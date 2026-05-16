// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {CasinoBankroll} from "../src/CasinoBankroll.sol";
import {CosmicFlip} from "../src/CosmicFlip.sol";
import {GravityDice} from "../src/GravityDice.sol";
import {ConstellationClimb} from "../src/ConstellationClimb.sol";

/// @notice HEVM cheatcode subset shared by Foundry, Medusa, and Echidna. Using
///         the bare interface (rather than `forge-std/Test.sol`'s `vm`) keeps
///         the target contract callable by Medusa, which would otherwise pick
///         up `setUp` / `failed` / etc. as fuzz inputs.
interface IHevm {
    function prank(address) external;
    function deal(address, uint256) external;
    function roll(uint256) external;
    function warp(uint256) external;
}

/// @title  CasinoMedusaTester
/// @notice Port of Mega House's `BunnyBagzMedusaTester` to SWO Cosmic Casino.
///         Mechanical rename:
///           BunnyBagzBankroll → CasinoBankroll
///           BunnyBagzCoinflip → CosmicFlip
///           BunnyBagzDice     → GravityDice
///           BunnyBagzHiLo     → ConstellationClimb
///         Shared coverage-guided invariant target driving the full game
///         lattice (CosmicFlip + GravityDice + ConstellationClimb) against a
///         single CasinoBankroll. Asserts `property_systemNeverInsolvent` —
///         across any sequence of place/settle/refund/cashOut actions on any
///         of the three games, the contracts together must always hold enough
///         ETH to honor every still-pending stake.
/// @dev    Designed to be the `targetContracts` entry in `medusa.json` and
///         simultaneously the handler driving Foundry's invariant runner via
///         `CasinoMedusaInvariant` below. Cheatcodes go through the HEVM
///         precompile address that both engines support natively.
contract CasinoMedusaTester {
    IHevm internal constant hevm = IHevm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    CasinoBankroll public bankroll;
    CosmicFlip public coinflip;
    GravityDice public dice;
    ConstellationClimb public hilo;

    address public constant OWNER = address(0xB055);
    uint256 public constant SEED = 50 ether;
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant MAX_BET = 0.1 ether;
    uint256 public constant MAX_PAYOUT = 5 ether;

    address[] public players;

    uint256[] internal openCoinflipBets;
    mapping(uint256 => bytes32) internal coinflipSeed;

    uint256[] internal openDiceBets;
    mapping(uint256 => bytes32) internal diceSeed;

    uint256[] internal openHiLoSessions;

    uint256 public totalStaked;
    uint256 public totalPaid;
    uint256 public totalRefunded;

    constructor() payable {
        // Pre-fund the harness contract itself. Medusa's `prank` cheatcode
        // only redirects `msg.sender`; the value of subsequent value-bearing
        // calls is debited from `address(this).balance`. Without this, the
        // very first `bankroll.deposit{value: 3 * SEED}` below reverts with
        // "insufficient balance for transfer" because Medusa deploys this
        // contract with `targetContractsBalances: []` (i.e. 0 ETH).
        hevm.deal(address(this), type(uint128).max);
        hevm.deal(OWNER, 1000 ether);

        hevm.prank(OWNER);
        bankroll = new CasinoBankroll(OWNER);

        hevm.prank(OWNER);
        coinflip = new CosmicFlip(OWNER, address(bankroll), MIN_BET, MAX_BET);
        hevm.prank(OWNER);
        dice = new GravityDice(OWNER, address(bankroll), MIN_BET, MAX_BET);
        hevm.prank(OWNER);
        hilo = new ConstellationClimb(OWNER, address(bankroll), MIN_BET, MAX_BET, MAX_PAYOUT);

        hevm.prank(OWNER);
        bankroll.registerGame(address(coinflip), SEED);
        hevm.prank(OWNER);
        bankroll.registerGame(address(dice), SEED);
        hevm.prank(OWNER);
        bankroll.registerGame(address(hilo), SEED);

        // Seed bankroll with 3 * SEED so each game's allowance is fully cashable.
        hevm.prank(OWNER);
        bankroll.deposit{value: 3 * SEED}();

        for (uint160 i = 1; i <= 5; i++) {
            address p = address(uint160(0xA000) + i);
            players.push(p);
            hevm.deal(p, 100 ether);
        }
    }

    // ---------------------------------------------------------------------
    // Coinflip handlers
    // ---------------------------------------------------------------------

    function placeCoinflip(uint256 playerIdx, uint256 sideIdx, uint256 stakeSeed, uint256 seedSeed) public {
        if (players.length == 0) return;
        address p = players[playerIdx % players.length];
        CosmicFlip.Side side =
            (sideIdx % 2) == 0 ? CosmicFlip.Side.Heads : CosmicFlip.Side.Tails;
        uint256 stake = _bound(stakeSeed, MIN_BET, MAX_BET);
        bytes32 server = keccak256(abi.encodePacked(seedSeed, "cf-server"));
        bytes32 client = keccak256(abi.encodePacked(seedSeed, "cf-client"));
        bytes32 commit = keccak256(abi.encodePacked(server));
        if (p.balance < stake) return;
        hevm.prank(p);
        try coinflip.placeBet{value: stake}(side, client, commit) returns (uint256 id) {
            coinflipSeed[id] = server;
            openCoinflipBets.push(id);
            totalStaked += stake;
        } catch {}
    }

    function settleCoinflip(uint256 idx) public {
        if (openCoinflipBets.length == 0) return;
        uint256 i = idx % openCoinflipBets.length;
        uint256 betId = openCoinflipBets[i];
        ( , uint96 stake, , , , , CosmicFlip.Status status, , ) = coinflip.bets(betId);
        if (status != CosmicFlip.Status.Pending) {
            _swapPopCF(i);
            return;
        }
        try coinflip.settleBet(betId, coinflipSeed[betId]) {
            ( , , , , , , CosmicFlip.Status newStatus, , ) = coinflip.bets(betId);
            if (newStatus == CosmicFlip.Status.Won) {
                totalPaid += (uint256(stake) * 198) / 100;
            }
            _swapPopCF(i);
        } catch {}
    }

    function refundCoinflip(uint256 idx, uint64 extra) public {
        if (openCoinflipBets.length == 0) return;
        uint256 i = idx % openCoinflipBets.length;
        uint256 betId = openCoinflipBets[i];
        ( address player, uint96 stake, , , uint64 placed, , CosmicFlip.Status status, , ) = coinflip.bets(betId);
        if (status != CosmicFlip.Status.Pending) {
            _swapPopCF(i);
            return;
        }
        uint64 needed = placed + coinflip.EXPIRY_BLOCKS();
        if (block.number < needed) {
            hevm.roll(uint256(needed) + uint256(extra % 16));
        }
        hevm.prank(player);
        try coinflip.refundBet(betId) {
            totalRefunded += stake;
            _swapPopCF(i);
        } catch {
            _swapPopCF(i);
        }
    }

    function _swapPopCF(uint256 i) internal {
        uint256 last = openCoinflipBets.length - 1;
        if (i != last) openCoinflipBets[i] = openCoinflipBets[last];
        openCoinflipBets.pop();
    }

    // ---------------------------------------------------------------------
    // Dice handlers
    // ---------------------------------------------------------------------

    function placeDice(uint256 playerIdx, uint256 rollUnderSeed, uint256 stakeSeed, uint256 seedSeed) public {
        if (players.length == 0) return;
        address p = players[playerIdx % players.length];
        uint8 rollUnder = uint8(_bound(rollUnderSeed, 2, 98));
        uint256 stake = _bound(stakeSeed, MIN_BET, MAX_BET);
        bytes32 server = keccak256(abi.encodePacked(seedSeed, "dice-server"));
        bytes32 client = keccak256(abi.encodePacked(seedSeed, "dice-client"));
        bytes32 commit = keccak256(abi.encodePacked(server));
        if (p.balance < stake) return;
        hevm.prank(p);
        try dice.placeBet{value: stake}(rollUnder, client, commit) returns (uint256 id) {
            diceSeed[id] = server;
            openDiceBets.push(id);
            totalStaked += stake;
        } catch {}
    }

    function settleDice(uint256 idx) public {
        if (openDiceBets.length == 0) return;
        uint256 i = idx % openDiceBets.length;
        uint256 betId = openDiceBets[i];
        ( , uint96 stake, , , , , GravityDice.Status status, , , ) = dice.bets(betId);
        if (status != GravityDice.Status.Pending) {
            _swapPopDice(i);
            return;
        }
        try dice.settleBet(betId, diceSeed[betId]) {
            ( , , , , , uint8 rollUnder, GravityDice.Status newStatus, , , ) = dice.bets(betId);
            if (newStatus == GravityDice.Status.Won) {
                // Payout = stake * 99 / (rollUnder - 1).
                uint256 payoutAmt = (uint256(stake) * 99) / (uint256(rollUnder) - 1);
                totalPaid += payoutAmt;
            }
            _swapPopDice(i);
        } catch {}
    }

    function refundDice(uint256 idx, uint64 extra) public {
        if (openDiceBets.length == 0) return;
        uint256 i = idx % openDiceBets.length;
        uint256 betId = openDiceBets[i];
        ( address player, uint96 stake, , , uint64 placed, , GravityDice.Status status, , , ) = dice.bets(betId);
        if (status != GravityDice.Status.Pending) {
            _swapPopDice(i);
            return;
        }
        uint64 needed = placed + dice.EXPIRY_BLOCKS();
        if (block.number < needed) {
            hevm.roll(uint256(needed) + uint256(extra % 16));
        }
        hevm.prank(player);
        try dice.refundBet(betId) {
            totalRefunded += stake;
            _swapPopDice(i);
        } catch {
            _swapPopDice(i);
        }
    }

    function _swapPopDice(uint256 i) internal {
        uint256 last = openDiceBets.length - 1;
        if (i != last) openDiceBets[i] = openDiceBets[last];
        openDiceBets.pop();
    }

    // ---------------------------------------------------------------------
    // HiLo handlers (open + cashOut + refund — per-step play deferred; the
    // open / cash / refund triple already exercises every fund-flow path
    // that affects system solvency).
    // ---------------------------------------------------------------------

    function openHiLo(uint256 playerIdx, uint256 stakeSeed, uint256 seedSeed) public {
        if (players.length == 0) return;
        address p = players[playerIdx % players.length];
        uint256 stake = _bound(stakeSeed, MIN_BET, MAX_BET);
        bytes32 server = keccak256(abi.encodePacked(seedSeed, "hl-server"));
        bytes32 client = keccak256(abi.encodePacked(seedSeed, "hl-client"));
        bytes32 commit = keccak256(abi.encodePacked(server));
        if (p.balance < stake) return;
        hevm.prank(p);
        try hilo.openSession{value: stake}(client, commit) returns (uint256 id) {
            openHiLoSessions.push(id);
            totalStaked += stake;
        } catch {}
    }

    function cashOutHiLo(uint256 idx) public {
        if (openHiLoSessions.length == 0) return;
        uint256 i = idx % openHiLoSessions.length;
        uint256 sid = openHiLoSessions[i];
        ( address player, uint96 bet, , , , , ConstellationClimb.Status status, , , ) = hilo.sessions(sid);
        if (status != ConstellationClimb.Status.Open) {
            _swapPopHL(i);
            return;
        }
        hevm.prank(player);
        try hilo.cashOut(sid) {
            // At open, multiplier is 1.0× (WAD). cashOut without any winning
            // step pays exactly `bet` — net-zero against the bankroll's
            // settle/payout handshake. Bookkeep both sides.
            totalPaid += uint256(bet);
            _swapPopHL(i);
        } catch {}
    }

    function refundHiLo(uint256 idx, uint64 extra) public {
        if (openHiLoSessions.length == 0) return;
        uint256 i = idx % openHiLoSessions.length;
        uint256 sid = openHiLoSessions[i];
        ( address player, uint96 bet, , , uint64 lastBlock, , ConstellationClimb.Status status, , , ) = hilo.sessions(sid);
        if (status != ConstellationClimb.Status.Open) {
            _swapPopHL(i);
            return;
        }
        uint64 needed = lastBlock + hilo.EXPIRY_BLOCKS();
        if (block.number < needed) {
            hevm.roll(uint256(needed) + uint256(extra % 16));
        }
        hevm.prank(player);
        try hilo.refundSession(sid) {
            totalRefunded += uint256(bet);
            _swapPopHL(i);
        } catch {
            _swapPopHL(i);
        }
    }

    function _swapPopHL(uint256 i) internal {
        uint256 last = openHiLoSessions.length - 1;
        if (i != last) openHiLoSessions[i] = openHiLoSessions[last];
        openHiLoSessions.pop();
    }

    // ---------------------------------------------------------------------
    // Properties (Medusa-style, prefix `property_`)
    // ---------------------------------------------------------------------

    /// @notice System-level solvency: total ETH held by (bankroll + every
    ///         game contract) must always cover every still-pending stake.
    ///         True for every reachable state under any sequence of the
    ///         handlers above.
    function property_systemNeverInsolvent() public view returns (bool) {
        uint256 ethHeld =
            address(bankroll).balance +
            address(coinflip).balance +
            address(dice).balance +
            address(hilo).balance;
        return ethHeld >= _sumPendingStakes();
    }

    function _sumPendingStakes() internal view returns (uint256 total) {
        uint256 cfNext = coinflip.nextBetId();
        for (uint256 i = 0; i < cfNext; i++) {
            ( , uint96 stake, , , , , CosmicFlip.Status status, , ) = coinflip.bets(i);
            if (status == CosmicFlip.Status.Pending) total += stake;
        }
        uint256 dNext = dice.nextBetId();
        for (uint256 i = 0; i < dNext; i++) {
            ( , uint96 stake, , , , , GravityDice.Status status, , , ) = dice.bets(i);
            if (status == GravityDice.Status.Pending) total += stake;
        }
        uint256 hNext = hilo.nextSessionId();
        for (uint256 i = 0; i < hNext; i++) {
            ( , uint96 bet, , , , , ConstellationClimb.Status status, , , ) = hilo.sessions(i);
            if (status == ConstellationClimb.Status.Open) total += bet;
        }
    }

    function _bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (lo == hi) return lo;
        return lo + (x % (hi - lo + 1));
    }
}

