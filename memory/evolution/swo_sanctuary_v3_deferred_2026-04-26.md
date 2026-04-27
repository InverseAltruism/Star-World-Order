# Sanctuary V3 — deferred (2026-04-26)

Mirror of `docs/SANCTUARY_V3_DEFERRED.md` for the evolution-memory log. See that file for the full snapshot.

## Status (2026-04-26)

- **V2** is primary. Companion view is the default `?v=2` landing; `?v=2&world=1` reaches the painted hub.
- **V3** (FM tilemap rebuild) is paused at `?v=3`. No new commits to `game/v3/`, `public/sanctuary-v3/`, or `scripts/v3/` without an explicit revival decision.
- **V1 is fallback-only as of 2026-04-27.** Still served at `/sanctuary` (no `?v=` param, V2 flag off) so deep links keep working, but the V1 surface now displays a banner directing players to `?v=2`. No new feature work on V1.
