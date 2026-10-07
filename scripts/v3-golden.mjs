// v3 1a 골든 비교 (실행 계획 .omc/plans/v3-execution-plan.md 1a-0, AC3).
// 서비스 입력 접점(자산 행 → subject)을 바꾸기 전후로 비교 3가지와 참고 범위 거래 출력이 같은지 확인한다.
// 앱 코드를 import하므로 verify/가 아닌 scripts/에 둔다.
//   node scripts/v3-golden.mjs source   — 서버를 멈춘 상태에서 실제 DB를 ~/.butler-poc/golden-src.db로 복사
//   node scripts/v3-golden.mjs capture  — 접점 수정 전 코드로 출력 저장
//   node scripts/v3-golden.mjs check    — 접점 수정 후 코드로 같은 출력인지 비교
// 매 실행 golden-src.db를 임시 파일로 복사해 new Database()로 연다(openDb는 마이그레이션으로 assets를 지우고,
// resolveLink가 연결 기록을 쓸 수 있어 읽기 전용으로도 열 수 없다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'server', 'package.json'));
const Database = require('better-sqlite3');

const DIR = path.join(os.homedir(), '.butler-poc');
const SRC = path.join(DIR, 'golden-src.db');
const OUT = path.join(ROOT, 'scripts', 'out', 'golden-v2-services.json');
const ASSET_IDS = [1, 4, 5, 6, 7];
const AS_OF = '202610';
const mode = process.argv[2];

const failingApi = { devFault: null, calls: 0, request: async () => { failingApi.calls++; throw new Error('golden: external call is not allowed'); } };
const natural = (t) => [t.deal_ym, t.deal_day, t.apt_seq, t.apt_dong, t.floor, t.deal_amount, t.area_u, t.cdeal_type, t.dealing_gbn];
const stripProgress = (section) => {
  const { progress, ...rest } = section;
  return rest;
};

function openCopy() {
  const tmp = path.join(os.tmpdir(), `butler-golden-${process.pid}.db`);
  fs.copyFileSync(SRC, tmp);
  return { db: new Database(tmp), tmp };
}

async function makeCtx(db) {
  const { createCollector } = await import(pathUrl('server/src/collect/collector.js'));
  return { db, api: failingApi, collector: createCollector({ db, api: failingApi }), asOf: () => AS_OF };
}
const pathUrl = (p) => new URL(`file:///${path.join(ROOT, p).replace(/\\/g, '/')}`).href;

function assertReady(id, cmp) {
  for (const k of ['sameFloor', 'sameComplex', 'neighborhood']) {
    if (cmp[k].status !== 'ready') throw new Error(`asset ${id} ${k} status ${cmp[k].status} (expected ready)`);
  }
}

async function run(produce) {
  const { db, tmp } = openCopy();
  try {
    const ctx = await makeCtx(db);
    const result = {};
    for (const id of ASSET_IDS) {
      const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
      const c = db.prepare('SELECT * FROM complexes WHERE kapt_code = ?').get(row.kapt_code);
      const { comparisons, trades } = await produce(ctx, row, c);
      assertReady(id, comparisons);
      result[id] = {
        comparisons: Object.fromEntries(['sameFloor', 'sameComplex', 'neighborhood'].map((k) => [k, stripProgress(comparisons[k])])),
        scope: trades.scope,
        sorted: trades.sorted.map(natural),
      };
    }
    if (failingApi.calls) throw new Error(`external calls happened: ${failingApi.calls}`);
    return result;
  } finally {
    db.close();
    fs.rmSync(tmp, { force: true });
  }
}

if (mode === 'source') {
  const src = new Database(path.join(DIR, 'app.db'));
  src.pragma('wal_checkpoint(TRUNCATE)');
  fs.rmSync(SRC, { force: true });
  await src.backup(SRC);
  src.close();
  console.log(`golden source → ${SRC}`);
} else if (mode === 'capture') {
  const { assetComparisons } = await import(pathUrl('server/src/services/comparisons.js'));
  const { assetTrades } = await import(pathUrl('server/src/services/valuation.js'));
  const result = await run(async (ctx, row, c) => ({ comparisons: assetComparisons(ctx, row.id), trades: assetTrades(ctx.db, row, c) }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(`golden capture: ${ASSET_IDS.length} assets → ${path.relative(ROOT, OUT)}`);
} else if (mode === 'check') {
  const { subjectComparisons } = await import(pathUrl('server/src/services/comparisons.js'));
  const { subjectTrades } = await import(pathUrl('server/src/services/valuation.js'));
  const subjectOf = (row) => ({ id: row.id, kaptCode: row.kapt_code, dong: row.dong, floor: row.floor, areaU: row.area_u, acquisitionYm: row.acquisition_ym });
  const result = await run(async (ctx, row, c) => ({
    comparisons: subjectComparisons(ctx, subjectOf(row)),
    trades: subjectTrades(ctx.db, subjectOf(row), c),
  }));
  const expected = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const diffs = ASSET_IDS.filter((id) => JSON.stringify(expected[id]) !== JSON.stringify(result[id]));
  console.log(JSON.stringify({ assets: ASSET_IDS.length, identical: ASSET_IDS.length - diffs.length, diffs }));
  process.exit(diffs.length ? 1 : 0);
} else {
  console.error('usage: node scripts/v3-golden.mjs source|capture|check');
  process.exit(2);
}
