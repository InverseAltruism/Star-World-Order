// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CasinoAllowlist
/// @notice Soft-launch access gate for the Cosmic Casino mainnet rollout.
/// @dev    Phase 3 exit ships behind a small allowlist so the operator can
///         observe live behaviour before opening the house. Each game
///         contract holds a reference to a single deployed allowlist and
///         calls `enforceAccess(player)` at the start of its `place*` /
///         `open*` entry-points. When `allowlistEnabled = false` the gate
///         is fully open — that is the post-soft-launch steady state.
///
///         `addAllowed` / `removeAllowed` accept arrays so the operator
///         can seed and prune the list in batched txs without a
///         per-address gas storm. `NotAllowed()` is the canonical revert
///         reason, surfaced both from this contract and from each game's
///         ABI (re-declared) so wallets show the same selector either way.
contract CasinoAllowlist is Ownable {
    /// @notice When true, only addresses with `isAllowed[a] == true` may play.
    /// @dev    Defaults to whatever the deployer passes; mainnet ships `true`.
    bool public allowlistEnabled;

    /// @notice Per-address access flag. Only consulted when `allowlistEnabled`.
    mapping(address => bool) public isAllowed;

    event AllowlistEnabledSet(bool enabled);
    event Allowed(address indexed account);
    event Disallowed(address indexed account);

    /// @notice Standard revert when a gated `place*` is called by a wallet
    ///         that is not on the allowlist while gating is active.
    error NotAllowed();
    error ZeroAddress();

    constructor(address initialOwner, bool enabled) Ownable(initialOwner) {
        allowlistEnabled = enabled;
        emit AllowlistEnabledSet(enabled);
    }

    // ---- Owner: gate state ----

    /// @notice Flip the allowlist on or off. Off = open house.
    function setAllowlistEnabled(bool enabled) external onlyOwner {
        allowlistEnabled = enabled;
        emit AllowlistEnabledSet(enabled);
    }

    /// @notice Add a batch of addresses to the allowlist.
    /// @dev    Idempotent per address — re-adding emits the event again so
    ///         indexers stay coherent on operator pokes.
    function addAllowed(address[] calldata accounts) external onlyOwner {
        uint256 len = accounts.length;
        for (uint256 i = 0; i < len; ++i) {
            address a = accounts[i];
            if (a == address(0)) revert ZeroAddress();
            isAllowed[a] = true;
            emit Allowed(a);
        }
    }

    /// @notice Remove a batch of addresses from the allowlist.
    function removeAllowed(address[] calldata accounts) external onlyOwner {
        uint256 len = accounts.length;
        for (uint256 i = 0; i < len; ++i) {
            address a = accounts[i];
            isAllowed[a] = false;
            emit Disallowed(a);
        }
    }

    // ---- Game / UX: read-side gate ----

    /// @notice Returns true if `player` may currently place a bet.
    /// @dev    True when gating is off OR the player is allowlisted.
    function gateOpen(address player) public view returns (bool) {
        if (!allowlistEnabled) return true;
        return isAllowed[player];
    }

    /// @notice Reverts with `NotAllowed()` when the gate is closed for `player`.
    /// @dev    Games delegate to this so the soft-launch check is one line at
    ///         the call-site and the revert string is uniform across games.
    function enforceAccess(address player) external view {
        if (!gateOpen(player)) revert NotAllowed();
    }
}
