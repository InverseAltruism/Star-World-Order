# ADR-002: STAR Sanctuary Currency — Soulbound on Monad

**Status:** Accepted
**Date:** 2026-04-27
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Supersedes:** None
**Resolves:** [SANCTUARY_ADR.md](./SANCTUARY_ADR.md) D6 / OQ1
**Task:** [SANCTUARY_STAR_CURRENCY_DECISION] (PROJECT:SWO, P2)

---

## Context

The Sanctuary off-chain STAR ledger is shipped (commit `fd9924c`): a SQLite
balance table, an audit ledger, server-internal `earn` (rate-clamped per
source), wallet-authenticated `spend`, and a public `balance` GET. The
companion HUD reads it. The cosmetic shop (V2) prices items in STAR points and
deducts via `spendStar`.

Cosmetic items themselves are catalogued off-chain
(`data/sanctuary/cosmetic_items.json`, 30-item canonical spec). The next layer
— **on-chain cosmetic minting**, where a holder burns STAR to mint a cosmetic
NFT they actually own — was blocked by an unresolved question:

> **OQ1 (ADR-001 D6):** STAR token design — soulbound vs transferable vs
> hybrid?

This ADR resolves OQ1.

The relevant tradeoffs are well-known and were enumerated in ADR-001 D6. What
follows is the call, the rationale, and the contract / migration shape.

---

## Decision

**STAR is a soulbound (non-transferable) on-chain token on Monad, implemented
as an ERC-20-shaped credit token whose `transfer` and `transferFrom` revert
for any caller other than the protocol's own mint/burn paths.**

Specifically:

1. **Standard:** ERC-20 surface for ecosystem tooling (wallets, explorers,
   indexers can read balances), but transfers are disabled at the contract
   level. Reference shape: `SoulboundERC20` — `transfer`/`transferFrom` always
   revert; only the `MINTER_ROLE` (server signer) can `mint`, only the
   `BURNER_ROLE` (cosmetic factory + designated sinks) can `burnFrom`.
   Implementing the ERC-20 surface (rather than a bespoke schema) means
   Monadscan, wallets, and indexers display balances without custom adapters.

2. **Cosmetic NFTs are transferable.** STAR is engagement; the cosmetic
   minted by burning STAR is an asset. Holders can trade, gift, or list
   cosmetics on the existing `StarSkrumpeyMarketplace` even though the
   currency that minted them cannot be moved. This separation is the whole
   point of choosing soulbound: it kills *currency* speculation while
   preserving *asset* liquidity.

3. **Off-chain ledger remains the source of truth for earnings.** STAR is
   credited off-chain (via the existing `earn` API with its rate-clamps and
   sybil guardrails). On-chain mint happens **lazily, on demand**, when a
   holder initiates a cosmetic mint or explicitly opts to settle their
   off-chain balance on-chain. The mint endpoint:
   - Verifies wallet signature.
   - Reads off-chain balance.
   - Decrements off-chain balance.
   - Issues a signed mint authorization to the contract.
   - Contract `mint`s the requested STAR to wallet, immediately followed by
     `burnFrom` for the cosmetic mint cost (or stays in wallet if the user is
     just settling).

4. **No retroactive bridging.** Existing off-chain balances do not need to be
   bulk-minted on-chain. The lazy-settle model means we mint exactly the STAR
   that flows through a use case, avoiding ~333 wallets' worth of one-time
   txns and the gas overhead of a snapshot.

---

## Why Soulbound (and not transferable or hybrid)

### Why not transferable

A transferable STAR-as-ERC-20 introduces three structural problems that the
project does not need to solve in V2:

- **Sybil and rate-arbitrage.** The earn rates are tunable and gentle on
  purpose (5–50 STAR per quest/activity). The moment STAR has a market price,
  the earn rate becomes a yield, and every clamp in `STAR_EARN_RATES` becomes
  a rent attack surface. Defending it requires sybil resistance the project
  does not currently have (no proof-of-personhood, no per-wallet caps beyond
  per-source clamps).
- **Regulatory surface.** A freely transferable utility token earned through
  user actions has a meaningfully larger securities footprint than a
  non-transferable engagement credit. SWO is a 333-NFT community DAO, not a
  token issuer. Not adopting that surface area is the conservative call.
- **Economic design burden.** A transferable token requires explicit thinking
  about supply schedule, sinks, inflation, and DEX liquidity. None of that
  work has been done; doing it speculatively pre-V2 is premature.

### Why not hybrid

The hybrid (soulbound base, transferable bonus) was the third option in
ADR-001 D6. It has the worst combination of properties for V2:

- All the regulatory and sybil surface of transferable, applied to a slice
  small enough that it provides no real liquidity.
