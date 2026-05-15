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

/// @title GravityDice
/// @notice Phase 2 solo Roll-Under dice for the Cosmic Casino. Server commit-
///         reveal randomness; payout routed through the shared bankroll; refund
///         path on stale settle. Mirrors the lifecycle of `CosmicFlip` so that
///         the keeper bot, indexer, and verify UI can reuse their settle/refund
///         plumbing one-to-one.
/// @dev    Lifecycle:
///           1. Off-chain: seed manager publishes `commit = keccak(serverSeed)`.
///           2. Player calls `placeBet(rollUnder, clientSeed, commit)` and locks
///              stake. `rollUnder` is the target threshold in [2, 98].
///           3. Backend calls `settleBet(betId, serverReveal)` within
///              `EXPIRY_BLOCKS`.
///           4. If backend never settles, player calls `refundBet(betId)`.
///         Outcome derivation:
///             roll = (uint256(outcomeHash) % 100) + 1   // ∈ [1, 100]
///             win  = roll < rollUnder                    // strict <
///         Multiplier: `99 / (R-1)` — encodes a 1.00% house edge against the
///         fair payout `100 / (R-1)`. Per-bet cap mirrors CosmicFlip.
contract GravityDice is Ownable, Pausable, ReentrancyGuard {
    using CommitRevealRandomness for bytes32;

    enum Status {
        None,    // 0 — slot empty
        Pending, // 1 — placed, not yet settled
        Won,     // 2 — settled, player won
        Lost,    // 3 — settled, house won
        Refunded // 4 — expired, player refunded
    }

    struct Bet {
        address player;
        uint96  stake;        // wei, fits 79+ bn tokens; plenty
        bytes32 clientSeed;
        bytes32 serverCommit;
        uint64  blockPlaced;
        uint8   rollUnder;    // target threshold in [MIN_ROLL_UNDER, MAX_ROLL_UNDER]
        Status  status;
        uint8   roll;         // populated on settle, in [1, 100]
        bytes32 serverReveal; // populated on settle
        uint256 nonce;        // matches per-bet nonce in randomness scheme
    }

    /// @notice Number of blocks after which an unsettled bet can be refunded.
    /// @dev    Same as CosmicFlip: 256 blocks ≈ ~2 min on Monad (~500ms blocks).
    uint64 public constant EXPIRY_BLOCKS = 256;

    /// @notice Payout numerator. Multiplier = `PAYOUT_NUM / (rollUnder - 1)`.
    ///         Encodes a 1.00% house edge against the fair `100 / (R-1)`.
    uint256 public constant PAYOUT_NUM = 99;

    /// @notice Roll outcome modulus (dice are 1..100 → modulo 100).
    uint256 public constant ROLL_MOD = 100;

    /// @notice Smallest legal `rollUnder`. Below this the win probability is
    ///         effectively zero (only roll==1 wins) — keep a meaningful floor.
    uint8 public constant MIN_ROLL_UNDER = 2;

    /// @notice Largest legal `rollUnder`. Above 98 the multiplier collapses
    ///         to 1.0102…× and the house edge is too thin to matter; cap there.
    uint8 public constant MAX_ROLL_UNDER = 98;

    /// @notice Hard ceiling per individual bet (in wei). Owner-tunable.
    uint256 public maxBet;

    /// @notice Minimum bet to keep gas / settlement worthwhile.
    uint256 public minBet;

    ICasinoBankroll public immutable bankroll;

    /// @notice Optional soft-launch allowlist.
    ICasinoAllowlist public allowlist;

    mapping(uint256 => Bet) public bets;
    uint256 public nextBetId;

    /// @dev Per-player monotonic nonce mixed into the randomness hash.
    mapping(address => uint256) public playerNonce;

    /// @dev Single-use guard for `serverCommit`.
    mapping(bytes32 => bool) public commitUsed;

    event BetPlaced(
        uint256 indexed betId,
        address indexed player,
        uint8   rollUnder,
        uint256 stake,
        bytes32 clientSeed,
        bytes32 serverCommit,
        uint256 nonce,
        uint64  blockPlaced
    );
    event BetSettled(
        uint256 indexed betId,
        address indexed player,
        uint8   rollUnder,
        uint8   roll,
        bool    won,
        uint256 payout,
        bytes32 serverReveal
    );
    event BetRefunded(uint256 indexed betId, address indexed player, uint256 stake);

    event MaxBetSet(uint256 oldMax, uint256 newMax);
    event MinBetSet(uint256 oldMin, uint256 newMin);
    event AllowlistSet(address indexed allowlist);

    error BetNotFound();
    error BetNotPending();
    error BetNotExpired();
    error InvalidReveal();
    error InvalidRollUnder();
    error StakeOutOfBounds();
    error NotPlayer();
    error ZeroAddress();
    error CommitAlreadyUsed();
    error ZeroCommit();
    error NotAllowed();
    error InvalidBetBounds();

    constructor(address initialOwner, address bankrollAddr, uint256 minBet_, uint256 maxBet_)
        Ownable(initialOwner)
    {
        if (bankrollAddr == address(0)) revert ZeroAddress();
        bankroll = ICasinoBankroll(bankrollAddr);
        minBet = minBet_;
        maxBet = maxBet_;
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

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setAllowlist(address newAllowlist) external onlyOwner {
        allowlist = ICasinoAllowlist(newAllowlist);
        emit AllowlistSet(newAllowlist);
    }

    // ---- Player ----

    function placeBet(uint8 rollUnder, bytes32 clientSeed, bytes32 serverCommit)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 betId)
    {
        ICasinoAllowlist al = allowlist;
        if (address(al) != address(0)) {
            try al.enforceAccess(msg.sender) {} catch {
                revert NotAllowed();
            }
        }
        if (rollUnder < MIN_ROLL_UNDER || rollUnder > MAX_ROLL_UNDER) {
            revert InvalidRollUnder();
        }
        if (msg.value < minBet || msg.value > maxBet) revert StakeOutOfBounds();
        if (serverCommit == bytes32(0)) revert ZeroCommit();
        if (commitUsed[serverCommit]) revert CommitAlreadyUsed();
        commitUsed[serverCommit] = true;

        betId = nextBetId++;
        uint256 nonce = playerNonce[msg.sender]++;

        bets[betId] = Bet({
            player:       msg.sender,
            stake:        uint96(msg.value),
            clientSeed:   clientSeed,
            serverCommit: serverCommit,
            blockPlaced:  uint64(block.number),
            rollUnder:    rollUnder,
            status:       Status.Pending,
            roll:         0,
            serverReveal: bytes32(0),
            nonce:        nonce
        });

        emit BetPlaced(
            betId, msg.sender, rollUnder, msg.value, clientSeed, serverCommit, nonce, uint64(block.number)
        );
    }

    function settleBet(uint256 betId, bytes32 serverReveal) external nonReentrant {
        Bet storage b = bets[betId];
        if (b.status == Status.None) revert BetNotFound();
        if (b.status != Status.Pending) revert BetNotPending();
        if (!CommitRevealRandomness.verifyCommit(serverReveal, b.serverCommit)) revert InvalidReveal();

        uint256 raw = CommitRevealRandomness.rollOutcome(serverReveal, b.clientSeed, b.nonce, ROLL_MOD);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 roll = uint8(raw + 1);
        b.serverReveal = serverReveal;
        b.roll = roll;

        bool won = roll < b.rollUnder;
        if (won) {
            uint256 payoutAmt = (uint256(b.stake) * PAYOUT_NUM) / (uint256(b.rollUnder) - 1);
            b.status = Status.Won;
            bankroll.settle{value: uint256(b.stake)}();
            bankroll.payout(b.player, payoutAmt);
            emit BetSettled(betId, b.player, b.rollUnder, roll, true, payoutAmt, serverReveal);
        } else {
            b.status = Status.Lost;
            bankroll.settle{value: uint256(b.stake)}();
            emit BetSettled(betId, b.player, b.rollUnder, roll, false, 0, serverReveal);
        }
    }

    function refundBet(uint256 betId) external nonReentrant {
        Bet storage b = bets[betId];
        if (b.status == Status.None) revert BetNotFound();
        if (b.status != Status.Pending) revert BetNotPending();
        if (msg.sender != b.player) revert NotPlayer();
        if (block.number < uint256(b.blockPlaced) + EXPIRY_BLOCKS) revert BetNotExpired();

        uint256 stake = uint256(b.stake);
        b.status = Status.Refunded;
        (bool ok,) = b.player.call{value: stake}("");
        if (!ok) revert("GravityDice: refund failed");
        emit BetRefunded(betId, b.player, stake);
    }

    // ---- Read helpers ----

    function previewRoll(bytes32 serverReveal, bytes32 clientSeed, uint256 nonce)
        external
        pure
        returns (uint8)
    {
        uint256 raw = CommitRevealRandomness.rollOutcome(serverReveal, clientSeed, nonce, ROLL_MOD);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(raw + 1);
    }

    function quotePayout(uint256 stake, uint8 rollUnder) external pure returns (uint256) {
        if (rollUnder < MIN_ROLL_UNDER || rollUnder > MAX_ROLL_UNDER) revert InvalidRollUnder();
        return (stake * PAYOUT_NUM) / (uint256(rollUnder) - 1);
    }

    function isExpired(uint256 betId) external view returns (bool) {
        Bet storage b = bets[betId];
        if (b.status != Status.Pending) return false;
        return block.number >= uint256(b.blockPlaced) + EXPIRY_BLOCKS;
    }

    receive() external payable {
        revert("GravityDice: use placeBet");
    }
}
