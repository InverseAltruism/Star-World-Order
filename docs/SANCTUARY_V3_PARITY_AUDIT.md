# Sanctuary V3 — Feature Parity Audit (vs V2)

> **Status:** First pass — code-level audit on dev HEAD as of 2026-04-26.
> **Source ticket:** `[SWO_V3_FEATURE_PARITY_AUDIT]` in QUEUE.md.
> **Companion docs:** `docs/SANCTUARY_V3.md` (canonical V3 spec), `docs/operator/SANCTUARY_PLAYTEST_2026-04-26.md` (playtest brief).
> **Authoring rule:** Each gap below has a follow-up task ID. Closing every "GAP / NOT WIRED" row is the gate for retiring V2 (`SANCTUARY_V3.md` §0 deprecation plan).

---

## 0. Why this audit exists

V2 (`?v=2`) is the gameplay testbed; V3 (`?v=3`) is the production rebuild. The deprecation plan in `SANCTUARY_V3.md` §0 says "V2 stays until V3 reaches feature parity." Until now there was no concrete checklist for what "feature parity" means. This document is that checklist — a row-by-row comparison of every V2 feature against its V3 wiring.

The intent is **not** to enumerate visual/aesthetic differences (those are tracked in `SANCTUARY_V3.md` §14 polish phases). The intent is to find **functional gaps** — a feature that works at `?v=2` but is silently absent or non-functional at `?v=3`.

---

## 1. Routing surface

`app/sanctuary/SanctuaryRouter.tsx`:

| URL / Flag | Route to |
|------------|----------|
| `?v=3` | `SanctuaryV3` |
| `?v=2` or `NEXT_PUBLIC_SANCTUARY_V2=true` | `SanctuaryV2` |
| else | `SanctuaryContent` (V1 legacy) |

V2 and V3 each mount their **own Phaser game instance** (`parent: 'phaser-sanctuary'` vs `parent: 'phaser-sanctuary-v3'`) — DOM containers are separate, scenes do not collide. The shared `EventBus` singleton (`components/sanctuary/EventBus.ts`) is what bridges React overlays to whichever Phaser game is mounted.

Backend, DB, API routes, Colyseus server, and `lib/sanctuary/*` are entirely shared — the audit therefore focuses on **client surface** parity.

---

## 2. Parity table

Legend:
- ✅ **PARITY** — works identically at `?v=2` and `?v=3`
- 🔁 **SHARED** — single component / endpoint serves both tracks; no track-specific work
- ⚠️ **GAP** — partial wiring; behaves but with reduced functionality
- ❌ **NOT WIRED** — V2-only; absent at `?v=3`

