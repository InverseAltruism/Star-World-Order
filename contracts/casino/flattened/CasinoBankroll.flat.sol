// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20 ^0.8.24;

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

// src/CasinoBankroll.sol

/// @title CasinoBankroll
/// @notice Single shared liquidity pool for every Cosmic Casino game contract.
/// @dev    Phase 0–2: 1/1 owner. Phase 3 migrates owner to a 3-of-5 multisig.
///         Per-game allowance prevents one buggy game from draining the rest.
///         Native MON only in Phase 1; ERC-20 layouts can mirror this per-token.
///
///         Phase 3 layers a *drawdown* circuit-breaker on top of the simple
///         `Pausable` switch. The breaker tracks a rolling 24h window: the
///         balance at window-start is recorded, and any net outflow ≥
///         `maxDrawdown24hWei` within that window auto-trips `halted = true`.
///         While halted, `payout()` reverts with `CircuitBreakerHalted`. The
///         `settle()` path stays open so games can still credit losses to the
///         bankroll. The breaker can be tripped manually by the owner and
///         auto-resets after `CIRCUIT_BREAKER_COOLDOWN`.
contract CasinoBankroll is Ownable, Pausable, ReentrancyGuard {
    /// @dev Per-game native-token allowance (in wei). Game contracts can only
    ///      pull payouts up to this value; refilled by the owner.
    mapping(address => uint256) public allowanceOf;

    /// @dev Set true once a game is registered; allows quick membership checks
    ///      without ambiguity at allowance == 0.
    mapping(address => bool) public isGame;

    /// @notice 24h rolling window for drawdown tracking and post-trip cooldown.
    uint256 public constant CIRCUIT_BREAKER_COOLDOWN = 24 hours;

    /// @notice Drawdown circuit-breaker state. `maxDrawdown24hWei == 0` means
    ///         the breaker is disabled (auto-trip skipped); manual `tripCircuitBreaker`
    ///         still works regardless of the threshold.
    struct CircuitBreaker {
        uint256 maxDrawdown24hWei;
        uint256 windowStartBalance;
        uint256 windowStartedAt;
        uint256 drawdownStartedAt;
        bool halted;
    }

    CircuitBreaker public circuitBreaker;

    event GameRegistered(address indexed game, uint256 allowance);
    event GameAllowanceSet(address indexed game, uint256 allowance);
    event GameRevoked(address indexed game);

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    /// @notice Game pulled `amount` to fund a payout to `recipient`.
    event GamePayout(address indexed game, address indexed recipient, uint256 amount);
    /// @notice Game returned a stake (loss / refund credit) of `amount`.
    event GameSettled(address indexed game, uint256 amount);

    /// @notice Circuit-breaker tripped (manually or by drawdown threshold).
    event CircuitBreakerTripped(
        uint256 windowStartBalance,
        uint256 currentBalance,
        uint256 maxDrawdown24hWei,
        uint256 timestamp
    );
    /// @notice Circuit-breaker reset (cooldown elapsed or owner-driven).
    event CircuitBreakerReset(uint256 currentBalance, uint256 timestamp);
    /// @notice Drawdown threshold updated.
    event CircuitBreakerThresholdSet(uint256 maxDrawdown24hWei);
    /// @notice Rolling 24h window rolled forward.
    event CircuitBreakerWindowRolled(uint256 newWindowStartBalance, uint256 timestamp);

    error NotGame();
    error AllowanceExceeded(uint256 requested, uint256 available);
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();
    error CircuitBreakerHalted();
    error CircuitBreakerNotHalted();
    error CooldownNotElapsed(uint256 readyAt);

    modifier onlyGame() {
        if (!isGame[msg.sender]) revert NotGame();
        _;
    }

    /// @notice Reverts when the drawdown breaker is currently tripped. Performs
    ///         a best-effort auto-reset (cooldown elapsed) and window-roll
    ///         beforehand so callers don't have to.
    modifier whenNotHalted() {
        _maybeAutoReset();
        _maybeRollWindow();
        if (circuitBreaker.halted) revert CircuitBreakerHalted();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        circuitBreaker.windowStartedAt = block.timestamp;
    }

    // ---- Owner: lifecycle ----

    /// @notice Register a new game contract with an initial native allowance.
    function registerGame(address game, uint256 initialAllowance) external onlyOwner {
        if (game == address(0)) revert ZeroAddress();
        isGame[game] = true;
        allowanceOf[game] = initialAllowance;
        emit GameRegistered(game, initialAllowance);
    }

    /// @notice Set the native allowance for an existing game.
    function setGameAllowance(address game, uint256 newAllowance) external onlyOwner {
        if (!isGame[game]) revert NotGame();
        allowanceOf[game] = newAllowance;
        emit GameAllowanceSet(game, newAllowance);
    }

    /// @notice Revoke a game's ability to pull from the bankroll.
    function revokeGame(address game) external onlyOwner {
        if (!isGame[game]) revert NotGame();
        isGame[game] = false;
        allowanceOf[game] = 0;
        emit GameRevoked(game);
    }

    /// @notice Owner pause (legacy circuit-breaker / emergency stop). Distinct
    ///         from the drawdown circuit-breaker; both gate `payout()` and
    ///         either alone is sufficient to block outflows.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---- Owner: drawdown circuit-breaker ----

    /// @notice Set the 24h drawdown threshold (in wei). `0` disables auto-trip.
    function setMaxDrawdown24hWei(uint256 newMax) external onlyOwner {
        circuitBreaker.maxDrawdown24hWei = newMax;
        emit CircuitBreakerThresholdSet(newMax);
    }

    /// @notice Manually trip the drawdown circuit-breaker. No-op if already halted.
    function tripCircuitBreaker() external onlyOwner {
        _trip();
    }

    /// @notice Force-reset the breaker even if the cooldown has not elapsed.
    ///         Intended for the operator playbook on intentional false-positive
    ///         trips (e.g. a planned high-roller payout that pierces the cap).
    function resetCircuitBreaker() external onlyOwner {
        if (!circuitBreaker.halted) revert CircuitBreakerNotHalted();
        _reset();
    }

    /// @notice Permissionless cooldown poke — callable by anyone after the
    ///         24h cooldown to clear the halt without the owner re-arming.
    function pokeCircuitBreaker() external {
        if (!circuitBreaker.halted) revert CircuitBreakerNotHalted();
        uint256 readyAt = circuitBreaker.drawdownStartedAt + CIRCUIT_BREAKER_COOLDOWN;
        if (block.timestamp < readyAt) revert CooldownNotElapsed(readyAt);
        _reset();
    }

    /// @notice Bundled view of breaker state for indexers / monitors.
    function circuitBreakerState()
        external
        view
        returns (
            uint256 maxDrawdown24hWei,
            uint256 windowStartBalance,
            uint256 windowStartedAt,
            uint256 drawdownStartedAt,
            bool halted,
            uint256 currentBalance
        )
    {
        CircuitBreaker memory c = circuitBreaker;
        return (
            c.maxDrawdown24hWei,
            c.windowStartBalance,
            c.windowStartedAt,
            c.drawdownStartedAt,
            c.halted,
            address(this).balance
        );
    }

    // ---- Owner: liquidity ----

    /// @notice Deposit native token into the bankroll.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        _bumpWindowStartIfFirst();
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Owner withdraws native from the bankroll (e.g. seed adjustment).
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    // ---- Game-only: payout / settle ----

    /// @notice Pay `amount` to `recipient`, decrementing the caller's allowance.
    /// @dev    Pausable: blocks payouts during a circuit-breaker; existing
    ///         player refund paths remain on the game contract. The drawdown
    ///         breaker is checked *before* the transfer (via `whenNotHalted`)
    ///         and re-evaluated *predictively* against the post-payout balance
    ///         — also before the external call — so a payout that crosses the
    ///         threshold trips the breaker for the next caller. Trip-before-
    ///         transfer preserves Checks-Effects-Interactions and closes any
    ///         cross-function reentrancy surface around the breaker state.
    function payout(address recipient, uint256 amount)
        external
        onlyGame
        whenNotPaused
        whenNotHalted
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 cur = allowanceOf[msg.sender];
        if (amount > cur) revert AllowanceExceeded(amount, cur);
        unchecked {
            allowanceOf[msg.sender] = cur - amount;
        }
        // CEI: trip the breaker before the external transfer using the
        // predicted post-payout balance. If the call reverts, the entire
        // tx reverts and the trip unwinds.
        _maybeAutoTrip(amount);
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit GamePayout(msg.sender, recipient, amount);
    }

    /// @notice Game forwards a settled stake (loss credit) into the bankroll.
    /// @dev    Increases the caller's allowance by `msg.value` so wins/losses
    ///         net within the per-game cap; bankroll grows on net player loss.
    ///         Always open — the breaker stops outflows, not inflows.
    function settle() external payable onlyGame {
        if (msg.value == 0) revert ZeroAmount();
        allowanceOf[msg.sender] += msg.value;
        _bumpWindowStartIfFirst();
        emit GameSettled(msg.sender, msg.value);
    }

    /// @notice Total native held in the bankroll.
    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Plain receive accepts native and emits `Deposited` so direct sends
    ///         are visible to the indexer (matches `deposit()` semantics).
    receive() external payable {
        _bumpWindowStartIfFirst();
        emit Deposited(msg.sender, msg.value);
    }

    // ---- internal: circuit-breaker helpers ----

    /// @dev If the rolling window has expired and the breaker is *not* halted,
    ///      snapshot the current balance as the new window start. Halted
    ///      windows freeze until `_reset()` to preserve the trip context.
    function _maybeRollWindow() internal {
        if (circuitBreaker.halted) return;
        if (block.timestamp >= circuitBreaker.windowStartedAt + CIRCUIT_BREAKER_COOLDOWN) {
            circuitBreaker.windowStartBalance = address(this).balance;
            circuitBreaker.windowStartedAt = block.timestamp;
            emit CircuitBreakerWindowRolled(circuitBreaker.windowStartBalance, block.timestamp);
        }
    }

    /// @dev Auto-reset if the cooldown since trip has elapsed.
    function _maybeAutoReset() internal {
        if (!circuitBreaker.halted) return;
        if (block.timestamp >= circuitBreaker.drawdownStartedAt + CIRCUIT_BREAKER_COOLDOWN) {
            _reset();
        }
    }

    /// @dev Common reset path: clears halt, re-anchors the rolling window at
    ///      the current balance/timestamp.
    function _reset() internal {
        circuitBreaker.halted = false;
        circuitBreaker.drawdownStartedAt = 0;
        circuitBreaker.windowStartBalance = address(this).balance;
        circuitBreaker.windowStartedAt = block.timestamp;
        emit CircuitBreakerReset(circuitBreaker.windowStartBalance, block.timestamp);
    }

    /// @dev Trip the breaker. Idempotent: if already halted, just emit nothing.
    ///      Manual entry-point reads the live balance.
    function _trip() internal {
        _trip(address(this).balance);
    }

    /// @dev Trip the breaker reporting `currentBalance` in the event payload.
    ///      Used by the predictive auto-trip path so the event reflects the
    ///      post-payout balance even when called *before* the external send.
    function _trip(uint256 currentBalance) internal {
        if (circuitBreaker.halted) return;
        circuitBreaker.halted = true;
        circuitBreaker.drawdownStartedAt = block.timestamp;
        emit CircuitBreakerTripped(
            circuitBreaker.windowStartBalance,
            currentBalance,
            circuitBreaker.maxDrawdown24hWei,
            block.timestamp
        );
    }

    /// @dev Auto-trip if the drawdown that *would* result from a pending
    ///      outflow of `pendingOutflow` wei has crossed the configured
    ///      threshold within the current 24h window. Called BEFORE the
    ///      external transfer so the breaker is set without violating CEI.
    ///      Skipped when the threshold is 0 (disabled) or the predicted
    ///      post-outflow balance would still be ≥ window-start.
    function _maybeAutoTrip(uint256 pendingOutflow) internal {
        uint256 max = circuitBreaker.maxDrawdown24hWei;
        if (max == 0) return;
        uint256 startBal = circuitBreaker.windowStartBalance;
        uint256 cur = address(this).balance;
        if (cur < pendingOutflow) return;
        uint256 postBal = cur - pendingOutflow;
        if (startBal <= postBal) return;
        uint256 drop = startBal - postBal;
        if (drop >= max) _trip(postBal);
    }

    /// @dev Capture the first non-zero balance as the window-start baseline so
    ///      the breaker has something to compare against on the very first
    ///      payout. Cheap no-op once anchored.
    function _bumpWindowStartIfFirst() internal {
        if (circuitBreaker.windowStartBalance == 0 && !circuitBreaker.halted) {
            circuitBreaker.windowStartBalance = address(this).balance;
            if (circuitBreaker.windowStartedAt == 0) {
                circuitBreaker.windowStartedAt = block.timestamp;
            }
        }
    }
}
