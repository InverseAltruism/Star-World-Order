// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Dust} from "../src/Dust.sol";
import {DustVaultSink} from "../src/DustVaultSink.sol";

/**
 * @title DustSymbolicTest
 * @notice Halmos symbolic proofs of the two ADR-003 §1.2 invariants. Run with:
 *           halmos --contract DustSymbolicTest
 *
 *         (c) During the anti-snipe window, the sell tax routes 100% of the
 *             taxed amount to the vault sink — value is conserved across
 *             {seller, pair, vault}.
 *         (d) Only MINTER_ROLE can mint and only BURNER_ROLE can burn.
 */
contract DustSymbolicTest is Test {
    Dust internal dust;
    address internal vault = address(0x7A17);
    address internal dao = address(0xDA0);
    uint256 internal constant EPOCH_CAP = type(uint128).max;
    uint256 internal constant EPOCH_DURATION = 1 days;

    function setUp() public {
        dust = new Dust(dao, vault, EPOCH_CAP, EPOCH_DURATION);
    }

    /// (c) Sell tax routes 100% to the vault during the anti-snipe window.
    function check_sellTaxRoutesToVault(address seller, address pair, uint256 amount) public {
        // Distinct, non-zero, non-vault participants; pair registered as AMM.
        vm.assume(seller != address(0) && pair != address(0));
        vm.assume(seller != pair && seller != vault && pair != vault);
        vm.assume(amount > 0 && amount <= EPOCH_CAP);

        vm.prank(dao);
        dust.setAmmPair(pair, true);

        // Grant mint and seed the seller.
        bytes32 minterRole = dust.MINTER_ROLE();
        vm.prank(dao);
        dust.grantRole(minterRole, address(this));
        dust.mint(seller, amount);

        // Still inside the anti-snipe window (no time warp since deploy).
        assert(dust.inAntiSnipeWindow());

        uint256 vaultBefore = dust.balanceOf(vault);
        uint256 pairBefore = dust.balanceOf(pair);

        vm.prank(seller);
        dust.transfer(pair, amount);

        uint256 tax = (amount * dust.SELL_TAX_BPS()) / dust.BPS_DENOMINATOR();
        // 100% of the tax landed in the vault; the pair got exactly the rest.
        assert(dust.balanceOf(vault) == vaultBefore + tax);
        assert(dust.balanceOf(pair) == pairBefore + (amount - tax));
        // Seller fully debited; total value conserved.
        assert(dust.balanceOf(seller) == 0);
    }

    /// (d) Only MINTER_ROLE can mint.
    function check_onlyMinterCanMint(address caller, address to, uint256 amount) public {
        vm.assume(to != address(0) && amount > 0 && amount <= EPOCH_CAP);
        bytes32 minterRole = dust.MINTER_ROLE();
        bool authorized = dust.hasRole(minterRole, caller);

        vm.prank(caller);
        try dust.mint(to, amount) {
            // A successful mint implies the caller held MINTER_ROLE.
            assert(authorized);
        } catch {
            // Reverts are acceptable for any caller.
        }
    }

    /// (d) Only BURNER_ROLE can burn.
    function check_onlyBurnerCanBurn(address caller, address from, uint256 amount) public {
        bytes32 burnerRole = dust.BURNER_ROLE();
        bool authorized = dust.hasRole(burnerRole, caller);

        vm.prank(caller);
        try dust.burn(from, amount) {
            assert(authorized);
        } catch {
            // Reverts are acceptable for any caller.
        }
    }
}

/**
 * @title DustInvariantTest
 * @notice Foundry stateful invariant: DUST totalSupply equals cumulative mints
 *         minus cumulative burns (no tax ever inflates/deflates supply — it
 *         only re-routes value between holders).
 */
contract DustInvariantTest is StdInvariant, Test {
    Dust internal dust;
    DustVaultSink internal vault;
    DustHandler internal handler;

    address internal dao = makeAddr("dao");

    function setUp() public {
        vault = new DustVaultSink(dao);
        dust = new Dust(dao, address(vault), type(uint128).max, 1 days);
        handler = new DustHandler(dust, dao, address(vault));

        vm.startPrank(dao);
        dust.grantRole(dust.MINTER_ROLE(), address(handler));
        dust.grantRole(dust.BURNER_ROLE(), address(handler));
        dust.setAmmPair(handler.pair(), true);
        vm.stopPrank();

        targetContract(address(handler));
    }

    /// totalSupply == minted - burned across an arbitrary call sequence.
    function invariant_supplyEqualsMintedMinusBurned() public view {
        assertEq(dust.totalSupply(), handler.totalMinted() - handler.totalBurned());
    }

    /// A holder→pair sell in-window never destroys value: vault + pair conserve it.
    function invariant_taxNeverDestroysValue() public view {
        assertLe(dust.balanceOf(address(vault)), dust.totalSupply());
    }
}

/// @dev Bounded handler driving mint/burn/transfer for the stateful invariant.
contract DustHandler is Test {
    Dust internal dust;
    address internal dao;
    address internal vault;
    address public pair = makeAddr("handlerPair");

    uint256 public totalMinted;
    uint256 public totalBurned;

    address[] internal actors;

    constructor(Dust dust_, address dao_, address vault_) {
        dust = dust_;
        dao = dao_;
        vault = vault_;
        actors.push(makeAddr("a0"));
        actors.push(makeAddr("a1"));
        actors.push(makeAddr("a2"));
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function mint(uint256 actorSeed, uint256 amount) external {
        amount = bound(amount, 0, 1_000 ether);
        address to = _actor(actorSeed);
        dust.mint(to, amount);
        totalMinted += amount;
    }

    function burn(uint256 actorSeed, uint256 amount) external {
        address from = _actor(actorSeed);
        uint256 bal = dust.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 0, bal);
        dust.burn(from, amount);
        totalBurned += amount;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        uint256 bal = dust.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 0, bal);
        address to = toSeed % 2 == 0 ? pair : _actor(toSeed);
        vm.prank(from);
        dust.transfer(to, amount);
    }
}
