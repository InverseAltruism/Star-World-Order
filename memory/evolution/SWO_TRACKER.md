# SWO Tracker

High-level state of major Sanctuary surfaces.

## Sanctuary surfaces

- **V2 (Companion + World hub)** — primary, default landing. Companion view at `/sanctuary?v=2` (default when V2 flag is on or `?v=2` is set); world hub at `/sanctuary?v=2&world=1`.
- **V3 (FM-tilemap pixel rebuild)** — paused. Reachable at `/sanctuary?v=3` for in-progress demo only. See `swo_sanctuary_v3_deferred_2026-04-26.md`.
- **V1 (legacy painted hub) — fallback only as of 2026-04-27.** Still rendered when no `?v=` param is present and the V2 flag is off. Kept for deep-link compatibility; in-page banner directs users to `?v=2`. No new feature work; do not remove without a deep-link audit.

## Audits

- **Pending-lane dependency status (2026-05-27)** — `docs/internal/audits/SWO_PENDING_LANE_STATUS_2026-05-27.md`. Resolves the critical lane's 0/4-eligible stall: all four pending rows (`SWO_CASINO_PLAYWRIGHT_CONNECTED`, `SWO_CASINO_VITEST_BET_PANEL`, `SWO_V2_SANCTUARY_EXPEDITIONS_UI`, `SWO_V2_SANCTUARY_VARIABLE_REWARDS`) are **stale-deferred, not blocked** — every dep and the target tag itself is already merged on `origin/dev`. Close-as-done with cited PR evidence.
