// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CommitRevealRandomness} from "./CommitRevealRandomness.sol";

interface ICasinoBankroll {
    function payout(address recipient, uint256 amount) external;
    function settle() external payable;
    function allowanceOf(address game) external view returns (uint256);
}

interface ICasinoAllowlist {
    function enforceAccess(address player) external view;
}

/// @title CosmicFlip
/// @notice Phase 1 solo coinflip for the Cosmic Casino. Server commit-reveal
///         randomness; payout routed through the shared bankroll; refund path
///         on stale settle.
/// @dev    Lifecycle:
///           1. Off-chain: seed manager publishes `commit = keccak(serverSeed)`.
///           2. Player calls `placeBet(side, clientSeed, commit)` and locks stake.
///           3. Backend calls `settleBet(betId, serverReveal)` within `EXPIRY_BLOCKS`.
///           4. If backend never settles, player calls `refundBet(betId)`.
///         Multiplier: 1.98× (1.00% house edge), encoded as `198/100`.
///         Per-bet cap: 0.5% of bankroll allowance — enforced via the bankroll's
///         per-game allowance ceiling and `MAX_BET` here as a belt-and-braces.
contract CosmicFlip is Ownable, Pausable, ReentrancyGuard {
    using CommitRevealRandomness for bytes32;

    enum Side { Heads, Tails }

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
        Side    side;
        Status  status;
        bytes32 serverReveal; // populated on settle
        uint256 nonce;        // matches per-bet nonce in randomness scheme
    }

    /// @notice Number of blocks after which an unsettled bet can be refunded.
    /// @dev    256 blocks ≈ ~2 min on Monad (~500ms blocks); generous given the
    ///         seed manager settles within 1 block in the happy path.
    uint64 public constant EXPIRY_BLOCKS = 256;

    /// @notice Payout numerator/denominator. Multiplier = 198 / 100 = 1.98×.
    uint256 public constant PAYOUT_NUM = 198;
    uint256 public constant PAYOUT_DEN = 100;

    /// @notice Hard ceiling per individual bet (in wei). Mirrors the 0.5%-of-
    ///         bankroll envelope for the small-seed launch. Owner-tunable.
    uint256 public maxBet;

    /// @notice Minimum bet to keep gas / settlement worthwhile.
    uint256 public minBet;

    ICasinoBankroll public immutable bankroll;

    /// @notice Optional soft-launch allowlist. When set, every `placeBet` is
    ///         gated by `allowlist.enforceAccess(msg.sender)`. Owner-clearable
    ///         (set to address(0)) once the soft-launch window closes; the
    ///         allowlist contract itself can also be flipped to `enabled=false`.
    ICasinoAllowlist public allowlist;

    mapping(uint256 => Bet) public bets;
    uint256 public nextBetId;

    /// @dev Per-player monotonic nonce, mixed into the randomness hash so that
    ///      reusing a (serverSeed, clientSeed) pair across bets produces
    ///      different outcomes.
    mapping(address => uint256) public playerNonce;

    /// @dev Single-use guard for `serverCommit`. Once any bet binds a commit,
    ///      that commit is consumed forever — a player who later observes the
    ///      revealed seed cannot re-bet against the same commit and pre-compute
    ///      the outcome. The off-chain seed manager MUST rotate per bet.
    mapping(bytes32 => bool) public commitUsed;

    event BetPlaced(
        uint256 indexed betId,
        address indexed player,
        Side    side,
        uint256 stake,
        bytes32 clientSeed,
        bytes32 serverCommit,
        uint256 nonce,
        uint64  blockPlaced
    );
    event BetSettled(
        uint256 indexed betId,
        address indexed player,
        Side    outcome,
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
    error StakeOutOfBounds();
    error NotPlayer();
    error ZeroAddress();
    error CommitAlreadyUsed();
    error ZeroCommit();
    /// @notice Soft-launch gate: caller is not on the allowlist while it is enabled.
    error NotAllowed();
    /// @notice `setBetBounds` rejected: newMax < newMin or newMax overflows uint96.
    error InvalidBetBounds();
    /// @notice `setBetBounds` rejected: bankroll allowance for this game can't
    ///         cover a max-bet WIN. Top up the bankroll first.
    error BankrollAllowanceTooLow(uint256 required, uint256 available);

    constructor(address initialOwner, address bankrollAddr, uint256 minBet_, uint256 maxBet_)
        Ownable(initialOwner)
    {
        if (bankrollAddr == address(0)) revert ZeroAddress();
        bankroll = ICasinoBankroll(bankrollAddr);
        minBet = minBet_;
        maxBet = maxBet_;
    }

    // ---- Owner ----

    /// @notice Set the per-bet stake floor and ceiling.
    function setBetBounds(uint256 newMin, uint256 newMax) external onlyOwner {
        if (newMax < newMin) revert InvalidBetBounds();
        if (newMax > type(uint96).max) revert InvalidBetBounds();
        uint256 required = ((PAYOUT_NUM - PAYOUT_DEN) * newMax) / PAYOUT_DEN;
        uint256 available = bankroll.allowanceOf(address(this));
        if (available < required) revert BankrollAllowanceTooLow(required, available);

        emit MinBetSet(minBet, newMin);
        emit MaxBetSet(maxBet, newMax);
        minBet = newMin;
        maxBet = newMax;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @notice Owner-set the soft-launch allowlist contract. Pass address(0)
    ///         to fully detach (open house). Mainnet ships with this set; the
    ///         operator clears it once the soft-launch window closes.
    function setAllowlist(address newAllowlist) external onlyOwner {
        allowlist = ICasinoAllowlist(newAllowlist);
        emit AllowlistSet(newAllowlist);
    }

    // ---- Player ----

    /// @notice Lock a stake on `side` against the server commit.
    function placeBet(Side side, bytes32 clientSeed, bytes32 serverCommit)
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
            side:         side,
            status:       Status.Pending,
            serverReveal: bytes32(0),
            nonce:        nonce
        });

        emit BetPlaced(
            betId, msg.sender, side, msg.value, clientSeed, serverCommit, nonce, uint64(block.number)
        );
    }

    /// @notice Settle a bet by revealing the server seed.
    function settleBet(uint256 betId, bytes32 serverReveal) external nonReentrant {
        Bet storage b = bets[betId];
        if (b.status == Status.None) revert BetNotFound();
        if (b.status != Status.Pending) revert BetNotPending();
        if (!CommitRevealRandomness.verifyCommit(serverReveal, b.serverCommit)) revert InvalidReveal();

        uint256 outcome = CommitRevealRandomness.rollOutcome(serverReveal, b.clientSeed, b.nonce, 2);
        Side rolled = outcome == 0 ? Side.Heads : Side.Tails;
        b.serverReveal = serverReveal;

        if (rolled == b.side) {
            uint256 payoutAmt = (uint256(b.stake) * PAYOUT_NUM) / PAYOUT_DEN;
            b.status = Status.Won;
            bankroll.settle{value: uint256(b.stake)}();
            bankroll.payout(b.player, payoutAmt);
            emit BetSettled(betId, b.player, rolled, true, payoutAmt, serverReveal);
        } else {
            b.status = Status.Lost;
            bankroll.settle{value: uint256(b.stake)}();
            emit BetSettled(betId, b.player, rolled, false, 0, serverReveal);
        }
    }

    /// @notice Refund a bet that was never settled within `EXPIRY_BLOCKS`.
    function refundBet(uint256 betId) external nonReentrant {
        Bet storage b = bets[betId];
        if (b.status == Status.None) revert BetNotFound();
        if (b.status != Status.Pending) revert BetNotPending();
        if (msg.sender != b.player) revert NotPlayer();
        if (block.number < uint256(b.blockPlaced) + EXPIRY_BLOCKS) revert BetNotExpired();

        uint256 stake = uint256(b.stake);
        b.status = Status.Refunded;
        (bool ok,) = b.player.call{value: stake}("");
        if (!ok) revert("CosmicFlip: refund failed");
        emit BetRefunded(betId, b.player, stake);
    }

    // ---- Read helpers ----

    /// @notice Compute the on-chain outcome side from a (reveal, clientSeed, nonce) tuple.
    function previewOutcome(bytes32 serverReveal, bytes32 clientSeed, uint256 nonce)
        external
        pure
        returns (Side)
    {
        uint256 o = CommitRevealRandomness.rollOutcome(serverReveal, clientSeed, nonce, 2);
        return o == 0 ? Side.Heads : Side.Tails;
    }

    /// @notice Whether a Pending bet is past its refund window.
    function isExpired(uint256 betId) external view returns (bool) {
        Bet storage b = bets[betId];
        if (b.status != Status.Pending) return false;
        return block.number >= uint256(b.blockPlaced) + EXPIRY_BLOCKS;
    }

    /// @dev Reject stray native sends except via `placeBet` / refunds.
    receive() external payable {
        revert("CosmicFlip: use placeBet");
    }
}
