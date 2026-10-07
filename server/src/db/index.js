import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
export const SCHEMA_VERSION = 3;

const kstStamp = (d = new Date()) => {
  const k = new Date(d.getTime() + 9 * 3600 * 1000).toISOString();
  return `${k.slice(0, 10).replace(/-/g, '')}-${k.slice(11, 19).replace(/:/g, '')}`;
};

/**
 * v3 마이그레이션 (실행 계획 2장): v2의 assets(아파트 한 호실 = 자산 한 건)를 지우고 건물·호실·계약 구조를 만든다.
 * 실거래 캐시(complexes, trades, raw_responses, fetch_log, 연결 기록, 사용량)는 그대로 둔다.
 * 기존 자산이 있는 파일 DB는 트랜잭션 전에 VACUUM INTO로 같은 폴더에 백업한다(WAL 안전, 동기).
 */
function migrate(db, dbPath) {
  if (db.pragma('user_version', { simple: true }) >= SCHEMA_VERSION) return null;
  const hasAssets = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'assets'").get());
  let backup = null;
  if (hasAssets && dbPath !== ':memory:') {
    backup = path.join(path.dirname(path.resolve(dbPath)), `app-v2-backup-${kstStamp()}.db`);
    db.prepare('VACUUM INTO ?').run(backup);
  }
  db.transaction(() => {
    if (hasAssets) db.exec('DROP TABLE assets');
    db.exec(SCHEMA);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
  return backup;
}

export function openDb(dbPath, { log = console } = {}) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const backup = migrate(db, dbPath);
  if (backup) log.info?.(`[db] v2 자산 데이터를 백업하고 v3 구조로 바꿨습니다: ${backup}`);
  db.exec(SCHEMA);
  return db;
}
