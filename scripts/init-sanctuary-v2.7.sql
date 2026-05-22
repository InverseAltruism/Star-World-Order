-- Star Sanctuary — V2.7 Schema: Compassionate streak counter
--
-- Backs [SWO_V2_SANCTUARY_STREAKS] (PR5 of 7). One row per companion token
-- holds the rolling daily-visit streak. The streak rules live in pure code
-- (lib/sanctuary/streaks.ts):
--
--   • 1 missed UTC day → pause (current_streak unchanged, paused_since_at set)
--   • 2+ consecutive missed days → reset current_streak to 1
--   • longest_streak ratchets upward only — identity over power
--
-- Milestones at 7 / 14 / 30 days unlock journal entries (no stat lift). The
-- highest milestone already reported is tracked on the row so a stat that
-- wobbles around a threshold cannot retrigger the same journal entry.
--
-- Loaded by lib/db.ts initializeSanctuary(). Safe to re-run.

CREATE TABLE IF NOT EXISTS sanctuary_companion_streaks (
  token_id INTEGER PRIMARY KEY,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_visit_at DATETIME,
  paused_since_at DATETIME,
  last_milestone_reported INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_companion_streaks_last_visit
  ON sanctuary_companion_streaks(last_visit_at);
