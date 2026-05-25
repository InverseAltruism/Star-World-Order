# Sanctuary economy + on-chain STAR — session handoff

> Living handoff for the Sanctuary economy redesign + the on-chain STAR/casino
> work (2026-05). Read this + `SANCTUARY_ECONOMY_REDESIGN.md` + `MONAD_KNOWLEDGE.md`
> before touching quests/games/shop/chat or any on-chain code. The **Gotchas**
> section (§5) is the important part — several of these cost real debugging time.

## 1. What shipped

- **Quests v2** (STAR-only, replaced XP/bond quests): 2 earn (24h→5★, 48h→15★) + 3 wager (6h/12h/24h, fixed stakes 5/15/30, tiered odds). Engine: `lib/sanctuary/questsV2.ts` (EV-capped). UI: `components/sanctuary/overlays/QuestsV2Panel.tsx`, mounted in CompanionView's `?view=quests`.
- **Charms** (trade-off shop items, not cosmetics): `gambit` (wager: +payout%, +stake cost%), `prospect` (earn: +STAR%, +resource cost%). Bought in the Shop's CHARMS tab (`CharmShop.tsx`), applied at quest start. Seeded in `db.ts` (`CHARM_SEED`).
- **Arcade** (`MinigameArcade.tsx`, `game/config/ArcadeConfig.ts`): the room minigames playable standalone (no Phaser world). Skill wager — stake STAR + energy cost; payout = `clamp(score/par,0,2.0) × 0.92` (house rake). Resolver: `lib/sanctuary/arcade.ts`. "Sanctuary World" button is **Coming Soon** (disabled) — the arcade is how you reach games now.
- **Companion actions** show give/take hints (`+25 food` etc.) on the buttons.
- **Chat** is real LLM via OpenRouter (`z-ai/glm-4.7-flash`) with per-Skrumpey personalities (`chatPersonality.ts` → `individualPersona`). Chat window flips over the right column (mirrors the TRAITS left flip).
- **Soulbound STAR token** deployed + auto-minted (see §3/§4).
- **Casino suite** reviewed + deployed to testnet + verified (see §3, `contracts/casino/SECURITY_REVIEW.md`).

## 2. DB migrations
- `scripts/init-sanctuary-v2.9.sql` — quest runs, charm items/stock, arcade session.
- `scripts/init-sanctuary-v2.10.sql` — STAR on-chain outbox queue.
Both wired in `lib/db.ts` `initializeSanctuary()`; idempotent, run on first DB hit.

## 3. Deployed (Monad testnet, chain 10143) — all Sourcify `exact_match` verified
| Contract | Address |
|---|---|
| **STAR** (soulbound) | `0x27EdCbA8A50b6872b7b95F49d198A277DEcBfA1D` |
| CasinoBankroll (review deploy) | `0x7bE6C6f2635F58df8A76F42a3C0cCF52956f0C34` |
| CosmicFlip | `0x735Bd1882722b4910B3eABF00958cd78496f0E56` |
| GravityDice | `0x3af4660AF1119ee05a9e972d2fC76606b1AF967A` |
| ConstellationClimb | `0xea45093Be67cB771D5feB7fd4856A4424cB10F7e` |

- **Deployer / review wallet:** `0x5e81C0D3511FD2266763448C8a6B7f9CE4a5142D`. Private key at `~/.config/swo-star/testnet-wallet.json` (chmod 600, **NOT in git**). Has ~9.7 testnet MON; holds MINTER+BURNER on STAR.
- The casino addresses are a **review deployment** (my wallet) — DISTINCT from the operator's canonical CREATE3 prediction (`0xb29e…fD7B`, in `deployments/10143.json` / `143.predicted.json`). Recorded in `deployments/10143.review-0x5e81.json`. Do NOT let `deploy-testnet.sh` overwrite `10143.json` (`predictedMainnet.test.ts` guards it).

