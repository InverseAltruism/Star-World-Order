# Sanctuary V2 components

This directory hosts the Sanctuary V2 React/Phaser bridge. V2 is the active
production surface; V3 lives under `game/v3/` and `app/sanctuary/SanctuaryV3.tsx`.

## DevMapEditor (`DevMapEditor.tsx`)

Dev-only overlay for building map data (spawn point, doors, collision rects)
against the live `WorldScene` view, then exporting it as TypeScript or JSON
that can be pasted into `game/config/worldLayout.ts`.

**How to open:**
- Press `Ctrl+Shift+M` while the Sanctuary canvas has focus, or
- Append `?edit=1` to the URL (e.g. `/sanctuary?edit=1&v=2`).

**Modes:** `door`, `collision`, `spawn`. Door/collision use two clicks to
define a rect; spawn uses one click to drop a point.

**Output:** `COPY TS` emits `worldLayout.ts`-shaped exports; `COPY JSON`
emits the same data as a JSON object suitable for tooling outside the repo.

The panel talks to `WorldScene` via `EventBus` (`editor-mode`, `editor-mouse`,
`editor-corner`, `editor-rect`). The Phaser scene listens for `editor-mode`
to enter pointer-capture mode and stops normal click-to-move while active.

## MultiplayerBridge (`overlays/MultiplayerBridge.tsx`)

**Status: intentional minimal mount.** This component is a thin wrapper that
calls `useMultiplayer` so the Colyseus connection lifecycle is owned by a
React hook. It is not a state aggregator: position, mood, chat, and remote
player updates flow through `EventBus` directly between Phaser and the
overlays that own each piece of state.

The hardcoded `constellation: ''` and `mood: 'idle'` are the *initial*
values sent on room join. Subsequent updates are pushed via `sendPosition`
and `sendMood` from inside Phaser (via EventBus) — see `WorldScene.update`
and `OtherPlayersManager`. Wiring live constellation/mood props through this
component would duplicate the EventBus path with no behavioral change.

If you need to change the bridge's responsibility (e.g. surface connection
state in the HUD), do it by reading from `useMultiplayer` here and emitting
to EventBus, not by adding new props.

## Click-to-move

**Status: complete in V2, intentionally deferred in V3.**

V2 (`game/scenes/WorldScene.ts:setupClickToMove`) uses EasyStar pathfinding
on the `NAV_CELL` collision grid and is fully wired. V3
(`game/v3/scenes/WorldSceneV3.ts:handleInput`) intentionally ships with
keyboard-only movement; pathfinding parity is tracked as
`[SWO_V3_PLAYER_PATHFINDING]` in `docs/SANCTUARY_V3_PARITY_AUDIT.md`. Do
not flag the V3 keyboard-only handler as a stub — it is the documented
state of V3 until that ticket is picked up.
