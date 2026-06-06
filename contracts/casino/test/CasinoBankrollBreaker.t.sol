// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @notice Phase 3 drawdown circuit-breaker tests. Pairs with
///         `CasinoBankrollUnit.t.sol` (legacy lifecycle suite). Every test
///         exercises a single property of the breaker: trip-on-threshold,
///         owner-only manual trip, payout-rejection-when-halted,
///         auto-reset-after-cooldown, window-roll, etc. Targets ≥10 cases per
///         the Phase 3 acceptance bar.
contract CasinoBankrollBreakerTest is Test {
    CasinoBankroll bankroll;

    address owner = address(0xB055);
    address game = address(0xCAFE);
    address other = address(0xBEEF);
    address recipient = address(0xD00D);

    uint256 constant SEED = 10 ether;
    /// @dev 50% of seed — mirrors the Deploy.s.sol default for testnet/mainnet.
    uint256 constant MAX_DRAWDOWN_24H = SEED / 2;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        bankroll.registerGame(game, 100 ether);
        bankroll.deposit{value: SEED}();
        bankroll.setMaxDrawdown24hWei(MAX_DRAWDOWN_24H);
        vm.stopPrank();
    }

    // ---- threshold setters / view ----

    function test_setMaxDrawdown24hWei_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        bankroll.setMaxDrawdown24hWei(1 ether);
    }

    function test_setMaxDrawdown24hWei_emitsAndStores() public {
        vm.expectEmit(false, false, false, true, address(bankroll));
        emit CasinoBankroll.CircuitBreakerThresholdSet(7 ether);
        vm.prank(owner);
        bankroll.setMaxDrawdown24hWei(7 ether);
        (uint256 max,,,,,) = bankroll.circuitBreakerState();
        assertEq(max, 7 ether);
    }

    function test_circuitBreakerState_initialView() public view {
        (
            uint256 max,
            uint256 startBal,
            uint256 startedAt,
            uint256 trippedAt,
            bool halted,
            uint256 cur
        ) = bankroll.circuitBreakerState();
        assertEq(max, MAX_DRAWDOWN_24H);
        assertEq(startBal, SEED, "windowStartBalance should anchor on first deposit");
        assertGt(startedAt, 0);
        assertEq(trippedAt, 0);
        assertFalse(halted);
        assertEq(cur, SEED);
    }

    // ---- owner-only manual trip / reset ----

    function test_tripCircuitBreaker_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        bankroll.tripCircuitBreaker();
    }

    function test_tripCircuitBreaker_setsHaltedAndEmits() public {
        vm.expectEmit(false, false, false, true, address(bankroll));
        emit CasinoBankroll.CircuitBreakerTripped(SEED, SEED, MAX_DRAWDOWN_24H, block.timestamp);
        vm.prank(owner);
        bankroll.tripCircuitBreaker();

        (,,, uint256 trippedAt, bool halted,) = bankroll.circuitBreakerState();
        assertTrue(halted);
        assertEq(trippedAt, block.timestamp);
    }

    function test_resetCircuitBreaker_onlyOwner() public {
        vm.prank(owner);
        bankroll.tripCircuitBreaker();

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        bankroll.resetCircuitBreaker();
    }

    function test_resetCircuitBreaker_revertsWhenNotHalted() public {
        vm.prank(owner);
        vm.expectRevert(CasinoBankroll.CircuitBreakerNotHalted.selector);
        bankroll.resetCircuitBreaker();
    }

    function test_resetCircuitBreaker_clearsHaltAndReanchorsWindow() public {
        vm.startPrank(owner);
        bankroll.tripCircuitBreaker();
        // Settle some ETH so the new window-start anchor differs from the trip
        // balance — proves the reset re-anchors at the *current* balance.
        vm.stopPrank();
        vm.deal(game, 3 ether);
        vm.prank(game);
        bankroll.settle{value: 3 ether}();

        vm.prank(owner);
        bankroll.resetCircuitBreaker();

        (, uint256 startBal,, uint256 trippedAt, bool halted,) = bankroll.circuitBreakerState();
        assertFalse(halted);
        assertEq(trippedAt, 0);
        assertEq(startBal, SEED + 3 ether);
    }

    // ---- payout reverts while halted ----

    function test_payout_revertsWhenHalted() public {
        vm.prank(owner);
        bankroll.tripCircuitBreaker();

        vm.prank(game);
        vm.expectRevert(CasinoBankroll.CircuitBreakerHalted.selector);
        bankroll.payout(recipient, 1 ether);
    }

    function test_settle_remainsOpenWhileHalted() public {
        vm.prank(owner);
        bankroll.tripCircuitBreaker();

        vm.deal(game, 2 ether);
        vm.prank(game);
        bankroll.settle{value: 2 ether}();
        assertEq(address(bankroll).balance, SEED + 2 ether);
    }

    // ---- auto-trip on threshold ----

    function test_payout_autoTripsAtThreshold() public {
        // Single payout equal to the threshold — auto-trip should fire after
        // the transfer succeeds. The current call does *not* revert; the next
        // payout attempt does.
        vm.expectEmit(false, false, false, true, address(bankroll));
        emit CasinoBankroll.CircuitBreakerTripped(
            SEED, SEED - MAX_DRAWDOWN_24H, MAX_DRAWDOWN_24H, block.timestamp
        );
        vm.prank(game);
        bankroll.payout(recipient, MAX_DRAWDOWN_24H);

        (,,,, bool halted,) = bankroll.circuitBreakerState();
        assertTrue(halted, "breaker should auto-trip at threshold");
        assertEq(recipient.balance, MAX_DRAWDOWN_24H);

        // Subsequent payout in the same window must revert.
        vm.prank(game);
        vm.expectRevert(CasinoBankroll.CircuitBreakerHalted.selector);
        bankroll.payout(recipient, 0.001 ether);
    }

    function test_payout_belowThreshold_doesNotTrip() public {
        vm.prank(game);
        bankroll.payout(recipient, MAX_DRAWDOWN_24H - 1 wei);

        (,,,, bool halted,) = bankroll.circuitBreakerState();
        assertFalse(halted, "breaker must not trip below threshold");
    }

    function test_payout_withZeroThreshold_disablesAutoTrip() public {
        vm.prank(owner);
        bankroll.setMaxDrawdown24hWei(0);

        // Drain almost everything; with auto-trip disabled, no halt.
        vm.prank(game);
        bankroll.payout(recipient, SEED - 1 wei);

        (,,,, bool halted,) = bankroll.circuitBreakerState();
        assertFalse(halted);
    }

    // ---- cooldown / auto-reset ----

    function test_payout_autoResetsAfterCooldown() public {
        vm.prank(owner);
        bankroll.tripCircuitBreaker();

        // Cooldown not yet elapsed: payout still blocked.
        vm.warp(block.timestamp + 12 hours);
        vm.prank(game);
        vm.expectRevert(CasinoBankroll.CircuitBreakerHalted.selector);
        bankroll.payout(recipient, 0.1 ether);

        // 24h after the trip: the next payout passes through the
        // `whenNotHalted` modifier, which auto-resets via `_maybeAutoReset`.
        vm.warp(block.timestamp + 12 hours + 1);
        vm.prank(game);
        bankroll.payout(recipient, 0.1 ether);
        assertEq(recipient.balance, 0.1 ether);

        (,,,, bool halted,) = bankroll.circuitBreakerState();
        assertFalse(halted);
    }

    function test_pokeCircuitBreaker_revertsBeforeCooldown() public {
        vm.prank(owner);
        bankroll.tripCircuitBreaker();
        uint256 readyAt = block.timestamp + bankroll.CIRCUIT_BREAKER_COOLDOWN();

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(CasinoBankroll.CooldownNotElapsed.selector, readyAt));
        bankroll.pokeCircuitBreaker();
    }

    function test_pokeCircuitBreaker_clearsAfterCooldown() public {
        vm.prank(owner);
        bankroll.tripCircuitBreaker();
        vm.warp(block.timestamp + bankroll.CIRCUIT_BREAKER_COOLDOWN() + 1);

        vm.prank(other);
        bankroll.pokeCircuitBreaker();

        (,,,, bool halted,) = bankroll.circuitBreakerState();
        assertFalse(halted);
    }

    function test_pokeCircuitBreaker_revertsWhenNotHalted() public {
        vm.prank(other);
        vm.expectRevert(CasinoBankroll.CircuitBreakerNotHalted.selector);
        bankroll.pokeCircuitBreaker();
    }

    // ---- window roll ----

    function test_payout_windowRollsForwardAfterCooldown() public {
        // Drain just under threshold so the breaker doesn't trip.
        vm.prank(game);
        bankroll.payout(recipient, MAX_DRAWDOWN_24H - 1 wei);

        // Skip past the rolling window without crossing the threshold.
        vm.warp(block.timestamp + bankroll.CIRCUIT_BREAKER_COOLDOWN() + 1);

        // Next payout should *roll the window* (start balance re-anchors) and
        // then succeed. A drawdown that previously would have looked tipped
        // (relative to the SEED baseline) is now measured against the new
        // start balance — i.e. SEED - (MAX/2 - 1) ≈ 5 ether + 1 wei.
        vm.prank(game);
        bankroll.payout(recipient, 1 ether);

        (, uint256 startBal,,, bool halted,) = bankroll.circuitBreakerState();
        assertFalse(halted);
        // Window rolled: the breaker's start balance must reflect the
        // post-first-payout balance, NOT the original SEED.
        assertLt(startBal, SEED);
    }

    // ---- post-pause/breaker interaction ----

    function test_pauseAndHalt_eitherBlocksPayout() public {
        // Pause first, halt second — the Pausable modifier runs first, so
        // we always see EnforcedPause if both are active.
        vm.startPrank(owner);
        bankroll.pause();
        bankroll.tripCircuitBreaker();
        vm.stopPrank();

        vm.prank(game);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bankroll.payout(recipient, 0.1 ether);
    }
}
