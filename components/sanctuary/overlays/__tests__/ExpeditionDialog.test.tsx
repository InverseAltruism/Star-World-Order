// @vitest-environment happy-dom
//
// ExpeditionDialog — acceptance contract for
// [SWO_V2_SANCTUARY_EXPEDITIONS_UI] (PR3 of 7).
//
// Verified here:
//   (a) renders the current step (narrative + choice buttons) sourced from
//       the reducer state returned by /run or /start
//   (b) clicking a choice POSTs /api/sanctuary/expeditions/choose with the
//       exact choice_id and refreshes the rendered step on the response
//   (c) the abandon CTA POSTs /api/sanctuary/expeditions/abandon and the
//       dialog reflects the resulting status (no more choice buttons,
//       no abandon button)
//   (d) on remount, the dialog re-fetches the active row via /run so the
//       player resumes at the same current_step_id that the DB stored —
//       this is the "reload mid-flight" property.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import EventBus from '@/components/sanctuary/EventBus';
import ExpeditionDialog from '../ExpeditionDialog';

// React 19's act(...) checks for this flag and warns otherwise.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/clientWalletAuth', () => ({
  getWalletAuthHeader: vi.fn(async () => 'mocked-auth-header'),
}));

const WALLET = '0x000000000000000000000000000000000000abcd';
const TOKEN_ID = 7;

interface MockChoice {
  id: string;
  label: string;
  nextStepId?: string | null;
  outcome?: 'success' | 'partial' | 'failure';
}

interface MockStep {
  id: string;
  narrative: string;
  choices: MockChoice[];
  isFinal?: boolean;
}

const MOCK_DEFINITION = {
  id: 'exp-test-meadow',
  title: 'Meadow Walk',
  description: 'A short walk through the Stellar Meadow.',
  npcSource: 'meadow',
  startStepId: 'start',
  rewards: { xp: 20, bond: 2, trait: 'Wanderer' },
  steps: [
    {
      id: 'start',
      narrative: 'The meadow is in full bloom. Two trails fork.',
      choices: [
        { id: 'flowers', label: 'Follow the flowers.', nextStepId: 'final' },
        { id: 'stream', label: 'Follow the stream.', nextStepId: 'final' },
      ],
    },
    {
      id: 'final',
      narrative: 'The trail loops back, sun warm.',
      isFinal: true,
      choices: [
        { id: 'share', label: 'Share the snack.', outcome: 'success' },
        { id: 'leave', label: 'Head home.', outcome: 'partial' },
      ],
    },
  ] as MockStep[],
};

