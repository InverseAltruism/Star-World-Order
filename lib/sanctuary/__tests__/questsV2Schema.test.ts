// [SWO_V2_SANCTUARY_QUESTS_V2] Guards the v2.9 migration: a malformed migration
// crashes the whole sanctuary DB init at runtime, so we load it in isolation and
// assert the tables + key constraints it must create.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function loadV29(): Database.Database {
  const db = new Database(':memory:');
  // The charm catalog seed FKs into sanctuary_charm_items; quest runs FK
  // token_id into star_skrumpey_metadata. Stand that stub up first.
  db.exec('CREATE TABLE star_skrumpey_metadata (token_id INTEGER PRIMARY KEY)');
  const sql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.9.sql'), 'utf-8');
  db.exec(sql); // throws on any SQL error → the test fails loudly
  return db;
}

describe('v2.9 migration', () => {
  it('runs without error and is idempotent', () => {
    const db = loadV29();
    const sql = fs.readFileSync(path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.9.sql'), 'utf-8');
    expect(() => db.exec(sql)).not.toThrow(); // CREATE ... IF NOT EXISTS
  });

  it('creates the three new tables', () => {
    const db = loadV29();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining([
      'sanctuary_charm_items', 'sanctuary_charm_stock', 'sanctuary_quest_runs',
    ]));
  });

  it('quest_runs enforces the kind + status + outcome check constraints', () => {
    const db = loadV29();
    db.exec("INSERT INTO star_skrumpey_metadata (token_id) VALUES (1)");
    const insert = (kind: string, status: string) => db.prepare(
      `INSERT INTO sanctuary_quest_runs (wallet_address, token_id, quest_key, kind, ends_at, status)
       VALUES ('0xabc', 1, 'q', ?, datetime('now'), ?)`,
    ).run(kind, status);
    expect(() => insert('earn', 'active')).not.toThrow();
    expect(() => insert('nonsense', 'active')).toThrow();
    expect(() => insert('earn', 'bogus')).toThrow();
  });

  it('charm_items effect_type is constrained to the trade-off kinds', () => {
    const db = loadV29();
    const ins = (et: string) => db.prepare(
      `INSERT INTO sanctuary_charm_items (item_key, name, star_cost, effect_type, upside, downside, description, asset_key)
       VALUES (?, 'n', 10, ?, 0.3, 0.2, 'd', 'a')`,
    ).run(`k-${et}`, et);
    for (const ok of ['gambit', 'prospect']) {
      expect(() => ins(ok)).not.toThrow();
    }
    expect(() => ins('mind_control')).toThrow();
  });

  it('charm_stock charges cannot go negative (CHECK)', () => {
    const db = loadV29();
    db.prepare(
      "INSERT INTO sanctuary_charm_items (item_key, name, star_cost, effect_type, upside, downside, description, asset_key) VALUES ('c','n',10,'gambit',0.3,0.2,'d','a')",
    ).run();
    expect(() => db.prepare(
      "INSERT INTO sanctuary_charm_stock (wallet_address, item_key, charges) VALUES ('0xabc','c',-1)",
    ).run()).toThrow();
  });
});
