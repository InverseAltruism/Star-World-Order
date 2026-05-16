// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CasinoAllowlist} from "../src/CasinoAllowlist.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";

/// @title CasinoAllowlistUnit
/// @notice Port of `BunnyBagzAllowlist.t.sol` (Mega House) → SWO's Cosmic Casino
///         soft-launch gate (`CasinoAllowlist`). Mechanical rename:
///           BunnyBagzAllowlist   → CasinoAllowlist
///           BunnyBagzBankroll    → CasinoBankroll
///           BunnyBagzCoinflip    → CosmicFlip
///           BunnyBagzDice        → GravityDice
///           BunnyBagzHiLo        → ConstellationClimb
///         Covers the allowlist surface — batch add/remove, owner-only edits,
///         zero-address rejection, the enabled flag, and `enforceAccess` under
///         all three states required by the spec:
///           (i)   enabled + allowed   → passthrough
///           (ii)  enabled + denied    → reverts NotAllowed
///           (iii) disabled            → passthrough
///         Then wires the gate into each game and re-verifies blocked vs.
///         allowed wallets and the operator's gate-off / detach escape hatches.
contract CasinoAllowlistUnitTest is Test {
    CasinoAllowlist allowlist;
    CasinoBankroll bankroll;
    CosmicFlip coinflip;
    GravityDice dice;
    ConstellationClimb hilo;

    address owner   = address(0xB055);
    address allowed = address(0xA11);
    address blocked = address(0xB10C);
    address other   = address(0xC0FFEE);

    bytes32 constant SERVER_SEED = bytes32(uint256(0xA11CE));
    bytes32 constant CLIENT_SEED = bytes32(uint256(0xC11ABC));

    uint256 constant MIN_BET = 0.001 ether;
    uint256 constant MAX_BET = 0.1 ether;
    uint256 constant SEED_AMT = 10 ether;

    function setUp() public {
        vm.deal(owner, 100 ether);
        vm.deal(allowed, 10 ether);
        vm.deal(blocked, 10 ether);
        vm.deal(other,   10 ether);

        vm.startPrank(owner);
        allowlist = new CasinoAllowlist(owner, true);
        bankroll = new CasinoBankroll(owner);
        coinflip = new CosmicFlip(owner, address(bankroll), MIN_BET, MAX_BET);
        dice     = new GravityDice(owner, address(bankroll), MIN_BET, MAX_BET);
        hilo     = new ConstellationClimb(owner, address(bankroll), MIN_BET, MAX_BET, 1 ether);
        bankroll.registerGame(address(coinflip), SEED_AMT);
        bankroll.registerGame(address(dice),     SEED_AMT);
        bankroll.registerGame(address(hilo),     SEED_AMT);
        bankroll.deposit{value: SEED_AMT}();

        coinflip.setAllowlist(address(allowlist));
        dice.setAllowlist(address(allowlist));
        hilo.setAllowlist(address(allowlist));

        address[] memory seed = new address[](1);
        seed[0] = allowed;
        allowlist.addAllowed(seed);
        vm.stopPrank();
    }

    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed));
    }

    // ---- Allowlist contract surface ----

    function test_allowlist_initialState() public view {
        assertTrue(allowlist.allowlistEnabled());
        assertTrue(allowlist.isAllowed(allowed));
        assertFalse(allowlist.isAllowed(blocked));
    }

    function test_allowlist_addAllowedBatch() public {
        address[] memory batch = new address[](2);
        batch[0] = blocked;
        batch[1] = other;
        vm.prank(owner);
        allowlist.addAllowed(batch);
        assertTrue(allowlist.isAllowed(blocked));
        assertTrue(allowlist.isAllowed(other));
    }

    function test_allowlist_removeAllowedBatch() public {
        address[] memory batch = new address[](1);
        batch[0] = allowed;
        vm.prank(owner);
        allowlist.removeAllowed(batch);
        assertFalse(allowlist.isAllowed(allowed));
    }

    function test_allowlist_setEnabledFlipsGate() public {
        assertFalse(allowlist.gateOpen(blocked));
        vm.prank(owner);
        allowlist.setAllowlistEnabled(false);
        // disabled = open house, every wallet passes
        assertTrue(allowlist.gateOpen(blocked));
        assertTrue(allowlist.gateOpen(allowed));
    }

    function test_allowlist_addAllowedRejectsZeroAddress() public {
        address[] memory batch = new address[](1);
        batch[0] = address(0);
        vm.prank(owner);
        vm.expectRevert(CasinoAllowlist.ZeroAddress.selector);
        allowlist.addAllowed(batch);
    }

    function test_allowlist_onlyOwnerCanModify() public {
        address[] memory batch = new address[](1);
        batch[0] = blocked;
        vm.prank(blocked);
        vm.expectRevert();
        allowlist.addAllowed(batch);
    }

    function test_allowlist_enforceAccessReverts() public {
        vm.expectRevert(CasinoAllowlist.NotAllowed.selector);
        allowlist.enforceAccess(blocked);
    }

    function test_allowlist_enforceAccessPasses() public view {
        allowlist.enforceAccess(allowed);  // does not revert
    }

    // ---- Game wiring (the criterion-(b) tests) ----

    function test_coinflip_revertsForBlockedWallet() public {
        vm.prank(blocked);
        vm.expectRevert(CosmicFlip.NotAllowed.selector);
        coinflip.placeBet{value: 0.01 ether}(
            CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED)
        );
    }

    function test_coinflip_passesForAllowedWallet() public {
        vm.prank(allowed);
        uint256 betId = coinflip.placeBet{value: 0.01 ether}(
            CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED)
        );
        // betId is the first storage slot — was 0 before, must now be 0 (first id)
        assertEq(betId, 0);
    }

    function test_dice_revertsForBlockedWallet() public {
        vm.prank(blocked);
        vm.expectRevert(GravityDice.NotAllowed.selector);
        dice.placeBet{value: 0.01 ether}(50, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_hilo_revertsForBlockedWallet() public {
        vm.prank(blocked);
        vm.expectRevert(ConstellationClimb.NotAllowed.selector);
        hilo.openSession{value: 0.01 ether}(CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_gateOff_blockedWalletPasses() public {
        // Operator flips the gate — the soft-launch closing event.
        vm.prank(owner);
        allowlist.setAllowlistEnabled(false);

        vm.prank(blocked);
        uint256 betId = coinflip.placeBet{value: 0.01 ether}(
            CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED)
        );
        assertEq(betId, 0);
    }

    function test_clearAllowlistOnGame_anyoneCanPlay() public {
        // Operator detaches the allowlist entirely — equivalent to gate off.
        vm.prank(owner);
        coinflip.setAllowlist(address(0));

        vm.prank(blocked);
        uint256 betId = coinflip.placeBet{value: 0.01 ether}(
            CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED)
        );
        assertEq(betId, 0);
    }
}
