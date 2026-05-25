// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CreateXScript} from "createx-forge/script/CreateXScript.sol";

import {Star} from "../src/Star.sol";

/// @title DeployStar
/// @notice Deploys the soulbound STAR token via CREATE3 through the CreateX
///         singleton at `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`. The same
///         `(deployer, salt)` yields the same address on anvil + Monad testnet
///         (10143) + mainnet (143), so the address is predictable pre-broadcast.
///
///         Predict only (NO broadcast):
///           forge script DeployStar --rpc-url $MONAD_TESTNET_RPC --sender <deployer>
///
///         Broadcast (funded key):
///           forge script DeployStar --rpc-url $MONAD_TESTNET_RPC --private-key $PRIVATE_KEY --broadcast
///
///         Tunable via env vars (all optional):
///           STAR_ADMIN           DAO governor / admin (default = deployer)
///           STAR_EPOCH_CAP       per-epoch mint cap, wei (default 10_000_000e18)
///           STAR_EPOCH_DURATION  epoch length, seconds (default 1 days)
///           STAR_TOKEN_SALT      uint88 entropy (default 0x57A201)
///           PRIVATE_KEY          deployer key (forge default if unset)
contract DeployStar is CreateXScript {
    uint88 internal constant DEFAULT_TOKEN_SALT = 0x57A201; // "STAR" 01

    function setUp() public withCreateX {}

    function run() external returns (address starAddr) {
        address deployer = msg.sender;
        address admin = vm.envOr("STAR_ADMIN", deployer);
        uint256 epochCap = vm.envOr("STAR_EPOCH_CAP", uint256(10_000_000 ether));
        uint256 epochDuration = vm.envOr("STAR_EPOCH_DURATION", uint256(1 days));
        // Permissioned, cross-chain-deterministic CreateX salt: the deployer in
        // the top 20 bytes, byte[20]=0 (no cross-chain redeploy mixing), entropy
        // in the low bytes. This is the salt shape CreateX's _guard and
        // createx-forge's computeCreate3Address agree on, so prediction ==
        // actual. Mirrors the casino salts (deployer-prefixed). Entropy must fit
        // in the low 88 bits to keep byte[20] zero.
        uint256 entropy = vm.envOr("STAR_TOKEN_SALT", uint256(DEFAULT_TOKEN_SALT));
        require(entropy < (uint256(1) << 88), "STAR_TOKEN_SALT entropy too large");
        bytes32 salt = bytes32((uint256(uint160(deployer)) << 96) | entropy);

        starAddr = computeCreate3Address(salt, deployer);

        console2.log("Predicted Star:    ", starAddr);
        console2.log("chainId:           ", block.chainid);
        console2.log("deployer:          ", deployer);
        console2.log("admin:             ", admin);
        console2.log("epochCap (wei):    ", epochCap);
        console2.log("epochDuration (s): ", epochDuration);

        if (vm.envOr("PRIVATE_KEY", uint256(0)) != 0) {
            vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        } else {
            vm.startBroadcast();
        }

        if (starAddr.code.length == 0) {
            address deployed = create3(
                salt,
                abi.encodePacked(
                    type(Star).creationCode,
                    abi.encode(admin, epochCap, epochDuration)
                )
            );
            require(deployed == starAddr, "Star: CREATE3 address mismatch");
            console2.log("Deployed Star at:  ", deployed);
        } else {
            console2.log("Star already deployed, skipping.");
        }

        vm.stopBroadcast();
    }
}
