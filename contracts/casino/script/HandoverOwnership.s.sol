// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";
import {CasinoAllowlist} from "../src/CasinoAllowlist.sol";

/// @title HandoverOwnership
/// @notice Transfers `Ownable.owner()` on every Cosmic Casino contract from the
///         deploy EOA to the SWO multisig, then asserts the deployer no longer
///         holds the owner role on any contract. Implements G7 of the casino
///         mainnet checklist (`SWO_CASINO_MAINNET_OWNERSHIP_HANDOVER`).
///
///         The contracts use OpenZeppelin `Ownable` (not Ownable2Step), so
///         `transferOwnership` is a *one-step* transfer — the multisig address
///         must be checked twice before broadcast. The shell wrapper
///         `handover-ownership.sh` does that and refuses to broadcast against
///         an EOA-looking destination (codesize == 0) unless the operator
///         explicitly waives it.
///
///         Inputs (env, all required unless noted):
///           CASINO_MULTISIG       destination address (the SWO governance multisig)
///           CASINO_BANKROLL       deployed bankroll address
///           CASINO_FLIP           deployed CosmicFlip address
///           CASINO_DICE           deployed GravityDice address
///           CASINO_CLIMB          deployed ConstellationClimb address
///           CASINO_ALLOWLIST      deployed CasinoAllowlist address (optional, set
///                                 to 0x0 to skip — allowlist isn't deployed by
///                                 default on mainnet)
///           PRIVATE_KEY           deployer key (must currently own each contract)
contract HandoverOwnership is Script {
    error MultisigZero();
    error MultisigEqualsDeployer(address deployer);
    error BankrollZero();
    error NotOwner(address contractAddr, address expectedOwner, address actualOwner);
    error PostTransferOwnerMismatch(address contractAddr, address expected, address actual);
    error DeployerStillOwner(address contractAddr, address deployer);

    struct HandoverParams {
        address multisig;
        address deployer;
        address bankroll;
        address flip;
        address dice;
        address climb;
        address allowlist;
    }

    function run() external {
        HandoverParams memory p = _loadParams();
        _runWithParams(p, vm.envUint("PRIVATE_KEY"));
    }

    /// @notice Test-friendly entrypoint that bypasses env reads. Production
    ///         callers should use `run()`. The shell wrapper threads env into
    ///         `forge script` so `run()` is the real broadcast path on chain.
    function runWithParams(HandoverParams memory p, uint256 pk) external {
        _runWithParams(p, pk);
    }

    function _runWithParams(HandoverParams memory p, uint256 pk) internal {
        if (p.multisig == address(0)) revert MultisigZero();
        if (p.deployer == address(0)) p.deployer = vm.addr(pk);
        if (p.multisig == p.deployer) revert MultisigEqualsDeployer(p.deployer);
        if (p.bankroll == address(0)) revert BankrollZero();

        _preflight(p);

        vm.startBroadcast(pk);
        _transfer(p.bankroll, p.deployer, p.multisig, "bankroll");
        _transfer(p.flip, p.deployer, p.multisig, "cosmicFlip");
        _transfer(p.dice, p.deployer, p.multisig, "gravityDice");
        _transfer(p.climb, p.deployer, p.multisig, "constellationClimb");
        if (p.allowlist != address(0)) {
            _transfer(p.allowlist, p.deployer, p.multisig, "allowlist");
        }
        vm.stopBroadcast();

        _verify(p);

        console2.log("HandoverOwnership: complete");
        console2.log("  multisig (new owner):", p.multisig);
        console2.log("  deployer (revoked):  ", p.deployer);
    }

    function _loadParams() internal view returns (HandoverParams memory p) {
        p.multisig = vm.envAddress("CASINO_MULTISIG");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        p.deployer = vm.addr(pk);
        p.bankroll = vm.envAddress("CASINO_BANKROLL");
        p.flip = vm.envAddress("CASINO_FLIP");
        p.dice = vm.envAddress("CASINO_DICE");
        p.climb = vm.envAddress("CASINO_CLIMB");
        p.allowlist = vm.envOr("CASINO_ALLOWLIST", address(0));
    }

    function _preflight(HandoverParams memory p) internal view {
        _expectOwner(p.bankroll, p.deployer);
        _expectOwner(p.flip, p.deployer);
        _expectOwner(p.dice, p.deployer);
        _expectOwner(p.climb, p.deployer);
        if (p.allowlist != address(0)) {
            _expectOwner(p.allowlist, p.deployer);
        }
    }

    function _verify(HandoverParams memory p) internal view {
        _expectOwner(p.bankroll, p.multisig);
        _expectOwner(p.flip, p.multisig);
        _expectOwner(p.dice, p.multisig);
        _expectOwner(p.climb, p.multisig);
        if (p.allowlist != address(0)) {
            _expectOwner(p.allowlist, p.multisig);
        }

        if (_ownerOf(p.bankroll) == p.deployer) revert DeployerStillOwner(p.bankroll, p.deployer);
        if (_ownerOf(p.flip) == p.deployer) revert DeployerStillOwner(p.flip, p.deployer);
        if (_ownerOf(p.dice) == p.deployer) revert DeployerStillOwner(p.dice, p.deployer);
        if (_ownerOf(p.climb) == p.deployer) revert DeployerStillOwner(p.climb, p.deployer);
        if (p.allowlist != address(0) && _ownerOf(p.allowlist) == p.deployer) {
            revert DeployerStillOwner(p.allowlist, p.deployer);
        }
    }

    function _transfer(address target, address expectedOwner, address newOwner, string memory label)
        internal
    {
        _expectOwner(target, expectedOwner);
        CasinoBankroll(payable(target)).transferOwnership(newOwner);
        console2.log(string.concat(label, ": transferOwnership ->"), newOwner);
    }

    function _expectOwner(address target, address expected) internal view {
        address actual = _ownerOf(target);
        if (actual != expected) revert NotOwner(target, expected, actual);
    }

    function _ownerOf(address target) internal view returns (address) {
        // All five casino contracts inherit OZ Ownable, so owner() has the
        // identical selector regardless of which contract we point at.
        return CasinoBankroll(payable(target)).owner();
    }
}
