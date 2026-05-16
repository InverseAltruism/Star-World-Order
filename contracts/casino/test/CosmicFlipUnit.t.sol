// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";

contract CosmicFlipUnitTest is Test {
    CasinoBankroll bankroll;
    CosmicFlip game;

    address owner = address(0xB055);
    address player = address(0xCAFE);
    address keeper = address(0xBEEF); // backend that calls settleBet

    bytes32 constant SERVER_SEED = bytes32(uint256(0xA11CE));
    bytes32 constant CLIENT_SEED = bytes32(uint256(0xC11ABC));

    uint256 constant MIN_BET = 0.001 ether;
    uint256 constant MAX_BET = 0.1 ether;
    uint256 constant SEED_AMT = 10 ether;

    function setUp() public {
        vm.deal(owner, 100 ether);
        vm.deal(player, 10 ether);

        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        game = new CosmicFlip(owner, address(bankroll), MIN_BET, MAX_BET);
        bankroll.registerGame(address(game), SEED_AMT);
        bankroll.deposit{value: SEED_AMT}();
        vm.stopPrank();
    }

    // ---- Helpers ----

    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed));
    }

    function _placeBet(CosmicFlip.Side side, uint256 stake) internal returns (uint256) {
        vm.prank(player);
        return game.placeBet{value: stake}(side, CLIENT_SEED, _commit(SERVER_SEED));
    }

    // ---- Settlement math (the 100% target) ----

    function test_placeBet_storesPendingBet() public {
        uint256 betId = _placeBet(CosmicFlip.Side.Heads, 0.01 ether);
        (
            address p,
            uint96 stake,,
            bytes32 commit,,
            CosmicFlip.Side side,
            CosmicFlip.Status status,,
        ) = game.bets(betId);
        assertEq(p, player);
        assertEq(stake, uint96(0.01 ether));
        assertEq(commit, _commit(SERVER_SEED));
        assertEq(uint8(side), uint8(CosmicFlip.Side.Heads));
        assertEq(uint8(status), uint8(CosmicFlip.Status.Pending));
    }

    function test_placeBet_revertsBelowMin() public {
        vm.prank(player);
        vm.expectRevert(CosmicFlip.StakeOutOfBounds.selector);
        game.placeBet{value: MIN_BET - 1}(CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_placeBet_revertsAboveMax() public {
        vm.prank(player);
        vm.expectRevert(CosmicFlip.StakeOutOfBounds.selector);
        game.placeBet{value: MAX_BET + 1}(CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_settleBet_winnerPaysOut198x() public {
        uint256 stake = 0.01 ether;
        // Compute the rolled side off-chain (mirrors the on-chain math).
        uint256 nonceUsed = game.playerNonce(player);
        uint256 outcome = CommitRevealRandomness.rollOutcome(SERVER_SEED, CLIENT_SEED, nonceUsed, 2);
        CosmicFlip.Side rolled = outcome == 0 ? CosmicFlip.Side.Heads : CosmicFlip.Side.Tails;

        uint256 betId = _placeBet(rolled, stake);

        uint256 playerBefore = player.balance;
        vm.prank(keeper);
        game.settleBet(betId, SERVER_SEED);

        uint256 expectedPayout = (stake * 198) / 100;
        assertEq(player.balance, playerBefore + expectedPayout, "winner payout = 1.98x stake");

        (,,,,,, CosmicFlip.Status status,,) = game.bets(betId);
        assertEq(uint8(status), uint8(CosmicFlip.Status.Won));
    }

    function test_settleBet_loserKeepsNothing() public {
        uint256 stake = 0.01 ether;
        // Pick the *opposite* of what would have rolled.
        uint256 nonceUsed = game.playerNonce(player);
        uint256 outcome = CommitRevealRandomness.rollOutcome(SERVER_SEED, CLIENT_SEED, nonceUsed, 2);
        CosmicFlip.Side losing = outcome == 0 ? CosmicFlip.Side.Tails : CosmicFlip.Side.Heads;

        uint256 betId = _placeBet(losing, stake);

        uint256 playerBefore = player.balance;
        vm.prank(keeper);
        game.settleBet(betId, SERVER_SEED);

        assertEq(player.balance, playerBefore, "loser receives nothing");
        (,,,,,, CosmicFlip.Status status,,) = game.bets(betId);
        assertEq(uint8(status), uint8(CosmicFlip.Status.Lost));
    }

    function test_settleBet_rejectsInvalidReveal() public {
        uint256 betId = _placeBet(CosmicFlip.Side.Heads, 0.01 ether);
        vm.prank(keeper);
        vm.expectRevert(CosmicFlip.InvalidReveal.selector);
        game.settleBet(betId, bytes32(uint256(0xDEAD)));
    }

    function test_settleBet_rejectsDoubleSettle() public {
        uint256 betId = _placeBet(CosmicFlip.Side.Heads, 0.01 ether);
        vm.prank(keeper);
        game.settleBet(betId, SERVER_SEED);
        vm.prank(keeper);
        vm.expectRevert(CosmicFlip.BetNotPending.selector);
        game.settleBet(betId, SERVER_SEED);
    }

    // ---- Refund path ----

    function test_refundBet_afterExpiry() public {
        uint256 stake = 0.01 ether;
        uint256 betId = _placeBet(CosmicFlip.Side.Heads, stake);

        // Before expiry: refund reverts.
        vm.prank(player);
        vm.expectRevert(CosmicFlip.BetNotExpired.selector);
        game.refundBet(betId);

        vm.roll(block.number + game.EXPIRY_BLOCKS());
        uint256 playerBefore = player.balance;
        vm.prank(player);
        game.refundBet(betId);
        assertEq(player.balance, playerBefore + stake, "refund returns full stake");

        (,,,,,, CosmicFlip.Status status,,) = game.bets(betId);
        assertEq(uint8(status), uint8(CosmicFlip.Status.Refunded));
    }

    function test_refundBet_rejectsNonPlayer() public {
        uint256 betId = _placeBet(CosmicFlip.Side.Heads, 0.01 ether);
        vm.roll(block.number + game.EXPIRY_BLOCKS());
        vm.prank(keeper);
        vm.expectRevert(CosmicFlip.NotPlayer.selector);
        game.refundBet(betId);
    }

    // ---- setBetBounds invariants (Phase 2 hardening) ----

    function test_setBetBounds_rejectsMaxBelowMin() public {
        vm.prank(owner);
        vm.expectRevert(CosmicFlip.InvalidBetBounds.selector);
        game.setBetBounds(0.01 ether, 0.005 ether);
    }

    function test_setBetBounds_rejectsMaxAboveUint96() public {
        vm.prank(owner);
        vm.expectRevert(CosmicFlip.InvalidBetBounds.selector);
        game.setBetBounds(MIN_BET, uint256(type(uint96).max) + 1);
    }

    function test_setBetBounds_rejectsAllowanceShortfall() public {
        // SEED_AMT == 10 ether. Required allowance for newMax = 11 ether is
        // (198 - 100) * 11e18 / 100 = 10.78 ether — exceeds available, must revert.
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                CosmicFlip.BankrollAllowanceTooLow.selector,
                (uint256(98) * 11 ether) / 100,
                SEED_AMT
            )
        );
        game.setBetBounds(MIN_BET, 11 ether);
    }

    function test_setBetBounds_acceptsAfterAllowanceTopUp() public {
        // Top up the allowance first, then raising maxBet succeeds.
        vm.prank(owner);
        bankroll.setGameAllowance(address(game), 50 ether);
        vm.prank(owner);
        game.setBetBounds(MIN_BET, 1 ether);
        assertEq(game.maxBet(), 1 ether);
    }

    // ---- Pause ----

    function test_paused_blocksPlaceBet() public {
        vm.prank(owner);
        game.pause();
        vm.prank(player);
        vm.expectRevert();
        game.placeBet{value: 0.01 ether}(CosmicFlip.Side.Heads, CLIENT_SEED, _commit(SERVER_SEED));
    }

    // ---- Fuzz: settlement math holds for arbitrary (server, client, nonce) ----

    function testFuzz_winnerAlwaysGets198x(bytes32 fSeed, bytes32 fClient, uint96 fStake) public {
        uint256 stake = bound(uint256(fStake), MIN_BET, MAX_BET);
        bytes32 commit = keccak256(abi.encodePacked(fSeed));

        uint256 nonceUsed = game.playerNonce(player);
        uint256 outcome = CommitRevealRandomness.rollOutcome(fSeed, fClient, nonceUsed, 2);
        CosmicFlip.Side rolled = outcome == 0 ? CosmicFlip.Side.Heads : CosmicFlip.Side.Tails;

        vm.prank(player);
        uint256 betId = game.placeBet{value: stake}(rolled, fClient, commit);

        uint256 playerBefore = player.balance;
        vm.prank(keeper);
        game.settleBet(betId, fSeed);

        uint256 expected = (stake * 198) / 100;
        assertEq(player.balance, playerBefore + expected);
    }
}
