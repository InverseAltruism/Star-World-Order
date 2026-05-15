// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";

/// @title  CosmicFlip commit-replay regression tests
/// @notice Encodes the off-chain seed lifecycle as adversarial scenarios:
///         once a (commit, reveal) pair has been observed (settled bet), no
///         later bet may use the same `serverCommit`. The contracts must
///         reject the second placement, not merely the second settlement.
contract CosmicFlipCommitReplayTest is Test {
    CasinoBankroll bankroll;
    CosmicFlip game;

    address owner   = address(0xB055);
    address player  = address(0xCAFE);
    address keeper  = address(0xBEEF);

    bytes32 constant SERVER_SEED = bytes32(uint256(0xA11CE));
    bytes32 constant CLIENT_SEED = bytes32(uint256(0xC11ABC));

    uint256 constant MIN_BET  = 0.001 ether;
    uint256 constant MAX_BET  = 0.1 ether;
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

    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed));
    }

    /// @notice REGRESSION: a player who has observed any settled bet for a
    ///         commit must NOT be able to place a second bet using that same
    ///         commit. Today the contract has no per-commit single-use guard,
    ///         so the second `placeBet` succeeds and the player can pick the
    ///         winning side deterministically.
    function test_commitReplay_secondPlaceMustRevert() public {
        // 1) Burn one bet to leak the seed publicly via BetSettled.
        bytes32 commit = _commit(SERVER_SEED);
        vm.prank(player);
        uint256 firstBetId =
            game.placeBet{value: MIN_BET}(CosmicFlip.Side.Heads, CLIENT_SEED, commit);
        vm.prank(keeper);
        game.settleBet(firstBetId, SERVER_SEED);

        // 2) The seed is now public on-chain (event + storage). Attacker
        //    computes the deterministic outcome for their NEXT nonce and
        //    bets the winning side.
        uint256 nextNonce = game.playerNonce(player);
        uint256 outcome =
            CommitRevealRandomness.rollOutcome(SERVER_SEED, CLIENT_SEED, nextNonce, 2);
        CosmicFlip.Side guaranteedWin =
            outcome == 0 ? CosmicFlip.Side.Heads : CosmicFlip.Side.Tails;

        // 3) The contract MUST reject the replay. The expected behaviour is a
        //    revert with the dedicated `CommitAlreadyUsed` selector once the
        //    fix lands.
        vm.expectRevert(CosmicFlip.CommitAlreadyUsed.selector);
        vm.prank(player);
        game.placeBet{value: MIN_BET}(guaranteedWin, CLIENT_SEED, commit);
    }

    /// @notice Same commit cannot be reused across two PENDING bets either —
    ///         once placed against a commit, that commit is consumed.
    function test_commitReplay_secondPlaceWhilePendingAlsoReverts() public {
        bytes32 commit = _commit(SERVER_SEED);
        vm.prank(player);
        game.placeBet{value: MIN_BET}(CosmicFlip.Side.Heads, CLIENT_SEED, commit);

        vm.expectRevert(CosmicFlip.CommitAlreadyUsed.selector);
        vm.prank(player);
        game.placeBet{value: MIN_BET}(CosmicFlip.Side.Tails, CLIENT_SEED, commit);
    }
}
