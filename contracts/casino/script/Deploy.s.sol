// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CreateXScript} from "createx-forge/script/CreateXScript.sol";

import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";
import {CasinoAllowlist} from "../src/CasinoAllowlist.sol";

/// @title Deploy
/// @notice Deploys the Cosmic Casino stack (bankroll + Cosmic Flip + Gravity
///         Dice + Constellation Climb) via CREATE3 through the CreateX
///         singleton at `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`. Same
///         `(deployer, salt)` pair produces the same address on local anvil +
///         Monad testnet (10143) + Monad mainnet (143).
///
///         Salt entropy is BB-derived (0xBB01/0xBBC1/...) so addresses match
///         the legacy CREATE3 prediction for the same deployer — useful if
///         the operator wants to mirror an off-chain registry. Changing the
///         entropy yields fresh addresses; either is fine.
///
///         Tunable via env vars (all optional):
///           CASINO_INITIAL_ALLOWANCE  wei pulled by game per period
///           CASINO_INITIAL_DEPOSIT    wei seeded into bankroll
///           CASINO_MIN_BET            wei
///           CASINO_MAX_BET            wei
///           CASINO_CLIMB_MAX_PAYOUT   wei cap on a Constellation Climb cashout
///           CASINO_MAX_DRAWDOWN_24H   wei drawdown breaker (default = 50% seed)
///           CASINO_BANKROLL_SALT      uint88 entropy (default 0xBB01)
///           CASINO_FLIP_SALT          uint88 entropy (default 0xBBC1)
///           CASINO_DICE_SALT          uint88 entropy (default 0xBBD1)
///           CASINO_CLIMB_SALT         uint88 entropy (default 0xBBA1)
///           CASINO_ALLOWLIST_SALT     uint88 entropy (default 0xBBAA)
///           CASINO_DEPLOY_ALLOWLIST   bool (default false)
///           CASINO_ALLOWLIST_ENABLED  bool (default true)
///           CASINO_ALLOWLIST_SEED     CSV of addresses (default empty)
///           PRIVATE_KEY               deployer key (forge default if unset)
contract Deploy is CreateXScript {
    uint88 internal constant DEFAULT_BANKROLL_SALT = 0xBB01;
    uint88 internal constant DEFAULT_FLIP_SALT = 0xBBC1;
    uint88 internal constant DEFAULT_DICE_SALT = 0xBBD1;
    uint88 internal constant DEFAULT_CLIMB_SALT = 0xBBA1;
    uint88 internal constant DEFAULT_ALLOWLIST_SALT = 0xBBAA;

    function setUp() public withCreateX {}

    struct DeployParams {
        uint256 initialAllowance;
        uint256 initialDeposit;
        uint256 minBet;
        uint256 maxBet;
        uint256 climbMaxPayout;
        uint256 maxDrawdown24hWei;
        address deployer;
        bytes32 bankrollSalt;
        bytes32 flipSalt;
        bytes32 diceSalt;
        bytes32 climbSalt;
        bytes32 allowlistSalt;
        bool deployAllowlist;
        bool allowlistEnabled;
    }

    struct DeployedAddresses {
        address bankroll;
        address flip;
        address dice;
        address climb;
        address allowlist;
    }

    function run()
        external
        returns (address bankrollAddr, address flipAddr, address diceAddr, address climbAddr)
    {
        DeployParams memory p = _loadParams();

        if (vm.envOr("PRIVATE_KEY", uint256(0)) != 0) {
            vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        } else {
            vm.startBroadcast();
        }

        DeployedAddresses memory a;
        a.bankroll = computeCreate3Address(p.bankrollSalt, p.deployer);
        a.flip = computeCreate3Address(p.flipSalt, p.deployer);
        a.dice = computeCreate3Address(p.diceSalt, p.deployer);
        a.climb = computeCreate3Address(p.climbSalt, p.deployer);

        _create3IfMissing(
            a.bankroll,
            p.bankrollSalt,
            abi.encodePacked(type(CasinoBankroll).creationCode, abi.encode(p.deployer)),
            "bankroll"
        );
        _create3IfMissing(
            a.flip,
            p.flipSalt,
            abi.encodePacked(
                type(CosmicFlip).creationCode,
                abi.encode(p.deployer, a.bankroll, p.minBet, p.maxBet)
            ),
            "cosmic-flip"
        );
        _create3IfMissing(
            a.dice,
            p.diceSalt,
            abi.encodePacked(
                type(GravityDice).creationCode,
                abi.encode(p.deployer, a.bankroll, p.minBet, p.maxBet)
            ),
            "gravity-dice"
        );
        _create3IfMissing(
            a.climb,
            p.climbSalt,
            abi.encodePacked(
                type(ConstellationClimb).creationCode,
                abi.encode(p.deployer, a.bankroll, p.minBet, p.maxBet, p.climbMaxPayout)
            ),
            "constellation-climb"
        );

        CasinoBankroll bankroll = CasinoBankroll(payable(a.bankroll));
        _registerIfMissing(bankroll, a.flip, p.initialAllowance);
        _registerIfMissing(bankroll, a.dice, p.initialAllowance);
        _registerIfMissing(bankroll, a.climb, p.initialAllowance);
        if (p.initialDeposit > 0) {
            bankroll.deposit{value: p.initialDeposit}();
        }

        if (bankroll.owner() == p.deployer) {
            (uint256 currentMax,,,,,) = bankroll.circuitBreakerState();
            if (currentMax != p.maxDrawdown24hWei) {
                bankroll.setMaxDrawdown24hWei(p.maxDrawdown24hWei);
            }
        }

        if (p.deployAllowlist) {
            a.allowlist = computeCreate3Address(p.allowlistSalt, p.deployer);
            _create3IfMissing(
                a.allowlist,
                p.allowlistSalt,
                abi.encodePacked(
                    type(CasinoAllowlist).creationCode, abi.encode(p.deployer, p.allowlistEnabled)
                ),
                "allowlist"
            );

            CosmicFlip cf = CosmicFlip(payable(a.flip));
            GravityDice dc = GravityDice(payable(a.dice));
            ConstellationClimb hl = ConstellationClimb(payable(a.climb));
            if (address(cf.allowlist()) != a.allowlist && cf.owner() == p.deployer) {
                cf.setAllowlist(a.allowlist);
            }
            if (address(dc.allowlist()) != a.allowlist && dc.owner() == p.deployer) {
                dc.setAllowlist(a.allowlist);
            }
            if (address(hl.allowlist()) != a.allowlist && hl.owner() == p.deployer) {
                hl.setAllowlist(a.allowlist);
            }

            string memory seedCsv = vm.envOr("CASINO_ALLOWLIST_SEED", string(""));
            if (bytes(seedCsv).length > 0) {
                address[] memory seed = _parseAddressCsv(seedCsv);
                CasinoAllowlist al = CasinoAllowlist(a.allowlist);
                if (al.owner() == p.deployer) {
                    al.addAllowed(seed);
                }
            }
        }

        vm.stopBroadcast();

        console2.log("CasinoBankroll:    ", a.bankroll);
        console2.log("CosmicFlip:        ", a.flip);
        console2.log("GravityDice:       ", a.dice);
        console2.log("ConstellationClimb:", a.climb);
        console2.log("chainId:           ", block.chainid);
        console2.log("deployer:          ", p.deployer);
        console2.log("maxDrawdown24hWei: ", p.maxDrawdown24hWei);

        _writeDeploymentJson(a, p);

        bankrollAddr = a.bankroll;
        flipAddr = a.flip;
        diceAddr = a.dice;
        climbAddr = a.climb;
    }

    function _loadParams() internal view returns (DeployParams memory p) {
        p.initialAllowance = vm.envOr("CASINO_INITIAL_ALLOWANCE", uint256(10 ether));
        p.initialDeposit = vm.envOr("CASINO_INITIAL_DEPOSIT", p.initialAllowance);
        p.minBet = vm.envOr("CASINO_MIN_BET", uint256(0.001 ether));
        p.maxBet = vm.envOr("CASINO_MAX_BET", uint256(0.1 ether));
        p.climbMaxPayout = vm.envOr("CASINO_CLIMB_MAX_PAYOUT", uint256(1 ether));
        p.maxDrawdown24hWei = vm.envOr("CASINO_MAX_DRAWDOWN_24H", p.initialDeposit / 2);

        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0));
        p.deployer = pk != 0 ? vm.addr(pk) : msg.sender;

        uint88 bEntropy = uint88(vm.envOr("CASINO_BANKROLL_SALT", uint256(DEFAULT_BANKROLL_SALT)));
        uint88 cEntropy = uint88(vm.envOr("CASINO_FLIP_SALT", uint256(DEFAULT_FLIP_SALT)));
        uint88 dEntropy = uint88(vm.envOr("CASINO_DICE_SALT", uint256(DEFAULT_DICE_SALT)));
        uint88 hEntropy = uint88(vm.envOr("CASINO_CLIMB_SALT", uint256(DEFAULT_CLIMB_SALT)));
        uint88 aEntropy = uint88(vm.envOr("CASINO_ALLOWLIST_SALT", uint256(DEFAULT_ALLOWLIST_SALT)));
        p.bankrollSalt = _packSalt(p.deployer, bEntropy);
        p.flipSalt = _packSalt(p.deployer, cEntropy);
        p.diceSalt = _packSalt(p.deployer, dEntropy);
        p.climbSalt = _packSalt(p.deployer, hEntropy);
        p.allowlistSalt = _packSalt(p.deployer, aEntropy);

        p.deployAllowlist = vm.envOr("CASINO_DEPLOY_ALLOWLIST", false);
        p.allowlistEnabled = vm.envOr("CASINO_ALLOWLIST_ENABLED", true);
    }

    function _parseAddressCsv(string memory csv) internal pure returns (address[] memory) {
        bytes memory b = bytes(csv);
        if (b.length == 0) return new address[](0);
        uint256 n = 1;
        for (uint256 i = 0; i < b.length; ++i) {
            if (b[i] == ",") n++;
        }
        address[] memory out = new address[](n);
        uint256 start = 0;
        uint256 idx = 0;
        for (uint256 i = 0; i <= b.length; ++i) {
            if (i == b.length || b[i] == ",") {
                bytes memory slice = new bytes(i - start);
                for (uint256 j = 0; j < slice.length; ++j) {
                    slice[j] = b[start + j];
                }
                out[idx++] = vm.parseAddress(string(slice));
                start = i + 1;
            }
        }
        return out;
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

    function _registerIfMissing(CasinoBankroll bankroll, address game, uint256 allowance) internal {
        if (bankroll.isGame(game)) return;
        bankroll.registerGame(game, allowance);
    }

    function _writeDeploymentJson(DeployedAddresses memory a, DeployParams memory p) internal {
        string memory key = "casino_deployment";
        vm.serializeAddress(key, "bankroll", a.bankroll);
        vm.serializeAddress(key, "cosmicFlip", a.flip);
        vm.serializeAddress(key, "gravityDice", a.dice);
        vm.serializeAddress(key, "constellationClimb", a.climb);
        vm.serializeAddress(key, "allowlist", a.allowlist);
        vm.serializeAddress(key, "deployer", p.deployer);
        vm.serializeBytes32(key, "bankrollSalt", p.bankrollSalt);
        vm.serializeBytes32(key, "cosmicFlipSalt", p.flipSalt);
        vm.serializeBytes32(key, "gravityDiceSalt", p.diceSalt);
        vm.serializeBytes32(key, "constellationClimbSalt", p.climbSalt);
        vm.serializeBytes32(key, "allowlistSalt", p.allowlistSalt);
        vm.serializeBool(key, "allowlistEnabled", p.allowlistEnabled);
        vm.serializeUint(key, "maxDrawdown24hWei", p.maxDrawdown24hWei);
        string memory json = vm.serializeUint(key, "chainId", block.chainid);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Wrote deployment JSON to:", path);
    }
}
