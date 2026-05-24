// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DustVaultSink
 * @notice Star Vault sink that receives the DUST anti-snipe sell tax (ADR-003
 *         §1.2 / §"Star Vault settlement"). DUST accrues here passively as the
 *         {Dust} contract routes the tax via plain ERC-20 transfers — no
 *         callback hook is required, so there is no Dust↔Vault constructor
 *         cycle.
 * @dev The DAO governor ({StarWorldOrderGovernor}) holds DEFAULT_ADMIN_ROLE
 *      and SWEEPER_ROLE. Sweeping moves accrued tax into the 24h pro-rata
 *      settlement flow (out of scope for this PR; the sink only custodies and
 *      releases funds under DAO control).
 */
contract DustVaultSink is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant SWEEPER_ROLE = keccak256("SWEEPER_ROLE");

    event Swept(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();

    /// @param admin DAO governor — receives DEFAULT_ADMIN_ROLE and SWEEPER_ROLE.
    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SWEEPER_ROLE, admin);
    }

    /// @notice ERC-20 balance of `token` currently custodied by the sink.
    function balance(IERC20 token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Sweep `amount` of `token` to `to` (DAO settlement flow).
    function sweep(IERC20 token, address to, uint256 amount) external onlyRole(SWEEPER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Swept(address(token), to, amount);
    }
}
