// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20 ^0.8.24;

// src/CommitRevealRandomness.sol

/// @title CommitRevealRandomness
/// @notice Stateless commit-reveal helpers shared by every Cosmic Casino game.
/// @dev    Mirrors the off-chain verify layer byte-for-byte. Test vectors in
///         both layers MUST agree, or settlement is broken. No state, no
///         events, no external calls — just three pure functions.
///
///         Hash schema (also enforced off-chain):
///             outcomeHash = keccak256(abi.encodePacked(serverSeed, clientSeed, nonce))
///             commit      = keccak256(abi.encodePacked(serverSeed))
library CommitRevealRandomness {
    /// @notice Compute the raw outcome hash for a single bet/step.
    function outcomeHash(bytes32 serverSeed, bytes32 clientSeed, uint256 nonce)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(serverSeed, clientSeed, nonce));
    }

    /// @notice Reduce an outcome hash to a uniform integer in [0, mod).
    /// @dev    Modulo bias is negligible while `mod` ≪ 2^256.
    function outcomeFromHash(bytes32 hash, uint256 mod) internal pure returns (uint256) {
        require(mod > 0, "CommitRevealRandomness: mod=0");
        return uint256(hash) % mod;
    }

    /// @notice Verify that `serverSeed` matches a previously published `commit`.
    function verifyCommit(bytes32 serverSeed, bytes32 commit) internal pure returns (bool) {
        return keccak256(abi.encodePacked(serverSeed)) == commit;
    }

    /// @notice Convenience: derive a uniform `[0, mod)` outcome end-to-end.
    function rollOutcome(bytes32 serverSeed, bytes32 clientSeed, uint256 nonce, uint256 mod)
        internal
        pure
        returns (uint256)
    {
        return outcomeFromHash(outcomeHash(serverSeed, clientSeed, nonce), mod);
    }
}

// lib/openzeppelin-contracts/contracts/utils/Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.0.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// lib/openzeppelin-contracts/contracts/access/Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// lib/openzeppelin-contracts/contracts/utils/Pausable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (utils/Pausable.sol)

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    bool private _paused;

    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    /**
     * @dev The operation failed because the contract is paused.
     */
    error EnforcedPause();

    /**
     * @dev The operation failed because the contract is not paused.
     */
    error ExpectedPause();

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor() {
        _paused = false;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        if (paused()) {
            revert EnforcedPause();
        }
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        if (!paused()) {
            revert ExpectedPause();
        }
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

// src/GravityDice.sol

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
        None, // 0 — slot empty
        Pending, // 1 — placed, not yet settled
        Won, // 2 — settled, player won
        Lost, // 3 — settled, house won
        Refunded // 4 — expired, player refunded
    }

    struct Bet {
        address player;
        uint96 stake; // wei, fits 79+ bn tokens; plenty
        bytes32 clientSeed;
        bytes32 serverCommit;
        uint64 blockPlaced;
        uint8 rollUnder; // target threshold in [MIN_ROLL_UNDER, MAX_ROLL_UNDER]
        Status status;
        uint8 roll; // populated on settle, in [1, 100]
        bytes32 serverReveal; // populated on settle
        uint256 nonce; // matches per-bet nonce in randomness scheme
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
        uint8 rollUnder,
        uint256 stake,
        bytes32 clientSeed,
        bytes32 serverCommit,
        uint256 nonce,
        uint64 blockPlaced
    );
    event BetSettled(
        uint256 indexed betId,
        address indexed player,
        uint8 rollUnder,
        uint8 roll,
        bool won,
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

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
            try al.enforceAccess(msg.sender) {}
            catch {
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
            player: msg.sender,
            stake: uint96(msg.value),
            clientSeed: clientSeed,
            serverCommit: serverCommit,
            blockPlaced: uint64(block.number),
            rollUnder: rollUnder,
            status: Status.Pending,
            roll: 0,
            serverReveal: bytes32(0),
            nonce: nonce
        });

        emit BetPlaced(
            betId,
            msg.sender,
            rollUnder,
            msg.value,
            clientSeed,
            serverCommit,
            nonce,
            uint64(block.number)
        );
    }

    function settleBet(uint256 betId, bytes32 serverReveal) external nonReentrant {
        Bet storage b = bets[betId];
        if (b.status == Status.None) revert BetNotFound();
        if (b.status != Status.Pending) revert BetNotPending();
        if (!CommitRevealRandomness.verifyCommit(serverReveal, b.serverCommit)) {
            revert InvalidReveal();
        }

        uint256 raw =
            CommitRevealRandomness.rollOutcome(serverReveal, b.clientSeed, b.nonce, ROLL_MOD);
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
