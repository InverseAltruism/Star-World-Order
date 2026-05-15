// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CommitRevealRandomness
/// @notice Stateless commit-reveal helpers shared by every Cosmic Casino game.
/// @dev    Mirrors the off-chain verify layer byte-for-byte. Test vectors in
///         both layers MUST agree, or settlement is broken. No state, no
///         events, no external calls — just three pure functions.
///
///         Hash schema (also enforced off-chain):
///             outcomeHash = keccak256(abi.encodePacked(serverSeed, clientSeed, nonce))
///             commit      = keccak256(abi.encodePacked(serverSeed))
library CommitRevealRandomness {
    /// @notice Compute the raw outcome hash for a single bet/step.
    function outcomeHash(bytes32 serverSeed, bytes32 clientSeed, uint256 nonce)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(serverSeed, clientSeed, nonce));
    }

    /// @notice Reduce an outcome hash to a uniform integer in [0, mod).
    /// @dev    Modulo bias is negligible while `mod` ≪ 2^256.
    function outcomeFromHash(bytes32 hash, uint256 mod) internal pure returns (uint256) {
        require(mod > 0, "CommitRevealRandomness: mod=0");
        return uint256(hash) % mod;
    }

    /// @notice Verify that `serverSeed` matches a previously published `commit`.
    function verifyCommit(bytes32 serverSeed, bytes32 commit) internal pure returns (bool) {
        return keccak256(abi.encodePacked(serverSeed)) == commit;
    }

    /// @notice Convenience: derive a uniform `[0, mod)` outcome end-to-end.
    function rollOutcome(bytes32 serverSeed, bytes32 clientSeed, uint256 nonce, uint256 mod)
        internal
        pure
        returns (uint256)
    {
        return outcomeFromHash(outcomeHash(serverSeed, clientSeed, nonce), mod);
    }
}