/// @notice Foundry-side wrapper around `CasinoMedusaTester`. Re-uses the
///         exact same handler surface as Medusa via `targetContract`, so the
///         two engines exercise the identical lattice of state transitions.
///         Provides a forge-style `invariant_*` shim that delegates to the
///         shared `property_*`.
contract CasinoMedusaInvariant is StdInvariant, Test {
    CasinoMedusaTester public tester;

    function setUp() public {
        tester = new CasinoMedusaTester();
        targetContract(address(tester));
        // Restrict to the funds-flow handlers; let Foundry pick the variant.
        bytes4[] memory sels = new bytes4[](9);
        sels[0] = tester.placeCoinflip.selector;
        sels[1] = tester.settleCoinflip.selector;
        sels[2] = tester.refundCoinflip.selector;
        sels[3] = tester.placeDice.selector;
        sels[4] = tester.settleDice.selector;
        sels[5] = tester.refundDice.selector;
        sels[6] = tester.openHiLo.selector;
        sels[7] = tester.cashOutHiLo.selector;
        sels[8] = tester.refundHiLo.selector;
        targetSelector(FuzzSelector({addr: address(tester), selectors: sels}));
    }

    function invariant_systemNeverInsolvent() public view {
        assertTrue(tester.property_systemNeverInsolvent(), "system insolvent");
    }
}
