// 개선 v2 회귀 비교 준비 (docs/IMPROVEMENT-SPEC.md 6장 1항, 실행 계획 E3-1).
// 기준 DB에서 사본 두 개(변경 전 코드용·변경 후 코드용)를 만들고, 두 사본 모두 외부 호출이 생기지 않는 상태로 맞춘다.
//  1) 서버가 꺼진 상태에서 체크포인트 후 backup으로 사본 생성
//  2) 화면·API가 쓸 수 있는 모든 달(10년 탭, 보유 기간, 등록 수집 범위, 비교 근거 36개월)이 수집돼 있는지 확인 — 하나라도 없으면 중단
//  3) fetch_log.fetched_at을 지금 시각으로 갱신 → 재수집(30일 경과) 조건이 변경 전(3개월)·변경 후(12개월) 모두 성립하지 않음
//  4) 사본의 데이터 테이블 해시를 기록 (regress-compare.mjs가 비교 후 다시 확인)
// 사용: node verify/regress-prep.mjs --as-of 202610 [--src ~/.butler-poc/app.db] [--dir ~/.butler-poc]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { addMonths, monthRange, tableHashes } from './regress-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const AS_OF = arg('--as-of', null);
if (!/^\d{6}$/.test(AS_OF ?? '')) throw new Error('--as-of YYYYMM이 필요합니다');
const SRC = arg('--src', path.join(os.homedir(), '.butler-poc', 'app.db'));
const DIR = arg('--dir', path.join(os.homedir(), '.butler-poc'));
const copies = { before: path.join(DIR, 'reg-before.db'), after: path.join(DIR, 'reg-after.db') };

// 1) 체크포인트 + 사본 (실행할 때마다 새로 만든다)
const src = new Database(SRC);
src.pragma('wal_checkpoint(TRUNCATE)');
for (const file of Object.values(copies)) {
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  await src.backup(file);
}

// 2) 필요한 달 확인
const assets = src.prepare(`SELECT a.*, c.sigungu_code FROM assets a JOIN complexes c USING (kapt_code)`).all();
const need = new Map(); // sgg -> Set(ym)
for (const a of assets) {
  const set = need.get(a.sigungu_code) ?? new Set();
  for (const ym of monthRange(addMonths(AS_OF, -119), AS_OF)) set.add(ym); // 10년 탭 (1·3·5년, 비교 근거 36개월 포함)
  const holdFrom = a.purchase_price ? (a.purchase_source === 'matched' && a.purchase_date ? a.purchase_date.slice(0, 6) : a.acquisition_ym) : null;
  if (holdFrom) for (const ym of monthRange(holdFrom, AS_OF)) set.add(ym); // 보유 기간
  if (a.acquisition_ym) for (let i = -3; i <= 0; i++) set.add(addMonths(a.acquisition_ym, i)); // 등록 수집 범위
  need.set(a.sigungu_code, set);
}
const have = new Set(src.prepare('SELECT sgg_cd || \'|\' || deal_ym AS k FROM fetch_log').all().map((r) => r.k));
const missing = [];
for (const [sgg, set] of need) for (const ym of set) if (!have.has(`${sgg}|${ym}`)) missing.push(`${sgg}|${ym}`);
src.close();
if (missing.length) {
  console.error(`중단: 수집되지 않은 달 ${missing.length}개 — 비교 중 한쪽만 외부 호출을 하게 됩니다.\n${missing.sort().join('\n')}`);
  process.exit(1);
}

// 3) 재수집 조건 제거
const now = new Date().toISOString();
for (const file of Object.values(copies)) {
  const db = new Database(file);
  db.prepare('UPDATE fetch_log SET fetched_at = ?').run(now);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}

// 4) 해시 기록
const hashes = { before: tableHashes(copies.before), after: tableHashes(copies.after) };
const same = JSON.stringify(hashes.before) === JSON.stringify(hashes.after);
const outFile = path.join(ROOT, 'verify', 'out', 'regress-prep.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ asOf: AS_OF, fetchedAt: now, copies, hashes, neededMonths: [...need].map(([s, v]) => `${s}:${v.size}`) }, null, 2));
console.log(JSON.stringify({ copies, neededMonths: [...need].map(([s, v]) => `${s}:${v.size}`), missing: 0, copiesIdentical: same, hashes: hashes.after }, null, 2));
if (!same) process.exit(1);
