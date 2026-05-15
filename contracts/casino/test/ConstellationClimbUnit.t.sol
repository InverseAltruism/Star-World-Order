// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";

/// @title ConstellationClimbUnit
/// @notice Port of `BunnyBagzHiLo.t.sol` (Mega House) → SWO's Cosmic Casino
///         Hi-Lo (`ConstellationClimb`). Mechanical rename:
///           BunnyBagzBankroll   → CasinoBankroll
///           BunnyBagzHiLo       → ConstellationClimb
///           BunnyBagzRandomness → CommitRevealRandomness
///         Exercises:
///           - open / playStep (win / push / lose) lifecycle
///           - cashOut at 1.0× and at the two closest step-multipliers to
///             1.5× and 2.0× reachable in a single winning step
///             (initial card 5/Higher → 1.485× ; initial 7/Higher → 1.98×)
///           - `maxPayout` cap on both unit-multiplier and compounded sessions
///           - quoteStepMultiplier formula across the full legal domain
///           - cross-layer parity vectors and session-length fuzz.
contract ConstellationClimbUnitTest is Test {
    CasinoBankroll bankroll;
    ConstellationClimb game;

    address owner   = address(0xB055);
    address player  = address(0xCAFE);
    address keeper  = address(0xBEEF);

    bytes32 constant SERVER_SEED  = bytes32(uint256(0xA11CE));
    bytes32 constant SERVER_SEED2 = bytes32(uint256(0xA11CE2));
    bytes32 constant CLIENT_SEED  = bytes32(uint256(0xC11ABC));

    uint256 constant MIN_BET    = 0.001 ether;
    uint256 constant MAX_BET    = 0.1 ether;
    uint256 constant MAX_PAYOUT = 5 ether;
    uint256 constant SEED_AMT   = 200 ether; // generous to absorb compounded payouts

    uint256 constant WAD      = 1e18;
    uint256 constant STEP_NUM = 12 * 99;
    uint256 constant STEP_DEN = 100;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.deal(player, 100 ether);

        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        game = new ConstellationClimb(owner, address(bankroll), MIN_BET, MAX_BET, MAX_PAYOUT);
        bankroll.registerGame(address(game), SEED_AMT);
        bankroll.deposit{value: SEED_AMT}();
        vm.stopPrank();
    }

    // ---- Helpers ----

    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed));
    }

    function _open(uint256 stake, bytes32 clientSeed, bytes32 commit) internal returns (uint256) {
        vm.prank(player);
        return game.openSession{value: stake}(clientSeed, commit);
    }

    function _cardFor(bytes32 server, bytes32 client, uint256 nonce) internal pure returns (uint8) {
        return uint8(CommitRevealRandomness.rollOutcome(server, client, nonce, 13) + 1);
    }

    function _initialCardFor(bytes32 client) internal pure returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked(client, bytes32(uint256(0xC0DECAFE))))) % 13) + 1;
    }

    function _expectedHigherMult(uint256 oldMult, uint8 cur) internal pure returns (uint256) {
        return (oldMult * STEP_NUM) / ((13 - uint256(cur)) * STEP_DEN);
    }

    function _expectedLowerMult(uint256 oldMult, uint8 cur) internal pure returns (uint256) {
        return (oldMult * STEP_NUM) / ((uint256(cur) - 1) * STEP_DEN);
    }

    function _readCard(uint256 sessionId) internal view returns (uint8) {
        ( , , , , , uint8 c, , , , ) = game.sessions(sessionId);
        return c;
    }

    function _readMult(uint256 sessionId) internal view returns (uint256) {
        ( , , , , , , , , uint256 m, ) = game.sessions(sessionId);
        return m;
    }

    function _readStatus(uint256 sessionId) internal view returns (ConstellationClimb.Status) {
        ( , , , , , , ConstellationClimb.Status st, , , ) = game.sessions(sessionId);
        return st;
    }

    function _readBet(uint256 sessionId) internal view returns (uint96) {
        ( , uint96 b, , , , , , , , ) = game.sessions(sessionId);
        return b;
    }

    function _readStepCount(uint256 sessionId) internal view returns (uint8) {
        ( , , , , , , , uint8 sc, , ) = game.sessions(sessionId);
        return sc;
    }

    function _readNonce(uint256 sessionId) internal view returns (uint256) {
        ( , , , , , , , , , uint256 n) = game.sessions(sessionId);
        return n;
    }

    function _stepNonce(uint256 sessionId, uint8 stepIdx) internal view returns (uint256) {
        return _readNonce(sessionId) + uint256(stepIdx) + 1;
    }

    /// @dev Find a clientSeed whose initial card == `target`.
    function _seedForInitial(uint8 target) internal pure returns (bytes32) {
        for (uint256 i = 1; i < 10_000; i++) {
            bytes32 cs = bytes32(i);
            if (_initialCardFor(cs) == target) return cs;
        }
        revert("no seed found for target initial card");
    }

    /// @dev Find a server seed s.t. the first-step draw for (clientSeed, nonce=1)
    ///      is strictly greater than `floor` (used to force a Higher win).
    function _seedForHigherWin(bytes32 client, uint8 floor) internal pure returns (bytes32) {
        for (uint256 i = 1; i < 10_000; i++) {
            bytes32 s = bytes32(i);
            uint8 next = uint8(CommitRevealRandomness.rollOutcome(s, client, 1, 13) + 1);
            if (next > floor) return s;
        }
        revert("no server seed found for Higher win");
    }

    // ---- openSession bounds & state ----

    function test_open_storesSessionAndDealsCard() public {
        bytes32 commit = _commit(SERVER_SEED);
        uint256 sid = _open(0.01 ether, CLIENT_SEED, commit);

        assertEq(_readBet(sid), uint96(0.01 ether));
        assertEq(_readMult(sid), WAD);
        assertEq(_readCard(sid), _initialCardFor(CLIENT_SEED));
        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Open));
        assertEq(_readStepCount(sid), 0);
    }

    function test_open_revertsBelowMinStake() public {
        vm.prank(player);
        vm.expectRevert(ConstellationClimb.StakeOutOfBounds.selector);
        game.openSession{value: MIN_BET - 1}(CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_open_revertsAboveMaxStake() public {
        vm.prank(player);
        vm.expectRevert(ConstellationClimb.StakeOutOfBounds.selector);
        game.openSession{value: MAX_BET + 1}(CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_paused_blocksOpen() public {
        vm.prank(owner);
        game.pause();
        vm.prank(player);
        vm.expectRevert();
        game.openSession{value: 0.01 ether}(CLIENT_SEED, _commit(SERVER_SEED));
    }

    function test_previewInitialCard_matchesOpen() public {
        uint8 expected = _initialCardFor(CLIENT_SEED);
        assertEq(game.previewInitialCard(CLIENT_SEED), expected);
        uint256 sid = _open(0.01 ether, CLIENT_SEED, _commit(SERVER_SEED));
        assertEq(_readCard(sid), expected);
    }

    // ---- quoteStepMultiplier (settlement math 100% target) ----

    function test_quoteStepMultiplier_higherFormula() public view {
        for (uint8 c = 1; c <= 12; c++) {
            uint256 expected = (WAD * STEP_NUM) / ((13 - uint256(c)) * STEP_DEN);
            assertEq(game.quoteStepMultiplier(c, ConstellationClimb.Direction.Higher), expected, "higher quote drift");
        }
    }

    function test_quoteStepMultiplier_lowerFormula() public view {
        for (uint8 c = 2; c <= 13; c++) {
            uint256 expected = (WAD * STEP_NUM) / ((uint256(c) - 1) * STEP_DEN);
            assertEq(game.quoteStepMultiplier(c, ConstellationClimb.Direction.Lower), expected, "lower quote drift");
        }
    }

    function test_quoteStepMultiplier_revertsAtBoundaries() public {
        vm.expectRevert(ConstellationClimb.InvalidDirection.selector);
        game.quoteStepMultiplier(13, ConstellationClimb.Direction.Higher);
        vm.expectRevert(ConstellationClimb.InvalidDirection.selector);
        game.quoteStepMultiplier(1, ConstellationClimb.Direction.Lower);
    }

    // ---- previewCard ----

    function test_previewCard_inRange() public view {
        for (uint256 i = 0; i < 30; i++) {
            uint8 c = game.previewCard(SERVER_SEED, CLIENT_SEED, i);
            assertGe(c, 1);
            assertLe(c, 13);
        }
    }

    // ---- Settlement: a single winning step compounds the multiplier ----

    function test_playStep_winningHigherCompoundsMultiplier() public {
        bytes32 clientSeed = bytes32(uint256(0x100));
        uint8 initial = _initialCardFor(clientSeed);
        if (initial == 13) {
            clientSeed = bytes32(uint256(0x101));
            initial = _initialCardFor(clientSeed);
        }
        uint256 sid = _open(0.01 ether, clientSeed, _commit(SERVER_SEED));
        uint8 cur = _readCard(sid);

        bytes32 server = SERVER_SEED;
        for (uint256 i = 0; i < 100; i++) {
            uint8 probe = _cardFor(server, clientSeed, _stepNonce(sid, 0));
            if (probe > cur) break;
            server = keccak256(abi.encodePacked(server, "tweak"));
        }
        sid = _open(0.01 ether, clientSeed, _commit(server));
        cur = _readCard(sid);
        uint8 newCard = _cardFor(server, clientSeed, _stepNonce(sid, 0));
        if (newCard <= cur) {
            return;
        }

        uint256 oldMult = _readMult(sid);
        bytes32 nextCommit = _commit(SERVER_SEED2);

        vm.prank(keeper);
        game.playStep(sid, ConstellationClimb.Direction.Higher, server, nextCommit);

        uint256 expected = _expectedHigherMult(oldMult, cur);
        assertEq(_readMult(sid), expected, "higher compounding mismatch");
        assertEq(_readCard(sid), newCard, "currentCard advance");
        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Open), "stays open after win");
        assertEq(_readStepCount(sid), 1);
    }

    function test_playStep_tieIsPushAndRefundsStake() public {
        bytes32 clientSeed = bytes32(uint256(1));
        bytes32 server = bytes32(uint256(1));
        uint8 cur;
        bool found;
        for (uint256 i = 1; i < 200 && !found; i++) {
            clientSeed = bytes32(i);
            cur = _initialCardFor(clientSeed);
            if (cur == 1 || cur == 13) continue;
            for (uint256 j = 1; j < 50; j++) {
                server = bytes32(j);
                uint8 next = _cardFor(server, clientSeed, 1);
                if (next == cur) {
                    found = true;
                    break;
                }
            }
        }
        require(found, "tie seed not found in search");

        uint256 sid = _open(0.01 ether, clientSeed, _commit(server));
        uint256 bankrollBefore = address(bankroll).balance;
        uint256 gameBefore = address(game).balance;
        uint256 playerBefore = player.balance;

        vm.prank(keeper);
        game.playStep(sid, ConstellationClimb.Direction.Higher, server, _commit(SERVER_SEED2));

        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Pushed), "tie = push");
        assertEq(_readStepCount(sid), 1);
        assertEq(address(game).balance, gameBefore - 0.01 ether, "game balance returned");
        assertEq(address(bankroll).balance, bankrollBefore, "bankroll untouched on push");
        assertEq(player.balance, playerBefore + 0.01 ether, "player got stake back");
    }

    function test_playStep_strictLossClosesSessionAndForfeitsStake() public {
        bytes32 clientSeed = bytes32(uint256(1));
        bytes32 server = bytes32(uint256(1));
        uint8 cur;
        bool found;
        for (uint256 i = 1; i < 200 && !found; i++) {
            clientSeed = bytes32(i);
            cur = _initialCardFor(clientSeed);
            if (cur < 3) continue;
            for (uint256 j = 1; j < 100; j++) {
                server = bytes32(j);
                uint8 next = _cardFor(server, clientSeed, 1);
                if (next < cur) {
                    found = true;
                    break;
                }
            }
        }
        require(found, "strict-loss seed not found in search");

        uint256 sid = _open(0.01 ether, clientSeed, _commit(server));
        uint256 bankrollBefore = address(bankroll).balance;
        uint256 gameBefore = address(game).balance;

        vm.prank(keeper);
        game.playStep(sid, ConstellationClimb.Direction.Higher, server, _commit(SERVER_SEED2));

        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Lost), "strict loss");
        assertEq(address(game).balance, gameBefore - 0.01 ether, "game balance drained");
        assertEq(address(bankroll).balance, bankrollBefore + 0.01 ether, "bankroll absorbed stake");
    }

    function test_playStep_rejectsInvalidReveal() public {
        uint256 sid = _open(0.01 ether, CLIENT_SEED, _commit(SERVER_SEED));
        vm.prank(keeper);
        vm.expectRevert(ConstellationClimb.InvalidReveal.selector);
        game.playStep(sid, ConstellationClimb.Direction.Higher, bytes32(uint256(0xDEAD)), _commit(SERVER_SEED2));
    }

    function test_playStep_revertsHigherAt13() public {
        bytes32 cs;
        for (uint256 i = 1; i < 1000; i++) {
            cs = bytes32(i);
            if (_initialCardFor(cs) == 13) break;
        }
        require(_initialCardFor(cs) == 13, "no 13 seed found");

        uint256 sid = _open(0.01 ether, cs, _commit(SERVER_SEED));
        vm.prank(keeper);
        vm.expectRevert(ConstellationClimb.InvalidDirection.selector);
        game.playStep(sid, ConstellationClimb.Direction.Higher, SERVER_SEED, _commit(SERVER_SEED2));
    }

    function test_playStep_revertsLowerAt1() public {
        bytes32 cs;
        for (uint256 i = 1; i < 1000; i++) {
            cs = bytes32(i);
            if (_initialCardFor(cs) == 1) break;
        }
        require(_initialCardFor(cs) == 1, "no 1 seed found");

        uint256 sid = _open(0.01 ether, cs, _commit(SERVER_SEED));
        vm.prank(keeper);
        vm.expectRevert(ConstellationClimb.InvalidDirection.selector);
        game.playStep(sid, ConstellationClimb.Direction.Lower, SERVER_SEED, _commit(SERVER_SEED2));
    }

    function test_playStep_rejectsClosedSession() public {
        uint256 sid = _open(0.01 ether, CLIENT_SEED, _commit(SERVER_SEED));
        vm.prank(player);
        game.cashOut(sid);
        vm.prank(keeper);
        vm.expectRevert(ConstellationClimb.SessionNotOpen.selector);
        game.playStep(sid, ConstellationClimb.Direction.Higher, SERVER_SEED, _commit(SERVER_SEED2));
    }

    // ---- cashOut at three multipliers (acceptance criterion (c)) ----

    /// @notice 1.0× cashOut — open and cashOut without playing.
    function test_cashOut_atUnitMultiplier_returnsStake() public {
        uint256 stake = 0.01 ether;
        uint256 sid = _open(stake, CLIENT_SEED, _commit(SERVER_SEED));
        uint256 playerBefore = player.balance;

        vm.prank(player);
        game.cashOut(sid);

        assertEq(player.balance, playerBefore + stake, "1.0x cash out returns full stake");
        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.CashedOut));
    }

    /// @notice ≈1.5× cashOut — winning Higher from initial card 5 lands
    ///         multiplier = 12*99 / ((13-5)*100) = 1.485e18, the closest
    ///         single-step multiplier to 1.5× the formula permits.
    function test_cashOut_atApprox1p5xMultiplier() public {
        bytes32 clientSeed = _seedForInitial(5);
        bytes32 server = _seedForHigherWin(clientSeed, 5);

        uint256 stake = 0.01 ether;
        uint256 sid = _open(stake, clientSeed, _commit(server));

        vm.prank(keeper);
        game.playStep(sid, ConstellationClimb.Direction.Higher, server, _commit(SERVER_SEED2));

        uint256 expectedMult = (WAD * STEP_NUM) / ((13 - uint256(5)) * STEP_DEN);
        assertEq(_readMult(sid), expectedMult, "1.5x-equivalent mult drift");
        assertEq(expectedMult, 1.485e18, "expected 1.485e18 at initial=5/Higher");

        uint256 playerBefore = player.balance;
        vm.prank(player);
        game.cashOut(sid);

        uint256 expectedPayout = (stake * expectedMult) / WAD;
        assertEq(player.balance, playerBefore + expectedPayout, "approx 1.5x payout drift");
        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.CashedOut));
    }

    /// @notice ≈2.0× cashOut — winning Higher from initial card 7 lands
    ///         multiplier = 12*99 / ((13-7)*100) = 1.98e18, the closest
    ///         single-step multiplier to 2.0× the formula permits.
    function test_cashOut_atApprox2p0xMultiplier() public {
        bytes32 clientSeed = _seedForInitial(7);
        bytes32 server = _seedForHigherWin(clientSeed, 7);

        uint256 stake = 0.01 ether;
        uint256 sid = _open(stake, clientSeed, _commit(server));

        vm.prank(keeper);
        game.playStep(sid, ConstellationClimb.Direction.Higher, server, _commit(SERVER_SEED2));

        uint256 expectedMult = (WAD * STEP_NUM) / ((13 - uint256(7)) * STEP_DEN);
        assertEq(_readMult(sid), expectedMult, "2.0x-equivalent mult drift");
        assertEq(expectedMult, 1.98e18, "expected 1.98e18 at initial=7/Higher");

        uint256 playerBefore = player.balance;
        vm.prank(player);
        game.cashOut(sid);

        uint256 expectedPayout = (stake * expectedMult) / WAD;
        assertEq(player.balance, playerBefore + expectedPayout, "approx 2.0x payout drift");
        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.CashedOut));
    }

    function test_cashOut_revertsForNonPlayer() public {
        uint256 sid = _open(0.01 ether, CLIENT_SEED, _commit(SERVER_SEED));
        vm.prank(keeper);
        vm.expectRevert(ConstellationClimb.NotPlayer.selector);
        game.cashOut(sid);
    }

    // ---- maxPayout cap (acceptance criterion (d)) ----

    /// @notice Cap enforced even at the 1.0× cashOut path (cap below stake).
    function test_cashOut_maxPayout_capsUnitMultiplier() public {
        vm.prank(owner);
        game.setMaxPayout(0.005 ether);

        uint256 sid = _open(0.01 ether, CLIENT_SEED, _commit(SERVER_SEED));
        vm.prank(player);
        vm.expectRevert(ConstellationClimb.PayoutExceedsCap.selector);
        game.cashOut(sid);
    }

    /// @notice Cap enforced on a compounded session — tighten maxPayout below
    ///         the resulting `stake * mult / WAD` and assert the revert fires.
    function test_cashOut_maxPayout_capsCompoundedMultiplier() public {
        bytes32 clientSeed = _seedForInitial(7);
        bytes32 server = _seedForHigherWin(clientSeed, 7);
        uint256 stake = 0.01 ether;
        uint256 sid = _open(stake, clientSeed, _commit(server));

        vm.prank(keeper);
        game.playStep(sid, ConstellationClimb.Direction.Higher, server, _commit(SERVER_SEED2));

        uint256 mult = _readMult(sid);
        uint256 wouldPay = (stake * mult) / WAD;
        // Cap one wei below `wouldPay` so the cashOut path must revert.
        vm.prank(owner);
        game.setMaxPayout(wouldPay - 1);

        vm.prank(player);
        vm.expectRevert(ConstellationClimb.PayoutExceedsCap.selector);
        game.cashOut(sid);
    }

    // ---- Consolidated lifecycle (acceptance criterion (c)) ----

    /// @notice One test that walks the full session lifecycle:
    ///         open → playStep(WIN), open → playStep(PUSH), open → playStep(LOSE).
    ///         Push and Lose terminate the session, so the three transitions
    ///         are exercised across three sessions, sharing the same setUp.
    function test_lifecycle_winThenPushThenLose() public {
        // --- WIN leg ---
        {
            bytes32 clientSeed = _seedForInitial(5);
            bytes32 server = _seedForHigherWin(clientSeed, 5);
            uint256 sid = _open(0.01 ether, clientSeed, _commit(server));
            uint256 oldMult = _readMult(sid);
            uint8 cur = _readCard(sid);
            vm.prank(keeper);
            game.playStep(sid, ConstellationClimb.Direction.Higher, server, _commit(SERVER_SEED2));
            assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Open), "WIN stays Open");
            assertEq(_readMult(sid), _expectedHigherMult(oldMult, cur));
        }

        // --- PUSH leg --- find (client, server) producing a tie on the next
        // step. The step-nonce is (playerNonce_at_open + 0 + 1), so it advances
        // each time `player` opens a session — fetch the live counter to drive
        // the seed search against the right nonce.
        {
            uint256 stepNonce = game.playerNonce(player) + 1;
            bytes32 clientSeed;
            bytes32 server;
            bool found;
            for (uint256 i = 2; i < 800 && !found; i++) {
                clientSeed = bytes32(i);
                uint8 init = _initialCardFor(clientSeed);
                if (init == 1 || init == 13) continue;
                for (uint256 j = 1; j < 400; j++) {
                    server = bytes32(j);
                    if (_cardFor(server, clientSeed, stepNonce) == init) {
                        found = true;
                        break;
                    }
                }
            }
            require(found, "no push seed");
            uint256 sid = _open(0.01 ether, clientSeed, _commit(server));
            vm.prank(keeper);
            game.playStep(
                sid,
                ConstellationClimb.Direction.Higher,
                server,
                keccak256(abi.encodePacked("lifecycle-push-next", clientSeed, server))
            );
            assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Pushed), "PUSH path");
        }

        // --- LOSE leg --- find (client, server) producing a strict loss on Higher.
        {
            uint256 stepNonce = game.playerNonce(player) + 1;
            bytes32 clientSeed;
            bytes32 server;
            bool found;
            for (uint256 i = 2; i < 800 && !found; i++) {
                clientSeed = bytes32(i);
                uint8 init = _initialCardFor(clientSeed);
                if (init < 3) continue;
                for (uint256 j = 1; j < 400; j++) {
                    server = bytes32(j);
                    if (_cardFor(server, clientSeed, stepNonce) < init) {
                        found = true;
                        break;
                    }
                }
            }
            require(found, "no lose seed");
            uint256 sid = _open(0.01 ether, clientSeed, _commit(server));
            vm.prank(keeper);
            game.playStep(
                sid,
                ConstellationClimb.Direction.Higher,
                server,
                keccak256(abi.encodePacked("lifecycle-lose-next", clientSeed, server))
            );
            assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Lost), "LOSE path");
        }
    }

    // ---- refundSession ----

    function test_refundSession_afterExpiry() public {
        uint256 stake = 0.01 ether;
        uint256 sid = _open(stake, CLIENT_SEED, _commit(SERVER_SEED));

        vm.prank(player);
        vm.expectRevert(ConstellationClimb.SessionNotExpired.selector);
        game.refundSession(sid);

        vm.roll(block.number + game.EXPIRY_BLOCKS());
        uint256 playerBefore = player.balance;
        vm.prank(player);
        game.refundSession(sid);

        assertEq(player.balance, playerBefore + stake, "refund returns stake");
        assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Refunded));
    }

    function test_refundSession_rejectsNonPlayer() public {
        uint256 sid = _open(0.01 ether, CLIENT_SEED, _commit(SERVER_SEED));
        vm.roll(block.number + game.EXPIRY_BLOCKS());
        vm.prank(keeper);
        vm.expectRevert(ConstellationClimb.NotPlayer.selector);
        game.refundSession(sid);
    }

    // ---- setBetBounds invariants (Phase 2 hardening) ----

    function test_setBetBounds_rejectsMaxBelowMin() public {
        vm.prank(owner);
        vm.expectRevert(ConstellationClimb.InvalidBetBounds.selector);
        game.setBetBounds(0.01 ether, 0.005 ether);
    }

    function test_setBetBounds_rejectsMaxAboveUint96() public {
        vm.prank(owner);
        vm.expectRevert(ConstellationClimb.InvalidBetBounds.selector);
        game.setBetBounds(MIN_BET, uint256(type(uint96).max) + 1);
    }

    // ---- Cross-layer parity (mirrors verify package hiloCard vectors) ----

    function test_parityHilo_v1() public pure {
        bytes32 server = bytes32(uint256(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa));
        bytes32 client = bytes32(uint256(0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));
        uint256 nonce = 0;
        uint256 raw = CommitRevealRandomness.rollOutcome(server, client, nonce, 13);
        assertEq(raw + 1, _expectedHiloV1(), "v1 hilo drift");
    }

    function test_parityHilo_v2() public pure {
        bytes32 server = bytes32(uint256(0x1212121212121212121212121212121212121212121212121212121212121212));
        bytes32 client = bytes32(uint256(0xfefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe));
        uint256 nonce = 42;
        uint256 raw = CommitRevealRandomness.rollOutcome(server, client, nonce, 13);
        assertEq(raw + 1, _expectedHiloV2(), "v2 hilo drift");
    }

    function test_parityHilo_v3() public pure {
        bytes32 server = bytes32(uint256(0));
        bytes32 client = bytes32(uint256(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff));
        uint256 nonce = 999;
        uint256 raw = CommitRevealRandomness.rollOutcome(server, client, nonce, 13);
        assertEq(raw + 1, _expectedHiloV3(), "v3 hilo drift");
    }

    function _expectedHiloV1() internal pure returns (uint256) {
        bytes32 server = bytes32(uint256(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa));
        bytes32 client = bytes32(uint256(0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));
        return (uint256(keccak256(abi.encodePacked(server, client, uint256(0)))) % 13) + 1;
    }

    function _expectedHiloV2() internal pure returns (uint256) {
        bytes32 server = bytes32(uint256(0x1212121212121212121212121212121212121212121212121212121212121212));
        bytes32 client = bytes32(uint256(0xfefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe));
        return (uint256(keccak256(abi.encodePacked(server, client, uint256(42)))) % 13) + 1;
    }

    function _expectedHiloV3() internal pure returns (uint256) {
        bytes32 server = bytes32(uint256(0));
        bytes32 client = bytes32(uint256(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff));
        return (uint256(keccak256(abi.encodePacked(server, client, uint256(999)))) % 13) + 1;
    }

    // ---- Fuzz: settlement math holds regardless of seeds and stake ----

    function testFuzz_settlement_winLossPaths(
        bytes32 fSeed,
        bytes32 fClient,
        uint96 fStake,
        uint8 fDir
    ) public {
        ConstellationClimb.Direction dir = (fDir % 2) == 0
            ? ConstellationClimb.Direction.Higher
            : ConstellationClimb.Direction.Lower;

        uint8 initial = _initialCardFor(fClient);
        if (dir == ConstellationClimb.Direction.Higher && initial == 13) return;
        if (dir == ConstellationClimb.Direction.Lower && initial == 1) return;

        bytes32 openCommit = _commit(fSeed);
        vm.assume(!game.commitUsed(openCommit));

        vm.prank(player);
        uint256 sid = game.openSession{value: bound(uint256(fStake), MIN_BET, MAX_BET)}(
            fClient, openCommit
        );

        _runFuzzStep(sid, dir, fSeed, fClient);
    }

    function _runFuzzStep(
        uint256 sid,
        ConstellationClimb.Direction dir,
        bytes32 fSeed,
        bytes32 fClient
    ) internal {
        uint8 cur = _readCard(sid);
        uint256 oldMult = _readMult(sid);
        uint8 newCard = _cardFor(fSeed, fClient, _stepNonce(sid, 0));

        bytes32 nextCommit = keccak256(abi.encodePacked("climb-fuzz-step", sid));

        vm.prank(keeper);
        game.playStep(sid, dir, fSeed, nextCommit);

        bool won = dir == ConstellationClimb.Direction.Higher ? newCard > cur : newCard < cur;
        if (won) {
            uint256 expectedMult = dir == ConstellationClimb.Direction.Higher
                ? _expectedHigherMult(oldMult, cur)
                : _expectedLowerMult(oldMult, cur);
            assertEq(_readMult(sid), expectedMult, "fuzz: win multiplier drift");
            assertEq(_readCard(sid), newCard, "fuzz: card advance");
            assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Open));
        } else if (newCard == cur) {
            assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Pushed));
        } else {
            assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Lost));
        }
    }

    function testFuzz_sessionLength_compoundsCorrectly(uint8 fK, bytes32 fClient, bytes32 fSeed0) public {
        uint256 K = bound(uint256(fK), 1, 6);
        uint8 initial = _initialCardFor(fClient);
        if (initial == 13 || initial == 1) return;

        bytes32[] memory seeds = new bytes32[](K);
        bytes32 prev = fSeed0;
        for (uint256 i = 0; i < K; i++) {
            prev = keccak256(abi.encodePacked(prev, i));
            seeds[i] = prev;
        }

        vm.prank(player);
        uint256 sid = game.openSession{value: 0.01 ether}(fClient, _commit(seeds[0]));

        for (uint256 i = 0; i < K; i++) {
            ConstellationClimb.Status st = _readStatus(sid);
            if (st != ConstellationClimb.Status.Open) break;

            uint8 cur = _readCard(sid);
            ConstellationClimb.Direction dir = cur < 13
                ? ConstellationClimb.Direction.Higher
                : ConstellationClimb.Direction.Lower;

            uint256 stepNonceVal = _stepNonce(sid, uint8(i));
            uint8 newCard = _cardFor(seeds[i], fClient, stepNonceVal);
            uint256 oldMult = _readMult(sid);

            bytes32 nextCommit = i + 1 < K
                ? _commit(seeds[i + 1])
                : keccak256(abi.encodePacked("climb-fuzz-tail", fClient, fSeed0, i));
            vm.prank(keeper);
            game.playStep(sid, dir, seeds[i], nextCommit);

            bool won;
            uint256 expectedMult = oldMult;
            if (dir == ConstellationClimb.Direction.Higher) {
                won = newCard > cur;
                if (won) expectedMult = _expectedHigherMult(oldMult, cur);
            } else {
                won = newCard < cur;
                if (won) expectedMult = _expectedLowerMult(oldMult, cur);
            }

            if (won) {
                assertEq(_readMult(sid), expectedMult, "len-fuzz: mult drift");
                assertEq(_readCard(sid), newCard);
                assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Open));
            } else if (newCard == cur) {
                assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Pushed));
                break;
            } else {
                assertEq(uint8(_readStatus(sid)), uint8(ConstellationClimb.Status.Lost));
                break;
            }
        }
    }
}

