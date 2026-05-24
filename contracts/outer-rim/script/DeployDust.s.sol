// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CreateXScript} from "createx-forge/script/CreateXScript.sol";

import {Dust} from "../src/Dust.sol";
import {DustVaultSink} from "../src/DustVaultSink.sol";

/// @title DeployDust
/// @notice Deploys the Outer Rim DUST stack (DustVaultSink + Dust) via CREATE3
///         through the CreateX singleton at
///         `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`. The same
///         `(deployer, salt)` pair yields the same address on local anvil +
///         Monad testnet (10143) + Monad mainnet (143), so the operator can
///         predict the DUST address before broadcasting.
///
///         Predict only (NO broadcast) — operator-gated deploy:
///           forge script DeployDust --rpc-url $MONAD_TESTNET_RPC \
///             --sender <deployer>
///
///         Broadcast (operator, with funded key):
///           forge script DeployDust --rpc-url $MONAD_TESTNET_RPC \
///             --private-key $PK --broadcast
///
///         Tunable via env vars (all optional):
///           DUST_ADMIN          DAO governor (default = deployer)
///           DUST_EPOCH_CAP      per-epoch mint cap, wei (default 1_000_000e18)
///           DUST_EPOCH_DURATION epoch length, seconds (default 1 days)
///           DUST_VAULT_SALT     uint88 entropy (default 0xD05701)
///           DUST_TOKEN_SALT     uint88 entropy (default 0xD05702)
///           PRIVATE_KEY         deployer key (forge default if unset)
contract DeployDust is CreateXScript {
    uint88 internal constant DEFAULT_VAULT_SALT = 0xD05701;
    uint88 internal constant DEFAULT_TOKEN_SALT = 0xD05702;

    function setUp() public withCreateX {}

    struct Params {
        address deployer;
        address admin;
        uint256 epochCap;
        uint256 epochDuration;
        bytes32 vaultSalt;
        bytes32 tokenSalt;
    }

    function run() external returns (address dustAddr, address vaultAddr) {
        Params memory p = _loadParams();

        // Predict both addresses up front (pure; works without broadcasting).
        vaultAddr = computeCreate3Address(p.vaultSalt, p.deployer);
        dustAddr = computeCreate3Address(p.tokenSalt, p.deployer);

        console2.log("Predicted DustVaultSink:", vaultAddr);
        console2.log("Predicted Dust:         ", dustAddr);
        console2.log("chainId:                ", block.chainid);
        console2.log("deployer:               ", p.deployer);
        console2.log("admin (DAO):            ", p.admin);
        console2.log("epochCap (wei):         ", p.epochCap);
        console2.log("epochDuration (s):      ", p.epochDuration);

        if (vm.envOr("PRIVATE_KEY", uint256(0)) != 0) {
            vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        } else {
            vm.startBroadcast();
        }

        _create3IfMissing(
            vaultAddr,
            p.vaultSalt,
            abi.encodePacked(type(DustVaultSink).creationCode, abi.encode(p.admin)),
            "dust-vault-sink"
        );
        _create3IfMissing(
            dustAddr,
            p.tokenSalt,
            abi.encodePacked(
                type(Dust).creationCode,
                abi.encode(p.admin, vaultAddr, p.epochCap, p.epochDuration)
            ),
            "dust"
        );

        vm.stopBroadcast();

        _writeDeploymentJson(dustAddr, vaultAddr, p);
    }

    function _loadParams() internal view returns (Params memory p) {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        p.deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        p.admin = vm.envOr("DUST_ADMIN", p.deployer);
        p.epochCap = vm.envOr("DUST_EPOCH_CAP", uint256(1_000_000 ether));
        p.epochDuration = vm.envOr("DUST_EPOCH_DURATION", uint256(1 days));

        uint88 vEntropy = uint88(vm.envOr("DUST_VAULT_SALT", uint256(DEFAULT_VAULT_SALT)));
        uint88 tEntropy = uint88(vm.envOr("DUST_TOKEN_SALT", uint256(DEFAULT_TOKEN_SALT)));
        p.vaultSalt = _packSalt(p.deployer, vEntropy);
        p.tokenSalt = _packSalt(p.deployer, tEntropy);
    }

    function _packSalt(address deployer, uint88 entropy) internal pure returns (bytes32) {
        return bytes32(abi.encodePacked(deployer, hex"00", bytes11(entropy)));
    }

    function _create3IfMissing(
        address predicted,
        bytes32 salt,
        bytes memory creation,
        string memory label
    ) internal {
        if (predicted.code.length > 0) {
            console2.log(string.concat(label, ": already deployed at"), predicted);
            return;
        }
        address deployed = create3(salt, creation);
        require(deployed == predicted, string.concat(label, " address mismatch"));
    }

    function _writeDeploymentJson(address dustAddr, address vaultAddr, Params memory p) internal {
        string memory key = "dust_deployment";
        vm.serializeAddress(key, "dust", dustAddr);
        vm.serializeAddress(key, "dustVaultSink", vaultAddr);
        vm.serializeAddress(key, "deployer", p.deployer);
        vm.serializeAddress(key, "admin", p.admin);
        vm.serializeBytes32(key, "vaultSalt", p.vaultSalt);
        vm.serializeBytes32(key, "tokenSalt", p.tokenSalt);
        vm.serializeUint(key, "epochCap", p.epochCap);
        vm.serializeUint(key, "epochDuration", p.epochDuration);
        string memory json = vm.serializeUint(key, "chainId", block.chainid);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Wrote deployment JSON to:", path);
    }
}
