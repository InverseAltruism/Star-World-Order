// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreateXScript} from "createx-forge/script/CreateXScript.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";

/// @title DeployDeterministicTest
/// @notice Acceptance harness for the createx-forge cutover on Monad: the
///         same `(deployer, salt)` pair must produce the same contract
///         addresses no matter which chain we deploy on. Without that,
///         "wrong address on chain X" is the next mainnet footgun.
contract DeployDeterministicTest is Test, CreateXScript {
    /// @dev Use a real private key so the test can drive `Deploy.run()` via
    ///      `vm.startBroadcast(pk)` (which is broadcast-compatible) instead of
    ///      `vm.prank` (which isn't).
    uint256 internal constant DEPLOYER_PK = 0xA11CE;
    address internal deployer = vm.addr(DEPLOYER_PK);

    /// @dev Distinct from any real chainId so the end-to-end test writes to
    ///      `deployments/9999999.json` instead of clobbering the real
    ///      anvil/testnet artifacts.
    uint256 internal constant _TEST_CHAIN_ID = 9999999;

    /// @dev Salt entropy values must match `Deploy.s.sol`'s defaults.
    uint88 internal constant BANKROLL_ENTROPY = 0xBB01;
    uint88 internal constant FLIP_ENTROPY     = 0xBBC1;
    uint88 internal constant DICE_ENTROPY     = 0xBBD1;
    uint88 internal constant CLIMB_ENTROPY    = 0xBBA1;

    /// @dev The live production deployer for `deployments/10143.json`. The
    ///      address book test below pins CREATE3 predictions for this deployer
    ///      against the Monad-testnet artifact so we notice the moment salt
    ///      encoding or default entropy drifts.
    address internal constant PROD_DEPLOYER =
        0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B;

    function setUp() public withCreateX {
        vm.deal(deployer, 100 ether);
    }

    /// @notice Cleans up the per-chain deployment JSON the end-to-end test
    ///         writes so we don't leave drift in the workspace.
    function _cleanupTestDeploymentJson() internal {
        string memory path = string.concat("deployments/", vm.toString(_TEST_CHAIN_ID), ".json");
        try vm.removeFile(path) {} catch {}
    }

    /// @notice Same deployer + same salt entropy = same CREATE3 address,
    ///         independent of `block.chainid`. This is the central guarantee
    ///         that the createx-forge switch is supposed to give us. We span
    ///         all four casino contracts so we don't ship a "wrong address on
    ///         chain X" footgun for any of the games.
    function test_sameSaltYieldsSameAddressAcrossChains() public {
        bytes32 bankrollSalt = _packSalt(deployer, BANKROLL_ENTROPY);
        bytes32 flipSalt     = _packSalt(deployer, FLIP_ENTROPY);
        bytes32 diceSalt     = _packSalt(deployer, DICE_ENTROPY);
        bytes32 climbSalt    = _packSalt(deployer, CLIMB_ENTROPY);

        // anvil
        vm.chainId(31337);
        address bankrollOnAnvil = computeCreate3Address(bankrollSalt, deployer);
        address flipOnAnvil     = computeCreate3Address(flipSalt,     deployer);
        address diceOnAnvil     = computeCreate3Address(diceSalt,     deployer);
        address climbOnAnvil    = computeCreate3Address(climbSalt,    deployer);

        // Monad testnet
        vm.chainId(10143);
        address bankrollOnTestnet = computeCreate3Address(bankrollSalt, deployer);
        address flipOnTestnet     = computeCreate3Address(flipSalt,     deployer);
        address diceOnTestnet     = computeCreate3Address(diceSalt,     deployer);
        address climbOnTestnet    = computeCreate3Address(climbSalt,    deployer);

        // Monad mainnet
        vm.chainId(143);
        address bankrollOnMainnet = computeCreate3Address(bankrollSalt, deployer);
        address flipOnMainnet     = computeCreate3Address(flipSalt,     deployer);
        address diceOnMainnet     = computeCreate3Address(diceSalt,     deployer);
        address climbOnMainnet    = computeCreate3Address(climbSalt,    deployer);

        assertEq(bankrollOnAnvil, bankrollOnTestnet, "bankroll drifts anvil->testnet");
        assertEq(bankrollOnAnvil, bankrollOnMainnet, "bankroll drifts anvil->mainnet");
        assertEq(flipOnAnvil,     flipOnTestnet,     "flip drifts anvil->testnet");
        assertEq(flipOnAnvil,     flipOnMainnet,     "flip drifts anvil->mainnet");
        assertEq(diceOnAnvil,     diceOnTestnet,     "dice drifts anvil->testnet");
        assertEq(diceOnAnvil,     diceOnMainnet,     "dice drifts anvil->mainnet");
        assertEq(climbOnAnvil,    climbOnTestnet,    "climb drifts anvil->testnet");
        assertEq(climbOnAnvil,    climbOnMainnet,    "climb drifts anvil->mainnet");

        // Distinct entropy => distinct addresses for every contract pair.
        assertTrue(bankrollOnAnvil != flipOnAnvil,  "bankroll/flip share addr");
        assertTrue(bankrollOnAnvil != diceOnAnvil,  "bankroll/dice share addr");
        assertTrue(bankrollOnAnvil != climbOnAnvil, "bankroll/climb share addr");
        assertTrue(flipOnAnvil     != diceOnAnvil,  "flip/dice share addr");
        assertTrue(flipOnAnvil     != climbOnAnvil, "flip/climb share addr");
        assertTrue(diceOnAnvil     != climbOnAnvil, "dice/climb share addr");
    }

    /// @notice Different deployers -> different addresses for the same salt.
    ///         This is the permissioned-deploy guard from CreateX (first 20
    ///         bytes of the salt are the deployer's address).
    function test_differentDeployerYieldsDifferentAddress() public view {
        uint88 entropy = BANKROLL_ENTROPY;
        address addrA = computeCreate3Address(_packSalt(address(0xA11CE), entropy), address(0xA11CE));
        address addrB = computeCreate3Address(_packSalt(address(0xB0B),   entropy), address(0xB0B));
        assertTrue(addrA != addrB, "permissioned-deploy guard broken");
    }

    /// @notice End-to-end: run the actual `Deploy` script against a local
    ///         anvil VM and assert the deployed addresses match the
    ///         pre-computed addresses from `computeCreate3Address`. Catches
    ///         any drift between the script's salt encoding and the test's,
    ///         and verifies all 4 contracts (bankroll + cosmic-flip +
    ///         gravity-dice + constellation-climb) are deployed and
    ///         registered.
    function test_deployScriptYieldsPredictedAddresses() public {
        bytes32 bankrollSalt = _packSalt(deployer, BANKROLL_ENTROPY);
        bytes32 flipSalt     = _packSalt(deployer, FLIP_ENTROPY);
        bytes32 diceSalt     = _packSalt(deployer, DICE_ENTROPY);
        bytes32 climbSalt    = _packSalt(deployer, CLIMB_ENTROPY);
        address expectedBankroll = computeCreate3Address(bankrollSalt, deployer);
        address expectedFlip     = computeCreate3Address(flipSalt,     deployer);
        address expectedDice     = computeCreate3Address(diceSalt,     deployer);
        address expectedClimb    = computeCreate3Address(climbSalt,    deployer);

        // Use a unique chainId so the script's `deployments/<chainId>.json`
        // writeup lands in a test-only artifact instead of clobbering the
        // real `deployments/31337.json`. We then remove it on teardown.
        vm.chainId(_TEST_CHAIN_ID);

        Deploy script = new Deploy();
        // CreateX is already etched by this test's own setUp(); the script's
        // setUp re-checks and is a no-op.
        script.setUp();

        // Inject a real PRIVATE_KEY so the script takes the
        // `vm.startBroadcast(pk)` branch — that path is broadcast-compatible
        // and doesn't fight a vm.prank like the implicit-broadcaster branch
        // would.
        vm.setEnv("PRIVATE_KEY", vm.toString(bytes32(DEPLOYER_PK)));
        (address bankrollAddr, address flipAddr, address diceAddr, address climbAddr) =
            script.run();

        assertEq(bankrollAddr, expectedBankroll, "deploy bankroll != predicted");
        assertEq(flipAddr,     expectedFlip,     "deploy flip != predicted");
        assertEq(diceAddr,     expectedDice,     "deploy dice != predicted");
        assertEq(climbAddr,    expectedClimb,    "deploy climb != predicted");

        // Sanity: deployed bytecode is non-empty.
        assertGt(bankrollAddr.code.length, 0, "bankroll has no code");
        assertGt(flipAddr.code.length,     0, "flip has no code");
        assertGt(diceAddr.code.length,     0, "dice has no code");
        assertGt(climbAddr.code.length,    0, "climb has no code");

        // Wiring sanity: every game is registered against the bankroll.
        CasinoBankroll bankroll = CasinoBankroll(payable(bankrollAddr));
        assertTrue(bankroll.isGame(flipAddr),  "flip not registered as game");
        assertTrue(bankroll.isGame(diceAddr),  "dice not registered as game");
        assertTrue(bankroll.isGame(climbAddr), "climb not registered as game");

        _cleanupTestDeploymentJson();
    }

    /// @notice Pins the CREATE3 prediction for the live production deployer
    ///         against the addresses recorded in `deployments/10143.json`.
    ///         If anyone changes salt encoding or rotates default entropy
    ///         without rotating the artifact, this test trips immediately —
    ///         well before anyone tries to deploy to mainnet against a stale
    ///         address book.
    function test_predictionsMatchDeployments10143Json() public view {
        bytes32 bankrollSalt = _packSalt(PROD_DEPLOYER, BANKROLL_ENTROPY);
        bytes32 flipSalt     = _packSalt(PROD_DEPLOYER, FLIP_ENTROPY);
        bytes32 diceSalt     = _packSalt(PROD_DEPLOYER, DICE_ENTROPY);
        bytes32 climbSalt    = _packSalt(PROD_DEPLOYER, CLIMB_ENTROPY);

        address predictedBankroll = computeCreate3Address(bankrollSalt, PROD_DEPLOYER);
        address predictedFlip     = computeCreate3Address(flipSalt,     PROD_DEPLOYER);
        address predictedDice     = computeCreate3Address(diceSalt,     PROD_DEPLOYER);
        address predictedClimb    = computeCreate3Address(climbSalt,    PROD_DEPLOYER);

        // Pinned from contracts/casino/deployments/10143.json (Monad testnet).
        // Update this test in lock-step if the deployer or default entropy
        // ever rotates.
        assertEq(
            predictedBankroll,
            0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf,
            "bankroll prediction != deployments/10143.json"
        );
        assertEq(
            predictedFlip,
            0x064b8bfc03b23D2b525deD9d3969090347A21983,
            "cosmicFlip prediction != deployments/10143.json"
        );
        assertEq(
            predictedDice,
            0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B,
            "gravityDice prediction != deployments/10143.json"
        );
        assertEq(
            predictedClimb,
            0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e,
            "constellationClimb prediction != deployments/10143.json"
        );
    }

    function _packSalt(address d, uint88 entropy) internal pure returns (bytes32) {
        return bytes32(abi.encodePacked(d, hex"00", bytes11(entropy)));
    }
}
