// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CommitRevealRandomness} from "./CommitRevealRandomness.sol";

interface ICasinoBankroll {
    function payout(address recipient, uint256 amount) external;
    function settle() external payable;
}

interface ICasinoAllowlist {
    function enforceAccess(address player) external view;
}

/// @title ConstellationClimb
/// @notice Phase 2 solo Hi-Lo for the Cosmic Casino, re-themed as climbing
///         the constellation: each correct call raises the player one rung
///         up the cosmic ladder, compounding the multiplier. A loss forfeits
///         the stake; a tie is a "push" — the stake is returned and the
///         session ends with multiplier-1.0×.
/// @dev    Lifecycle:
///           1. Off-chain: seed manager publishes `commit = keccak(serverSeed)`
///              for the FIRST step. A new commit is supplied at every play step
///              for the next round.
///           2. Player calls `openSession(clientSeed, serverCommit)` and locks
///              stake. Initial card is derived deterministically from
///              `keccak(clientSeed, INIT_TAG)` — no server seed required for
///              the open card; the multiplier starts at 1.0× (WAD).
///           3. Player calls `playStep(direction, serverReveal, nextCommit)`.
///                - WIN: compounds the multiplier and the session stays Open.
///                - LOSS: transitions to Lost; stake forwarded to bankroll.
///                - PUSH (newCard == currentCard): transitions to Pushed; the
///                  stake is returned to the player; bankroll untouched.
///           4. Player calls `cashOut` to claim `bet * multiplier`, or
///              `refundSession` if the keeper stops responding past expiry.
contract ConstellationClimb is Ownable, Pausable, ReentrancyGuard {
    enum Direction {
        Higher, // 0 — bet that next card > currentCard
        Lower   // 1 — bet that next card < currentCard
    }

    enum Status {
        None,        // 0 — slot empty
        Open,        // 1 — accepting playStep / cashOut
        CashedOut,   // 2 — player cashed out for `bet * multiplier`
        Lost,        // 3 — settled, player forfeited stake (lose path)
        Refunded,    // 4 — expired without resolution; stake returned
        Pushed       // 5 — tie on a playStep; stake returned, session ended
    }

    struct Session {
        address player;
        uint96  bet;                // wei locked at open
        bytes32 clientSeed;
        bytes32 serverCommit;       // rotates per playStep — points at NEXT step's reveal
        uint64  lastBlock;          // last action block (open or step) — basis for expiry
        uint8   currentCard;        // 1..13
        Status  status;
        uint8   stepCount;          // # of completed playSteps
        uint256 currentMultiplier;  // wad-scaled cumulative multiplier (1e18 = 1.0x)
        uint256 nonce;              // per-session nonce mixed into rollOutcome
    }

    /// @notice Number of blocks after which an idle Open session can be refunded.
    /// @dev    256 blocks ≈ ~2 min on Monad (~500ms blocks).
    uint64 public constant EXPIRY_BLOCKS = 256;

    /// @notice Wad scale for `currentMultiplier`. 1e18 == 1.0×.
    uint256 public constant WAD = 1e18;

    /// @notice Card domain — one standard 13-rank deck per step, with replacement.
    uint256 public constant CARD_MOD = 13;

    /// @notice Numerator of the step-multiplier formula: 12 (deck-minus-current)
    ///         times 99 (1% house multiplier).
    uint256 public constant STEP_NUM = 12 * 99;

    /// @notice Denominator of the step-multiplier formula: 100.
    uint256 public constant STEP_DEN = 100;

    /// @notice Domain separator that derives the open card from the clientSeed.
    bytes32 internal constant INIT_TAG = bytes32(uint256(0xC0DECAFE));

    /// @notice Hard ceiling on per-cashOut payout (wei). Owner-tunable.
    uint256 public maxPayout;

    /// @notice Minimum / maximum stake at openSession.
    uint256 public minBet;
    uint256 public maxBet;

    ICasinoBankroll public immutable bankroll;

    /// @notice Optional soft-launch allowlist.
    ICasinoAllowlist public allowlist;

    mapping(uint256 => Session) public sessions;
    uint256 public nextSessionId;

    /// @dev Per-player monotonic nonce.
    mapping(address => uint256) public playerNonce;

    /// @dev Single-use guard for every server commit ever bound by this game.
    mapping(bytes32 => bool) public commitUsed;

    event SessionOpened(
        uint256 indexed sessionId,
        address indexed player,
        uint256 stake,
        bytes32 clientSeed,
        bytes32 serverCommit,
        uint8   initialCard,
        uint256 nonce,
        uint64  blockOpened
    );
    event StepPlayed(
        uint256 indexed sessionId,
        address indexed player,
        Direction direction,
        uint8   prevCard,
        uint8   newCard,
        bool    won,
        uint256 newMultiplier,
        bytes32 serverReveal,
        bytes32 nextCommit
    );
    event SessionCashedOut(
        uint256 indexed sessionId,
        address indexed player,
        uint256 payout,
        uint256 finalMultiplier
    );
    event SessionRefunded(uint256 indexed sessionId, address indexed player, uint256 stake);
    event SessionPushed(
        uint256 indexed sessionId,
        address indexed player,
        uint256 stake,
        uint8   card,
        uint256 multiplier
    );

    event MaxBetSet(uint256 oldMax, uint256 newMax);
    event MinBetSet(uint256 oldMin, uint256 newMin);
    event MaxPayoutSet(uint256 oldMax, uint256 newMax);
    event AllowlistSet(address indexed allowlist);

    error SessionNotFound();
    error SessionNotOpen();
    error SessionNotExpired();
    error InvalidReveal();
    error InvalidDirection();
    error StakeOutOfBounds();
    error PayoutExceedsCap();
    error NotPlayer();
    error ZeroAddress();
    error CommitAlreadyUsed();
    error ZeroCommit();
    error NotAllowed();
    error InvalidBetBounds();

    constructor(
        address initialOwner,
        address bankrollAddr,
        uint256 minBet_,
        uint256 maxBet_,
        uint256 maxPayout_
    ) Ownable(initialOwner) {
        if (bankrollAddr == address(0)) revert ZeroAddress();
        bankroll = ICasinoBankroll(bankrollAddr);
        minBet = minBet_;
        maxBet = maxBet_;
        maxPayout = maxPayout_;
    }

    // ---- Owner ----

    function setBetBounds(uint256 newMin, uint256 newMax) external onlyOwner {
        if (newMax < newMin) revert InvalidBetBounds();
        if (newMax > type(uint96).max) revert InvalidBetBounds();
        emit MinBetSet(minBet, newMin);
        emit MaxBetSet(maxBet, newMax);
        minBet = newMin;
        maxBet = newMax;
    }

    function setMaxPayout(uint256 newMax) external onlyOwner {
        emit MaxPayoutSet(maxPayout, newMax);
        maxPayout = newMax;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setAllowlist(address newAllowlist) external onlyOwner {
        allowlist = ICasinoAllowlist(newAllowlist);
        emit AllowlistSet(newAllowlist);
    }

    // ---- Player ----

    function openSession(bytes32 clientSeed, bytes32 serverCommit)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 sessionId)
    {
        ICasinoAllowlist al = allowlist;
        if (address(al) != address(0)) {
            try al.enforceAccess(msg.sender) {} catch {
                revert NotAllowed();
            }
        }
        if (msg.value < minBet || msg.value > maxBet) revert StakeOutOfBounds();
        if (serverCommit == bytes32(0)) revert ZeroCommit();
        if (commitUsed[serverCommit]) revert CommitAlreadyUsed();
        commitUsed[serverCommit] = true;

        sessionId = nextSessionId++;
        uint256 nonce = playerNonce[msg.sender]++;

        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 initialCard =
            uint8(uint256(keccak256(abi.encodePacked(clientSeed, INIT_TAG))) % CARD_MOD) + 1;

        sessions[sessionId] = Session({
            player:             msg.sender,
            bet:                uint96(msg.value),
            clientSeed:         clientSeed,
            serverCommit:       serverCommit,
            lastBlock:          uint64(block.number),
            currentCard:        initialCard,
            status:             Status.Open,
            stepCount:          0,
            currentMultiplier:  WAD,
            nonce:              nonce
        });

        emit SessionOpened(
            sessionId, msg.sender, msg.value, clientSeed, serverCommit,
            initialCard, nonce, uint64(block.number)
        );
    }

    function playStep(
        uint256 sessionId,
        Direction direction,
        bytes32 serverReveal,
        bytes32 nextCommit
    ) external nonReentrant {
        Session storage s = sessions[sessionId];
        if (s.status == Status.None) revert SessionNotFound();
        if (s.status != Status.Open) revert SessionNotOpen();
        if (!CommitRevealRandomness.verifyCommit(serverReveal, s.serverCommit)) revert InvalidReveal();
        if (nextCommit == bytes32(0)) revert ZeroCommit();
        if (commitUsed[nextCommit]) revert CommitAlreadyUsed();
        commitUsed[nextCommit] = true;

        uint8 cur = s.currentCard;
        if (direction == Direction.Higher && cur >= 13) revert InvalidDirection();
        if (direction == Direction.Lower && cur <= 1) revert InvalidDirection();

        uint256 stepNonce = s.nonce + uint256(s.stepCount) + 1;
        uint8 newCard = uint8(
            CommitRevealRandomness.rollOutcome(serverReveal, s.clientSeed, stepNonce, CARD_MOD) + 1
        );

        bool won;
        uint256 newMult = s.currentMultiplier;
        if (direction == Direction.Higher) {
            won = newCard > cur;
            if (won) {
                newMult = (newMult * STEP_NUM) / ((CARD_MOD - uint256(cur)) * STEP_DEN);
            }
        } else {
            won = newCard < cur;
            if (won) {
                newMult = (newMult * STEP_NUM) / ((uint256(cur) - 1) * STEP_DEN);
            }
        }

        s.serverCommit = nextCommit;
        s.lastBlock = uint64(block.number);
        s.stepCount += 1;

        emit StepPlayed(
            sessionId, s.player, direction, cur, newCard, won, newMult, serverReveal, nextCommit
        );

        if (won) {
            s.currentCard = newCard;
            s.currentMultiplier = newMult;
        } else if (newCard == cur) {
            _settlePush(s, sessionId, cur, newMult);
        } else {
            s.status = Status.Lost;
            bankroll.settle{value: uint256(s.bet)}();
        }
    }

    function _settlePush(
        Session storage s,
        uint256 sessionId,
        uint8 card,
        uint256 mult
    ) internal {
        s.status = Status.Pushed;
        uint256 stake = uint256(s.bet);
        address payable player = payable(s.player);
        (bool ok,) = player.call{value: stake}("");
        if (!ok) revert("ConstellationClimb: push refund failed");
        emit SessionPushed(sessionId, player, stake, card, mult);
    }

    function cashOut(uint256 sessionId) external nonReentrant {
        Session storage s = sessions[sessionId];
        if (s.status == Status.None) revert SessionNotFound();
        if (s.status != Status.Open) revert SessionNotOpen();
        if (msg.sender != s.player) revert NotPlayer();

        uint256 payoutAmt = (uint256(s.bet) * s.currentMultiplier) / WAD;
        if (maxPayout != 0 && payoutAmt > maxPayout) revert PayoutExceedsCap();

        s.status = Status.CashedOut;
        bankroll.settle{value: uint256(s.bet)}();
        if (payoutAmt > 0) {
            bankroll.payout(s.player, payoutAmt);
        }
        emit SessionCashedOut(sessionId, s.player, payoutAmt, s.currentMultiplier);
    }

    function refundSession(uint256 sessionId) external nonReentrant {
        Session storage s = sessions[sessionId];
        if (s.status == Status.None) revert SessionNotFound();
        if (s.status != Status.Open) revert SessionNotOpen();
        if (msg.sender != s.player) revert NotPlayer();
        if (block.number < uint256(s.lastBlock) + EXPIRY_BLOCKS) revert SessionNotExpired();

        uint256 stake = uint256(s.bet);
        s.status = Status.Refunded;
        (bool ok,) = s.player.call{value: stake}("");
        if (!ok) revert("ConstellationClimb: refund failed");
        emit SessionRefunded(sessionId, s.player, stake);
    }

    // ---- Read helpers ----

    function previewCard(bytes32 serverReveal, bytes32 clientSeed, uint256 nonce)
        external
        pure
        returns (uint8)
    {
        uint256 raw = CommitRevealRandomness.rollOutcome(serverReveal, clientSeed, nonce, CARD_MOD);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(raw + 1);
    }

    function quoteStepMultiplier(uint8 currentCard, Direction direction)
        external
        pure
        returns (uint256)
    {
        if (direction == Direction.Higher) {
            if (currentCard >= 13) revert InvalidDirection();
            return (WAD * STEP_NUM) / ((CARD_MOD - uint256(currentCard)) * STEP_DEN);
        } else {
            if (currentCard <= 1) revert InvalidDirection();
            return (WAD * STEP_NUM) / ((uint256(currentCard) - 1) * STEP_DEN);
        }
    }

    function previewInitialCard(bytes32 clientSeed) external pure returns (uint8) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(uint256(keccak256(abi.encodePacked(clientSeed, INIT_TAG))) % CARD_MOD) + 1;
    }

    function isExpired(uint256 sessionId) external view returns (bool) {
        Session storage s = sessions[sessionId];
        if (s.status != Status.Open) return false;
        return block.number >= uint256(s.lastBlock) + EXPIRY_BLOCKS;
    }

    receive() external payable {
        revert("ConstellationClimb: use openSession");
    }
}
