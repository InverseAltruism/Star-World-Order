// @vitest-environment happy-dom
//
// QuestBoard ⇄ ExpeditionDialog integration —
// [SWO_V2_SANCTUARY_EXPEDITIONS_UI] (PR3 of 7) follow-up.
//
// PR #329 covered the ExpeditionDialog's four acceptance criteria in
// isolation. This file fills the integration gap the task spec hints
// at ("hook into QuestBoard's 'Begin expedition' CTA when an NPC
// unlocks one"): with both overlays mounted together, the "BEGIN ▸"
// button on a fresh listing must spin up the dialog with the
// expedition_id, and "RESUME ▸" on an active row must spin it up with
// the same row_id the DB persisted — which is the path that drives
// "reload mid-flight resumes at the correct step" in production.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import EventBus from '@/components/sanctuary/EventBus';
import QuestBoard from '../QuestBoard';
import ExpeditionDialog from '../ExpeditionDialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/clientWalletAuth', () => ({
  getWalletAuthHeader: vi.fn(async () => 'mocked-auth-header'),
}));

const WALLET = '0x000000000000000000000000000000000000abcd';
const TOKEN_ID = 7;

const FRESH_EXPEDITION = {
  id: 'exp-meadow',
  title: 'Meadow Walk',
  description: 'A short walk through the Stellar Meadow.',
  npcSource: 'meadow',
  star_cost: 5,
  tier: 'easy' as const,
  rewards: { xp: 20, bond: 2, trait: 'Wanderer' },
  active_row_id: null,
};

const ACTIVE_EXPEDITION = {
  id: 'exp-eclipse',
  title: 'Eclipse Vigil',
  description: 'Stand watch as the eclipse crosses the spire.',
  npcSource: 'eclipse-scribe',
  star_cost: 12,
  tier: 'medium' as const,
  rewards: { xp: 40, bond: 4, trait: 'Eclipse Scribe' },
  active_row_id: 314,
};

const MOCK_DEFINITION = {
  id: ACTIVE_EXPEDITION.id,
  title: ACTIVE_EXPEDITION.title,
  description: ACTIVE_EXPEDITION.description,
  npcSource: ACTIVE_EXPEDITION.npcSource,
  startStepId: 'vigil-start',
  rewards: ACTIVE_EXPEDITION.rewards,
  steps: [
    {
      id: 'vigil-start',
      narrative: 'The spire hums beneath the eclipse.',
      choices: [
        { id: 'hold', label: 'Hold the line.', nextStepId: null },
      ],
    },
  ],
};

function runPayload(expeditionId: string, rowId: number, currentStepId: string) {
  return {
    row: {
      id: rowId,
      wallet_address: WALLET,
      token_id: TOKEN_ID,
      expedition_id: expeditionId,
      star_cost: 12,
      started_at: '2026-05-20T00:00:00Z',
      ended_at: null,
      outcome: null,
      status: 'active',
    },
    state: {
      expeditionId,
      currentStepId,
      status: 'active',
      history: [],
    },
    definition: MOCK_DEFINITION,
  };
}

let container: HTMLDivElement;
let root: Root;
let fetchCalls: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (url.includes('/api/sanctuary/quests')) {
        return new Response(JSON.stringify({ success: true, quests: [] }), {
          status: 200,
        });
      }
      if (url.includes('/api/sanctuary/expeditions/list')) {
        return new Response(
          JSON.stringify({
            success: true,
            expeditions: [FRESH_EXPEDITION, ACTIVE_EXPEDITION],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/sanctuary/expeditions/run')) {
        return new Response(
          JSON.stringify({
            success: true,
            run: runPayload(
              ACTIVE_EXPEDITION.id,
              ACTIVE_EXPEDITION.active_row_id ?? 0,
              'vigil-start',
            ),
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/sanctuary/expeditions/start')) {
        return new Response(
          JSON.stringify({
            success: true,
            run: runPayload(FRESH_EXPEDITION.id, 42, 'vigil-start'),
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: false }), { status: 404 });
    }),
  );
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountBoth() {
  act(() => {
    root.render(
      <>
        <QuestBoard walletAddress={WALLET} tokenId={TOKEN_ID} />
        <ExpeditionDialog walletAddress={WALLET} tokenId={TOKEN_ID} />
      </>,
    );
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openQuestBoard() {
  act(() => {
    EventBus.emit('quest-board-open');
  });
  await flush();
}

describe('QuestBoard ⇄ ExpeditionDialog integration', () => {
  it('renders BEGIN ▸ for fresh listings and RESUME ▸ for active rows', async () => {
    mountBoth();
    await openQuestBoard();

    const beginBtn = container.querySelector(
      `[data-testid="expedition-launch-${FRESH_EXPEDITION.id}"]`,
    );
    const resumeBtn = container.querySelector(
      `[data-testid="expedition-launch-${ACTIVE_EXPEDITION.id}"]`,
    );

    expect(beginBtn?.textContent).toContain('BEGIN');
    expect(resumeBtn?.textContent).toContain('RESUME');
  });

  it('BEGIN ▸ on a fresh listing opens the dialog and POSTs /start', async () => {
    mountBoth();
    await openQuestBoard();

    const begin = container.querySelector(
      `[data-testid="expedition-launch-${FRESH_EXPEDITION.id}"]`,
    ) as HTMLButtonElement;
    expect(begin).toBeTruthy();

    act(() => {
      begin.click();
    });
    await flush();

    // ExpeditionDialog mounted and is rendering the start step.
    expect(
      container.querySelector('[data-testid="expedition-dialog-panel"]'),
    ).toBeTruthy();

    // /start was called for a fresh launch (NOT /run).
    expect(
      fetchCalls.some((c) => c.url.includes('/expeditions/start')),
    ).toBe(true);
    expect(
      fetchCalls.some((c) => c.url.includes('/expeditions/run')),
    ).toBe(false);
  });

  it('RESUME ▸ on an active row opens the dialog and POSTs /run with the row_id', async () => {
    mountBoth();
    await openQuestBoard();

    const resume = container.querySelector(
      `[data-testid="expedition-launch-${ACTIVE_EXPEDITION.id}"]`,
    ) as HTMLButtonElement;
    expect(resume).toBeTruthy();

    act(() => {
      resume.click();
    });
    await flush();

    expect(
      container.querySelector('[data-testid="expedition-dialog-panel"]'),
    ).toBeTruthy();

    const runCall = fetchCalls.find((c) =>
      c.url.includes('/api/sanctuary/expeditions/run'),
    );
    expect(runCall).toBeDefined();
    expect(runCall?.url).toContain(`row_id=${ACTIVE_EXPEDITION.active_row_id}`);
    expect(runCall?.url).toContain(`address=${WALLET}`);
    expect(runCall?.url).toContain(`token_id=${TOKEN_ID}`);

    // RESUME must not silently fall back to /start, which would
    // double-charge the player's STAR cost.
    expect(
      fetchCalls.some((c) => c.url.includes('/expeditions/start')),
    ).toBe(false);

    // Resumed narrative reflects the DB-persisted current step.
    const narrative = container.querySelector(
      '[data-testid="expedition-narrative"]',
    );
    expect(narrative?.textContent).toBe('The spire hums beneath the eclipse.');
  });
});