| Feature | V2 source | V3 source | Status | Follow-up |
|---------|-----------|-----------|--------|-----------|
| **Player movement (WASD / click-to-move)** | `PlayerSprite` + `WorldScene.setupClickToMove` (EasyStar pathfinding) | `PlayerSpriteV3` + `WorldSceneV3.handleInput` (direct WASD only) | ⚠️ GAP | `[SWO_V3_PLAYER_PATHFINDING]` — add EasyStar to V3 for click-to-move |
| **Companion sprite in-world** | `CompanionSprite` spawned by `WorldScene` at spawn point | Not present in `WorldSceneV3` | ❌ NOT WIRED | `[SWO_V3_COMPANION_SPRITE]` — port companion sprite to FM palette + spawn beside player |
| **Companion HUD (mood/level/STAR/quest)** | Mounted in `SanctuaryV2.tsx` | **Mounted in `SanctuaryV3.tsx` (this PR)** | ✅ PARITY | — |
| **Companion radial menu (pet/feed/talk/send)** | Mounted in `SanctuaryV2.tsx`; anchors on `CompanionSprite` | Not mounted; depends on V3 companion sprite | ❌ NOT WIRED | Blocks on `[SWO_V3_COMPANION_SPRITE]`; then `[SWO_V3_RADIAL_MENU]` |
| **Companion chat overlay (LLM, hotkey C)** | Mounted in `SanctuaryV2.tsx` | **Mounted in `SanctuaryV3.tsx` (this PR)** | ✅ PARITY | — |
| **In-world chat bubble** | `ChatBubble` overlay (DOM) + `WorldScene` integration | Not mounted; bubble anchoring needs scene-side hook | ❌ NOT WIRED | `[SWO_V3_CHAT_BUBBLE]` — port `ChatBubble` + scene anchor |
| **In-world chat input (multiplayer)** | `ChatInput` overlay (DOM) | Not mounted | ❌ NOT WIRED | Blocks on `[SWO_V3_MULTIPLAYER]` |
| **Quest Board overlay** | Shared component | Already mounted | 🔁 SHARED | — |
| **Quest Tracker HUD** | Shared component | Already mounted | 🔁 SHARED | — |
| **Quest Dialog** | Shared component | Already mounted; `tokenId` was hardcoded `null` (this PR fixes) | ✅ PARITY | — |
| **Quest NPCs (overworld)** | 8 NPCs in `npcDefinitions.ts` | 9 NPCs in `npcDefinitionsV3.ts` (8 + Spawn Fox) | ✅ PARITY | Both tracks share quest backend |
| **Room interiors (8 rooms)** | `RoomScene` with hand-coded sprite layouts | `RoomSceneV3.renderInterior` — procedural floor/wall + 1 signature prop | ⚠️ GAP | `[SWO_V3_ROOM_INTERIOR_MAPS]` (P1) — hand-author 8 Tiled JSON maps |
| **Door transitions** | `WorldScene` → `RoomScene` via `scene.launch` | `WorldSceneV3` → `RoomSceneV3` via `scene.launch` | ✅ PARITY | — |
| **Minigames (7 scenes)** | Registered in `GameConfig`; launched by `RoomScene` listening to `minigame-launch` | Not in `GameConfigV3`; `RoomSceneV3` does not listen | ❌ NOT WIRED | `[SWO_V3_MINIGAMES]` — register scenes + wire RoomSceneV3 launch/exit handlers; bridge `RoomKey` (V2 Title Case) ↔ `BuildingId` (V3 kebab-case) |
| **Shop dialog** | Shared component | Already mounted; `tokenId` was hardcoded `null` (this PR fixes) | ✅ PARITY | — |
| **Shop backend (cosmetic items + inventory + equip)** | API routes | API routes | 🔁 SHARED | — |
| **STAR currency (earn / spend / balance API)** | API routes | API routes | 🔁 SHARED | — |
| **STAR balance display in HUD** | `CompanionHUD` ⭐ badge | **Visible at `?v=3` (this PR mounts CompanionHUD)** | ✅ PARITY | — |
| **Cosmetic equip rendering on companion** | `CompanionSprite.equipCosmetic()` layered render | No companion sprite to render layers on | ❌ NOT WIRED | Blocks on `[SWO_V3_COMPANION_SPRITE]` |
| **Multiplayer (Colyseus, other players)** | `MultiplayerBridge` + `OtherPlayersManager` in `WorldScene` | Not present in `WorldSceneV3`; `MultiplayerBridge` not mounted | ❌ NOT WIRED | `[SWO_V3_MULTIPLAYER]` — port bridge + OtherPlayersManager equivalent |
| **Journal overlay (hotkey J)** | Mounted in `SanctuaryV2.tsx` | **Mounted in `SanctuaryV3.tsx` (this PR)** | ✅ PARITY | — |
| **Traits overlay (hotkey T)** | Mounted in `SanctuaryV2.tsx` | **Mounted in `SanctuaryV3.tsx` (this PR)** | ✅ PARITY | Note: `location-entered`/`location-exited` events not yet emitted by `WorldSceneV3` — location-aware behavior degrades gracefully |
| **Welcome dialog (first-time)** | Mounted in `SanctuaryV2.tsx` | **Mounted in `SanctuaryV3.tsx` (this PR)** | ✅ PARITY | — |
| **Onboarding tutorial** | Shared component | Already mounted | 🔁 SHARED | — |
| **Audio (Howler ambient + SFX)** | Shared component (`AudioBootstrap`) | Already mounted | 🔁 SHARED | — |
| **VFX trigger contract (sparkle / heart / food / dream)** | `lib/sanctuary/vfxEvents.ts` + `CompanionSprite` listener | Event contract exists; no V3 sprite consumer | ⚠️ GAP | Blocks on `[SWO_V3_COMPANION_SPRITE]`; then `[SWO_V3_VFX_SPRITES]` (P2) for FM-palette sheets |
| **Level-up celebration** | Mounted in `SanctuaryV2.tsx` | **Mounted in `SanctuaryV3.tsx` (this PR)** | ✅ PARITY | — |
| **Daily errands + weekly adventures (PR #245)** | Quest catalog (`daily` / `weekly` quest_type) | Same shared catalog | 🔁 SHARED | — |
| **Wallet auth + gating** | `useAccount` + `/api/sanctuary/companion` | `useAccount` + same endpoint; loads `activeTokenId` | 🔁 SHARED | — |
| **Dev map editor (`?edit=1`)** | `DevMapEditor` mounted in V2 only | Not present | ❌ NOT WIRED | `[SWO_V3_DEV_MAP_EDITOR]` — only meaningful once V3 has hand-authored maps. Probably defer / drop. |
| **Location-aware events (`location-entered`/`exited`)** | Emitted by `WorldScene` + `ZoneSystem` | Not emitted by `WorldSceneV3` | ⚠️ GAP | `[SWO_V3_LOCATION_EVENTS]` — emit on door/zone enter so TraitsOverlay + CompanionHUD light up |

---

## 3. What this PR delivers

This PR is the audit + a batch of **drop-in overlay mounts** that close 6 of the ❌ NOT WIRED rows above with zero new logic — they were trivially missing because `SanctuaryV3.tsx` only imported 7 of the 17 V2 overlays.

Mounted in `SanctuaryV3.tsx`:
- `CompanionHUD` (mood, level, STAR balance, journal/traits buttons)
- `JournalOverlay` (hotkey J)
- `TraitsOverlay` (hotkey T) — gracefully no-ops on location events V3 doesn't emit yet
- `WelcomeDialog` (first-time check)
- `CompanionChatOverlay` (hotkey C — works because chat overlay is DOM-only, not Phaser-anchored)
- `LevelUpCelebration` (listens for level-up event)

Also fixed: previously `tokenId={null}` was hardcoded for QuestDialog, MinigameDialog, QuestBoard, QuestTracker, ShopDialog. This PR threads `activeTokenId` through, matching V2 behavior.

The hint line below the canvas is updated to mention the C / J / T hotkeys.

---

## 4. Gaps requiring real Phaser work (not in this PR)

These cannot be drop-in mounted — they require modifying `WorldSceneV3` / `RoomSceneV3` or porting V2-only sprites to FM palette:

1. **Companion sprite** (`[SWO_V3_COMPANION_SPRITE]`) — biggest single blocker. Unblocks: radial menu, cosmetic equip rendering, VFX visual reactions.
2. **Multiplayer** (`[SWO_V3_MULTIPLAYER]`) — Colyseus join + `OtherPlayersManager` in `WorldSceneV3`; in-world chat bubbles + chat input.
3. **Minigames** (`[SWO_V3_MINIGAMES]`) — register 7 scenes in `GameConfigV3` + add `minigame-launch`/`minigame-exit` handlers to `RoomSceneV3` + bridge V2 `RoomKey` (Title Case) ↔ V3 `BuildingId` (kebab-case) in the launch payload.
4. **Click-to-move pathfinding** (`[SWO_V3_PLAYER_PATHFINDING]`) — port EasyStar from V2.
5. **Location events** (`[SWO_V3_LOCATION_EVENTS]`) — emit `location-entered` / `location-exited` from V3 zones.
6. **Room interior maps** (`[SWO_V3_ROOM_INTERIOR_MAPS]`, P1, already in queue) — hand-author 8 Tiled JSON maps.
7. **VFX sprite sheets** (`[SWO_V3_VFX_SPRITES]`, P2, already in queue) — FM-palette sparkle/heart/food/dream sheets.

---

## 5. Suggested follow-up tasks (queue additions)

The following IDs are referenced above. Items already in QUEUE.md are noted; the rest are new candidates the operator should triage:

| ID | Status | Priority suggestion | Notes |
|----|--------|---------------------|-------|
| `[SWO_V3_COMPANION_SPRITE]` | NEW | P1 | Largest single unlocker; gates 3 other gaps |
| `[SWO_V3_MULTIPLAYER]` | NEW | P2 | Substantial scene work + Colyseus integration |
| `[SWO_V3_MINIGAMES]` | NEW | P1 | High operator value (7 minigames currently invisible at V3); bridge logic is small |
| `[SWO_V3_PLAYER_PATHFINDING]` | NEW | P2 | Quality-of-life; WASD-only is workable |
| `[SWO_V3_LOCATION_EVENTS]` | NEW | P2 | Small change, unblocks TraitsOverlay polish |
| `[SWO_V3_RADIAL_MENU]` | NEW | P2 | Blocks on `COMPANION_SPRITE` |
| `[SWO_V3_CHAT_BUBBLE]` | NEW | P2 | Blocks on multiplayer for full value |
| `[SWO_V3_DEV_MAP_EDITOR]` | NEW | P2 / drop | Only meaningful for hand-authored maps |
| `[SWO_V3_ROOM_INTERIOR_MAPS]` | EXISTS | P1 | Already in queue |
| `[SWO_V3_VFX_SPRITES]` | EXISTS | P2 | Already in queue, blocks on `COMPANION_SPRITE` |
| `[SWO_V3_HUD_ICONS]` | EXISTS | P1 | Blocked on RD_API_KEY operator action |
| `[SWO_V3_FONT_SWAP]` | OPEN PR | — | PR #253 (Pixelify Sans replaces Press Start 2P) |

---

## 6. V2 retirement gate

V2 can be retired (per `SANCTUARY_V3.md` §0) when:
1. Every ❌ NOT WIRED row above is closed **or** explicitly dropped.
2. Every ⚠️ GAP row is either closed or accepted as a permanent V3 stylistic difference.
3. Operator playtest at `?v=3` confirms no missing UI surfaces vs `?v=2`.

After this PR, the open NOT-WIRED items are:
- Companion sprite (+ cosmetic equip rendering, radial menu, VFX visual)
- Multiplayer (+ chat bubble, chat input)
- Minigames
- Dev map editor (probably drop)

That's a focused, finite retirement queue — the audit's primary value is converting "is V3 ready?" from a vibes question into a checklist.

---

_Audit author: Clarvis subconscious (Claude Code Opus 4.7), 2026-04-26._
_Re-audit cadence suggested: after every PR that closes a row. Update the table inline._
