// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommitRevealRandomness} from "../src/CommitRevealRandomness.sol";

/// @title CommitRevealRandomnessUnit
/// @notice Port of `BunnyBagzRandomness.t.sol` (Mega House) → SWO's Cosmic
///         Casino `CommitRevealRandomness` library. Mechanical rename:
///           BunnyBagzRandomness → CommitRevealRandomness
///         Covers `verifyCommit`, `outcomeHash`, `outcomeFromHash`, and
///         `rollOutcome`. Five known-vector cases pin the on-chain hash schema
///         to the off-chain verifier so settlement cannot drift silently. A
///         256-iteration distribution check confirms `rollOutcome` does not
///         exhibit gross bias.
contract CommitRevealRandomnessUnitTest is Test {
    // ────────────────────────────────────────────────────────────────────────
    // Basic unit coverage
    // ────────────────────────────────────────────────────────────────────────

    function test_verifyCommit_matches() public pure {
        bytes32 seed = keccak256("seed");
        bytes32 commit = keccak256(abi.encodePacked(seed));
        assertTrue(CommitRevealRandomness.verifyCommit(seed, commit));
    }

    function test_verifyCommit_rejectsMismatch() public pure {
        bytes32 seed = keccak256("seed");
        bytes32 wrong = keccak256(abi.encodePacked(keccak256("other")));
        assertFalse(CommitRevealRandomness.verifyCommit(seed, wrong));
    }

    function test_outcomeHash_deterministic() public pure {
        bytes32 a = CommitRevealRandomness.outcomeHash(bytes32(uint256(1)), bytes32(uint256(2)), 3);
        bytes32 b = CommitRevealRandomness.outcomeHash(bytes32(uint256(1)), bytes32(uint256(2)), 3);
        assertEq(a, b);
    }

    function test_outcomeHash_nonceChangesResult() public pure {
        bytes32 a = CommitRevealRandomness.outcomeHash(bytes32(uint256(1)), bytes32(uint256(2)), 3);
        bytes32 b = CommitRevealRandomness.outcomeHash(bytes32(uint256(1)), bytes32(uint256(2)), 4);
        assertTrue(a != b);
    }

    /// @dev Library is internal+pure, so `expectRevert` only sees the revert
    ///      if we wrap the call in an external one (creates a deeper call
    ///      frame than the cheatcode). `_outcomeFromHashExt` does that.
    function _outcomeFromHashExt(bytes32 hash, uint256 mod) external pure returns (uint256) {
        return CommitRevealRandomness.outcomeFromHash(hash, mod);
    }

    function test_outcomeFromHash_revertsOnZeroMod() public {
        vm.expectRevert(bytes("CommitRevealRandomness: mod=0"));
        this._outcomeFromHashExt(bytes32(uint256(1)), 0);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Property fuzz
    // ────────────────────────────────────────────────────────────────────────

    /// @notice Fuzz: outcome must always be in [0, mod) for any inputs.
    function testFuzz_outcomeFromHash_inRange(bytes32 hash, uint256 modSeed) public pure {
        uint256 mod = bound(modSeed, 1, type(uint128).max);
        uint256 r = CommitRevealRandomness.outcomeFromHash(hash, mod);
        assertLt(r, mod);
    }

    /// @notice Fuzz: rollOutcome agrees with outcomeFromHash(outcomeHash(...)).
    function testFuzz_rollOutcome_matchesPipeline(
        bytes32 server,
        bytes32 client,
        uint256 nonce,
        uint256 modSeed
    ) public pure {
        uint256 mod = bound(modSeed, 1, type(uint128).max);
        uint256 viaPipeline =
            CommitRevealRandomness.outcomeFromHash(CommitRevealRandomness.outcomeHash(server, client, nonce), mod);
        uint256 viaHelper = CommitRevealRandomness.rollOutcome(server, client, nonce, mod);
        assertEq(viaPipeline, viaHelper);
    }

    /// @notice Fuzz: verifyCommit only accepts the exact preimage.
    function testFuzz_verifyCommit_onlyExact(bytes32 seed, bytes32 wrongSeed) public pure {
        vm.assume(seed != wrongSeed);
        bytes32 commit = keccak256(abi.encodePacked(seed));
        assertTrue(CommitRevealRandomness.verifyCommit(seed, commit));
        assertFalse(CommitRevealRandomness.verifyCommit(wrongSeed, commit));
    }

    // ────────────────────────────────────────────────────────────────────────
    // Known-vector cases (parity with the off-chain verifier)
    //
    // Each vector pins (server, client, nonce) → (commit, outcomeHash,
    // rollOutcome) for a chosen `mod`. If the hash schema ever drifts between
    // on-chain settlement and the off-chain verifier, at least one of these
    // assertions will fail on the same fixture in both layers. Update both
    // sides together if a vector ever changes.
    // ────────────────────────────────────────────────────────────────────────

    function test_parityVector1_coinflip() public pure {
        bytes32 server = bytes32(uint256(0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa));
        bytes32 client = bytes32(uint256(0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));
        uint256 nonce = 0;
        bytes32 expectedCommit =
            0x20ee8f1366f06926e9e8771d8fb9007a8537c8dfdb6a3f8c2cfd64db19d2ec90;
        bytes32 expectedOutcomeHash =
            0x4bcf8d6c0234f488ad0c0be6d04c4dab44d1dad9c162020f8d1f1bb91e6f3314;
        uint256 expectedCoinflip = 0;

        assertEq(keccak256(abi.encodePacked(server)), expectedCommit, "v1: commit drift");
        assertEq(
            CommitRevealRandomness.outcomeHash(server, client, nonce),
            expectedOutcomeHash,
            "v1: outcomeHash drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 2),
            expectedCoinflip,
            "v1: coinflip drift"
        );
        assertTrue(CommitRevealRandomness.verifyCommit(server, expectedCommit), "v1: verifyCommit drift");
    }

    function test_parityVector2_coinflip() public pure {
        bytes32 server = bytes32(uint256(0x1212121212121212121212121212121212121212121212121212121212121212));
        bytes32 client = bytes32(uint256(0xfefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe));
        uint256 nonce = 42;
        bytes32 expectedCommit =
            0x1ade9f553ac636b4081983b175c3bbe991dd726b1cdbdb2588588cf5442bf50b;
        bytes32 expectedOutcomeHash =
            0x93aa6cb4454b7a54b69f5718f5317374d38fac4713e58f048e70d92d20ae3b0c;
        uint256 expectedCoinflip = 0;

        assertEq(keccak256(abi.encodePacked(server)), expectedCommit, "v2: commit drift");
        assertEq(
            CommitRevealRandomness.outcomeHash(server, client, nonce),
            expectedOutcomeHash,
            "v2: outcomeHash drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 2),
            expectedCoinflip,
            "v2: coinflip drift"
        );
        assertTrue(CommitRevealRandomness.verifyCommit(server, expectedCommit), "v2: verifyCommit drift");
    }

    function test_parityVector3_coinflip() public pure {
        bytes32 server = bytes32(uint256(0));
        bytes32 client = bytes32(uint256(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff));
        uint256 nonce = 999;
        bytes32 expectedCommit =
            0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563;
        bytes32 expectedOutcomeHash =
            0x728e65425523a8aba2498c23edc5b81dcccf9e2bba654e5b97fb88f6a9442e61;
        uint256 expectedCoinflip = 1;

        assertEq(keccak256(abi.encodePacked(server)), expectedCommit, "v3: commit drift");
        assertEq(
            CommitRevealRandomness.outcomeHash(server, client, nonce),
            expectedOutcomeHash,
            "v3: outcomeHash drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 2),
            expectedCoinflip,
            "v3: coinflip drift"
        );
        assertTrue(CommitRevealRandomness.verifyCommit(server, expectedCommit), "v3: verifyCommit drift");
    }

    /// @notice Vector 4 — small integer seeds, dice (`mod=6`) and roll-under
    ///         (`mod=100`) outcomes. Exercises a `mod` other than 2 to catch
    ///         schema drift that the coinflip vectors would not notice.
    function test_parityVector4_diceAndRollUnder() public pure {
        bytes32 server = bytes32(uint256(1));
        bytes32 client = bytes32(uint256(2));
        uint256 nonce = 100;
        bytes32 expectedCommit =
            0xb10e2d527612073b26eecdfd717e6a320cf44b4afac2b0732d9fcbe2b7fa0cf6;
        bytes32 expectedOutcomeHash =
            0x53fcaf77478d19cc564165ef5e0f22cbf2a347d03fce0828441d0f87ed5fde27;
        uint256 expectedMod6 = 1;
        uint256 expectedMod100 = 43;

        assertEq(keccak256(abi.encodePacked(server)), expectedCommit, "v4: commit drift");
        assertEq(
            CommitRevealRandomness.outcomeHash(server, client, nonce),
            expectedOutcomeHash,
            "v4: outcomeHash drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 6),
            expectedMod6,
            "v4: dice drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 100),
            expectedMod100,
            "v4: roll-under drift"
        );
        assertTrue(CommitRevealRandomness.verifyCommit(server, expectedCommit), "v4: verifyCommit drift");
    }

    /// @notice Vector 5 — keccak-derived seeds (typical production shape) with
    ///         a small odd nonce, checked against three different `mod` values
    ///         (coinflip, dice, roll-under) for breadth.
    function test_parityVector5_keccakSeeds() public pure {
        // server = keccak256("server-v5")
        bytes32 server = 0xd523b5c7e623f9083b246937c9233ed986e049ed20d99af29b6d4a295159b787;
        // client = keccak256("client-v5")
        bytes32 client = 0x0a2a52793f8b0227b319e751a2079c406dddfcaac539ee4fc77326da39a8893b;
        uint256 nonce = 7;
        bytes32 expectedCommit =
            0x0d3bca55222e713c1577d7ad235266f7eabd6f14bfe2fa0497ee3b5ace87826a;
        bytes32 expectedOutcomeHash =
            0x614dc4e9f30f5499a27fb7db75442b12fda175d363f6364afe9301a31851e8fd;
        uint256 expectedCoinflip = 1;
        uint256 expectedDice = 1;
        uint256 expectedRollUnder = 25;

        // Sanity: seeds match their published names.
        assertEq(server, keccak256("server-v5"), "v5: server-seed drift");
        assertEq(client, keccak256("client-v5"), "v5: client-seed drift");

        assertEq(keccak256(abi.encodePacked(server)), expectedCommit, "v5: commit drift");
        assertEq(
            CommitRevealRandomness.outcomeHash(server, client, nonce),
            expectedOutcomeHash,
            "v5: outcomeHash drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 2),
            expectedCoinflip,
            "v5: coinflip drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 6),
            expectedDice,
            "v5: dice drift"
        );
        assertEq(
            CommitRevealRandomness.rollOutcome(server, client, nonce, 100),
            expectedRollUnder,
            "v5: roll-under drift"
        );
        assertTrue(CommitRevealRandomness.verifyCommit(server, expectedCommit), "v5: verifyCommit drift");
    }

    // ────────────────────────────────────────────────────────────────────────
    // Distribution check
    // ────────────────────────────────────────────────────────────────────────

    /// @notice rollOutcome distribution: 256 sequential nonces split into two
    ///         coinflip buckets must each land within ±10% of the 128 expected
    ///         count. Deterministic (fixed seeds), so it does not flake. Acts
    ///         as a guard against gross modulo bias (e.g. dropping the low bit
    ///         or off-by-one in the reduction).
    function test_rollOutcome_distribution_256runs() public pure {
        bytes32 server = keccak256("dist-test-server");
        bytes32 client = keccak256("dist-test-client");
        uint256 totalRuns = 256;
        uint256 mod = 2;
        uint256 expected = totalRuns / mod;       // 128
        uint256 tolerance = expected / 10;        // 12 → ±10%

        uint256[2] memory buckets;
        for (uint256 i = 0; i < totalRuns; i++) {
            buckets[CommitRevealRandomness.rollOutcome(server, client, i, mod)]++;
        }

        // Sanity: every draw landed in some bucket.
        assertEq(buckets[0] + buckets[1], totalRuns, "dist: bucket total");

        // Bucket counts within ±10% of the expected 128.
        assertGe(buckets[0], expected - tolerance, "dist: bucket0 underflow");
        assertLe(buckets[0], expected + tolerance, "dist: bucket0 overflow");
        assertGe(buckets[1], expected - tolerance, "dist: bucket1 underflow");
        assertLe(buckets[1], expected + tolerance, "dist: bucket1 overflow");
    }
}
