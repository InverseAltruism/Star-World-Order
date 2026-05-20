// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Route-level tests for /api/sanctuary/expeditions/{list,start,choose,abandon}.
// Mirrors api-e2e.test.ts: mock the db helpers, wallet auth, and rate limiter,
// then drive each route handler directly with crafted NextRequests.

const db = vi.hoisted(() => ({
  listExpeditions: vi.fn(),
  startExpeditionRun: vi.fn(),
  chooseExpeditionStep: vi.fn(),
  abandonExpeditionRun: vi.fn(),
}));
const walletAuth = vi.hoisted(() => ({ verifyWalletAccess: vi.fn() }));
const rateLimit = vi.hoisted(() => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  recordRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => db);
vi.mock('@/lib/walletAuth', () => walletAuth);
vi.mock('@/lib/sanctuary/rateLimit', () => rateLimit);

import { GET as listGET } from '@/app/api/sanctuary/expeditions/list/route';
import { POST as startPOST } from '@/app/api/sanctuary/expeditions/start/route';
import { POST as choosePOST } from '@/app/api/sanctuary/expeditions/choose/route';
import { POST as abandonPOST } from '@/app/api/sanctuary/expeditions/abandon/route';

const ALICE = '0x' + 'a'.repeat(40);
const TOKEN = 3;

function get(path: string, params?: Record<string, string>): NextRequest {
  const url = new URL(path, 'http://test');
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}
function post(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL(path, 'http://test'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.resetAllMocks());

describe('GET /api/sanctuary/expeditions/list', () => {
  it('returns 400 when params missing', async () => {
    const res = await listGET(get('/api/sanctuary/expeditions/list'));
    expect(res.status).toBe(400);
  });

  it('returns catalog from db helper', async () => {
    db.listExpeditions.mockReturnValue({
      tiers: ['easy', 'medium', 'hard'],
      expeditions: [
        { tier: 'easy', star_cost: 5, id: 'exp-easy-meadow-walk', title: 'Meadow Walk', description: '', npcSource: 'meadow', rewards: { xp: 20, bond: 2, trait: 'Wanderer' }, active_row_id: null },
      ],
    });
    const res = await listGET(get('/api/sanctuary/expeditions/list', { address: ALICE, token_id: String(TOKEN) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.expeditions[0].id).toBe('exp-easy-meadow-walk');
    expect(db.listExpeditions).toHaveBeenCalledWith(ALICE, TOKEN);
  });
});

describe('POST /api/sanctuary/expeditions/start', () => {
  it('returns 400 on missing params', async () => {
    const res = await startPOST(post('/api/sanctuary/expeditions/start', { address: ALICE }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Missing auth' });
    const res = await startPOST(post('/api/sanctuary/expeditions/start', { address: ALICE, token_id: TOKEN, expedition_id: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 with the run on success', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.startExpeditionRun.mockReturnValue({ row: { id: 7, status: 'active' }, state: { currentStepId: 'a' }, definition: { id: 'x' } });
    const res = await startPOST(post('/api/sanctuary/expeditions/start', { address: ALICE, token_id: TOKEN, expedition_id: 'x' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.run.row.id).toBe(7);
  });

  it('returns 402 on insufficient STAR', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.startExpeditionRun.mockImplementation(() => { throw new Error('Insufficient STAR balance'); });
    const res = await startPOST(post('/api/sanctuary/expeditions/start', { address: ALICE, token_id: TOKEN, expedition_id: 'x' }));
    expect(res.status).toBe(402);
  });

  it('returns 409 when an active run already exists', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.startExpeditionRun.mockImplementation(() => { throw new Error('ALREADY_ACTIVE'); });
    const res = await startPOST(post('/api/sanctuary/expeditions/start', { address: ALICE, token_id: TOKEN, expedition_id: 'x' }));
    expect(res.status).toBe(409);
  });

  it('returns 404 when expedition id is unknown', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.startExpeditionRun.mockImplementation(() => { throw new Error('EXPEDITION_NOT_FOUND'); });
    const res = await startPOST(post('/api/sanctuary/expeditions/start', { address: ALICE, token_id: TOKEN, expedition_id: 'x' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/sanctuary/expeditions/choose', () => {
  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Missing auth' });
    const res = await choosePOST(post('/api/sanctuary/expeditions/choose', { address: ALICE, token_id: TOKEN, row_id: 1, choice_id: 'go' }));
    expect(res.status).toBe(401);
  });

  it('returns updated run + rewards', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chooseExpeditionStep.mockReturnValue({
      row: { id: 1, status: 'completed', outcome: 'success' },
      state: { status: 'completed', finalOutcome: 'success' },
      definition: { id: 'x' },
      rewards: { xp: 100, bond: 4, trait: 'TestTrait', starGained: 25 },
    });
    const res = await choosePOST(post('/api/sanctuary/expeditions/choose', { address: ALICE, token_id: TOKEN, row_id: 1, choice_id: 'win' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.rewards.trait).toBe('TestTrait');
  });

  it('returns 409 when run is not active', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chooseExpeditionStep.mockImplementation(() => { throw new Error('NOT_ACTIVE'); });
    const res = await choosePOST(post('/api/sanctuary/expeditions/choose', { address: ALICE, token_id: TOKEN, row_id: 1, choice_id: 'go' }));
    expect(res.status).toBe(409);
  });

  it('returns 404 when run not found', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chooseExpeditionStep.mockImplementation(() => { throw new Error('NOT_FOUND'); });
    const res = await choosePOST(post('/api/sanctuary/expeditions/choose', { address: ALICE, token_id: TOKEN, row_id: 99, choice_id: 'go' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/sanctuary/expeditions/abandon', () => {
  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Missing auth' });
    const res = await abandonPOST(post('/api/sanctuary/expeditions/abandon', { address: ALICE, token_id: TOKEN, row_id: 1 }));
    expect(res.status).toBe(401);
  });

  it('returns updated abandoned row', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.abandonExpeditionRun.mockReturnValue({
      row: { id: 1, status: 'abandoned', ended_at: '2026-01-01' },
      state: { status: 'abandoned' },
      definition: { id: 'x' },
    });
    const res = await abandonPOST(post('/api/sanctuary/expeditions/abandon', { address: ALICE, token_id: TOKEN, row_id: 1 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.row.status).toBe('abandoned');
  });

  it('returns 404 when run not found', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.abandonExpeditionRun.mockImplementation(() => { throw new Error('NOT_FOUND'); });
    const res = await abandonPOST(post('/api/sanctuary/expeditions/abandon', { address: ALICE, token_id: TOKEN, row_id: 99 }));
    expect(res.status).toBe(404);
  });
});
