import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, it, expect, afterEach } from 'vitest';
import { openDb, SCHEMA_VERSION } from '../src/db/index.js';

const tmpDirs = [];
const tmpDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'butler-mig-'));
  tmpDirs.push(d);
  return d;
};
afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
const quiet = { log: { info() {} } };

/** v2 구조(assets 포함)의 파일 DB를 만든다 — 스키마는 v2 커밋의 schema.sql 그대로(fixtures/schema-v2.sql) */
function makeV2(file) {
  const db = new Database(file);
  db.exec(fs.readFileSync(new URL('./fixtures/schema-v2.sql', import.meta.url), 'utf8'));
  db.exec(`
    INSERT INTO complexes (kapt_code, name, bjd_code, sigungu_code) VALUES ('A1', '하계현대우성', '1135010400', '11350');
    INSERT INTO trades (sgg_cd, deal_ym, src_seq, apt_seq, apt_nm, area_u, area_raw, deal_day, deal_amount) VALUES ('11350', '202609', 0, '11350-75', '우성', 849100, '84.91', 3, 120000);
    INSERT INTO assets (kapt_code, dong, ho, floor, area_u, area_source, created_at) VALUES ('A1', '112', '1001', 10, 849100, 'auto', 'x');
  `);
  db.close();
}

describe('v3 마이그레이션', () => {
  it('backs up a v2 file DB, drops assets, creates v3 tables and keeps the trade cache', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'app.db');
    makeV2(file);
    const db = openDb(file, quiet);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(tables(db)).not.toContain('assets');
    expect(tables(db)).toEqual(expect.arrayContaining(['buildings', 'units', 'unit_holdings', 'unit_value_references', 'leases', 'rent_transactions', 'conversion_rates', 'unit_lookups']));
    expect(db.prepare('SELECT COUNT(*) n FROM trades').get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM complexes').get().n).toBe(1);
    db.close();

    const backups = fs.readdirSync(dir).filter((f) => /^app-v2-backup-\d{8}-\d{6}\.db$/.test(f));
    expect(backups).toHaveLength(1);
    const b = new Database(path.join(dir, backups[0]), { readonly: true });
    expect(b.prepare('SELECT COUNT(*) n FROM assets').get().n).toBe(1);
    b.close();
  });

  it('is a no-op on the second open (no new backup, data intact)', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'app.db');
    makeV2(file);
    openDb(file, quiet).close();
    const db = openDb(file, quiet);
    db.prepare("INSERT INTO buildings (kapt_code, name, created_at) VALUES ('A1', '하계현대우성', 'x')").run();
    db.close();
    const again = openDb(file, quiet);
    expect(again.prepare('SELECT COUNT(*) n FROM buildings').get().n).toBe(1);
    again.close();
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('app-v2-backup-'))).toHaveLength(1);
  });

  it('does not back up an in-memory DB or a new file DB', () => {
    const mem = openDb(':memory:', quiet);
    expect(mem.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(tables(mem)).toContain('buildings');
    const dir = tmpDir();
    openDb(path.join(dir, 'new.db'), quiet).close();
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('app-v2-backup-'))).toHaveLength(0);
  });

  it('enforces unique building per complex and unique dong/ho per building', () => {
    const db = openDb(':memory:', quiet);
    db.prepare("INSERT INTO complexes (kapt_code, name, bjd_code, sigungu_code) VALUES ('A1', 'x', '1135010400', '11350')").run();
    const ins = db.prepare("INSERT INTO buildings (kapt_code, name, created_at) VALUES ('A1', 'x', 'x')");
    ins.run();
    expect(() => ins.run()).toThrow(/UNIQUE/);
    const u = db.prepare("INSERT INTO units (building_id, dong, ho, area_u, floor, area_source, created_at) VALUES (1, '112', '1001', 849100, 10, 'auto', 'x')");
    u.run();
    expect(() => u.run()).toThrow(/UNIQUE/);
  });
});
