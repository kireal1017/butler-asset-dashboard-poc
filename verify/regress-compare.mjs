// 개선 v2 회귀 비교 (docs/IMPROVEMENT-SPEC.md 6장 1항, 실행 계획 E3-1 7~9번).
// 같은 기준 DB의 두 사본으로 띄운 변경 전 서버와 변경 후 서버의 응답·화면 값이 같은지, DB가 바뀌지 않았는지 확인한다.
// 사용: node verify/regress-compare.mjs [--before http://localhost:3002] [--after http://localhost:3001]
//        [--dom-before verify/out/dom-before.json --dom-after verify/out/dom-after.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableHashes } from './regress-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BEFORE = arg('--before', 'http://localhost:3002');
const AFTER = arg('--after', 'http://localhost:3001');
const DOM_BEFORE = arg('--dom-before', null);
const DOM_AFTER = arg('--dom-after', null);
const prep = JSON.parse(fs.readFileSync(path.join(ROOT, 'verify', 'out', 'regress-prep.json'), 'utf8'));

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const summary = { requests: 0, non200: 0, apiDiffs: 0, domValues: 0, domDiffs: 0 };

async function both(p) {
  const [b, a] = await Promise.all([BEFORE, AFTER].map(async (base) => {
    const r = await fetch(`${base}${p}`);
    return { status: r.status, body: await r.json() };
  }));
  summary.requests += 2;
  // 200이 아니면 실패로 본다 (예: 둘 다 409여서 같은 것으로 통과하는 일을 막는다)
  if (b.status !== 200 || a.status !== 200) {
    summary.non200++;
    fail(p, `status before ${b.status}, after ${a.status}`);
  }
  if (!same(b.body, a.body)) {
    summary.apiDiffs++;
    fail(p, `response differs\n  before ${JSON.stringify(b.body).slice(0, 300)}\n  after  ${JSON.stringify(a.body).slice(0, 300)}`);
  }
  return a.body;
}

// ---------- API ----------
const health = await both('/api/health');
if (health.asOf !== prep.asOf) fail('health', `asOf ${health.asOf} ≠ prep ${prep.asOf}`);
const list = await both('/api/assets');
for (const item of list.items) {
  const detail = await both(`/api/assets/${item.id}`);
  for (const range of detail.ranges) await both(`/api/assets/${item.id}/series?range=${range}&collect=0`);
}

// ---------- 화면 값 (변경 전 화면에 있는 값만 비교, 비교 근거는 변경 후에만 있음) ----------
if (DOM_BEFORE && DOM_AFTER) {
  const b = JSON.parse(fs.readFileSync(DOM_BEFORE, 'utf8'));
  const a = JSON.parse(fs.readFileSync(DOM_AFTER, 'utf8'));
  if (!same(Object.keys(b.assets).sort(), Object.keys(a.assets).sort())) fail('dom', 'asset ids differ');
  for (const [id, views] of Object.entries(b.assets)) {
    for (const [where, vals] of Object.entries(views)) {
      for (const [k, v] of Object.entries(vals)) {
        if (k === 'series') {
          for (const [range, digest] of Object.entries(v)) {
            summary.domValues++;
            if (a.assets[id]?.[where]?.series?.[range] !== digest) { summary.domDiffs++; fail(`dom ${id} ${where}.series.${range}`, `${digest} ≠ ${a.assets[id]?.[where]?.series?.[range]}`); }
          }
          continue;
        }
        if (v === undefined) continue;
        summary.domValues++;
        if (!same(v, a.assets[id]?.[where]?.[k])) { summary.domDiffs++; fail(`dom ${id} ${where}.${k}`, `${JSON.stringify(v)} ≠ ${JSON.stringify(a.assets[id]?.[where]?.[k])}`); }
      }
    }
  }
  const bOverflow = b.uiChecks.filter((c) => c.horizontalOverflow || !c.disclaimer).length;
  const aOverflow = a.uiChecks.filter((c) => c.horizontalOverflow || !c.disclaimer).length;
  if (bOverflow || aOverflow) fail('ui', `overflow/disclaimer problems before ${bOverflow}, after ${aOverflow}`);
}

// ---------- DB 불변 (사본 해시가 준비 직후와 같아야 한다) ----------
const dbCheck = {};
for (const side of ['before', 'after']) {
  const now = tableHashes(prep.copies[side]);
  dbCheck[side] = same(now, prep.hashes[side]) ? 'unchanged' : 'CHANGED';
  if (!same(now, prep.hashes[side])) fail(`db ${side}`, `tables changed: ${JSON.stringify(prep.hashes[side])} → ${JSON.stringify(now)}`);
}

console.log(JSON.stringify({ before: BEFORE, after: AFTER, asOf: health.asOf, assets: list.items.length, ...summary, db: dbCheck, mismatches: problems.length, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
