# SWO Tracker

High-level state of major Sanctuary surfaces.

## Sanctuary surfaces

- **V2 (Companion + World hub)** — primary, default landing. Companion view at `/sanctuary?v=2` (default when V2 flag is on or `?v=2` is set); world hub at `/sanctuary?v=2&world=1`.
- **V3 (FM-tilemap pixel rebuild)** — paused. Reachable at `/sanctuary?v=3` for in-progress demo only. See `swo_sanctuary_v3_deferred_2026-04-26.md`.
- **V1 (legacy painted hub) — fallback only as of 2026-04-27.** Still rendered when no `?v=` param is present and the V2 flag is off. Kept for deep-link compatibility; in-page banner directs users to `?v=2`. No new feature work; do not remove without a deep-link audit.
