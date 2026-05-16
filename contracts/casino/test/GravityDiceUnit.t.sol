// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";

/// @title GravityDiceUnit
/// @notice Port of `BunnyBagzDice.t.sol` (Mega House) → SWO's Cosmic Casino
///         Roll-Under dice (`GravityDice`). Mechanical rename:
///           BunnyBagzBankroll   → CasinoBankroll
///           BunnyBagzDice       → GravityDice
///           BunnyBagzRandomness → CommitRevealRandomness
///         Verifies the settlement math invariant `payout = stake * 99 / (R-1)`
///         across the legal `rollUnder ∈ [2, 98]` range, with parameterised
///         winning + losing seed coverage, the refund/pause/preview helpers,
///         and the `setBetBounds` hardening checks.
contract GravityDiceUnitTest is Test {
    CasinoBankroll bankroll;
    GravityDice game;

    address owner = address(0xB055);
    address player = address(0xCAFE);
    address keeper = address(0xBEEF);

    bytes32 constant SERVER_SEED = bytes32(uint256(0xA11CE));
    bytes32 constant CLIENT_SEED = bytes32(uint256(0xC11ABC));

    uint256 constant MIN_BET = 0.001 ether;
    uint256 constant MAX_BET = 0.1 ether;
    uint256 constant SEED_AMT = 100 ether; // covers 99x payouts in fuzz

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.deal(player, 100 ether);

        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        game = new GravityDice(owner, address(bankroll), MIN_BET, MAX_BET);
        bankroll.registerGame(address(game), SEED_AMT);
        bankroll.deposit{value: SEED_AMT}();
        vm.stopPrank();
    }

    // ---- Helpers ----

    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed));
    }

    function _placeBet(uint8 rollUnder, uint256 stake) internal returns (uint256) {
        vm.prank(player);
        return game.placeBet{value: stake}(rollUnder, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function _rollFor(bytes32 server, bytes32 client, uint256 nonce) internal pure returns (uint8) {
        return uint8(CommitRevealRandomness.rollOutcome(server, client, nonce, 100) + 1);
    }

    // ---- Bounds & validation ----

    function test_placeBet_storesPendingBet() public {
        uint256 betId = _placeBet(50, 0.01 ether);
        (
            address p,
            uint96 stake,,
            bytes32 commit,,
            uint8 ru,
            GravityDice.Status status,
            uint8 roll,,
        ) = game.bets(betId);
        assertEq(p, player);
        assertEq(stake, uint96(0.01 ether));
        assertEq(commit, _commit(SERVER_SEED));
        assertEq(ru, 50);
        assertEq(roll, 0); // not yet settled
        assertEq(uint8(status), uint8(GravityDice.Status.Pending));
    }

    function test_placeBet_revertsBelowMinRollUnder() public {
        vm.prank(player);
        vm.expectRevert(GravityDice.InvalidRollUnder.selector);
        game.placeBet{value: 0.01 ether}(1, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_placeBet_revertsAboveMaxRollUnder() public {
        vm.prank(player);
        vm.expectRevert(GravityDice.InvalidRollUnder.selector);
        game.placeBet{value: 0.01 ether}(99, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_placeBet_acceptsBoundary_min() public {
        uint256 betId = _placeBet(2, 0.01 ether);
        (,,,,, uint8 ru,,,,) = game.bets(betId);
        assertEq(ru, 2);
    }

    function test_placeBet_acceptsBoundary_max() public {
        uint256 betId = _placeBet(98, 0.01 ether);
        (,,,,, uint8 ru,,,,) = game.bets(betId);
        assertEq(ru, 98);
    }

    function test_placeBet_revertsBelowMinStake() public {
        vm.prank(player);
        vm.expectRevert(GravityDice.StakeOutOfBounds.selector);
        game.placeBet{value: MIN_BET - 1}(50, CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_placeBet_revertsAboveMaxStake() public {
        vm.prank(player);
        vm.expectRevert(GravityDice.StakeOutOfBounds.selector);
        game.placeBet{value: MAX_BET + 1}(50, CLIENT_SEED, _commit(SERVER_SEED));
    }

    // ---- Settlement math (the 100% target) ----

    function test_settleBet_winnerPaysOut99OverRMinus1() public {
        uint256 stake = 0.01 ether;

        uint256 nonceUsed = game.playerNonce(player);
        uint8 roll = _rollFor(SERVER_SEED, CLIENT_SEED, nonceUsed);
        // To deterministically construct a winning bet we need rollUnder > roll
        // with rollUnder ≤ 98. If the seed lands on roll ≥ 98 there is no legal
        // winning rollUnder; the fuzz test covers that branch — skip here.
        if (roll >= game.MAX_ROLL_UNDER()) return;
        uint8 ru = roll + 1; // 2 ≤ ru ≤ 98 is guaranteed since roll ∈ [1, 97]

        uint256 betId = _placeBet(ru, stake);

        uint256 playerBefore = player.balance;
        vm.prank(keeper);
        game.settleBet(betId, SERVER_SEED);

        uint256 expectedPayout = (stake * 99) / (uint256(ru) - 1);
        assertEq(player.balance, playerBefore + expectedPayout, "winner payout = stake * 99/(R-1)");

        (,,,,,, GravityDice.Status status, uint8 storedRoll,,) = game.bets(betId);
        assertEq(uint8(status), uint8(GravityDice.Status.Won));
        assertEq(storedRoll, roll);
    }

    function test_settleBet_loserKeepsNothing() public {
        uint256 stake = 0.01 ether;

        uint256 nonceUsed = game.playerNonce(player);
        uint8 roll = _rollFor(SERVER_SEED, CLIENT_SEED, nonceUsed);
        // To deterministically construct a losing bet we need rollUnder ≤ roll
        // with rollUnder ≥ 2. If the seed lands on roll == 1 there is no legal
        // losing rollUnder; the fuzz test covers that branch — skip here.
        if (roll < game.MIN_ROLL_UNDER()) return;
        uint8 ru = roll > game.MAX_ROLL_UNDER() ? game.MAX_ROLL_UNDER() : roll;
        // Sanity: roll < ru is the win condition; we want it to be false.
        require(roll >= ru, "test setup: must be loss");

        uint256 betId = _placeBet(ru, stake);

        uint256 playerBefore = player.balance;
        vm.prank(keeper);
        game.settleBet(betId, SERVER_SEED);

        assertEq(player.balance, playerBefore, "loser receives nothing");
        (,,,,,, GravityDice.Status status, uint8 storedRoll,,) = game.bets(betId);
        assertEq(uint8(status), uint8(GravityDice.Status.Lost));
        assertEq(storedRoll, roll);
    }

    function test_settleBet_rejectsInvalidReveal() public {
        uint256 betId = _placeBet(50, 0.01 ether);
        vm.prank(keeper);
        vm.expectRevert(GravityDice.InvalidReveal.selector);
        game.settleBet(betId, bytes32(uint256(0xDEAD)));
    }

    function test_settleBet_rejectsDoubleSettle() public {
        uint256 betId = _placeBet(50, 0.01 ether);
        vm.prank(keeper);
        game.settleBet(betId, SERVER_SEED);
        vm.prank(keeper);
        vm.expectRevert(GravityDice.BetNotPending.selector);
        game.settleBet(betId, SERVER_SEED);
    }

    // ---- Refund path ----

    function test_refundBet_afterExpiry() public {
        uint256 stake = 0.01 ether;
        uint256 betId = _placeBet(50, stake);

        // Before expiry: refund reverts.
        vm.prank(player);
        vm.expectRevert(GravityDice.BetNotExpired.selector);
        game.refundBet(betId);

        vm.roll(block.number + game.EXPIRY_BLOCKS());
        uint256 playerBefore = player.balance;
        vm.prank(player);
        game.refundBet(betId);
        assertEq(player.balance, playerBefore + stake, "refund returns full stake");

        (,,,,,, GravityDice.Status status,,,) = game.bets(betId);
        assertEq(uint8(status), uint8(GravityDice.Status.Refunded));
    }

    function test_refundBet_rejectsNonPlayer() public {
        uint256 betId = _placeBet(50, 0.01 ether);
        vm.roll(block.number + game.EXPIRY_BLOCKS());
        vm.prank(keeper);
        vm.expectRevert(GravityDice.NotPlayer.selector);
        game.refundBet(betId);
    }

    // ---- Pause ----

    function test_paused_blocksPlaceBet() public {
        vm.prank(owner);
        game.pause();
        vm.prank(player);
        vm.expectRevert();
        game.placeBet{value: 0.01 ether}(50, CLIENT_SEED, _commit(SERVER_SEED));
    }

    // ---- Read helpers ----

    function test_previewRoll_matchesSettledRoll() public view {
        uint256 nonceUsed = game.playerNonce(player);
        uint8 expectedRoll = _rollFor(SERVER_SEED, CLIENT_SEED, nonceUsed);

        uint8 preview = game.previewRoll(SERVER_SEED, CLIENT_SEED, nonceUsed);
        assertEq(preview, expectedRoll, "preview must equal settle outcome");
    }

    function test_quotePayout_matchesFormula() public view {
        // Sample rollUnders covering low / mid / high.
        uint8[3] memory rus = [uint8(2), uint8(50), uint8(98)];
        uint256 stake = 0.05 ether;
        for (uint256 i = 0; i < rus.length; i++) {
            uint256 expected = (stake * 99) / (uint256(rus[i]) - 1);
            assertEq(game.quotePayout(stake, rus[i]), expected, "quote mismatch");
        }
    }

    function test_quotePayout_revertsOnInvalidRollUnder() public {
        vm.expectRevert(GravityDice.InvalidRollUnder.selector);
        game.quotePayout(0.01 ether, 1);
        vm.expectRevert(GravityDice.InvalidRollUnder.selector);
        game.quotePayout(0.01 ether, 99);
    }

    // ---- setBetBounds invariants (Phase 2 hardening) ----

    function test_setBetBounds_rejectsMaxBelowMin() public {
        vm.prank(owner);
        vm.expectRevert(GravityDice.InvalidBetBounds.selector);
        game.setBetBounds(0.01 ether, 0.005 ether);
    }

    function test_setBetBounds_rejectsMaxAboveUint96() public {
        vm.prank(owner);
        vm.expectRevert(GravityDice.InvalidBetBounds.selector);
        game.setBetBounds(MIN_BET, uint256(type(uint96).max) + 1);
    }

    // ---- Cross-layer parity (mirrors packages/verify diceRoll vectors) ----

    function test_parityDice_v1() public pure {
        bytes32 server =
            bytes32(uint256(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa));
        bytes32 client =
            bytes32(uint256(0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));
        uint256 nonce = 0;
        uint256 expectedDice = 5;

        uint256 raw = CommitRevealRandomness.rollOutcome(server, client, nonce, 100);
        assertEq(raw + 1, expectedDice, "v1 dice drift");
    }

    function test_parityDice_v2() public pure {
        bytes32 server =
            bytes32(uint256(0x1212121212121212121212121212121212121212121212121212121212121212));
        bytes32 client =
            bytes32(uint256(0xfefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe));
        uint256 nonce = 42;
        uint256 expectedDice = 13;

        uint256 raw = CommitRevealRandomness.rollOutcome(server, client, nonce, 100);
        assertEq(raw + 1, expectedDice, "v2 dice drift");
    }

    function test_parityDice_v3() public pure {
        bytes32 server = bytes32(uint256(0));
        bytes32 client =
            bytes32(uint256(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff));
        uint256 nonce = 999;
        uint256 expectedDice = 62;

        uint256 raw = CommitRevealRandomness.rollOutcome(server, client, nonce, 100);
        assertEq(raw + 1, expectedDice, "v3 dice drift");
    }

    // ---- Parameterised rollUnder ∈ [2, 98] coverage (acceptance ©) ----

    /// @notice Picks six distinct (server, client) seed pairs spanning the
    ///         legal `rollUnder` range. For each, derives the natural roll
    ///         and picks `ru` either above (forced win) or at-or-below
    ///         (forced loss) — guaranteeing ≥3 winning and ≥3 losing branches
    ///         executed in a single run. Asserts the exact payout invariant
    ///         `(stake * 99) / (ru - 1)` on the win path and zero credit on
    ///         the loss path (acceptance (d)).
    function test_parameterisedRollUnders_threeWinsAndThreeLosses() public {
        bytes32[6] memory servers = [
            bytes32(uint256(0x11)),
            bytes32(uint256(0x22)),
            bytes32(uint256(0x33)),
            bytes32(uint256(0x44)),
            bytes32(uint256(0x55)),
            bytes32(uint256(0x66))
        ];
        bytes32[6] memory clients = [
            bytes32(uint256(0xa1)),
            bytes32(uint256(0xa2)),
            bytes32(uint256(0xa3)),
            bytes32(uint256(0xa4)),
            bytes32(uint256(0xa5)),
            bytes32(uint256(0xa6))
        ];
        // First three slots aim to win, last three aim to lose.
        bool[6] memory wantWin = [true, true, true, false, false, false];

        uint256 stake = 0.01 ether;
        uint256 wins;
        uint256 losses;

        for (uint256 i = 0; i < 6; i++) {
            uint256 nonceUsed = game.playerNonce(player);
            uint8 roll = _rollFor(servers[i], clients[i], nonceUsed);

            uint8 ru;
            if (wantWin[i]) {
                // Need ru > roll, ru ≤ 98. If roll == 98+, fall back to a loss.
                if (roll >= game.MAX_ROLL_UNDER()) {
                    ru = game.MAX_ROLL_UNDER();
                } else {
                    ru = roll + 1;
                }
            } else {
                // Need ru ≤ roll, ru ≥ 2. If roll == 1, fall back to a win.
                if (roll < game.MIN_ROLL_UNDER()) {
                    ru = roll + 1;
                } else if (roll > game.MAX_ROLL_UNDER()) {
                    ru = game.MAX_ROLL_UNDER();
                } else {
                    ru = roll;
                }
            }

            bytes32 commit = keccak256(abi.encodePacked(servers[i]));
            vm.prank(player);
            uint256 betId = game.placeBet{value: stake}(ru, clients[i], commit);

            uint256 playerBefore = player.balance;
            vm.prank(keeper);
            game.settleBet(betId, servers[i]);

            (,,,,,, GravityDice.Status status, uint8 storedRoll,,) = game.bets(betId);
            assertEq(storedRoll, roll, "stored roll mismatch");

            if (roll < ru) {
                uint256 expectedPayout = (stake * 99) / (uint256(ru) - 1);
                assertEq(
                    player.balance,
                    playerBefore + expectedPayout,
                    "win payout = stake * 99 / (ru - 1)"
                );
                assertEq(uint8(status), uint8(GravityDice.Status.Won));
                wins++;
            } else {
                assertEq(player.balance, playerBefore, "loser receives nothing");
                assertEq(uint8(status), uint8(GravityDice.Status.Lost));
                losses++;
            }
        }

        // Acceptance (c): at least 3 winning + 3 losing branches in one run.
        assertGe(wins, 3, "need >=3 winning seeds");
        assertGe(losses, 3, "need >=3 losing seeds");
    }

    // ---- Fuzz ----

    /// @notice Fuzz: settlement math holds for arbitrary (server, client, stake)
    ///         and the full legal `rollUnder` range [2, 98]. Asserts the win-
    ///         path payout exactly matches `stake * 99 / (R - 1)` whenever the
    ///         derived roll happens to be a winner; asserts a clean Lost
    ///         outcome otherwise.
    function testFuzz_settle_paysCorrectMultiplier(
        bytes32 fSeed,
        bytes32 fClient,
        uint96 fStake,
        uint8 fRollUnder
    ) public {
        uint256 stake = bound(uint256(fStake), MIN_BET, MAX_BET);
        uint8 ru = uint8(bound(uint256(fRollUnder), 2, 98));

        bytes32 commit = keccak256(abi.encodePacked(fSeed));

        uint256 nonceUsed = game.playerNonce(player);
        uint8 expectedRoll = _rollFor(fSeed, fClient, nonceUsed);

        vm.prank(player);
        uint256 betId = game.placeBet{value: stake}(ru, fClient, commit);

        uint256 playerBefore = player.balance;
        vm.prank(keeper);
        game.settleBet(betId, fSeed);

        (,,,,,, GravityDice.Status status, uint8 storedRoll,,) = game.bets(betId);
        assertEq(storedRoll, expectedRoll, "stored roll mismatch");

        if (expectedRoll < ru) {
            uint256 expectedPayout = (stake * 99) / (uint256(ru) - 1);
            assertEq(player.balance, playerBefore + expectedPayout, "win payout drift");
            assertEq(uint8(status), uint8(GravityDice.Status.Won));
        } else {
            assertEq(player.balance, playerBefore, "loss must pay nothing");
            assertEq(uint8(status), uint8(GravityDice.Status.Lost));
        }
    }

    /// @notice Fuzz: roll is always in [1, 100] regardless of inputs.
    function testFuzz_rollAlwaysInRange(bytes32 fSeed, bytes32 fClient, uint256 fNonce)
        public
        view
    {
        uint8 r = game.previewRoll(fSeed, fClient, fNonce);
        assertGe(r, 1);
        assertLe(r, 100);
    }

    /// @notice Fuzz: house edge is non-negative for every legal `rollUnder`.
    ///         Fair fee-free payout is `100/(R-1)`; we charge `99/(R-1)`. So
    ///         per-bet `payout * P(win) = stake * 99/(R-1) * (R-1)/100 = stake * 99/100`.
    ///         The cleanest invariant to assert is `payout < stake * 100 / (R-1)`
    ///         (strictly below the fair payout) for any stake ≥ 1.
    function testFuzz_payoutBelowFairForEveryRollUnder(uint8 fRollUnder, uint96 fStake)
        public
        view
    {
        uint8 ru = uint8(bound(uint256(fRollUnder), 2, 98));
        uint256 stake = bound(uint256(fStake), 1 ether, 100 ether);

        uint256 quoted = game.quotePayout(stake, ru);
        // fair = stake * 100 / (R-1); house edge ≥ 1% ⇒ quoted < fair.
        uint256 fair = (stake * 100) / (uint256(ru) - 1);
        assertLt(quoted, fair, "house must keep at least the 1% edge");
    }
}