## 4. On-chain STAR model (IMPORTANT)
- **Off-chain SQLite ledger (`sanctuary_star_balance`) is the gameplay authority** (fast, free, no wallet popups). The soulbound token is a **mirror**.
- `earnStar` → enqueue mint, `spendStar` → enqueue burn (atomic in the txn, gated by `STAR_ONCHAIN_ENABLED`).
- The worker `/api/sanctuary/star/process-onchain` (cron-gated) **reconciles by net delta**: `delta = offchainBalance − onchainBalance`, mint/burn the difference. Self-healing — never strands on an insufficient-balance burn, backfills pre-existing balances. Driven by `scripts/star-onchain-cron.sh` (crontab, every 1 min).
- It is **not** on-chain-authoritative (that'd make every action a blocking tx). It is **not** atomic burn-then-remint — earns mint, spends burn, reconciled to balance.

## 5. Gotchas (read these)
1. **`~/.bashrc` exports `OPENROUTER_API_KEY`** (for other tools). Next.js dotenv won't override an already-set process var, so it **shadows** `.env.local` in the DEV shell → chat silently falls back to templates. SWO reads the namespaced **`SANCTUARY_OPENROUTER_API_KEY`** to dodge this. PROD (systemd) doesn't source `.bashrc`, so it's a DEV-only trap.
2. **`z-ai/glm-4.7-flash` is a reasoning model** — without `reasoning:{enabled:false}` it spends the whole token budget on its think trace and returns empty `content` (→ template fallback). `openrouter.ts` sets it.
3. **CREATE3 salts must be deployer-prefixed** (top 20 bytes = deployer, byte[20]=0). A raw salt makes `computeCreate3Address` ≠ the actual deploy address → `require` revert. `DeployStar.s.sol` and the casino `_packSalt` do this.
4. **`sanctuary_journal.entry_type` CHECK only allows `activity/interaction/quest/achievement/system`.** Using anything else (e.g. `'minigame'`) makes the journal insert throw and **reverts the whole transaction** — this silently broke every arcade settle ("STAR +0"). Use an allowed type or alter the constraint.
5. **Foundry under-estimates gas on Monad sometimes** — the casino seed `deposit()` failed at deploy; retried fine with `--gas-limit 200000`. If a setup tx fails, retry with explicit gas.
6. **Foundry's `--verifier sourcify` is broken on Monad** (falls back to etherscan → "Invalid API Key"). Verify keyless via the **Sourcify v2 API** directly — exact procedure in `MONAD_KNOWLEDGE.md §3`. (Monad's own explorer/MonadScan needs a `MONADSCAN_API_KEY` we don't have.)
7. **Vendored foundry libs aren't committed** (`contracts/casino/lib/` is gitignored; outer-rim shares it via `../casino/lib`). On a fresh checkout you must re-clone forge-std + `openzeppelin-contracts@v5.0.2` + createx-forge into `contracts/casino/lib/` before `forge build`.
8. **Slither/medusa/halmos aren't installed by default** — Slither was installed in a venv at `/tmp/slither-venv` (ephemeral). Reinstall per session: `python3 -m venv … && pip install slither-analyzer solc-select && solc-select install/use 0.8.24`.

## 6. Env flags (`.env.local`, gitignored)
`STAR_ONCHAIN_ENABLED=true`, `STAR_CONTRACT_ADDRESS`, `STAR_CHAIN_ID=10143`, `MONAD_TESTNET_RPC`, `STAR_SIGNER_KEY` (deployer key, server-only), `SANCTUARY_OPENROUTER_API_KEY` (TEST key), `SANCTUARY_CHAT_MODEL=z-ai/glm-4.7-flash`, `CRON_SECRET`.

## 7. Open follow-ups
- **Arcade par scores** (`lib/sanctuary/arcade.ts` `MINIGAME_PAR`) need calibration from real play data — they're best-guess.
- **Mainnet STAR minting:** batch the reconciler (cron cadence / threshold) — per-action mint/burn is many tiny txs (fine on testnet ~0.001 gwei, not for mainnet).
- **Casino mainnet:** admin → governance multisig, external audit, high-entropy `serverSeed`, enable allowlist (see `SECURITY_REVIEW.md §6`).
- **Verification via MonadScan** (etherscan route) pending a `MONADSCAN_API_KEY`; Sourcify is done.
- Retire V1 sanctuary; prune orphaned `public/sanctuary-v3` world art.
- **Pre-existing red tests** (NOT from this work): 4 `companion/chat` (LLM in test env), `roomScene.test.ts` (stale source-grep), casino `mascotSwap.test.ts` (bunny refs in the merged casino batch).
