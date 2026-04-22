import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mocks (created before imports resolve) ─────────────────

const db = vi.hoisted(() => ({
  getSanctuaryMapLocations: vi.fn(),
  getCompanionsAtLocations: vi.fn(),
  getSanctuaryState: vi.fn(),
  getCompanionTraits: vi.fn(),
  getTraitDefinitions: vi.fn(),
  filterMetadataByTraits: vi.fn(),
  getMetadataTraitDistribution: vi.fn(),
  getSanctuaryQuestsWithProgress: vi.fn(),
  getSanctuaryQuests: vi.fn(),
  claimSanctuaryQuestReward: vi.fn(),
  getActiveCompanion: vi.fn(),
  getAllCompanions: vi.fn(),
  selectCompanion: vi.fn(),
  getStarSkrumpeyMetadata: vi.fn(),
  switchCompanion: vi.fn(),
  getMetadataForTokenIds: vi.fn(),
  chatWithCompanion: vi.fn(),
  getCompanionChatHistory: vi.fn(),
  interactWithCompanionV15: vi.fn(),
  sendToActivity: vi.fn(),
  completeActivityV15: vi.fn(),
  getJournalEntriesPaginated: vi.fn(),
  getJournalStats: vi.fn(),
}));

const walletAuth = vi.hoisted(() => ({
  verifyWalletAccess: vi.fn(),
}));

const ownership = vi.hoisted(() => ({
  verifyTokenOwnership: vi.fn(),
  getOwnedTokenIds: vi.fn(),
}));

const star = vi.hoisted(() => ({
  isStarSkrumpeyId: vi.fn(),
  checkSkrumpeyOwnership: vi.fn(),
  checkStarOwnershipBatched: vi.fn(),
}));

const rateLimit = vi.hoisted(() => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  recordRequest: vi.fn(),
}));

vi.mock('@/lib/db', () => db);
vi.mock('@/lib/walletAuth', () => walletAuth);
vi.mock('@/lib/skrumpeyOwnership', () => ownership);
vi.mock('@/lib/starSkrumpey', () => star);
vi.mock('@/lib/sanctuary/rateLimit', () => rateLimit);

// ─── Route handler imports ──────────────────────────────────────────

import { GET as mapGET } from '@/app/api/sanctuary/map/route';
import { GET as stateGET } from '@/app/api/sanctuary/state/route';
import { GET as traitsGET } from '@/app/api/sanctuary/traits/route';
import { GET as nftTraitsGET } from '@/app/api/sanctuary/nft-traits/route';
import { GET as questsGET } from '@/app/api/sanctuary/quests/route';
import { POST as questClaimPOST } from '@/app/api/sanctuary/quests/claim/route';
import { GET as companionGET } from '@/app/api/sanctuary/companion/route';
import { POST as initPOST } from '@/app/api/sanctuary/companion/init/route';
import { POST as selectPOST } from '@/app/api/sanctuary/companion/select/route';
import { POST as switchPOST } from '@/app/api/sanctuary/companion/switch/route';
import { GET as listOwnedGET } from '@/app/api/sanctuary/companion/list-owned/route';
import { GET as chatGET, POST as chatPOST } from '@/app/api/sanctuary/companion/chat/route';
import { POST as interactPOST } from '@/app/api/sanctuary/companion/interact/route';
import { POST as sendActivityPOST } from '@/app/api/sanctuary/companion/send-to-activity/route';
import { POST as completeActivityPOST } from '@/app/api/sanctuary/companion/complete-activity/route';
import { GET as journalGET } from '@/app/api/sanctuary/companion/journal/route';

// ─── Constants & helpers ────────────────────────────────────────────

const ALICE = '0x' + 'a'.repeat(40);
const TOKEN = 3;

