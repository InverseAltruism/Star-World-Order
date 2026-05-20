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

// src/CosmicFlip.sol

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

    enum Side {
        Heads,
        Tails
    }

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
        Side side;
        Status status;
        bytes32 serverReveal; // populated on settle
        uint256 nonce; // matches per-bet nonce in randomness scheme
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
        Side side,
        uint256 stake,
        bytes32 clientSeed,
        bytes32 serverCommit,
        uint256 nonce,
        uint64 blockPlaced
    );
    event BetSettled(
        uint256 indexed betId,
        address indexed player,
        Side outcome,
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

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

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
            try al.enforceAccess(msg.sender) {}
            catch {
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
            player: msg.sender,
            stake: uint96(msg.value),
            clientSeed: clientSeed,
            serverCommit: serverCommit,
            blockPlaced: uint64(block.number),
            side: side,
            status: Status.Pending,
            serverReveal: bytes32(0),
            nonce: nonce
        });

        emit BetPlaced(
            betId,
            msg.sender,
            side,
            msg.value,
            clientSeed,
            serverCommit,
            nonce,
            uint64(block.number)
        );
    }

    /// @notice Settle a bet by revealing the server seed.
    function settleBet(uint256 betId, bytes32 serverReveal) external nonReentrant {
        Bet storage b = bets[betId];
        if (b.status == Status.None) revert BetNotFound();
        if (b.status != Status.Pending) revert BetNotPending();
        if (!CommitRevealRandomness.verifyCommit(serverReveal, b.serverCommit)) {
            revert InvalidReveal();
        }

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