- Two balances to track, reconcile, and display in the HUD.
- A second contract or two-track accounting in one contract.
- The user-visible split ("you have 240 SOULBOUND STAR and 18 TRANSFERABLE
  STAR") is confusing for non-crypto-native holders, which is most of them.

If transferable STAR is ever wanted, the right path is a **separate sister
token** (e.g. `xSTAR` for transferable rewards from achievements) issued from
a different contract with its own design, not a hybrid muddle inside one
contract. Soulbound STAR keeps that door open without committing to it.

### Why soulbound is the right shape

- Mirrors the off-chain model exactly: balance is engagement, spend is
  cosmetic minting. No semantic change between off-chain points and on-chain
  STAR — same rules, just a different storage layer.
- The asset that holders *want to trade* (cosmetics) stays transferable. The
  thing that *shouldn't be tradeable* (engagement credit) cannot be.
- Smallest contract surface: ERC-20 with two reverting hooks. Audit cost is
  minimal.
- Cleanly composable with future governance: soulbound STAR can weight
  Sanctuary-specific votes (e.g. "which cosmetic ships next") without
  becoming a governance token in the legal sense.

---

## Contract Shape (reference, not normative)

```solidity
// Sketch — actual implementation is a follow-up PR.
contract SoulboundStar is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    // Soulbound enforcement.
    function _update(address from, address to, uint256 value) internal override {
        // Allow mint (from == 0) and burn (to == 0); revert all transfers.
        if (from != address(0) && to != address(0)) revert("STAR: soulbound");
        super._update(from, to, value);
    }
}
```

`MINTER_ROLE` is held by a single backend signer key. `BURNER_ROLE` is held
by the cosmetic factory contract. Both roles are revocable by the DAO
governor (`StarWorldOrderGovernor`) — that gives the community a kill switch
without requiring contract migration.

---

## Off-Chain ↔ On-Chain Boundary

The off-chain ledger (`sanctuary_star_balance`, `sanctuary_star_ledger`) is
not deprecated by this decision. It remains the canonical earning surface
because:

- The earn paths (quests, minigames, activities, daily login) are all
  server-side game events. Putting them on-chain would mean a tx per quest
  claim, which is unworkable at SWO's session frequency and Monad gas.
- The off-chain ledger has the existing rate-clamp guardrails, audit trail,
  and admin tooling. None of that needs rebuilding.

The on-chain layer is **only** entered when:

1. A holder mints a cosmetic NFT (most common path).
2. A holder explicitly settles their off-chain balance to on-chain STAR
   (rare; primarily for governance weighting or display).

A new column `sanctuary_star_balance.on_chain_settled` (additive migration)
tracks how much of `lifetime_earned` has been minted on-chain so far, so
double-mint is impossible. The existing `balance` column continues to
represent **off-chain spendable**; on-chain balance is queried via
`balanceOf(wallet)` from the contract.

---

## Consequences

### Enables

- **Cosmetic on-chain minting** can proceed as a follow-up PR: deploy
  `SoulboundStar`, deploy `SanctuaryCosmeticFactory` (ERC-1155 or ERC-721),
  add `POST /api/sanctuary/cosmetics/mint` that signs an authorization, holder
  submits the tx.
- **STAR balance is now wallet-portable for display purposes.** Any wallet
  or explorer that supports ERC-20 will show STAR (with a clear soulbound
  label in the UI) without us building a custom indexer.
- **Sanctuary-only governance** becomes a possibility downstream — e.g. a
  cosmetic-roadmap vote weighted by soulbound STAR, separate from
  Skrumpey-token-weighted DAO votes.

### Constrains

- Cosmetics are the only sink that needs the on-chain layer in V2. Any new
  STAR sink (e.g. raffle entry) that wants to live on-chain must integrate
  with `BURNER_ROLE` rather than just deducting from the off-chain ledger.
  This is fine — it just needs to be remembered when designing new sinks.
- Soulbound is irreversible per-token. If the community later wants
  transferable STAR, the path is a sister token (`xSTAR`), not a
  retrofit upgrade of `SoulboundStar`.
- The MINTER_ROLE backend signer is a centralization point. Acceptable for
  V2; mitigated by DAO-revocable role and by the fact that the off-chain
  ledger already had this trust property.

### Risks

- **Backend signer key compromise** would let an attacker mint arbitrary
  STAR. Mitigation: standard hot-wallet hygiene (HSM or KMS-backed key,
  rate-limited mint endpoint, on-chain mint cap per epoch enforced by the
  contract). Rate-limit and per-epoch cap are part of the cosmetic-mint PR.
- **Off-chain / on-chain balance drift** if the settle endpoint fails
  partway. Mitigation: settle endpoint is idempotent on a request_id, and
  the on_chain_settled counter is updated only after on-chain confirmation.
- **Gas UX on Monad.** Monad gas is cheap but not free. The first cosmetic
  mint is the holder's first Sanctuary tx; we should batch the STAR mint
  and the cosmetic mint into a single tx (factory pulls STAR via
  `burnFrom` after the signed auth). This is a UX requirement for the
  cosmetic-mint PR, not a contract change.

---

## Status of OQ1

`OQ1 (STAR token design)` from ADR-001 is **resolved by this ADR**.
ADR-001 should be read with D6 superseded by ADR-002.

---

## Next Steps (not in scope of this ADR)

1. **Contract PR** — deploy `SoulboundStar` to Monad, add ABI to `lib/`,
   wire MINTER_ROLE to a backend signer.
2. **Cosmetic factory PR** — `SanctuaryCosmeticFactory` (ERC-1155 keyed by
   cosmetic_item_id), `BURNER_ROLE` integration.
3. **Mint endpoint PR** — `POST /api/sanctuary/cosmetics/mint` issues the
   signed authorization; updates `sanctuary_star_balance.on_chain_settled`.
4. **HUD update** — show on-chain STAR balance alongside off-chain
   spendable, with a clear "soulbound" badge.

None of (1)–(4) are required for V2 MVP. V2 ships with off-chain STAR and
off-chain cosmetics; on-chain is a V2.x or V3 layer.
