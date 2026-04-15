import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { WALLETS, TOKENS, NON_STAR_TOKEN, createSanctuaryDb, createSeededDb } from './fixtures';

describe('Wallet Ownership', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSeededDb();
  });

  it('holder can see their companions', () => {
    const companions = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ?'
    ).all(WALLETS.alice) as any[];
    expect(companions.length).toBe(2);
  });

  it('non-holder has no companions', () => {
    const companions = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ?'
    ).all(WALLETS.unauthorized) as any[];
    expect(companions.length).toBe(0);
  });

  it('cannot register a non-star token as companion', () => {
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)'
      ).run(WALLETS.alice, NON_STAR_TOKEN.id, 0);
    }).toThrow();
  });

  it('wallet addresses are isolated between users', () => {
    const aliceTokens = db.prepare(
      'SELECT token_id FROM sanctuary_companions WHERE wallet_address = ?'
    ).all(WALLETS.alice) as { token_id: number }[];
    const bobTokens = db.prepare(
      'SELECT token_id FROM sanctuary_companions WHERE wallet_address = ?'
    ).all(WALLETS.bob) as { token_id: number }[];

    const aliceIds = new Set(aliceTokens.map(t => t.token_id));
    const bobIds = new Set(bobTokens.map(t => t.token_id));
    for (const id of bobIds) {
      expect(aliceIds.has(id)).toBe(false);
    }
  });
});

describe('Companion State', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSeededDb();
  });

  it('active companion has correct initial state', () => {
    const active = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1'
    ).get(WALLETS.alice) as any;
    expect(active).toBeTruthy();
    expect(active.token_id).toBe(TOKENS.aether.id);
    expect(active.current_activity).toBe('exploring');
    expect(active.bond_score).toBe(3.5);
    expect(active.total_interactions).toBe(15);
  });

  it('inactive companion preserves its state', () => {
    const inactive = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(WALLETS.alice, TOKENS.spectra.id) as any;
    expect(inactive.is_active).toBe(0);
    expect(inactive.bond_score).toBe(1.2);
    expect(inactive.total_interactions).toBe(4);
  });

  it('bond_score defaults to 0 for new companions', () => {
    db.prepare(
      "INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)"
    ).run(WALLETS.charlie, TOKENS.nebulu.id, 1);

    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(WALLETS.charlie, TOKENS.nebulu.id) as any;
    expect(comp.bond_score).toBe(0.0);
    expect(comp.total_interactions).toBe(0);
    expect(comp.current_activity).toBe('lounging');
  });

  it('companion with metadata join returns constellation info', () => {
    const row = db.prepare(`
      SELECT sc.*, ssm.constellation, ssm.aura, ssm.form, ssm.mood,
             COALESCE(ux.total_xp, 0) as total_xp, COALESCE(ux.level, 1) as level
      FROM sanctuary_companions sc
      JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
      LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
      WHERE sc.wallet_address = ? AND sc.is_active = 1
    `).get(WALLETS.alice) as any;

    expect(row.constellation).toBe('aether');
    expect(row.aura).toBe('mystic');
    expect(row.total_xp).toBe(500);
    expect(row.level).toBe(5);
  });
});

describe('Companion Switching', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSeededDb();
  });

  it('switching deactivates current and activates new', () => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ? AND is_active = 1')
      .run(WALLETS.alice);
    db.prepare('UPDATE sanctuary_companions SET is_active = 1 WHERE wallet_address = ? AND token_id = ?')
      .run(WALLETS.alice, TOKENS.spectra.id);

    const active = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1'
    ).all(WALLETS.alice) as any[];
    expect(active.length).toBe(1);
    expect(active[0].token_id).toBe(TOKENS.spectra.id);

    const old = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(WALLETS.alice, TOKENS.aether.id) as any;
    expect(old.is_active).toBe(0);
  });

  it('preserves bond_score and interactions on switch', () => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ?')
      .run(WALLETS.alice);
    db.prepare('UPDATE sanctuary_companions SET is_active = 1 WHERE wallet_address = ? AND token_id = ?')
      .run(WALLETS.alice, TOKENS.spectra.id);

    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ?')
      .run(WALLETS.alice);
    db.prepare('UPDATE sanctuary_companions SET is_active = 1 WHERE wallet_address = ? AND token_id = ?')
      .run(WALLETS.alice, TOKENS.aether.id);

    const restored = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(WALLETS.alice, TOKENS.aether.id) as any;
    expect(restored.bond_score).toBe(3.5);
    expect(restored.total_interactions).toBe(15);
    expect(restored.is_active).toBe(1);
  });

  it('switching to new token creates companion with defaults', () => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ?')
      .run(WALLETS.alice);
    db.prepare(
      "INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, 1)"
    ).run(WALLETS.alice, TOKENS.nebulu.id);

    const newComp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(WALLETS.alice, TOKENS.nebulu.id) as any;
    expect(newComp.is_active).toBe(1);
    expect(newComp.bond_score).toBe(0.0);
    expect(newComp.current_activity).toBe('lounging');
  });

  it('switching does not affect other wallets', () => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ?')
      .run(WALLETS.alice);
    db.prepare('UPDATE sanctuary_companions SET is_active = 1 WHERE wallet_address = ? AND token_id = ?')
      .run(WALLETS.alice, TOKENS.spectra.id);

    const bobActive = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1'
    ).get(WALLETS.bob) as any;
    expect(bobActive).toBeTruthy();
    expect(bobActive.token_id).toBe(TOKENS.solveil.id);
  });
});

describe('Unauthorized Access Cases', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createSeededDb();
  });

  it('cannot insert companion for token not in metadata', () => {
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)'
      ).run(WALLETS.unauthorized, NON_STAR_TOKEN.id, 1);
    }).toThrow();
  });

  it('cannot duplicate wallet+token pair', () => {
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)'
      ).run(WALLETS.alice, TOKENS.aether.id, 0);
    }).toThrow();
  });

  it('cannot insert journal with invalid entry_type', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)"
      ).run(WALLETS.alice, TOKENS.aether.id, 'hack', 'Injected entry.');
    }).toThrow();
  });

  it('cannot insert journal for non-existent token', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)"
      ).run(WALLETS.unauthorized, NON_STAR_TOKEN.id, 'system', 'Should fail.');
    }).toThrow();
  });

  it('querying non-existent wallet returns empty', () => {
    const companions = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ?'
    ).all(WALLETS.unauthorized) as any[];
    expect(companions.length).toBe(0);

    const journal = db.prepare(
      'SELECT * FROM sanctuary_journal WHERE wallet_address = ?'
    ).all(WALLETS.unauthorized) as any[];
    expect(journal.length).toBe(0);
  });

  it('cannot access another wallets companion state via direct query', () => {
    const bobTryingAlice = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(WALLETS.bob, TOKENS.aether.id);
    expect(bobTryingAlice).toBeUndefined();
  });
});
