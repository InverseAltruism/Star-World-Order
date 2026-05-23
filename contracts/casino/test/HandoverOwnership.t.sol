// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {HandoverOwnership} from "../script/HandoverOwnership.s.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";
import {CasinoAllowlist} from "../src/CasinoAllowlist.sol";

/// @title HandoverOwnershipTest
/// @notice Acceptance harness for `HandoverOwnership.s.sol`. Mirrors the
///         mainnet flow in-VM: deploys the casino stack from a deployer EOA,
///         runs the script with a multisig target, and asserts every contract
///         is owned by the multisig and the deployer no longer holds the
///         owner role anywhere. Uses `runWithParams` so tests don't fight
///         each other over the process-global env vars.
contract HandoverOwnershipTest is Test {
    uint256 internal constant DEPLOYER_PK = 0xA11CE;
    address internal deployer = vm.addr(DEPLOYER_PK);
    address internal multisig = address(0xB0B5);

    CasinoBankroll internal bankroll;
    CosmicFlip internal flip;
    GravityDice internal dice;
    ConstellationClimb internal climb;
    CasinoAllowlist internal allowlist;
    HandoverOwnership internal handover;

    function setUp() public {
        vm.deal(deployer, 100 ether);
        vm.startPrank(deployer);
        bankroll = new CasinoBankroll(deployer);
        flip = new CosmicFlip(deployer, address(bankroll), 0.001 ether, 0.1 ether);
        dice = new GravityDice(deployer, address(bankroll), 0.001 ether, 0.1 ether);
        climb = new ConstellationClimb(deployer, address(bankroll), 0.001 ether, 0.1 ether, 1 ether);
        allowlist = new CasinoAllowlist(deployer, true);
        vm.stopPrank();

        // Multisig stand-in: deploy a tiny contract so codesize > 0. The shell
        // wrapper enforces "not an EOA"; the Solidity script doesn't care, but
        // testing against a contract address keeps the harness honest.
        vm.etch(multisig, hex"6000");

        handover = new HandoverOwnership();
    }

    function _params() internal view returns (HandoverOwnership.HandoverParams memory p) {
        p.multisig = multisig;
        p.deployer = deployer;
        p.bankroll = address(bankroll);
        p.flip = address(flip);
        p.dice = address(dice);
        p.climb = address(climb);
        p.allowlist = address(allowlist);
    }

    /// @notice Happy path: every contract ends owned by the multisig and the
    ///         deployer no longer owns any of them.
    function test_handover_transfersAllContracts() public {
        handover.runWithParams(_params(), DEPLOYER_PK);

        assertEq(bankroll.owner(), multisig, "bankroll owner");
        assertEq(flip.owner(), multisig, "flip owner");
        assertEq(dice.owner(), multisig, "dice owner");
        assertEq(climb.owner(), multisig, "climb owner");
        assertEq(allowlist.owner(), multisig, "allowlist owner");

        assertTrue(bankroll.owner() != deployer, "deployer still owns bankroll");
        assertTrue(flip.owner() != deployer, "deployer still owns flip");
        assertTrue(dice.owner() != deployer, "deployer still owns dice");
        assertTrue(climb.owner() != deployer, "deployer still owns climb");
        assertTrue(allowlist.owner() != deployer, "deployer still owns allowlist");
    }

    /// @notice After handover, calling an owner-gated function as the deployer
    ///         must revert with OwnableUnauthorizedAccount — confirming the
    ///         old key really no longer holds the role on-chain.
    function test_handover_deployerLosesOwnerPowers() public {
        handover.runWithParams(_params(), DEPLOYER_PK);

        vm.startPrank(deployer);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer)
        );
        bankroll.pause();
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer)
        );
        flip.pause();
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer)
        );
        dice.pause();
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, deployer)
        );
        climb.pause();
        vm.stopPrank();
    }

    /// @notice The multisig CAN exercise owner powers after handover (sanity:
    ///         we didn't just lock the contracts up).
    function test_handover_multisigGainsOwnerPowers() public {
        handover.runWithParams(_params(), DEPLOYER_PK);

        vm.prank(multisig);
        bankroll.pause();
        assertTrue(bankroll.paused(), "bankroll should be paused by new owner");
    }

    /// @notice allowlist=0x0 skips the allowlist step. Used on mainnet where
    ///         the allowlist isn't deployed by default.
    function test_handover_skipsAllowlistWhenZero() public {
        HandoverOwnership.HandoverParams memory p = _params();
        p.allowlist = address(0);
        handover.runWithParams(p, DEPLOYER_PK);

        assertEq(bankroll.owner(), multisig);
        assertEq(allowlist.owner(), deployer, "allowlist must be untouched when param=0");
    }

    /// @notice Multisig == deployer is a no-op handover and must abort.
    function test_handover_rejectsMultisigEqualsDeployer() public {
        HandoverOwnership.HandoverParams memory p = _params();
        p.multisig = deployer;
        vm.expectRevert(
            abi.encodeWithSelector(HandoverOwnership.MultisigEqualsDeployer.selector, deployer)
        );
        handover.runWithParams(p, DEPLOYER_PK);
    }

    /// @notice Multisig == 0x0 must abort.
    function test_handover_rejectsMultisigZero() public {
        HandoverOwnership.HandoverParams memory p = _params();
        p.multisig = address(0);
        vm.expectRevert(HandoverOwnership.MultisigZero.selector);
        handover.runWithParams(p, DEPLOYER_PK);
    }

    /// @notice Missing bankroll address must abort.
    function test_handover_rejectsBankrollZero() public {
        HandoverOwnership.HandoverParams memory p = _params();
        p.bankroll = address(0);
        vm.expectRevert(HandoverOwnership.BankrollZero.selector);
        handover.runWithParams(p, DEPLOYER_PK);
    }

    /// @notice If somebody else already owns a contract (e.g. ownership was
    ///         partially moved out of band), the script must abort BEFORE
    ///         broadcasting so we don't leave the stack split-brain.
    function test_handover_rejectsWrongCurrentOwner() public {
        // Pre-move bankroll ownership to another account so the deployer is
        // no longer the current owner.
        vm.prank(deployer);
        bankroll.transferOwnership(address(0xDEAD));

        vm.expectRevert(
            abi.encodeWithSelector(
                HandoverOwnership.NotOwner.selector, address(bankroll), deployer, address(0xDEAD)
            )
        );
        handover.runWithParams(_params(), DEPLOYER_PK);
    }
}
