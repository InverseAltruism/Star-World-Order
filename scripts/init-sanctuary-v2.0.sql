-- Star Sanctuary — V2.0 Schema: Server-side chat persistence + companion memory
-- Run from lib/db.ts initializeSanctuary()
--
-- Notes
--  • Persisted message history is already covered by sanctuary_chat_messages
--    (init-sanctuary-v1.5.sql). V2.0 keeps that table as the canonical
--    "chat history" backing store so we do not need a destructive migration
--    of existing user data.
--  • V2.0 introduces sanctuary_chat_memories: long-term, distilled facts about
--    the holder/companion relationship that survive context-window truncation.
--    Memories are extracted via a piggyback in the same LLM completion that
--    answers the chat (zero additional API cost).
--
-- Categories
--   owner_identity       — persistent facts about the holder (name, locale, role)
--   preferences          — likes/dislikes, communication style, interests
--   shared_experiences   — events both have lived through (activities, quests)
--   companion_feelings   — companion's evolving inner state toward the holder
--   recurring_topics     — themes that come up frequently across sessions

CREATE TABLE IF NOT EXISTS sanctuary_chat_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'owner_identity',
    'preferences',
    'shared_experiences',
    'companion_feelings',
    'recurring_topics'
  )),
  fact TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 1,
  mention_count INTEGER NOT NULL DEFAULT 1,
  last_mentioned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_message_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id, category, fact),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id),
  FOREIGN KEY (source_message_id) REFERENCES sanctuary_chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_chat_memories_companion
  ON sanctuary_chat_memories(wallet_address, token_id, importance DESC, last_mentioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_sanctuary_chat_memories_category
  ON sanctuary_chat_memories(wallet_address, token_id, category);
