// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";

/// @notice Handler exposed to the foundry invariant runner. Bounds inputs to
///         legal ranges so the invariant tracks legitimate game lifecycles
///         (place / settle / refund) rather than arithmetic underflows in
///         test scaffolding.
contract CoinflipHandler is Test {
    CasinoBankroll public immutable bankroll;
    CosmicFlip public immutable game;
    address public immutable owner;

    /// @dev Sum of every stake the player has put in (gross inflows).
    uint256 public totalStaked;
    /// @dev Sum of every payout the player has received (gross outflows).
    uint256 public totalPaid;
    /// @dev Sum of every refunded stake (player got their own money back).
    uint256 public totalRefunded;

    address[] public players;
    uint256[] public openBets;
    /// @dev Server seed indexed by betId (deterministic ⇒ settle path knows it).
    mapping(uint256 => bytes32) public seedOf;

    uint256 constant MIN_BET = 0.001 ether;
    uint256 constant MAX_BET = 0.1 ether;

    constructor(CasinoBankroll bk, CosmicFlip g, address o) {
        bankroll = bk;
        game = g;
        owner = o;
        // Pre-seed several players with ETH so they can place bets through fuzzed actions.
        for (uint160 i = 1; i <= 5; i++) {
            address p = address(uint160(0xA000) + i);
            players.push(p);
            vm.deal(p, 100 ether);
        }
    }

    function place(uint256 playerIdx, uint256 sideIdx, uint256 stakeSeed, uint256 seedSeed) external {
        address p = players[playerIdx % players.length];
        CosmicFlip.Side side =
            (sideIdx % 2) == 0 ? CosmicFlip.Side.Heads : CosmicFlip.Side.Tails;
        uint256 stake = bound(stakeSeed, MIN_BET, MAX_BET);
        bytes32 server = keccak256(abi.encodePacked(seedSeed, "server"));
        bytes32 client = keccak256(abi.encodePacked(seedSeed, "client"));
        bytes32 commit = keccak256(abi.encodePacked(server));

        if (p.balance < stake) return;

        vm.prank(p);
        try game.placeBet{value: stake}(side, client, commit) returns (uint256 id) {
            seedOf[id] = server;
            openBets.push(id);
            totalStaked += stake;
        } catch {
            // Pause / out-of-bounds — fine, invariant only cares about the funds path.
        }
    }

    function settle(uint256 idx) external {
        if (openBets.length == 0) return;
        uint256 i = idx % openBets.length;
        uint256 betId = openBets[i];
        ( , uint96 stake, , , , , CosmicFlip.Status status, , ) = game.bets(betId);
        if (status != CosmicFlip.Status.Pending) {
            _swapPop(i);
            return;
        }
        bytes32 server = seedOf[betId];
        try game.settleBet(betId, server) {
            // Re-read post-state to score outcome.
            ( address player, , , , , , CosmicFlip.Status newStatus, , ) = game.bets(betId);
            if (newStatus == CosmicFlip.Status.Won) {
                totalPaid += (uint256(stake) * 198) / 100;
                _trackPlayer(player);
            }
            _swapPop(i);
        } catch {
            // Settlement failed (e.g. paused) — leave the bet on the open list.
        }
    }

    function refund(uint256 idx, uint64 blocksToWarp) external {
        if (openBets.length == 0) return;
        uint256 i = idx % openBets.length;
        uint256 betId = openBets[i];
        ( address p, uint96 stake, , , uint64 placed, , CosmicFlip.Status status, , ) = game.bets(betId);
        if (status != CosmicFlip.Status.Pending) {
            _swapPop(i);
            return;
        }
        uint64 needed = placed + game.EXPIRY_BLOCKS();
        if (block.number < needed) {
            vm.roll(uint256(needed) + uint256(blocksToWarp % 16));
        }
        vm.prank(p);
        try game.refundBet(betId) {
            totalRefunded += stake;
            _swapPop(i);
        } catch {
            _swapPop(i);
        }
    }

    function _swapPop(uint256 i) internal {
        uint256 last = openBets.length - 1;
        if (i != last) openBets[i] = openBets[last];
        openBets.pop();
    }

    function _trackPlayer(address p) internal {
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == p) return;
        }
    }
}

/// @notice Bankroll-solvency invariant. Across any sequence of place/settle/
///         refund actions, the contracts together must always hold enough ETH
///         to honor every still-pending stake. (The bankroll seed plus net
///         inflows minus net outflows is non-negative — i.e. the system is
///         never insolvent.)
contract CasinoBankrollInvariant is StdInvariant, Test {
    CasinoBankroll bankroll;
    CosmicFlip game;
    CoinflipHandler  handler;
    address owner = address(0xB055);

    uint256 constant SEED = 50 ether;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        game = new CosmicFlip(owner, address(bankroll), 0.001 ether, 0.1 ether);
        bankroll.registerGame(address(game), SEED);
        bankroll.deposit{value: SEED}();
        vm.stopPrank();

        handler = new CoinflipHandler(bankroll, game, owner);

        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](3);
        sels[0] = handler.place.selector;
        sels[1] = handler.settle.selector;
        sels[2] = handler.refund.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// @dev System-level solvency: total ETH held by (bankroll + game) must
    ///      always cover every pending stake. Since we never let the bankroll
    ///      go below zero (constraint enforced by `payout`), the floor we
    ///      check is: total_eth >= sum_of_pending_stakes.
    function invariant_systemNeverInsolvent() public view {
        uint256 ethHeld = address(bankroll).balance + address(game).balance;
        uint256 pendingStake = _sumPendingStakes();
        assertGe(ethHeld, pendingStake, "system would not cover pending stakes");
    }

    /// @dev The bankroll's per-game allowance is capped — never overflows past
    ///      the seed plus net player losses on settled bets. We assert here
    ///      that `allowanceOf[game]` plus `pending claims` ≤ initial seed +
    ///      ever-deposited; equivalently, the bankroll has not minted ETH.
    function invariant_bankrollMatchesEth() public view {
        // Bankroll ETH balance must equal the running net of deposits and
        // payouts/withdrawals/refund settlements. A simpler structural check:
        // the bankroll's balance must equal handler.totalStaked - handler.totalPaid
        // + SEED - handler.totalRefunded - (sum of pending stakes still in game).
        uint256 expected = SEED + handler.totalStaked() - handler.totalPaid()
            - handler.totalRefunded() - _sumPendingStakes();
        assertEq(address(bankroll).balance, expected, "bankroll accounting drifted");
    }

    function _sumPendingStakes() internal view returns (uint256 total) {
        uint256 next = game.nextBetId();
        for (uint256 i = 0; i < next; i++) {
            ( , uint96 stake, , , , , CosmicFlip.Status status, , ) = game.bets(i);
            if (status == CosmicFlip.Status.Pending) total += stake;
        }
    }
}