function get(path: string, params?: Record<string, string>): NextRequest {
  const url = new URL(path, 'http://test');
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function post(path: string, body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL(path, 'http://test'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Reset between tests ────────────────────────────────────────────

beforeEach(() => vi.resetAllMocks());

// =====================================================================
// GET /api/sanctuary/map
// =====================================================================

describe('GET /api/sanctuary/map', () => {
  const LOC = [{ id: 1, name: 'Hot Springs', position_x: 0.2, position_y: 0.3 }];

  it('returns locations and companions at locations', async () => {
    db.getSanctuaryMapLocations.mockReturnValue(LOC);
    db.getCompanionsAtLocations.mockReturnValue([{ token_id: 3, location_id: 1 }]);
    const res = await mapGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.locations).toEqual(LOC);
    expect(body.companionsAtLocations).toHaveLength(1);
  });

  it('returns 500 on db error', async () => {
    db.getSanctuaryMapLocations.mockImplementation(() => { throw new Error('db down'); });
    const res = await mapGET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// =====================================================================
// GET /api/sanctuary/state
// =====================================================================

describe('GET /api/sanctuary/state', () => {
  it('returns sanctuary state for address', async () => {
    db.getSanctuaryState.mockReturnValue({ companion: { token_id: TOKEN }, quests: [] });
    const res = await stateGET(get('/api/sanctuary/state', { address: ALICE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.companion.token_id).toBe(TOKEN);
  });

  it('returns 400 when address missing', async () => {
    const res = await stateGET(get('/api/sanctuary/state'));
    expect(res.status).toBe(400);
  });

  it('returns 500 on error', async () => {
    db.getSanctuaryState.mockImplementation(() => { throw new Error('fail'); });
    const res = await stateGET(get('/api/sanctuary/state', { address: ALICE }));
    expect(res.status).toBe(500);
  });
});

// =====================================================================
// GET /api/sanctuary/traits
// =====================================================================

describe('GET /api/sanctuary/traits', () => {
  it('returns trait definitions when definitions=true', async () => {
    db.getTraitDefinitions.mockReturnValue([{ name: 'bond', threshold: 100 }]);
    const res = await traitsGET(get('/api/sanctuary/traits', { definitions: 'true' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.definitions).toHaveLength(1);
  });

  it('returns enriched companion traits', async () => {
    db.getCompanionTraits.mockReturnValue([{ trait_name: 'bond', value: 50 }]);
    db.getTraitDefinitions.mockReturnValue([{ name: 'bond', threshold: 100, description: 'Bond level' }]);
    const res = await traitsGET(get('/api/sanctuary/traits', { address: ALICE, token_id: String(TOKEN) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.traits[0].threshold).toBe(100);
    expect(body.traits[0].description).toBe('Bond level');
  });

  it('returns 400 when address or token_id missing', async () => {
    const res = await traitsGET(get('/api/sanctuary/traits', { address: ALICE }));
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// GET /api/sanctuary/nft-traits
// =====================================================================

describe('GET /api/sanctuary/nft-traits', () => {
  it('returns all trait distributions by default', async () => {
    db.getMetadataTraitDistribution.mockReturnValue({ mystic: 10, radiant: 20 });
    const res = await nftTraitsGET(get('/api/sanctuary/nft-traits'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.distributions).toBeDefined();
  });

  it('returns single trait distribution', async () => {
    db.getMetadataTraitDistribution.mockReturnValue({ mystic: 10 });
    const res = await nftTraitsGET(get('/api/sanctuary/nft-traits', { trait_type: 'aura' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trait_type).toBe('aura');
    expect(body.distribution).toEqual({ mystic: 10 });
  });

  it('filters tokens by traits', async () => {
    db.filterMetadataByTraits.mockReturnValue([{
      token_id: 3, name: 'Star #3', image_url: 'img',
      attributes_json: '{"aura":"mystic"}', rarity_rank: 1, rarity_score: 99,
    }]);
    const res = await nftTraitsGET(get('/api/sanctuary/nft-traits', { action: 'filter', aura: 'mystic' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0].traits.aura).toBe('mystic');
  });

  it('returns 400 for unknown action', async () => {
    const res = await nftTraitsGET(get('/api/sanctuary/nft-traits', { action: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('handles malformed attributes_json gracefully', async () => {
    db.filterMetadataByTraits.mockReturnValue([{
      token_id: 5, name: 'Star #5', image_url: 'img',
      attributes_json: '{bad', rarity_rank: null, rarity_score: null,
    }]);
    const res = await nftTraitsGET(get('/api/sanctuary/nft-traits', { action: 'filter' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens[0].traits).toEqual({});
  });
});

// =====================================================================
// GET /api/sanctuary/quests
// =====================================================================

describe('GET /api/sanctuary/quests', () => {
  it('returns quests without progress when no address', async () => {
    db.getSanctuaryQuests.mockReturnValue([{ id: 1, name: 'Explore' }]);
    const res = await questsGET(get('/api/sanctuary/quests'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toBeNull();
    expect(body.quests).toHaveLength(1);
  });

  it('returns quests with progress when address provided', async () => {
    db.getSanctuaryQuestsWithProgress.mockReturnValue([{ id: 1, name: 'Explore', status: 'completed' }]);
    const res = await questsGET(get('/api/sanctuary/quests', { address: ALICE, token_id: String(TOKEN) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quests[0].status).toBe('completed');
  });

  it('passes season param through', async () => {
    db.getSanctuaryQuests.mockReturnValue([]);
    await questsGET(get('/api/sanctuary/quests', { season: 'summer-2026' }));
    expect(db.getSanctuaryQuests).toHaveBeenCalledWith('summer-2026');
  });
});

// =====================================================================
// POST /api/sanctuary/quests/claim
// =====================================================================

describe('POST /api/sanctuary/quests/claim', () => {
  it('claims reward successfully', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.claimSanctuaryQuestReward.mockReturnValue({ xp_gained: 100, new_level: 2 });
    const res = await questClaimPOST(
      post('/api/sanctuary/quests/claim', { address: ALICE, token_id: TOKEN, quest_id: 1 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.xp_gained).toBe(100);
  });

  it('returns 400 when params missing', async () => {
    const res = await questClaimPOST(
      post('/api/sanctuary/quests/claim', { address: ALICE }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Missing auth' });
    const res = await questClaimPOST(
      post('/api/sanctuary/quests/claim', { address: ALICE, token_id: TOKEN, quest_id: 1 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when quest not found', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.claimSanctuaryQuestReward.mockImplementation(() => { throw new Error('Quest not found'); });
    const res = await questClaimPOST(
      post('/api/sanctuary/quests/claim', { address: ALICE, token_id: TOKEN, quest_id: 999 }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when quest not completed', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.claimSanctuaryQuestReward.mockImplementation(() => { throw new Error('Quest not completed yet'); });
    const res = await questClaimPOST(
      post('/api/sanctuary/quests/claim', { address: ALICE, token_id: TOKEN, quest_id: 1 }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when already claimed', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.claimSanctuaryQuestReward.mockImplementation(() => { throw new Error('Reward already claimed'); });
    const res = await questClaimPOST(
      post('/api/sanctuary/quests/claim', { address: ALICE, token_id: TOKEN, quest_id: 1 }),
    );
    expect(res.status).toBe(409);
  });
});

// =====================================================================
// GET /api/sanctuary/companion
// =====================================================================

describe('GET /api/sanctuary/companion', () => {
  it('returns active companion', async () => {
    db.getActiveCompanion.mockReturnValue({ token_id: TOKEN, bond_score: 3.5 });
    const res = await companionGET(get('/api/sanctuary/companion', { address: ALICE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companion.token_id).toBe(TOKEN);
  });

  it('returns all companions when all=true', async () => {
    db.getAllCompanions.mockReturnValue([{ token_id: 3 }, { token_id: 17 }]);
    const res = await companionGET(get('/api/sanctuary/companion', { address: ALICE, all: 'true' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companions).toHaveLength(2);
  });

  it('returns 400 when address missing', async () => {
    const res = await companionGET(get('/api/sanctuary/companion'));
    expect(res.status).toBe(400);
  });

  it('returns null companion when none active', async () => {
    db.getActiveCompanion.mockReturnValue(null);
    const res = await companionGET(get('/api/sanctuary/companion', { address: ALICE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companion).toBeNull();
  });
});

// =====================================================================
// POST /api/sanctuary/companion/init
// =====================================================================

describe('POST /api/sanctuary/companion/init', () => {
  it('initializes companion when token owned', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(true);
    db.selectCompanion.mockReturnValue({ token_id: TOKEN, is_active: 1 });
    const res = await initPOST(
      post('/api/sanctuary/companion/init', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companion.token_id).toBe(TOKEN);
  });

  it('returns 400 when params missing', async () => {
    const res = await initPOST(
      post('/api/sanctuary/companion/init', { address: ALICE }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Missing auth' });
    const res = await initPOST(
      post('/api/sanctuary/companion/init', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when token not owned', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(false);
    const res = await initPOST(
      post('/api/sanctuary/companion/init', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('do not own');
  });
});

// =====================================================================
// POST /api/sanctuary/companion/select
// =====================================================================

describe('POST /api/sanctuary/companion/select', () => {
  it('selects companion with star metadata', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(true);
    star.isStarSkrumpeyId.mockReturnValue(true);
    db.getStarSkrumpeyMetadata.mockReturnValue({
      image_url: 'http://img/3.png',
      attributes_json: '{"aura":"mystic"}',
      rarity_rank: 1,
    });
    db.selectCompanion.mockReturnValue({ token_id: TOKEN, is_active: 1 });

    const res = await selectPOST(
      post('/api/sanctuary/companion/select', { walletAddress: ALICE, tokenId: TOKEN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isStar).toBe(true);
    expect(body.metadata.image).toBe('http://img/3.png');
    expect(body.metadata.traits.aura).toBe('mystic');
  });

  it('returns 400 when params missing', async () => {
    const res = await selectPOST(
      post('/api/sanctuary/companion/select', { walletAddress: ALICE }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Bad signature' });
    const res = await selectPOST(
      post('/api/sanctuary/companion/select', { walletAddress: ALICE, tokenId: TOKEN }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Bad signature');
  });

  it('returns 403 when token not owned', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(false);
    const res = await selectPOST(
      post('/api/sanctuary/companion/select', { walletAddress: ALICE, tokenId: TOKEN }),
    );
    expect(res.status).toBe(403);
  });

  it('handles null metadata for non-star token', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(true);
    star.isStarSkrumpeyId.mockReturnValue(false);
    db.getStarSkrumpeyMetadata.mockReturnValue(null);
    db.selectCompanion.mockReturnValue({ token_id: 99, is_active: 1 });

    const res = await selectPOST(
      post('/api/sanctuary/companion/select', { walletAddress: ALICE, tokenId: 99 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isStar).toBe(false);
    expect(body.metadata).toBeNull();
  });
});

// =====================================================================
// POST /api/sanctuary/companion/switch
// =====================================================================

describe('POST /api/sanctuary/companion/switch', () => {
  it('switches to a different companion', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(true);
    star.isStarSkrumpeyId.mockReturnValue(false);
    db.getStarSkrumpeyMetadata.mockReturnValue(null);
    db.switchCompanion.mockReturnValue({ token_id: 17, is_active: 1 });

    const res = await switchPOST(
      post('/api/sanctuary/companion/switch', { walletAddress: ALICE, tokenId: 17 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.companion.token_id).toBe(17);
    expect(body.metadata).toBeNull();
  });

  it('returns 400 when params missing', async () => {
    const res = await switchPOST(
      post('/api/sanctuary/companion/switch', {}),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 on auth failure', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Expired' });
    const res = await switchPOST(
      post('/api/sanctuary/companion/switch', { walletAddress: ALICE, tokenId: 17 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when token not owned', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(false);
    const res = await switchPOST(
      post('/api/sanctuary/companion/switch', { walletAddress: ALICE, tokenId: 17 }),
    );
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// GET /api/sanctuary/companion/list-owned
// =====================================================================

describe('GET /api/sanctuary/companion/list-owned', () => {
  it('returns owned tokens with star info', async () => {
    star.checkSkrumpeyOwnership.mockResolvedValue({ hasSkrumpey: true, balance: 2 });
    star.checkStarOwnershipBatched.mockResolvedValue([{ tokenId: 3, name: 'Star #3' }]);
    ownership.getOwnedTokenIds.mockResolvedValue([3, 100]);
    star.isStarSkrumpeyId.mockImplementation((id: number) => id === 3);
    db.getMetadataForTokenIds.mockReturnValue([
      { token_id: 3, name: 'Star #3', image_url: 'img1', constellation: 'aether', attributes_json: '{}', rarity_rank: 1, rarity_score: 99 },
      { token_id: 100, name: 'Skrumpey #100', image_url: 'img2', constellation: null, attributes_json: null, rarity_rank: null, rarity_score: null },
    ]);

    const res = await listOwnedGET(get('/api/sanctuary/companion/list-owned', { address: ALICE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.owned).toHaveLength(2);
    expect(body.balance).toBe(2);
    expect(body.starCount).toBe(1);
    expect(body.owned[0].isStar).toBe(true);
  });

  it('returns 400 when address missing', async () => {
    const res = await listOwnedGET(get('/api/sanctuary/companion/list-owned'));
    expect(res.status).toBe(400);
  });

  it('returns empty array for non-holder', async () => {
    star.checkSkrumpeyOwnership.mockResolvedValue({ hasSkrumpey: false, balance: 0 });
    const res = await listOwnedGET(get('/api/sanctuary/companion/list-owned', { address: ALICE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.owned).toEqual([]);
    expect(body.balance).toBe(0);
  });
});

// =====================================================================
// GET /api/sanctuary/companion/chat
// =====================================================================

describe('GET /api/sanctuary/companion/chat', () => {
  it('returns chat history in reverse order', async () => {
    db.getCompanionChatHistory.mockReturnValue([
      { id: 1, message: 'Hello', sender: 'user' },
      { id: 2, message: 'Hi!', sender: 'companion' },
    ]);
    const res = await chatGET(get('/api/sanctuary/companion/chat', { address: ALICE, token_id: String(TOKEN) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].id).toBe(2);
    expect(body.messages[1].id).toBe(1);
  });

  it('returns 400 when params missing', async () => {
    const res = await chatGET(get('/api/sanctuary/companion/chat', { address: ALICE }));
    expect(res.status).toBe(400);
  });

  it('caps limit at 100', async () => {
    db.getCompanionChatHistory.mockReturnValue([]);
    await chatGET(get('/api/sanctuary/companion/chat', { address: ALICE, token_id: String(TOKEN), limit: '999' }));
    expect(db.getCompanionChatHistory).toHaveBeenCalledWith(ALICE, TOKEN, 100);
  });
});

// =====================================================================
// POST /api/sanctuary/companion/chat
// =====================================================================

describe('POST /api/sanctuary/companion/chat', () => {
  it('sends chat message and gets reply', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chatWithCompanion.mockReturnValue({ reply: 'Hello traveler!', mood_change: 0.5 });
    const res = await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE, token_id: TOKEN, message: 'Hi there' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Hello traveler!');
  });

  it('returns 400 when params missing', async () => {
    const res = await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Invalid signature' });
    const res = await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE, token_id: TOKEN, message: 'hi' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for whitespace-only message', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    const res = await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE, token_id: TOKEN, message: '   ' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('empty');
  });

  it('truncates message to 500 chars', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chatWithCompanion.mockReturnValue({ reply: 'ok' });
    const longMsg = 'x'.repeat(600);
    await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE, token_id: TOKEN, message: longMsg }),
    );
    const sentMsg = db.chatWithCompanion.mock.calls[0][2] as string;
    expect(sentMsg).toHaveLength(500);
  });

  it('returns 404 when no active companion', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chatWithCompanion.mockImplementation(() => { throw new Error('No active companion found'); });
    const res = await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE, token_id: TOKEN, message: 'hi' }),
    );
    expect(res.status).toBe(404);
  });
});

// =====================================================================
// POST /api/sanctuary/companion/interact
// =====================================================================

describe('POST /api/sanctuary/companion/interact', () => {
  it('interacts successfully (feed)', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(true);
    db.interactWithCompanionV15.mockReturnValue({ bond_change: 0.5, mood: 'happy' });
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE, token_id: TOKEN, action: 'feed' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bond_change).toBe(0.5);
  });

  it('supports legacy address field', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(false);
    db.interactWithCompanionV15.mockReturnValue({ bond_change: 0.3 });
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { address: ALICE, token_id: TOKEN, action: 'pet' }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 400 when params missing', async () => {
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE, token_id: TOKEN, action: 'slap' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid action');
  });

  it('returns 401 on wallet auth failure', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Missing auth' });
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE, token_id: TOKEN, action: 'feed' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no active companion', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(false);
    db.interactWithCompanionV15.mockImplementation(() => { throw new Error('No active companion'); });
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE, token_id: TOKEN, action: 'feed' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 429 on daily interaction limit', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(false);
    db.interactWithCompanionV15.mockImplementation(() => { throw new Error('Daily interaction limit reached'); });
    const res = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE, token_id: TOKEN, action: 'feed' }),
    );
    expect(res.status).toBe(429);
  });
});

// =====================================================================
// POST /api/sanctuary/companion/send-to-activity
// =====================================================================

describe('POST /api/sanctuary/companion/send-to-activity', () => {
  it('sends companion to activity', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.sendToActivity.mockReturnValue({ activity: 'exploring', started_at: '2026-01-01' });
    const res = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN, location_id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity).toBe('exploring');
  });

  it('returns 400 when params missing', async () => {
    const res = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Expired' });
    const res = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN, location_id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no active companion', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.sendToActivity.mockImplementation(() => { throw new Error('No active companion'); });
    const res = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN, location_id: '1' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when location not found', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.sendToActivity.mockImplementation(() => { throw new Error('Location not found'); });
    const res = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN, location_id: '999' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when already on activity', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.sendToActivity.mockImplementation(() => { throw new Error('Companion is already on an activity'); });
    const res = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN, location_id: '1' }),
    );
    expect(res.status).toBe(409);
  });
});

// =====================================================================
// POST /api/sanctuary/companion/complete-activity
// =====================================================================

describe('POST /api/sanctuary/companion/complete-activity', () => {
  it('completes activity with star bonus', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(true);
    db.completeActivityV15.mockReturnValue({ xp_gained: 50, rewards: [] });
    const res = await completeActivityPOST(
      post('/api/sanctuary/companion/complete-activity', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xp_gained).toBe(50);
    expect(db.completeActivityV15).toHaveBeenCalledWith(ALICE, TOKEN, { isStar: true });
  });

  it('returns 400 when params missing', async () => {
    const res = await completeActivityPOST(
      post('/api/sanctuary/companion/complete-activity', { address: ALICE }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 401 when wallet auth fails', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: false, error: 'Bad sig' });
    const res = await completeActivityPOST(
      post('/api/sanctuary/companion/complete-activity', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 409 when no activity to complete', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(false);
    db.completeActivityV15.mockReturnValue(null);
    const res = await completeActivityPOST(
      post('/api/sanctuary/companion/complete-activity', { address: ALICE, token_id: TOKEN }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('No activity to complete');
  });
});

// =====================================================================
// GET /api/sanctuary/companion/journal
// =====================================================================

describe('GET /api/sanctuary/companion/journal', () => {
  it('returns paginated journal for active companion', async () => {
    db.getActiveCompanion.mockReturnValue({ token_id: TOKEN });
    db.getJournalEntriesPaginated.mockReturnValue({
      entries: [{ id: 1, content: 'Awakened' }],
      page: 1, total_pages: 1, total_entries: 1,
    });
    const res = await journalGET(get('/api/sanctuary/companion/journal', { address: ALICE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
  });

  it('includes stats when requested', async () => {
    db.getActiveCompanion.mockReturnValue({ token_id: TOKEN });
    db.getJournalEntriesPaginated.mockReturnValue({ entries: [], page: 1, total_pages: 0, total_entries: 0 });
    db.getJournalStats.mockReturnValue({ total: 10, by_type: { system: 5, interaction: 5 } });
    const res = await journalGET(get('/api/sanctuary/companion/journal', { address: ALICE, stats: 'true' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.total).toBe(10);
  });

  it('uses explicit token_id over active companion', async () => {
    db.getJournalEntriesPaginated.mockReturnValue({ entries: [], page: 1, total_pages: 0, total_entries: 0 });
    await journalGET(get('/api/sanctuary/companion/journal', { address: ALICE, token_id: '17' }));
    expect(db.getJournalEntriesPaginated).toHaveBeenCalledWith(ALICE, 17, expect.any(Object));
    expect(db.getActiveCompanion).not.toHaveBeenCalled();
  });

  it('returns 400 when address missing', async () => {
    const res = await journalGET(get('/api/sanctuary/companion/journal'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric token_id', async () => {
    const res = await journalGET(get('/api/sanctuary/companion/journal', { address: ALICE, token_id: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no active companion and no token_id', async () => {
    db.getActiveCompanion.mockReturnValue(null);
    const res = await journalGET(get('/api/sanctuary/companion/journal', { address: ALICE }));
    expect(res.status).toBe(404);
  });
});

// =====================================================================
// Flow: init → interact → check journal
// =====================================================================

describe('Flow: init → interact → journal', () => {
  it('walks through companion lifecycle', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    ownership.verifyTokenOwnership.mockResolvedValue(true);
    db.selectCompanion.mockReturnValue({ token_id: TOKEN, is_active: 1, bond_score: 0 });
    const initRes = await initPOST(
      post('/api/sanctuary/companion/init', { address: ALICE, token_id: TOKEN }),
    );
    expect(initRes.status).toBe(200);

    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    star.isStarSkrumpeyId.mockReturnValue(true);
    db.interactWithCompanionV15.mockReturnValue({ bond_change: 1.0, mood: 'happy' });
    const interactRes = await interactPOST(
      post('/api/sanctuary/companion/interact', { walletAddress: ALICE, token_id: TOKEN, action: 'feed' }),
    );
    expect(interactRes.status).toBe(200);

    db.getActiveCompanion.mockReturnValue({ token_id: TOKEN });
    db.getJournalEntriesPaginated.mockReturnValue({
      entries: [{ id: 1, content: 'Fed a treat', entry_type: 'interaction' }],
      page: 1, total_pages: 1, total_entries: 1,
    });
    const journalRes = await journalGET(get('/api/sanctuary/companion/journal', { address: ALICE }));
    expect(journalRes.status).toBe(200);
    const journal = await journalRes.json();
    expect(journal.entries[0].entry_type).toBe('interaction');
  });
});

// =====================================================================
// Flow: send to activity → complete
// =====================================================================

describe('Flow: send to activity → complete activity', () => {
  it('sends companion then completes', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.sendToActivity.mockReturnValue({ activity: 'exploring', location: 'Hot Springs' });
    const sendRes = await sendActivityPOST(
      post('/api/sanctuary/companion/send-to-activity', { address: ALICE, token_id: TOKEN, location_id: '1' }),
    );
    expect(sendRes.status).toBe(200);

    star.isStarSkrumpeyId.mockReturnValue(true);
    db.completeActivityV15.mockReturnValue({ xp_gained: 75, trait_progress: [{ name: 'bond', delta: 2 }] });
    const completeRes = await completeActivityPOST(
      post('/api/sanctuary/companion/complete-activity', { address: ALICE, token_id: TOKEN }),
    );
    expect(completeRes.status).toBe(200);
    const result = await completeRes.json();
    expect(result.xp_gained).toBe(75);
  });
});

// =====================================================================
// Flow: chat send → history retrieve
// =====================================================================

describe('Flow: chat conversation', () => {
  it('sends message then retrieves history', async () => {
    walletAuth.verifyWalletAccess.mockResolvedValue({ valid: true });
    db.chatWithCompanion.mockReturnValue({ reply: 'Hello traveler!' });
    const sendRes = await chatPOST(
      post('/api/sanctuary/companion/chat', { address: ALICE, token_id: TOKEN, message: 'Hi friend' }),
    );
    expect(sendRes.status).toBe(200);
    const reply = await sendRes.json();
    expect(reply.reply).toBe('Hello traveler!');

    db.getCompanionChatHistory.mockReturnValue([
      { id: 1, message: 'Hi friend', sender: 'user' },
      { id: 2, message: 'Hello traveler!', sender: 'companion' },
    ]);
    const histRes = await chatGET(get('/api/sanctuary/companion/chat', { address: ALICE, token_id: String(TOKEN) }));
    expect(histRes.status).toBe(200);
    const hist = await histRes.json();
    expect(hist.messages).toHaveLength(2);
  });
});