function runPayload(currentStepId: string | null, status = 'active') {
  return {
    row: {
      id: 99,
      wallet_address: WALLET,
      token_id: TOKEN_ID,
      expedition_id: MOCK_DEFINITION.id,
      star_cost: 5,
      started_at: '2026-05-20T00:00:00Z',
      ended_at: status === 'active' ? null : '2026-05-20T00:01:00Z',
      outcome: null,
      status,
    },
    state: {
      expeditionId: MOCK_DEFINITION.id,
      currentStepId,
      status,
      history: [],
    },
    definition: MOCK_DEFINITION,
  };
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let fetchCalls: Array<{ url: string; init?: RequestInit }>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  fetchCalls = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    if (url.includes('/api/sanctuary/expeditions/run')) {
      return new Response(
        JSON.stringify({ success: true, run: runPayload('start') }),
        { status: 200 },
      );
    }
    if (url.includes('/api/sanctuary/expeditions/start')) {
      return new Response(
        JSON.stringify({ success: true, run: runPayload('start') }),
        { status: 200 },
      );
    }
    if (url.includes('/api/sanctuary/expeditions/choose')) {
      // Advance reducer to step `final`.
      return new Response(
        JSON.stringify({
          success: true,
          run: runPayload('final'),
          rewards: { xp: 0, bond: 0, trait: null, starGained: 0 },
        }),
        { status: 200 },
      );
    }
    if (url.includes('/api/sanctuary/expeditions/abandon')) {
      return new Response(
        JSON.stringify({
          success: true,
          run: runPayload(null, 'abandoned'),
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render() {
  act(() => {
    root.render(
      <ExpeditionDialog walletAddress={WALLET} tokenId={TOKEN_ID} />,
    );
  });
}

async function flush() {
  // Settle microtasks (fetch promise → setState → re-render).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function fireOpen(payload: { expedition_id: string; row_id?: number | null }) {
  act(() => {
    EventBus.emit('expedition-open', payload);
  });
}

describe('ExpeditionDialog — current step rendering', () => {
  it('(a) renders the current step narrative + choices after start', async () => {
    render();
    fireOpen({ expedition_id: 'exp-test-meadow' });
    await flush();

    const narrative = container.querySelector(
      '[data-testid="expedition-narrative"]',
    );
    expect(narrative?.textContent).toBe(
      'The meadow is in full bloom. Two trails fork.',
    );

    const flowers = container.querySelector(
      '[data-testid="expedition-choice-flowers"]',
    );
    const stream = container.querySelector(
      '[data-testid="expedition-choice-stream"]',
    );
    expect(flowers?.textContent).toBe('Follow the flowers.');
    expect(stream?.textContent).toBe('Follow the stream.');

    // Abandon CTA must be present while the run is active.
    expect(
      container.querySelector('[data-testid="expedition-abandon"]'),
    ).toBeTruthy();
  });
});

describe('ExpeditionDialog — choice click', () => {
  it('(b) clicking a choice POSTs /choose with the choice id', async () => {
    render();
    fireOpen({ expedition_id: 'exp-test-meadow' });
    await flush();

    const flowers = container.querySelector(
      '[data-testid="expedition-choice-flowers"]',
    ) as HTMLButtonElement;
    expect(flowers).toBeTruthy();

    act(() => {
      flowers.click();
    });
    await flush();

    const chooseCall = fetchCalls.find((c) =>
      c.url.includes('/api/sanctuary/expeditions/choose'),
    );
    expect(chooseCall).toBeDefined();
    expect(chooseCall?.init?.method).toBe('POST');
    const body = JSON.parse(String(chooseCall?.init?.body));
    expect(body).toMatchObject({
      address: WALLET,
      token_id: TOKEN_ID,
      row_id: 99,
      choice_id: 'flowers',
    });

    // The new step is reflected in the rendered narrative.
    const narrative = container.querySelector(
      '[data-testid="expedition-narrative"]',
    );
    expect(narrative?.textContent).toBe('The trail loops back, sun warm.');
  });
});

describe('ExpeditionDialog — abandon CTA', () => {
  it('(c) the abandon CTA POSTs /abandon and removes the choice buttons', async () => {
    render();
    fireOpen({ expedition_id: 'exp-test-meadow' });
    await flush();

    const abandon = container.querySelector(
      '[data-testid="expedition-abandon"]',
    ) as HTMLButtonElement;
    expect(abandon).toBeTruthy();

    act(() => {
      abandon.click();
    });
    await flush();

    const abandonCall = fetchCalls.find((c) =>
      c.url.includes('/api/sanctuary/expeditions/abandon'),
    );
    expect(abandonCall).toBeDefined();
    expect(abandonCall?.init?.method).toBe('POST');
    const body = JSON.parse(String(abandonCall?.init?.body));
    expect(body).toMatchObject({
      address: WALLET,
      token_id: TOKEN_ID,
      row_id: 99,
    });

    // Post-abandon: no choice buttons, no abandon CTA, summary visible.
    expect(
      container.querySelector('[data-testid="expedition-choices"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="expedition-abandon"]'),
    ).toBeNull();
    const summary = container.querySelector(
      '[data-testid="expedition-summary"]',
    );
    expect(summary?.getAttribute('data-status')).toBe('abandoned');
  });
});

describe('ExpeditionDialog — DB-backed resume on remount', () => {
  it('(d) resume reads current_step_id from /run on remount', async () => {
    // First mount: start a run.
    render();
    fireOpen({ expedition_id: 'exp-test-meadow' });
    await flush();
    expect(
      fetchCalls.some((c) => c.url.includes('/expeditions/start')),
    ).toBe(true);

    // Now simulate a remount with a known active row_id — the dialog
    // must fetch /run (NOT /start) and seed the current step from the
    // DB response.
    act(() => {
      root.unmount();
    });
    container.remove();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchCalls.length = 0;

    render();
    fireOpen({ expedition_id: 'exp-test-meadow', row_id: 99 });
    await flush();

    const resumeCall = fetchCalls.find((c) =>
      c.url.includes('/api/sanctuary/expeditions/run'),
    );
    expect(resumeCall).toBeDefined();
    expect(resumeCall?.url).toContain(`address=${WALLET}`);
    expect(resumeCall?.url).toContain(`token_id=${TOKEN_ID}`);
    expect(resumeCall?.url).toContain('row_id=99');

    // Crucially: /start must NOT be called on resume.
    expect(
      fetchCalls.some((c) => c.url.includes('/expeditions/start')),
    ).toBe(false);

    // The narrative reflects the resumed step (the API mock returns the
    // `start` step here — same as it would persist after a refresh
    // before any choice has been made).
    const narrative = container.querySelector(
      '[data-testid="expedition-narrative"]',
    );
    expect(narrative?.textContent).toBe(
      'The meadow is in full bloom. Two trails fork.',
    );
  });
});
