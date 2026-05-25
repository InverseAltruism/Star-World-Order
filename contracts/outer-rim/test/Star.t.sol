// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Star} from "../src/Star.sol";

contract StarTest is Test {
    Star internal star;

    address internal dao = address(0xDA0);
    address internal minter = address(0x111);
    address internal burner = address(0x222);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant CAP = 1_000_000 ether;
    uint256 internal constant EPOCH = 1 days;

    function setUp() public {
        star = new Star(dao, CAP, EPOCH);
        vm.startPrank(dao);
        star.grantRole(star.MINTER_ROLE(), minter);
        star.grantRole(star.BURNER_ROLE(), burner);
        vm.stopPrank();
    }

    function test_metadata() public view {
        assertEq(star.name(), "Star");
        assertEq(star.symbol(), "STAR");
        assertTrue(star.hasRole(star.DEFAULT_ADMIN_ROLE(), dao));
    }

    function test_minterCanMint() public {
        vm.prank(minter);
        star.mint(alice, 100 ether);
        assertEq(star.balanceOf(alice), 100 ether);
    }

    function test_nonMinterCannotMint() public {
        vm.expectRevert();
        vm.prank(alice);
        star.mint(alice, 1 ether);
    }

    function test_burnerCanBurn() public {
        vm.prank(minter);
        star.mint(alice, 100 ether);
        vm.prank(burner);
        star.burn(alice, 40 ether);
        assertEq(star.balanceOf(alice), 60 ether);
    }

    function test_soulbound_transferReverts() public {
        vm.prank(minter);
        star.mint(alice, 100 ether);
        vm.expectRevert(Star.Soulbound.selector);
        vm.prank(alice);
        star.transfer(bob, 1 ether);
    }

    function test_soulbound_transferFromReverts() public {
        vm.prank(minter);
        star.mint(alice, 100 ether);
        vm.prank(alice);
        star.approve(bob, 50 ether);
        vm.expectRevert(Star.Soulbound.selector);
        vm.prank(bob);
        star.transferFrom(alice, bob, 10 ether);
    }

    function test_epochMintCapEnforced() public {
        vm.prank(minter);
        star.mint(alice, CAP);
        vm.expectRevert();
        vm.prank(minter);
        star.mint(alice, 1);
    }

    function test_mintCapResetsNextEpoch() public {
        vm.prank(minter);
        star.mint(alice, CAP);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(minter);
        star.mint(alice, 100 ether); // fresh epoch allowance
        assertEq(star.balanceOf(alice), CAP + 100 ether);
    }

    function test_daoCanRevokeMinter() public {
        bytes32 role = star.MINTER_ROLE();
        vm.prank(dao);
        star.revokeRole(role, minter);
        vm.expectRevert();
        vm.prank(minter);
        star.mint(alice, 1 ether);
    }

    function testFuzz_mintNeverExceedsEpochCap(uint256 a, uint256 b) public {
        a = bound(a, 0, CAP);
        b = bound(b, 0, CAP);
        vm.startPrank(minter);
        if (a > 0) star.mint(alice, a);
        if (a + b > CAP) {
            vm.expectRevert();
            star.mint(alice, b);
        } else if (b > 0) {
            star.mint(alice, b);
        }
        vm.stopPrank();
        assertLe(star.mintedInEpoch(star.currentEpoch()), CAP);
    }
}
