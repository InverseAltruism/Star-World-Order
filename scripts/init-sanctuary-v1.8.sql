-- Star Sanctuary — V1.8 Schema: Minigame scores
-- Run from lib/db.ts initializeSanctuary()

-- Per-play score log. Multiple rows per (wallet, token, game_id) allow leaderboard
-- queries by best/recent score and per-token personal-best tracking.
CREATE TABLE IF NOT EXISTS sanctuary_minigame_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  star_awarded INTEGER NOT NULL DEFAULT 0,
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_minigame_scores_game_score
  ON sanctuary_minigame_scores(game_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_minigame_scores_wallet_game
  ON sanctuary_minigame_scores(wallet_address, game_id);
CREATE INDEX IF NOT EXISTS idx_minigame_scores_token_game
  ON sanctuary_minigame_scores(wallet_address, token_id, game_id);
