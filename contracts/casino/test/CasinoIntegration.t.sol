// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CasinoAllowlist} from "../src/CasinoAllowlist.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";

/// @notice End-to-end smoke test of the Cosmic Casino stack on local anvil.
///         Exercises: deploy, register games, fund bankroll, place a winning
///         and losing Cosmic Flip bet, place a winning Gravity Dice bet, open
///         a Constellation Climb session and cash out, and assert allowlist
///         gating. This is the minimum we want green before any Monad deploy.
contract CasinoIntegrationTest is Test {
    CasinoBankroll bankroll;
    CosmicFlip flip;
    GravityDice dice;
    ConstellationClimb climb;
    CasinoAllowlist allowlist;

    address owner = address(0xA11CE);
    address player = address(0xB0B);
    address other = address(0xC0FFEE);

    bytes32 serverSeed = bytes32(uint256(0xDEADBEEF));
    bytes32 commit;

    function setUp() public {
        commit = keccak256(abi.encodePacked(serverSeed));

        vm.startPrank(owner);
        bankroll = new CasinoBankroll(owner);
        flip = new CosmicFlip(owner, address(bankroll), 0.001 ether, 0.1 ether);
        dice = new GravityDice(owner, address(bankroll), 0.001 ether, 0.1 ether);
        climb = new ConstellationClimb(owner, address(bankroll), 0.001 ether, 0.1 ether, 1 ether);

        bankroll.registerGame(address(flip), 1 ether);
        bankroll.registerGame(address(dice), 1 ether);
        bankroll.registerGame(address(climb), 1 ether);
        vm.stopPrank();

        // Fund bankroll.
        vm.deal(owner, 10 ether);
        vm.prank(owner);
        bankroll.deposit{value: 5 ether}();

        vm.deal(player, 5 ether);
        vm.deal(other, 5 ether);
    }

    function test_CosmicFlip_winRoute() public {
        // Pre-compute the winning side from the same RNG library the contract uses.
        bytes32 clientSeed = bytes32(uint256(0x1234));
        uint256 outcome = CommitRevealRandomness.rollOutcome(serverSeed, clientSeed, 0, 2);
        CosmicFlip.Side bettingSide = outcome == 0 ? CosmicFlip.Side.Heads : CosmicFlip.Side.Tails;

        vm.prank(player);
        uint256 betId = flip.placeBet{value: 0.01 ether}(bettingSide, clientSeed, commit);

        uint256 playerBalBefore = player.balance;
        flip.settleBet(betId, serverSeed);

        // Won → +0.98× = +0.0098 ether net (received 0.0198 ether on a 0.01 stake).
        assertEq(
            player.balance, playerBalBefore + 0.0198 ether, "player should receive 1.98x stake"
        );
    }

    function test_CosmicFlip_loseRoute() public {
        bytes32 clientSeed = bytes32(uint256(0x1234));
        uint256 outcome = CommitRevealRandomness.rollOutcome(serverSeed, clientSeed, 0, 2);
        CosmicFlip.Side losingSide = outcome == 0 ? CosmicFlip.Side.Tails : CosmicFlip.Side.Heads;

        uint256 playerBalBefore = player.balance;
        vm.prank(player);
        uint256 betId = flip.placeBet{value: 0.01 ether}(losingSide, clientSeed, commit);

        uint256 bankrollBalBefore = address(bankroll).balance;
        flip.settleBet(betId, serverSeed);

        assertEq(player.balance, playerBalBefore - 0.01 ether, "player loses full stake");
        assertEq(
            address(bankroll).balance, bankrollBalBefore + 0.01 ether, "bankroll grows by stake"
        );
    }

    function test_GravityDice_winRoute() public {
        // Pick a rollUnder such that the current seed lands a win.
        bytes32 clientSeed = bytes32(uint256(0xABCDEF));
        uint256 raw = CommitRevealRandomness.rollOutcome(serverSeed, clientSeed, 0, 100);
        uint8 roll = uint8(raw + 1);

        // To guarantee win: rollUnder must be > roll. Pick rollUnder = roll + 1
        // (clamped to [2, 98]).
        uint8 rollUnder = roll < 98 ? roll + 1 : 98;
        // Ensure rollUnder>1 (always true since roll∈[1,100] and rollUnder=roll+1 or 98).
        if (rollUnder < 2) rollUnder = 2;

        // Skip if the chosen seed actually wouldn't win at the clamped rollUnder.
        if (!(roll < rollUnder)) {
            return; // unlikely with this seed
        }

        vm.prank(player);
        uint256 betId = dice.placeBet{value: 0.01 ether}(rollUnder, clientSeed, commit);

        uint256 playerBalBefore = player.balance;
        dice.settleBet(betId, serverSeed);

        uint256 expectedPayout = (0.01 ether * 99) / (uint256(rollUnder) - 1);
        assertEq(player.balance, playerBalBefore + expectedPayout, "player wins quoted payout");
    }

    function test_ConstellationClimb_openAndCashOut() public {
        bytes32 clientSeed = bytes32(uint256(0xCAFEBABE));

        vm.prank(player);
        uint256 sessionId = climb.openSession{value: 0.01 ether}(clientSeed, commit);

        // Cash out immediately (multiplier == 1.0× WAD; payout == stake).
        uint256 playerBalBefore = player.balance;
        uint256 bankrollBalBefore = address(bankroll).balance;
        vm.prank(player);
        climb.cashOut(sessionId);

        // Stake was already inside the contract; cashOut routes stake → bankroll
        // then bankroll → player at 1x.
        assertEq(player.balance, playerBalBefore + 0.01 ether, "player gets stake back at 1.0x");
        assertEq(
            address(bankroll).balance,
            bankrollBalBefore,
            "bankroll net-zero (settle + payout cancel)"
        );
    }

    function test_CasinoAllowlist_gating() public {
        vm.prank(owner);
        allowlist = new CasinoAllowlist(owner, true);

        vm.prank(owner);
        flip.setAllowlist(address(allowlist));

        // Non-allowlisted player can't bet.
        vm.prank(other);
        vm.expectRevert(CosmicFlip.NotAllowed.selector);
        flip.placeBet{value: 0.01 ether}(CosmicFlip.Side.Heads, bytes32(uint256(1)), commit);

        // Add to allowlist.
        address[] memory accs = new address[](1);
        accs[0] = other;
        vm.prank(owner);
        allowlist.addAllowed(accs);

        // Now it works.
        vm.prank(other);
        flip.placeBet{value: 0.01 ether}(CosmicFlip.Side.Heads, bytes32(uint256(1)), commit);
    }

    function test_RandomnessLibrary_verifyCommit() public pure {
        bytes32 seed = bytes32(uint256(0x42));
        bytes32 c = keccak256(abi.encodePacked(seed));
        assert(CommitRevealRandomness.verifyCommit(seed, c));
        assert(!CommitRevealRandomness.verifyCommit(seed, bytes32(uint256(0))));
    }
}