// ---- Bankroll-solvency invariant (mirrors CosmicFlip's) ------------------

contract ClimbHandler is Test {
    CasinoBankroll public immutable bankroll;
    ConstellationClimb public immutable game;
    address public immutable owner;

    uint256 public totalStaked;
    uint256 public totalPaid;
    uint256 public totalRefunded;

    address[] public players;
    uint256[] public openSessions;
    mapping(uint256 => bytes32) public openSeedOf;

    uint256 constant MIN_BET = 0.001 ether;
    uint256 constant MAX_BET = 0.1 ether;

    constructor(CasinoBankroll bk, ConstellationClimb g, address o) {
        bankroll = bk;
        game = g;
        owner = o;
        for (uint160 i = 1; i <= 5; i++) {
            address p = address(uint160(0xC000) + i);
            players.push(p);
            vm.deal(p, 100 ether);
        }
    }

    function open(uint256 playerIdx, uint256 stakeSeed, uint256 seedSeed) external {
        address p = players[playerIdx % players.length];
        uint256 stake = bound(stakeSeed, MIN_BET, MAX_BET);
        bytes32 server = keccak256(abi.encodePacked(seedSeed, "server"));
        bytes32 client = keccak256(abi.encodePacked(seedSeed, "client"));
        bytes32 commit = keccak256(abi.encodePacked(server));

        if (p.balance < stake) return;
        vm.prank(p);
        try game.openSession{value: stake}(client, commit) returns (uint256 id) {
            openSeedOf[id] = server;
            openSessions.push(id);
            totalStaked += stake;
        } catch {
            // Pause / out-of-bounds — ignored.
        }
    }

    function step(uint256 idx, uint256 dirSeed) external {
        if (openSessions.length == 0) return;
        uint256 i = idx % openSessions.length;
        uint256 sid = openSessions[i];
        ( , uint96 stk, , , , uint8 cur, ConstellationClimb.Status status, , , ) = game.sessions(sid);
        if (status != ConstellationClimb.Status.Open) {
            _swapPop(i);
            return;
        }

        ConstellationClimb.Direction dir;
        if (cur >= 13) dir = ConstellationClimb.Direction.Lower;
        else if (cur <= 1) dir = ConstellationClimb.Direction.Higher;
        else dir = (dirSeed % 2) == 0 ? ConstellationClimb.Direction.Higher : ConstellationClimb.Direction.Lower;

        bytes32 reveal = openSeedOf[sid];
        bytes32 nextCommit = keccak256(abi.encodePacked("climb-handler-step", sid, dirSeed));

        try game.playStep(sid, dir, reveal, nextCommit) {
            ( , , , , , , ConstellationClimb.Status nst, , , ) = game.sessions(sid);
            if (nst == ConstellationClimb.Status.Lost) {
                _swapPop(i);
            } else if (nst == ConstellationClimb.Status.Pushed) {
                totalRefunded += uint256(stk);
                _swapPop(i);
            } else {
                _swapPop(i);
                _pendingCashOuts.push(sid);
            }
        } catch {
            _swapPop(i);
        }
    }

    uint256[] internal _pendingCashOuts;

    function cashOutPending(uint256 idx) external {
        if (_pendingCashOuts.length == 0) return;
        uint256 i = idx % _pendingCashOuts.length;
        uint256 sid = _pendingCashOuts[i];
        ( address p, uint96 stake, , , , , ConstellationClimb.Status status, , uint256 mult, ) = game.sessions(sid);
        if (status != ConstellationClimb.Status.Open) {
            _swapPopPending(i);
            return;
        }
        vm.prank(p);
        try game.cashOut(sid) {
            uint256 payoutAmt = (uint256(stake) * mult) / 1e18;
            totalPaid += payoutAmt;
            _swapPopPending(i);
        } catch {
            _swapPopPending(i);
        }
    }

    function refund(uint256 idx, uint64 blocksToWarp) external {
        if (openSessions.length == 0) return;
        uint256 i = idx % openSessions.length;
        uint256 sid = openSessions[i];
        ( address p, uint96 stake, , , uint64 last, , ConstellationClimb.Status status, , , ) = game.sessions(sid);
        if (status != ConstellationClimb.Status.Open) {
            _swapPop(i);
            return;
        }
        uint64 needed = last + game.EXPIRY_BLOCKS();
        if (block.number < needed) {
            vm.roll(uint256(needed) + uint256(blocksToWarp % 16));
        }
        vm.prank(p);
        try game.refundSession(sid) {
            totalRefunded += stake;
            _swapPop(i);
        } catch {
            _swapPop(i);
        }
    }

    function _swapPop(uint256 i) internal {
        uint256 last = openSessions.length - 1;
        if (i != last) openSessions[i] = openSessions[last];
        openSessions.pop();
    }

    function _swapPopPending(uint256 i) internal {
        uint256 last = _pendingCashOuts.length - 1;
        if (i != last) _pendingCashOuts[i] = _pendingCashOuts[last];
        _pendingCashOuts.pop();
    }
}

