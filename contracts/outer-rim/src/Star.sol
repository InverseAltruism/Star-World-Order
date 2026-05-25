// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Star
 * @notice STAR — the soulbound Sanctuary currency on Monad. Earned in the
 *         Sanctuary (quests, wagers, minigames, care) and spent on cosmetics,
 *         charms, and wagers. Per ADR-002 §"Contract Shape" — the soulbound
 *         sibling of {Dust} (see Dust.sol): same ERC-20 + AccessControl shape
 *         with MINTER_ROLE/BURNER_ROLE, DAO-revocable via {StarWorldOrderGovernor},
 *         but **non-transferable** between holders.
 *
 * @dev Soulbound: {_update} reverts on any holder→holder transfer. Only mints
 *      (`from == 0`) and burns (`to == 0`) are allowed, so balances move solely
 *      through the role-gated {mint}/{burn} entry points. There is no team
 *      allocation; total supply is purely earned-mints minus spent-burns.
 *
 *      Distribution model: the Sanctuary backend holds MINTER_ROLE and mints
 *      STAR to a holder's wallet when the off-chain ledger credits them (quest
 *      claim, wager win, minigame payout, care bonus); it burns via BURNER_ROLE
 *      when STAR is spent (shop, charms, wager stake). A per-epoch mint cap
 *      bounds issuance so a backend bug can't mint unbounded STAR.
 *
 *      Role custody (mirrors {Dust}):
 *        - DEFAULT_ADMIN_ROLE → {StarWorldOrderGovernor} (DAO). Grants/revokes
 *          MINTER/BURNER; community kill-switch without a migration.
 *        - MINTER_ROLE → Sanctuary backend settlement signer.
 *        - BURNER_ROLE → Sanctuary backend spend signer.
 */
contract Star is ERC20, AccessControl {
    // ============ Roles ============

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ============ Per-epoch mint cap ============

    /// @notice Maximum STAR mintable per epoch (bounds backend issuance).
    uint256 public immutable mintCapPerEpoch;

    /// @notice Length of a mint-cap epoch in seconds.
    uint256 public immutable epochDuration;

    /// @notice Deployment timestamp; epoch 0 starts here.
    uint256 public immutable deployTimestamp;

    /// @notice STAR minted in a given epoch index.
    mapping(uint256 => uint256) public mintedInEpoch;

    // ============ Errors ============

    error ZeroAddress();
    error ZeroEpochDuration();
    error EpochMintCapExceeded(uint256 epoch, uint256 requested, uint256 remaining);
    /// @notice STAR is soulbound — holder→holder transfers are not allowed.
    error Soulbound();

    /**
     * @param admin            DAO governor — receives DEFAULT_ADMIN_ROLE.
     * @param mintCapPerEpoch_ Max STAR mintable per epoch.
     * @param epochDuration_   Epoch length in seconds.
     */
    constructor(address admin, uint256 mintCapPerEpoch_, uint256 epochDuration_)
        ERC20("Star", "STAR")
    {
        if (admin == address(0)) revert ZeroAddress();
        if (epochDuration_ == 0) revert ZeroEpochDuration();

        deployTimestamp = block.timestamp;
        mintCapPerEpoch = mintCapPerEpoch_;
        epochDuration = epochDuration_;

        // DAO holds admin; it grants MINTER/BURNER to the backend signers and
        // can revoke them at any time. No team allocation is minted.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ============ Mint / burn (role-gated) ============

    /// @notice Mint STAR to `to`, bounded by the current epoch's mint cap.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 epoch = currentEpoch();
        uint256 minted = mintedInEpoch[epoch];
        if (minted + amount > mintCapPerEpoch) {
            revert EpochMintCapExceeded(epoch, amount, mintCapPerEpoch - minted);
        }
        mintedInEpoch[epoch] = minted + amount;
        _mint(to, amount);
    }

    /// @notice Burn `amount` STAR held by `from` when STAR is spent in-app.
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    // ============ Views ============

    /// @notice Current mint-cap epoch index since deployment.
    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - deployTimestamp) / epochDuration;
    }

    /// @notice STAR still mintable in the current epoch.
    function remainingMintAllowance() external view returns (uint256) {
        return mintCapPerEpoch - mintedInEpoch[currentEpoch()];
    }

    // ============ Soulbound transfer hook ============

    /**
     * @dev Soulbound enforcement: allow only mints (`from == 0`) and burns
     *      (`to == 0`). Any holder→holder transfer reverts, so {transfer} and
     *      {transferFrom} are effectively disabled.
     */
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert Soulbound();
        super._update(from, to, value);
    }
}
