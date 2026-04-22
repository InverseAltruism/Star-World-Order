# ADR-002: Companion Chat Architecture

**Status:** Proposed  
**Date:** 2026-04-20  
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)  
**Depends on:** ADR-001 (Star Sanctuary Architecture)

---

## Context

Sanctuary companions need a lightweight chat system where holders can "talk" to their active Skrumpey. The companion should respond with personality derived from its NFT traits (constellation, aura, form, mood) and its bond/activity history from the journal.

This ADR defines the minimal architecture for V1 chat. It should feel personalized without requiring heavy infrastructure or high ongoing costs.

---

## Decisions

### D1. LLM Backend: Single-model, Server-side Only

Chat completions run server-side via a single OpenRouter call per message. No streaming for V1 (simplifies rate-limiting and cost control). The model should be small and fast (Gemini Flash or equivalent, $0.05-0.15/1k tokens).

**Rationale:** No client-side inference (too heavy for mobile wallets), no websocket complexity. A simple POST endpoint is sufficient for turn-based chat.

### D2. Personality System: Template + Trait Injection

Each chat request builds a system prompt from:
1. **Base template** — Skrumpey persona (playful, curious, loyal)
2. **Trait modifiers** — constellation/aura/mood adjust tone and vocabulary
3. **Bond context** — high bond = more affectionate/open; low bond = shy/brief
4. **Recent journal** — last 5 journal entries included for continuity

Trait → personality mappings are static config (no DB, no LLM to generate them).

```typescript
// Example trait personality config
const MOOD_CHAT_STYLE: Record<string, string> = {
  happy: 'enthusiastic and bubbly, uses exclamation marks',
  calm: 'thoughtful and measured, sometimes philosophical',
  excited: 'energetic, talks fast, jumps between topics',
  mysterious: 'cryptic, speaks in riddles, hints at secrets',
};
```

**Rationale:** Deterministic personality from on-chain traits makes each companion feel unique without per-companion fine-tuning. Bond level as a dial ensures progression affects the relationship.

### D3. Conversation Memory: Session-scoped, Not Persistent

V1 chat maintains conversation history within a single browser session (React state). No server-side conversation persistence beyond journal entries. When the user closes the tab, conversation resets.

**Rationale:** Persistent chat history adds table complexity, retention concerns, and cost (LLM context grows). V1 validates the feature; V1.5 can add persistence if engagement warrants it.

### D4. Rate Limiting: Per-wallet Daily Cap

- **15 messages/day** per wallet (matches interaction cap cadence)
- Server enforces via simple counter in `sanctuary_chat_usage` table
- Each chat exchange awards **+0.1 bond** and **+1 XP** (lower than explicit interactions since chat is passive)

**Rationale:** Prevents runaway API costs. 15 messages ~ $0.01-0.03/day per active user at Flash-tier pricing.

### D5. Database Schema

```sql
CREATE TABLE IF NOT EXISTS sanctuary_chat_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  message_count INTEGER DEFAULT 0,
  last_reset_date TEXT NOT NULL, -- YYYY-MM-DD, resets daily
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id, last_reset_date)
);

CREATE INDEX idx_chat_usage_wallet ON sanctuary_chat_usage(wallet_address, last_reset_date);
```

No chat history table in V1. Journal entries serve as the persistent record of notable conversations.

### D6. API Route

```
POST /api/sanctuary/companion/chat
Body: { address, token_id, message, history: [{role, content}] }
Response: { success, reply, bond_gained, xp_gained, daily_remaining }
```

History is sent from the client (session state) to maintain context without server storage. Server validates history length (max 20 turns) to cap token usage.

### D7. Notable Reply → Journal

If the companion's reply contains certain trigger phrases or if bond crosses a threshold during chat, a journal entry is auto-created:
- Entry type: `interaction`
- Content: Brief summary of the exchange
- Metadata: `{ action: 'chat', topic_hint: '...' }`

This bridges ephemeral chat into the persistent journal timeline.

### D8. UI: Inline Chat Panel

Chat replaces the current "Talk" interaction button with an expandable chat panel within the CompanionPanel. Not a separate page, not a modal.

- Collapsed: shows last reply (if any)
- Expanded: scrollable message list + input field
- Companion avatar (mood emoji) next to each reply
- Max visible history: 20 messages before auto-scroll

---

## Implementation Sequence

1. `sanctuary_chat_usage` table + init SQL
2. `lib/sanctuary/chatPersonality.ts` — trait→prompt builder
3. `POST /api/sanctuary/companion/chat` — route with rate limit + LLM call
4. `CompanionPanel` — inline chat UI component
5. Integration test: mock LLM, verify rate limit + bond/XP award + journal trigger

---

## Cost Estimate

At 100 active users, 10 messages/day average:
- ~1000 requests/day
- ~50k input tokens + 25k output tokens/day (short prompts, brief replies)
- Gemini Flash: ~$0.05/day
- Monthly: ~$1.50

---

## Open Questions

1. **Model choice:** Gemini Flash vs Claude Haiku vs local Qwen? Flash is cheapest; Haiku has better personality range; local has zero marginal cost but higher latency.
2. **Content moderation:** Should we filter user messages before sending to LLM? For V1, the closed community (NFT holders only) likely doesn't need heavy moderation.
3. **Companion evolution:** Should chat topics influence trait evolution? Deferred to `[SANCTUARY_TRAIT_EVOLUTION]`.