contract ConstellationClimbInvariant is StdInvariant, Test {
    CasinoBankroll bankroll;
    ConstellationClimb game;
    ClimbHandler handler;
    address owner = address(0xB055);

    uint256 constant SEED = 100 ether;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        game = new ConstellationClimb(owner, address(bankroll), 0.001 ether, 0.1 ether, 5 ether);
        bankroll.registerGame(address(game), SEED);
        bankroll.deposit{value: SEED}();
        vm.stopPrank();

        handler = new ClimbHandler(bankroll, game, owner);
        targetContract(address(handler));

        bytes4[] memory sels = new bytes4[](4);
        sels[0] = handler.open.selector;
        sels[1] = handler.step.selector;
        sels[2] = handler.cashOutPending.selector;
        sels[3] = handler.refund.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    function invariant_systemNeverInsolvent() public view {
        uint256 ethHeld = address(bankroll).balance + address(game).balance;
        uint256 pendingStake = _sumPendingStakes();
        assertGe(ethHeld, pendingStake, "system would not cover pending stakes");
    }

    function invariant_bankrollMatchesEth() public view {
        uint256 expected = SEED + handler.totalStaked() - handler.totalPaid()
            - handler.totalRefunded() - _sumPendingStakes();
        assertEq(address(bankroll).balance, expected, "bankroll accounting drifted");
    }

    function _sumPendingStakes() internal view returns (uint256 total) {
        uint256 next = game.nextSessionId();
        for (uint256 i = 0; i < next; i++) {
            ( , uint96 stake, , , , , ConstellationClimb.Status status, , , ) = game.sessions(i);
            if (status == ConstellationClimb.Status.Open) total += stake;
        }
    }
}
