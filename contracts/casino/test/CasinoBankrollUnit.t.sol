// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Standalone unit tests for the CasinoBankroll lifecycle paths
///         that the coinflip+invariant suites only hit indirectly:
///         registerGame / setGameAllowance / revokeGame, deposit/withdraw,
///         pause/unpause, payout-out-of-allowance, and the onlyGame guard.
contract CasinoBankrollUnitTest is Test {
    CasinoBankroll bankroll;

    address owner = address(0xB055);
    address game = address(0xCAFE);
    address other = address(0xBEEF);
    address recipient = address(0xD00D);

    function setUp() public {
        vm.deal(owner, 100 ether);
        vm.prank(owner);
        bankroll = new CasinoBankroll(owner);
    }

    // ---- registerGame / setGameAllowance / revokeGame ----

    function test_registerGame_setsFlagsAndAllowance() public {
        vm.prank(owner);
        bankroll.registerGame(game, 1 ether);
        assertTrue(bankroll.isGame(game));
        assertEq(bankroll.allowanceOf(game), 1 ether);
    }

    function test_registerGame_rejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CasinoBankroll.ZeroAddress.selector);
        bankroll.registerGame(address(0), 1 ether);
    }

    function test_registerGame_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        bankroll.registerGame(game, 1 ether);
    }

    function test_setGameAllowance_updatesValue() public {
        vm.startPrank(owner);
        bankroll.registerGame(game, 1 ether);
        bankroll.setGameAllowance(game, 5 ether);
        vm.stopPrank();
        assertEq(bankroll.allowanceOf(game), 5 ether);
    }

    function test_setGameAllowance_rejectsUnregistered() public {
        vm.prank(owner);
        vm.expectRevert(CasinoBankroll.NotGame.selector);
        bankroll.setGameAllowance(game, 1 ether);
    }

    function test_revokeGame_zeroesAllowanceAndFlag() public {
        vm.startPrank(owner);
        bankroll.registerGame(game, 1 ether);
        bankroll.revokeGame(game);
        vm.stopPrank();
        assertFalse(bankroll.isGame(game));
        assertEq(bankroll.allowanceOf(game), 0);
    }

    function test_revokeGame_rejectsUnregistered() public {
        vm.prank(owner);
        vm.expectRevert(CasinoBankroll.NotGame.selector);
        bankroll.revokeGame(game);
    }

    // ---- deposit / withdraw ----

    function test_deposit_emitsEventAndIncreasesBalance() public {
        vm.expectEmit(true, false, false, true, address(bankroll));
        emit CasinoBankroll.Deposited(owner, 3 ether);
        vm.prank(owner);
        bankroll.deposit{value: 3 ether}();
        assertEq(address(bankroll).balance, 3 ether);
    }

    function test_deposit_rejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(CasinoBankroll.ZeroAmount.selector);
        bankroll.deposit{value: 0}();
    }

    function test_withdraw_sendsToRecipient() public {
        vm.startPrank(owner);
        bankroll.deposit{value: 2 ether}();
        bankroll.withdraw(recipient, 1 ether);
        vm.stopPrank();
        assertEq(recipient.balance, 1 ether);
        assertEq(address(bankroll).balance, 1 ether);
    }

    function test_withdraw_onlyOwner() public {
        vm.prank(owner);
        bankroll.deposit{value: 1 ether}();
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        bankroll.withdraw(recipient, 1 ether);
    }

    function test_withdraw_rejectsZeroRecipient() public {
        vm.startPrank(owner);
        bankroll.deposit{value: 1 ether}();
        vm.expectRevert(CasinoBankroll.ZeroAddress.selector);
        bankroll.withdraw(address(0), 1 ether);
        vm.stopPrank();
    }

    function test_withdraw_rejectsZeroAmount() public {
        vm.startPrank(owner);
        bankroll.deposit{value: 1 ether}();
        vm.expectRevert(CasinoBankroll.ZeroAmount.selector);
        bankroll.withdraw(recipient, 0);
        vm.stopPrank();
    }

    // ---- payout / settle (via game-only modifier) ----

    function test_payout_decrementsAllowanceAndSendsETH() public {
        vm.startPrank(owner);
        bankroll.registerGame(game, 5 ether);
        bankroll.deposit{value: 5 ether}();
        vm.stopPrank();

        vm.prank(game);
        bankroll.payout(recipient, 2 ether);
        assertEq(recipient.balance, 2 ether);
        assertEq(bankroll.allowanceOf(game), 3 ether);
    }

    function test_payout_rejectsNonGame() public {
        vm.prank(other);
        vm.expectRevert(CasinoBankroll.NotGame.selector);
        bankroll.payout(recipient, 1 ether);
    }

    function test_payout_rejectsOverAllowance() public {
        vm.startPrank(owner);
        bankroll.registerGame(game, 1 ether);
        bankroll.deposit{value: 5 ether}();
        vm.stopPrank();

        vm.prank(game);
        vm.expectRevert(
            abi.encodeWithSelector(CasinoBankroll.AllowanceExceeded.selector, 2 ether, 1 ether)
        );
        bankroll.payout(recipient, 2 ether);
    }

    function test_payout_rejectsZeroAmount() public {
        vm.prank(owner);
        bankroll.registerGame(game, 1 ether);
        vm.prank(game);
        vm.expectRevert(CasinoBankroll.ZeroAmount.selector);
        bankroll.payout(recipient, 0);
    }

    function test_payout_rejectsZeroRecipient() public {
        vm.prank(owner);
        bankroll.registerGame(game, 1 ether);
        vm.prank(game);
        vm.expectRevert(CasinoBankroll.ZeroAddress.selector);
        bankroll.payout(address(0), 1 ether);
    }

    function test_settle_increasesAllowanceAndBalance() public {
        vm.prank(owner);
        bankroll.registerGame(game, 1 ether);

        vm.deal(game, 5 ether);
        vm.prank(game);
        bankroll.settle{value: 2 ether}();

        assertEq(bankroll.allowanceOf(game), 3 ether);
        assertEq(address(bankroll).balance, 2 ether);
    }

    function test_settle_rejectsNonGame() public {
        vm.deal(other, 1 ether);
        vm.prank(other);
        vm.expectRevert(CasinoBankroll.NotGame.selector);
        bankroll.settle{value: 1 ether}();
    }

    function test_settle_rejectsZero() public {
        vm.prank(owner);
        bankroll.registerGame(game, 1 ether);
        vm.prank(game);
        vm.expectRevert(CasinoBankroll.ZeroAmount.selector);
        bankroll.settle{value: 0}();
    }

    // ---- pause / unpause (circuit-breaker contract) ----

    function test_pause_blocksPayoutsButLeavesSettleOpen() public {
        vm.startPrank(owner);
        bankroll.registerGame(game, 5 ether);
        bankroll.deposit{value: 5 ether}();
        bankroll.pause();
        vm.stopPrank();

        vm.prank(game);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bankroll.payout(recipient, 1 ether);

        // settle path remains open so games can still credit losses to the
        // bankroll while paused (the circuit-breaker stops outflows, not inflows).
        vm.deal(game, 1 ether);
        vm.prank(game);
        bankroll.settle{value: 1 ether}();
        assertEq(address(bankroll).balance, 6 ether);
    }

    function test_pause_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        bankroll.pause();
    }

    function test_unpause_restoresPayouts() public {
        vm.startPrank(owner);
        bankroll.registerGame(game, 5 ether);
        bankroll.deposit{value: 5 ether}();
        bankroll.pause();
        bankroll.unpause();
        vm.stopPrank();

        vm.prank(game);
        bankroll.payout(recipient, 1 ether);
        assertEq(recipient.balance, 1 ether);
    }

    // ---- balance() view helper ----

    function test_balance_matchesEth() public {
        vm.prank(owner);
        bankroll.deposit{value: 7 ether}();
        assertEq(bankroll.balance(), 7 ether);
    }

    // ---- receive: direct sends emit Deposited so indexer can see them ----

    function test_receive_emitsDepositedAndAcceptsETH() public {
        vm.deal(other, 1 ether);
        vm.expectEmit(true, false, false, true, address(bankroll));
        emit CasinoBankroll.Deposited(other, 1 ether);
        vm.prank(other);
        (bool ok,) = address(bankroll).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(bankroll).balance, 1 ether);
    }
}
