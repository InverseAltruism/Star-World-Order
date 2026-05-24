// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Dust
 * @notice DUST — the transferable wealth token of the Outer Rim "Cosmic
 *         Offshore" overlay on Monad. Per ADR-003 §1.2.
 * @dev Mirrors ADR-002 §"Contract Shape" (ERC-20 + AccessControl, MINTER_ROLE
 *      + BURNER_ROLE, DAO-revocable via {StarWorldOrderGovernor}) **without**
 *      the soulbound transfer restriction — DUST is freely transferable once
 *      the anti-snipe window closes.
 *
 *      Differences from soulbound STAR:
 *        - Transfers are permitted (no `_update` revert on holder→holder).
 *        - A 50% anti-snipe sell tax applies to sells (transfers into a
 *          registered AMM pair) during the first 24h post-deploy; the tax is
 *          routed in full to the Star Vault sink. Verbatim from Offshore.
 *        - A per-epoch mint cap is enforced on-chain to bound voyage-settlement
 *          issuance.
 *
 *      No team allocation: the constructor mints nothing. Total supply is a
 *      pure function of voyage-success mints minus burns.
 *
 *      Role custody (ADR-003 §1.2):
 *        - DEFAULT_ADMIN_ROLE → {StarWorldOrderGovernor} (DAO). Grants/revokes
 *          the operational roles, so the community has a kill switch without a
 *          contract migration.
 *        - MINTER_ROLE → backend voyage-settlement signer.
 *        - BURNER_ROLE → Equipment factory, Loadout-4 auction, hit contract,
 *          faction-stake contract.
 */
contract Dust is ERC20, AccessControl {
    // ============ Roles ============

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    // ============ Anti-snipe ============

    /// @notice Sell tax in basis points applied during the anti-snipe window.
    uint256 public constant SELL_TAX_BPS = 5000; // 50%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Duration of the post-deploy anti-snipe window.
    uint256 public constant ANTI_SNIPE_WINDOW = 24 hours;

    /// @notice Deployment timestamp; anti-snipe window is [deployTimestamp, +24h).
    uint256 public immutable deployTimestamp;

    /// @notice Star Vault sink that receives the anti-snipe sell tax.
    address public immutable vault;

    /// @notice Addresses treated as AMM pairs; a transfer *into* one is a "sell".
    mapping(address => bool) public isAmmPair;

    // ============ Per-epoch mint cap ============

    /// @notice Maximum DUST mintable per epoch.
    uint256 public immutable mintCapPerEpoch;

    /// @notice Length of a mint-cap epoch in seconds.
    uint256 public immutable epochDuration;

    /// @notice DUST minted in a given epoch index.
    mapping(uint256 => uint256) public mintedInEpoch;

    // ============ Events ============

    event AmmPairSet(address indexed pair, bool isPair);
    event SellTaxCollected(address indexed seller, address indexed pair, uint256 tax);

    // ============ Errors ============

    error ZeroAddress();
    error ZeroEpochDuration();
    error EpochMintCapExceeded(uint256 epoch, uint256 requested, uint256 remaining);

    /**
     * @param admin            DAO governor — receives DEFAULT_ADMIN_ROLE.
     * @param vault_           Star Vault sink that receives the sell tax.
     * @param mintCapPerEpoch_ Max DUST mintable per epoch.
     * @param epochDuration_   Epoch length in seconds.
     */
    constructor(address admin, address vault_, uint256 mintCapPerEpoch_, uint256 epochDuration_)
        ERC20("Dust", "DUST")
    {
        if (admin == address(0) || vault_ == address(0)) revert ZeroAddress();
        if (epochDuration_ == 0) revert ZeroEpochDuration();

        deployTimestamp = block.timestamp;
        vault = vault_;
        mintCapPerEpoch = mintCapPerEpoch_;
        epochDuration = epochDuration_;

        // DAO holds admin; it grants MINTER/BURNER to the operational addresses
        // and can revoke them at any time. No team allocation is minted.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ============ Mint / burn (role-gated) ============

    /// @notice Mint DUST to `to`, bounded by the current epoch's mint cap.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 epoch = currentEpoch();
        uint256 minted = mintedInEpoch[epoch];
        if (minted + amount > mintCapPerEpoch) {
            revert EpochMintCapExceeded(epoch, amount, mintCapPerEpoch - minted);
        }
        mintedInEpoch[epoch] = minted + amount;
        _mint(to, amount);
    }

    /// @notice Burn `amount` DUST held by `from` (Equipment/auction/hit/stake).
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    // ============ Anti-snipe config (DAO) ============

    /// @notice Register/deregister an AMM pair for sell-tax purposes.
    function setAmmPair(address pair, bool isPair) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (pair == address(0)) revert ZeroAddress();
        isAmmPair[pair] = isPair;
        emit AmmPairSet(pair, isPair);
    }

    // ============ Views ============

    /// @notice Current mint-cap epoch index since deployment.
    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - deployTimestamp) / epochDuration;
    }

    /// @notice True while the 24h anti-snipe sell tax is active.
    function inAntiSnipeWindow() public view returns (bool) {
        return block.timestamp < deployTimestamp + ANTI_SNIPE_WINDOW;
    }

    /// @notice DUST still mintable in the current epoch.
    function remainingMintAllowance() external view returns (uint256) {
        return mintCapPerEpoch - mintedInEpoch[currentEpoch()];
    }

    // ============ Transfer hook (anti-snipe sell tax) ============

    /**
     * @dev Applies the anti-snipe sell tax. Mints (`from == 0`) and burns
     *      (`to == 0`) are never taxed. During the window, a transfer into a
     *      registered AMM pair routes 50% of the value to the vault and the
     *      remainder to the pair. Total value is conserved.
     */
    function _update(address from, address to, uint256 value) internal override {
        if (
            from != address(0) && to != address(0) && value > 0 && isAmmPair[to]
                && inAntiSnipeWindow()
        ) {
            uint256 tax = (value * SELL_TAX_BPS) / BPS_DENOMINATOR;
            if (tax > 0) {
                super._update(from, vault, tax);
                emit SellTaxCollected(from, to, tax);
            }
            super._update(from, to, value - tax);
        } else {
            super._update(from, to, value);
        }
    }
}
