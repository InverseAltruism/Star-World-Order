// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Dust} from "../src/Dust.sol";
import {DustVaultSink} from "../src/DustVaultSink.sol";

contract DustTest is Test {
    Dust internal dust;
    DustVaultSink internal vault;

    address internal dao = makeAddr("dao");
    address internal minter = makeAddr("minter");
    address internal burner = makeAddr("burner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal pair = makeAddr("ammPair");

    uint256 internal constant EPOCH_CAP = 1_000_000 ether;
    uint256 internal constant EPOCH_DURATION = 1 days;

    function setUp() public {
        vault = new DustVaultSink(dao);
        dust = new Dust(dao, address(vault), EPOCH_CAP, EPOCH_DURATION);

        vm.startPrank(dao);
        dust.grantRole(dust.MINTER_ROLE(), minter);
        dust.grantRole(dust.BURNER_ROLE(), burner);
        dust.setAmmPair(pair, true);
        vm.stopPrank();
    }

    // ---------- construction ----------

    function test_constructor_metadataAndState() public view {
        assertEq(dust.name(), "Dust");
        assertEq(dust.symbol(), "DUST");
        assertEq(dust.decimals(), 18);
        assertEq(dust.vault(), address(vault));
        assertEq(dust.mintCapPerEpoch(), EPOCH_CAP);
        assertEq(dust.epochDuration(), EPOCH_DURATION);
        assertEq(dust.deployTimestamp(), block.timestamp);
    }

    function test_noTeamAllocation() public view {
        assertEq(dust.totalSupply(), 0);
        assertEq(dust.balanceOf(dao), 0);
    }

    function test_daoHoldsAdminRole() public view {
        assertTrue(dust.hasRole(dust.DEFAULT_ADMIN_ROLE(), dao));
    }

    function test_constructor_revertsOnZeroAddress() public {
        vm.expectRevert(Dust.ZeroAddress.selector);
        new Dust(address(0), address(vault), EPOCH_CAP, EPOCH_DURATION);
        vm.expectRevert(Dust.ZeroAddress.selector);
        new Dust(dao, address(0), EPOCH_CAP, EPOCH_DURATION);
    }

    function test_constructor_revertsOnZeroEpochDuration() public {
        vm.expectRevert(Dust.ZeroEpochDuration.selector);
        new Dust(dao, address(vault), EPOCH_CAP, 0);
    }

    // ---------- mint authorization ----------

    function test_mint_onlyMinter() public {
        vm.prank(minter);
        dust.mint(alice, 100 ether);
        assertEq(dust.balanceOf(alice), 100 ether);
    }

    function test_mint_revertsForNonMinter() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, dust.MINTER_ROLE()
            )
        );
        vm.prank(alice);
        dust.mint(alice, 100 ether);
    }

    // ---------- burn authorization ----------

    function test_burn_onlyBurner() public {
        vm.prank(minter);
        dust.mint(alice, 100 ether);
        vm.prank(burner);
        dust.burn(alice, 40 ether);
        assertEq(dust.balanceOf(alice), 60 ether);
        assertEq(dust.totalSupply(), 60 ether);
    }

    function test_burn_revertsForNonBurner() public {
        vm.prank(minter);
        dust.mint(alice, 100 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, bob, dust.BURNER_ROLE()
            )
        );
        vm.prank(bob);
        dust.burn(alice, 10 ether);
    }

    // ---------- DAO revocation (kill switch) ----------

    function test_daoCanRevokeMinter() public {
        bytes32 minterRole = dust.MINTER_ROLE();
        vm.prank(dao);
        dust.revokeRole(minterRole, minter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, minter, dust.MINTER_ROLE()
            )
        );
        vm.prank(minter);
        dust.mint(alice, 1 ether);
    }

    function test_daoCanRevokeBurner() public {
        vm.prank(minter);
        dust.mint(alice, 10 ether);
        bytes32 burnerRole = dust.BURNER_ROLE();
        vm.prank(dao);
        dust.revokeRole(burnerRole, burner);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, burner, dust.BURNER_ROLE()
            )
        );
        vm.prank(burner);
        dust.burn(alice, 1 ether);
    }

    function test_setAmmPair_revertsOnZeroAddress() public {
        vm.expectRevert(Dust.ZeroAddress.selector);
        vm.prank(dao);
        dust.setAmmPair(address(0), true);
    }

    function test_vault_constructorRevertsOnZeroAdmin() public {
        vm.expectRevert(DustVaultSink.ZeroAddress.selector);
        new DustVaultSink(address(0));
    }

    function test_vault_sweepRevertsOnZeroRecipient() public {
        vm.expectRevert(DustVaultSink.ZeroAddress.selector);
        vm.prank(dao);
        vault.sweep(dust, address(0), 0);
    }

    function test_setAmmPair_onlyAdmin() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                dust.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(alice);
        dust.setAmmPair(makeAddr("p2"), true);
    }

    // ---------- per-epoch mint cap ----------

    function test_mint_atCapSucceeds() public {
        vm.prank(minter);
        dust.mint(alice, EPOCH_CAP);
        assertEq(dust.balanceOf(alice), EPOCH_CAP);
        assertEq(dust.remainingMintAllowance(), 0);
    }

    function test_mint_overCapReverts() public {
        vm.prank(minter);
        dust.mint(alice, EPOCH_CAP - 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(Dust.EpochMintCapExceeded.selector, 0, 2 ether, 1 ether)
        );
        vm.prank(minter);
        dust.mint(alice, 2 ether);
    }

    function test_mintCap_resetsNextEpoch() public {
        vm.prank(minter);
        dust.mint(alice, EPOCH_CAP);
        // Advance into the next epoch.
        vm.warp(block.timestamp + EPOCH_DURATION);
        assertEq(dust.currentEpoch(), 1);
        assertEq(dust.remainingMintAllowance(), EPOCH_CAP);
        vm.prank(minter);
        dust.mint(bob, EPOCH_CAP);
        assertEq(dust.balanceOf(bob), EPOCH_CAP);
    }

    // ---------- anti-snipe sell tax ----------

    function _fund(address to, uint256 amount) internal {
        vm.prank(minter);
        dust.mint(to, amount);
    }

    function test_sellTax_appliedInWindowOnSellToPair() public {
        _fund(alice, 100 ether);
        assertTrue(dust.inAntiSnipeWindow());

        vm.prank(alice);
        dust.transfer(pair, 100 ether);

        // 50% to vault, 50% to the pair, total conserved.
        assertEq(dust.balanceOf(address(vault)), 50 ether);
        assertEq(dust.balanceOf(pair), 50 ether);
        assertEq(dust.balanceOf(alice), 0);
    }

    function test_sellTax_notAppliedToNonPairTransferInWindow() public {
        _fund(alice, 100 ether);
        vm.prank(alice);
        dust.transfer(bob, 100 ether);
        assertEq(dust.balanceOf(bob), 100 ether);
        assertEq(dust.balanceOf(address(vault)), 0);
    }

    function test_sellTax_notAppliedAfterWindow() public {
        _fund(alice, 100 ether);
        vm.warp(block.timestamp + dust.ANTI_SNIPE_WINDOW());
        assertFalse(dust.inAntiSnipeWindow());

        vm.prank(alice);
        dust.transfer(pair, 100 ether);
        assertEq(dust.balanceOf(pair), 100 ether);
        assertEq(dust.balanceOf(address(vault)), 0);
    }

    function test_mintAndBurn_neverTaxedEvenInWindow() public {
        assertTrue(dust.inAntiSnipeWindow());
        // Mint to the pair address: from == 0, must not be taxed.
        vm.prank(minter);
        dust.mint(pair, 100 ether);
        assertEq(dust.balanceOf(pair), 100 ether);
        assertEq(dust.balanceOf(address(vault)), 0);

        // Burn from the pair: to == 0, must not be taxed.
        vm.prank(burner);
        dust.burn(pair, 40 ether);
        assertEq(dust.balanceOf(pair), 60 ether);
        assertEq(dust.balanceOf(address(vault)), 0);
    }

    function testFuzz_sellTax_conservesValue(uint256 amount) public {
        amount = bound(amount, 1, EPOCH_CAP);
        _fund(alice, amount);
        vm.prank(alice);
        dust.transfer(pair, amount);

        uint256 tax = (amount * dust.SELL_TAX_BPS()) / dust.BPS_DENOMINATOR();
        assertEq(dust.balanceOf(address(vault)), tax);
        assertEq(dust.balanceOf(pair), amount - tax);
        assertEq(dust.balanceOf(address(vault)) + dust.balanceOf(pair), amount);
    }

    // ---------- vault sink ----------

    function test_vault_sweepByDao() public {
        _fund(alice, 100 ether);
        vm.prank(alice);
        dust.transfer(pair, 100 ether); // 50 DUST tax accrues to the vault
        assertEq(vault.balance(dust), 50 ether);

        vm.prank(dao);
        vault.sweep(dust, bob, 50 ether);
        assertEq(dust.balanceOf(bob), 50 ether);
        assertEq(vault.balance(dust), 0);
    }

    function test_vault_sweepRevertsForNonSweeper() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                alice,
                vault.SWEEPER_ROLE()
            )
        );
        vm.prank(alice);
        vault.sweep(dust, alice, 1);
    }
}
