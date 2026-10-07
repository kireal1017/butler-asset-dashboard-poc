// 독립 재계산 (v3). 앱 코드(server/, client/)를 import하지 않는다 (verify/check-imports.mjs가 강제).
// 1) 저장된 원본 응답(raw_responses)을 이 파일의 파서로 다시 읽어 trades·fetch_log와 대조한다.
// 2) 호실마다 참고가·기준일·건수, 기간 평균(1·3·6개월), 가격 범위·위치 막대, 최근 거래, 매입가 대비,
//    비교 3가지, 매입가 제안을 명세 문장대로 다시 계산해 서버 API 응답과 비교한다(기준 월 AS_OF).
// 3) --dom이 있으면 화면에서 뽑은 값(verify/dom-extract.js)을 같은 재계산 값으로 만든 표기와 비교한다.
// 사용: node verify/recompute.mjs [--api http://localhost:3001] [--dom verify/out/dom.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const API = arg('--api', 'http://localhost:3001');

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return '';
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}
const DB_PATH = envValue('DB_PATH') || path.join(os.homedir(), '.butler-poc', 'app.db');
const db = new Database(DB_PATH, { readonly: true });

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

// ---------- 원본 응답 2차 파싱 (indexOf 기반, 앱의 정규식 파서와 다른 구현) ----------
function tagValue(block, tag) {
  const open = `<${tag}>`;
  const s = block.indexOf(open);
  if (s < 0) return '';
  const e = block.indexOf(`</${tag}>`, s);
  return block.slice(s + open.length, e).trim();
}
function itemsOf(xml) {
  const out = [];
  let pos = 0;
  for (;;) {
    const s = xml.indexOf('<item>', pos);
    if (s < 0) break;
    const e = xml.indexOf('</item>', s);
    out.push(xml.slice(s, e));
    pos = e + 7;
  }
  return out;
}
// 면적 문자열 → 1/10000㎡ 정수 (소수점 위치로 직접 계산)
function areaUnits(str) {
  const dot = str.indexOf('.');
  const whole = dot < 0 ? str : str.slice(0, dot);
  const frac = dot < 0 ? '' : str.slice(dot + 1);
  return parseInt(whole, 10) * 10000 + parseInt((frac + '0000').slice(0, 4), 10);
}
const manwon = (s) => parseInt(s.split(',').join(''), 10);

const rawByMonth = new Map(); // `${sgg}|${ym}` -> trade[]
const logs = db.prepare('SELECT * FROM fetch_log').all();
const pageStmt = db.prepare('SELECT page, body FROM raw_responses WHERE sgg_cd = ? AND deal_ym = ? ORDER BY page');
const dbRowsStmt = db.prepare('SELECT * FROM trades WHERE sgg_cd = ? AND deal_ym = ? ORDER BY src_seq');
let countMismatches = 0;
let rowMismatches = 0;
let checkedRows = 0;

for (const log of logs) {
  const where = `${log.sgg_cd}/${log.deal_ym}`;
  const pages = pageStmt.all(log.sgg_cd, log.deal_ym);
  const expectedPages = Math.max(1, Math.ceil(log.total_count / 1000));
  const parsed = [];
  for (const p of pages) {
    const total = parseInt(tagValue(p.body, 'totalCount'), 10);
    if (total !== log.total_count) { fail(where, `page ${p.page} totalCount ${total} ≠ log ${log.total_count}`); countMismatches++; }
    for (const b of itemsOf(p.body)) {
      parsed.push({
        aptSeq: tagValue(b, 'aptSeq'),
        aptNm: tagValue(b, 'aptNm'),
        umdCd: tagValue(b, 'umdCd'),
        bonbun: parseInt(tagValue(b, 'bonbun') || 'NaN', 10),
        bubun: parseInt(tagValue(b, 'bubun') || 'NaN', 10),
        aptDong: tagValue(b, 'aptDong').replace(/동$/, ''),
        ym: log.deal_ym,
        day: parseInt(tagValue(b, 'dealDay'), 10),
        floor: parseInt(tagValue(b, 'floor'), 10),
        amount: manwon(tagValue(b, 'dealAmount')),
        area: areaUnits(tagValue(b, 'excluUseAr')),
        cancelled: tagValue(b, 'cdealType') !== '',
        direct: tagValue(b, 'dealingGbn') === '직거래',
      });
    }
  }
  rawByMonth.set(`${log.sgg_cd}|${log.deal_ym}`, parsed);
  const rows = dbRowsStmt.all(log.sgg_cd, log.deal_ym);
  if (pages.length !== expectedPages) { fail(where, `pages ${pages.length} ≠ ceil(total/1000) ${expectedPages}`); countMismatches++; }
  if (parsed.length !== log.total_count || rows.length !== log.total_count || log.row_count !== log.total_count) {
    fail(where, `raw ${parsed.length}, db ${rows.length}, log row_count ${log.row_count}, total ${log.total_count}`);
    countMismatches++;
  }
  rows.forEach((r, i) => {
    const p = parsed[i];
    checkedRows++;
    if (!p || p.aptSeq !== r.apt_seq || p.amount !== r.deal_amount || p.area !== r.area_u || p.floor !== r.floor
      || p.day !== r.deal_day || p.cancelled !== Boolean(r.cdeal_type) || (p.aptDong || null) !== r.apt_dong) {
      rowMismatches++;
      if (rowMismatches <= 5) fail(where, `row ${i} differs: raw=${JSON.stringify(p)} db=${JSON.stringify(r)}`);
    }
  });
}

// ---------- PRD 7장 재구현 ----------
// "같은 단지·같은 면적": 연결된(동 소속) 실거래 단지 + 전용면적 차이 0.1㎡ 이하, 해제 거래 제외
// 순서(사용자 확정): 계약 연월·일 → 단지 → 동 → 층 → 금액 → 면적
const collator = new Intl.Collator('ko', { numeric: true });
function byTime(a, b) {
  if (a.ym !== b.ym) return a.ym < b.ym ? -1 : 1;
  if (a.day !== b.day) return a.day - b.day;
  if (a.aptSeq !== b.aptSeq) return a.aptSeq < b.aptSeq ? -1 : 1;
  const d = collator.compare(a.aptDong || '', b.aptDong || '');
  if (d) return d;
  if (a.floor !== b.floor) return a.floor - b.floor;
  if (a.amount !== b.amount) return a.amount - b.amount;
  return a.area - b.area;
}
function comparable(sgg, aptSeqs, areaU) {
  const set = new Set(aptSeqs);
  const out = [];
  for (const [key, list] of rawByMonth) {
    if (!key.startsWith(`${sgg}|`)) continue;
    for (const t of list) if (set.has(t.aptSeq) && !t.cancelled && Math.abs(t.area - areaU) <= 1000) out.push(t);
  }
  return out.sort(byTime);
}
// PRD 7.5 "소수 첫째 자리": 0에서 먼 쪽으로 반올림 (부호 대칭)
const pct = (diff, base) => (diff < 0 ? -1 : 1) * Math.round((Math.abs(diff) / base) * 1000) / 10;
function expectedChange(list, purchase) {
  if (!list.length) return null;
  const last = list[list.length - 1].amount;
  if (purchase) return { kind: 'purchase', diff: last - purchase, rate: pct(last - purchase, purchase) };
  if (list.length === 1) return null;
  const prev = list[list.length - 2].amount;
  return { kind: 'previous', diff: last - prev, rate: pct(last - prev, prev) };
}
function nextYm(ym) {
  let y = +ym.slice(0, 4);
  let m = +ym.slice(4) + 1;
  if (m === 13) { m = 1; y++; }
  return `${y}${m < 10 ? '0' : ''}${m}`;
}
function expectedSeries(list, from, to) {
  const out = [];
  let value = null;
  for (const t of list) if (t.ym < from) value = t.amount;
  for (let ym = from; ym <= to; ym = nextYm(ym)) {
    const inMonth = list.filter((t) => t.ym === ym);
    const last = inMonth[inMonth.length - 1];
    if (last) value = last.amount;
    out.push({ ym, value, trade: last ? last.amount : null });
  }
  return out;
}

// ---------- 금액 표기 (PRD 7.9) 재구현: DOM 비교용 ----------
function won(v) {
  const a = Math.abs(v);
  const eok = Math.trunc(a / 10000);
  const man = a - eok * 10000;
  const g = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return [eok ? `${g(eok)}억` : '', man ? `${g(man)}만` : ''].filter(Boolean).join(' ') || '0원';
}
const signed = (v) => (v === 0 ? '0원' : `${v > 0 ? '+' : '−'}${won(v)}`);
const signedRate = (r) => (Math.round(r * 10) === 0 ? '0.0%' : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}%`);
const ymText = (ym) => `${ym.slice(0, 4)}.${ym.slice(4)}`;

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// ---------- 단지 범위·기간 시작 독립 재구성 ----------
// 같은 단지: K-APT 지번(법정동·본번·부번)과 같은 실거래 단지 + 저장된 오버라이드.
// 그중 자산의 동이 거래에 가장 많이 나온 단지, 없으면 대장 면적과 정확히 같은 면적 거래가 있는 유일한 단지, 그것도 없으면 전체.
// 같은 지번에 K-APT 단지가 둘 이상이면(이름 규칙 필요) 앱 범위가 지번 집합의 부분집합인지만 확인한다.
function lotSeqs(asset) {
  const umd = asset.bjd_code.slice(5);
  const lot = new Set();
  for (const [key, list] of rawByMonth) {
    if (!key.startsWith(`${asset.sigungu_code}|`)) continue;
    for (const t of list) if (t.umdCd === umd && t.bonbun === asset.bonbun && t.bubun === asset.bubun) lot.add(t.aptSeq);
  }
  for (const r of db.prepare('SELECT apt_seq FROM complex_trade_link_override WHERE kapt_code = ?').all(asset.kapt_code)) lot.add(r.apt_seq);
  return lot;
}
function independentScope(asset) {
  const lot = lotSeqs(asset);
  const shared = db.prepare('SELECT COUNT(*) n FROM complexes WHERE bjd_code = ? AND bonbun = ? AND bubun = ? AND kapt_code <> ?')
    .get(asset.bjd_code, asset.bonbun, asset.bubun, asset.kapt_code).n > 0;
  const seqs = [...lot].sort();
  if (shared || seqs.length <= 1) return { seqs, shared };
  const dongCount = new Map();
  const exact = new Set();
  for (const list of rawByMonth.values()) for (const t of list) {
    if (!lot.has(t.aptSeq)) continue;
    if (t.aptDong && t.aptDong === String(asset.dong)) dongCount.set(t.aptSeq, (dongCount.get(t.aptSeq) ?? 0) + 1);
    if (t.area === asset.area_u) exact.add(t.aptSeq);
  }
  const ranked = [...dongCount].sort((a, b) => b[1] - a[1]);
  if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) return { seqs: [ranked[0][0]], shared };
  if (exact.size === 1) return { seqs: [...exact], shared };
  return { seqs, shared };
}
const RANGE_N = { '1y': 12, '3y': 36, '5y': 60, '10y': 120 };
function addMonthsYm(ym, d) {
  let n = +ym.slice(0, 4) * 12 + (+ym.slice(4) - 1) + d;
  return `${Math.floor(n / 12)}${String((n % 12) + 1).padStart(2, '0')}`;
}
function independentFrom(range, asOf, asset) {
  if (range === 'hold') {
    if (!asset.purchase_price) return null;
    return asset.purchase_source === 'matched' ? asset.purchase_date.slice(0, 6) : asset.acquisition_ym;
  }
  return addMonthsYm(asOf, -(RANGE_N[range] - 1));
}

// ---------- 개선 v2 비교 근거 재구현 (docs/IMPROVEMENT-SPEC.md 3.3~3.5 문장대로) ----------
// 같은 층: 현재가 범위·36개월(기준 월 포함), 같은 층이 없으면 ±2층(1층 미만 제외), 최근 5건.
// 같은 단지: 지번 연결 전체·12개월·±5㎡·직거래 포함, 중앙값(짝수면 가운데 둘 평균 반올림), 내 면적 ±0.1㎡ 한 줄 + 나머지 면적값별, 가까운 순.
// 같은 법정동: 같은 시군구·같은 법정동 코드, 내 단지 제외, 단지별 최근 거래·건수·최근 단지명, 최근 거래 순.
function medianOf(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[h] : Math.round((s[h - 1] + s[h]) / 2);
}
function expectedComparisons(asset, scope, asOf) {
  const f36 = addMonthsYm(asOf, -35);
  const f12 = addMonthsYm(asOf, -11);
  const within = (t, from) => t.ym >= from && t.ym <= asOf;
  const own = comparable(asset.sigungu_code, scope, asset.area_u).filter((t) => Number.isInteger(t.floor) && within(t, f36));
  let floorRange = { min: asset.floor, max: asset.floor, widened: false };
  let fl = own.filter((t) => t.floor === asset.floor);
  if (!fl.length) {
    floorRange = { min: Math.max(1, asset.floor - 2), max: asset.floor + 2, widened: true };
    fl = own.filter((t) => t.floor >= floorRange.min && t.floor <= floorRange.max);
  }
  const sgg = [];
  for (const [key, list] of rawByMonth) if (key.startsWith(`${asset.sigungu_code}|`)) sgg.push(...list);
  const link = lotSeqs(asset);
  const near = (t) => !t.cancelled && within(t, f12) && Math.abs(t.area - asset.area_u) <= 50000;
  const cx = sgg.filter((t) => link.has(t.aptSeq) && near(t)).sort(byTime);
  const groups = new Map();
  for (const t of cx) {
    const mine = Math.abs(t.area - asset.area_u) <= 1000;
    const k = mine ? 'mine' : t.area;
    const g = groups.get(k) ?? { mine, areas: [], count: 0, latest: null };
    if (!g.areas.includes(t.area)) g.areas.push(t.area);
    g.count++;
    g.latest = t;
    groups.set(k, g);
  }
  const dist = (g) => (g.mine ? -1 : Math.abs(g.areas[0] - asset.area_u));
  const sortedGroups = [...groups.values()].sort((a, b) => dist(a) - dist(b) || a.areas[0] - b.areas[0]).slice(0, 5);
  const umd = asset.bjd_code.slice(5);
  const hood = link.size ? sgg.filter((t) => t.umdCd === umd && !link.has(t.aptSeq) && near(t)).sort(byTime) : [];
  const byApt = new Map();
  for (const t of hood) {
    const g = byApt.get(t.aptSeq) ?? { aptSeq: t.aptSeq, count: 0, latest: null };
    g.count++;
    g.latest = t;
    byApt.set(t.aptSeq, g);
  }
  const complexes = [...byApt.values()].sort((a, b) => byTime(b.latest, a.latest));
  return {
    sameFloor: { floorRange, count: fl.length, trades: fl.slice(-5).reverse().map((t) => [t.ym, t.day, t.floor, t.amount, t.direct]) },
    sameComplex: {
      linked: link.size > 0, count: cx.length, median: medianOf(cx.map((t) => t.amount)),
      groups: sortedGroups.map((g) => [g.mine, [...g.areas].sort((a, b) => a - b), g.count, g.latest.ym, g.latest.day, g.latest.amount]),
    },
    neighborhood: {
      linked: link.size > 0, count: hood.length, complexCount: complexes.length, median: medianOf(hood.map((t) => t.amount)),
      complexes: complexes.map((g) => [g.aptSeq, g.latest.aptNm, g.count, g.latest.ym, g.latest.day, g.latest.amount]),
    },
  };
}
function apiComparisons(c) {
  return {
    sameFloor: { floorRange: c.sameFloor.floorRange, count: c.sameFloor.count, trades: c.sameFloor.trades.map((t) => [t.ym, t.day, t.floor, t.amount, t.direct]) },
    sameComplex: {
      linked: c.sameComplex.linked, count: c.sameComplex.count, median: c.sameComplex.median,
      groups: c.sameComplex.groups.map((g) => [g.mine, g.areas, g.count, g.latest.ym, g.latest.day, g.latest.amount]),
    },
    neighborhood: {
      linked: c.neighborhood.linked, count: c.neighborhood.count, complexCount: c.neighborhood.complexCount, median: c.neighborhood.median,
      complexes: c.neighborhood.complexes.map((g) => [g.aptSeq, g.name, g.count, g.latest.ym, g.latest.day, g.latest.amount]),
    },
  };
}
// 화면 표기 재구현 (client/src/utils/format.js와 다른 코드)
function areaText(u) {
  const whole = Math.trunc(u / 10000);
  let frac = String(u - whole * 10000).padStart(4, '0');
  while (frac.endsWith('0')) frac = frac.slice(0, -1);
  return frac ? `${whole}.${frac}` : String(whole);
}
const r2 = (u) => String(Math.round(u / 100) / 100);
function domComparisons(exp, asset) {
  const f = exp.sameFloor;
  const c = exp.sameComplex;
  const h = exp.neighborhood;
  const range = `전용 ${r2(asset.area_u - 50000)}~${r2(asset.area_u + 50000)}㎡ · 최근 12개월`;
  return {
    sameFloor: {
      cond: `같은 단지·같은 면적·${f.floorRange.widened ? '±2층 기준' : `${asset.floor}층`} · 최근 3년`,
      count: f.count ? String(f.count) : null,
      rows: f.trades.map(([ym, , floor, amount]) => `${ymText(ym)}|${floor}층|${won(amount)}`),
    },
    sameComplex: {
      cond: `${range} · 단지 전체 기준`,
      count: c.count ? String(c.count) : null,
      median: c.count ? won(c.median) : null,
      rows: c.groups.map(([mine, areas, count, ym, , amount]) =>
        [`${areas.map(areaText).join('·')}㎡`, ...(mine ? ['내 면적'] : []), ymText(ym), `${count}건`, won(amount)].join('|')),
    },
    neighborhood: {
      cond: `${range} · 우리 단지 제외`,
      count: h.count ? String(h.count) : null,
      median: h.count ? won(h.median) : null,
      complexes: h.count ? String(h.complexCount) : null,
      rows: h.complexes.map(([, name, count, ym, , amount]) => [name, ymText(ym), `${count}건`, won(amount)].join('|')),
    },
  };
}

// ---------- v3 매매 시세 재구현 (docs/butler-poc-improvement-spec.md 7.3·7.4·7.7, 기준 월 AS_OF) ----------
// 참고가: 같은 범위·기준 월 포함 최근 12개월 안의 마지막 거래. 기간 평균: 1·3·6개월, 만원 단위 반올림.
// 가격 위치 막대: min(매입가, 참고가, 최저)~max(…), 양끝 5% 여유. 매입가 제안: 취득 월 → 이전 3개월 → 6개월.
function windowTrades(list, from, to) {
  return list.filter((t) => t.ym >= from && t.ym <= to);
}
const avgWon = (list) => (list.length ? Math.round(list.reduce((s, t) => s + t.amount, 0) / list.length) * 10000 : null);
function expectedBar(range, purchase, reference) {
  if (!range.count) return { hidden: true };
  const vals = [range.min, range.max, purchase, reference].filter((v) => typeof v === 'number');
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const pad = (hi0 - lo0 || hi0 || 1) / 20;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const at = (v) => (typeof v === 'number' ? (v - lo) / (hi - lo) : null);
  return {
    hidden: false, lo, hi,
    single: range.count === 1 ? at(range.min) : null,
    band: range.count > 1 ? { from: at(range.min), to: at(range.max) } : null,
    purchase: at(purchase), reference: at(reference),
  };
}
const close = (a, b) => JSON.stringify(a, (k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v))
  === JSON.stringify(b, (k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v));

// ---------- API 비교 (v3: 건물 → 호실) ----------
const get = async (p, init) => {
  const r = await fetch(`${API}${p}`, init);
  return { status: r.status, body: await r.json() };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const health = (await get('/api/health')).body;
if (health.devFault) fail('health', `결함 주입이 켜져 있습니다 (${health.devFault})`);
const AS_OF = envValue('AS_OF') || health.asOf;
if (AS_OF !== health.asOf) fail('asOf', `env AS_OF ${AS_OF} ≠ server ${health.asOf}`);

const unitStmt = db.prepare(`SELECT u.*, b.kapt_code, h.acquisition_ym, h.purchase_price, c.sigungu_code, c.bjd_code, c.bonbun, c.bubun, c.umd_name
  FROM units u JOIN buildings b ON b.id = u.building_id JOIN unit_holdings h ON h.unit_id = u.id JOIN complexes c ON c.kapt_code = b.kapt_code
  WHERE u.id = ?`);
const fetched = new Set(db.prepare('SELECT sgg_cd || \'|\' || deal_ym AS k FROM fetch_log').all().map((r) => r.k));
const summary = {
  buildings: 0, units: 0, scopeChecked: 0, scopeTrustedSharedLot: [], valueChecked: 0, referenceChecked: 0,
  comparisonsChecked: 0, comparisonsSkipped: [], suggestionsChecked: 0, suggestionsSkipped: [],
};
// --dom 비교용 기대값 (호실 id → 재계산 결과)
const domExp = {};

const list = (await get('/api/buildings')).body;
for (const b of list.items) {
  summary.buildings++;
  const detail = (await get(`/api/buildings/${b.id}`)).body;
  if (detail.units.length !== b.unitCount) fail(`building ${b.id}`, `unitCount ${b.unitCount} ≠ units ${detail.units.length}`);
  for (const u of detail.units) {
    summary.units++;
    const w = `unit ${u.id}`;
    const row = unitStmt.get(u.id);
    const asset = { ...row }; // independentScope·expectedComparisons가 쓰는 필드: kapt_code, bjd_code, sigungu_code, bonbun, bubun, dong, area_u, floor
    const ind = independentScope(asset);
    let scope = ind.seqs;
    if (ind.shared) summary.scopeTrustedSharedLot.push(u.id);
    else summary.scopeChecked++;
    const trades = comparable(row.sigungu_code, scope, row.area_u);
    const w12 = windowTrades(trades, addMonthsYm(AS_OF, -11), AS_OF);
    const last = w12[w12.length - 1] ?? null;

    // 매매 시세 카드
    const v = (await get(`/api/units/${u.id}/value`)).body;
    if (v.status !== 'ready') { fail(w, `value status ${v.status}`); continue; }
    summary.valueChecked++;
    const expRef = last ? { value: last.amount * 10000, referenceDate: `${last.ym}${String(last.day).padStart(2, '0')}`, count: w12.length } : { value: null, referenceDate: null, count: 0 };
    // 저장된 참고가는 기록 시점의 계산이다. 기준 월이 같고 데이터가 그대로면 지금 다시 계산한 값과 같아야 한다.
    if (v.reference && v.reference.asOf === AS_OF) {
      summary.referenceChecked++;
      const got = { value: v.reference.value, referenceDate: v.reference.referenceDate, count: v.reference.count };
      if (!same(expRef, got)) fail(`${w} reference`, `expected ${JSON.stringify(expRef)} got ${JSON.stringify(got)}`);
    }
    const expAvg = [1, 3, 6].map((m) => {
      const l = windowTrades(trades, addMonthsYm(AS_OF, -(m - 1)), AS_OF);
      return { months: m, from: addMonthsYm(AS_OF, -(m - 1)), to: AS_OF, count: l.length, average: avgWon(l) };
    });
    domExp[u.id] = { asset, buildingId: b.id, ref: expRef, avg: expAvg, purchase: row.purchase_price, acquisitionYm: row.acquisition_ym };
    if (!same(expAvg, v.periodAverages)) fail(`${w} periodAverages`, `expected ${JSON.stringify(expAvg)} got ${JSON.stringify(v.periodAverages)}`);
    const amounts = w12.map((t) => t.amount * 10000);
    const expRange = amounts.length ? { count: amounts.length, min: Math.min(...amounts), max: Math.max(...amounts) } : { count: 0, min: null, max: null };
    if (!same(expRange, v.range)) fail(`${w} range`, `expected ${JSON.stringify(expRange)} got ${JSON.stringify(v.range)}`);
    const expBar = expectedBar(expRange, row.purchase_price, v.reference?.value ?? null);
    if (!close(expBar, v.bar)) fail(`${w} bar`, `expected ${JSON.stringify(expBar)} got ${JSON.stringify(v.bar)}`);
    const expRecent = w12.slice(-5).reverse().map((t) => [t.ym, t.day, t.floor, t.amount * 10000]);
    const gotRecent = v.recentTrades.map((t) => [t.ym, t.day, t.floor, t.amount]);
    if (!same(expRecent, gotRecent)) fail(`${w} recentTrades`, `expected ${JSON.stringify(expRecent)} got ${JSON.stringify(gotRecent)}`);
    if (v.reference?.value != null) {
      const diff = v.reference.value - row.purchase_price;
      const expChange = { diff, rate: pct(diff, row.purchase_price) };
      if (!same(expChange, v.change)) fail(`${w} change`, `expected ${JSON.stringify(expChange)} got ${JSON.stringify(v.change)}`);
    }

    // 비교 3가지 (기존 규칙 그대로)
    const cmp = await get(`/api/units/${u.id}/comparisons`);
    const KEYS = ['sameFloor', 'sameComplex', 'neighborhood'];
    if (cmp.status !== 200) fail(`${w} comparisons`, `status ${cmp.status}`);
    else if (KEYS.some((k) => cmp.body[k].status !== 'ready')) summary.comparisonsSkipped.push(`${u.id}:${KEYS.map((k) => cmp.body[k].status).join('/')}`);
    else {
      const exp = expectedComparisons(asset, scope, AS_OF);
      domExp[u.id].cmp = exp;
      const got = apiComparisons(cmp.body);
      for (const k of KEYS) {
        summary.comparisonsChecked++;
        if (!same(exp[k], got[k])) fail(`${w} comparisons.${k}`, `expected ${JSON.stringify(exp[k])} got ${JSON.stringify(got[k])}`);
      }
    }

    // 매입가 제안: 필요한 달이 모두 수집돼 있을 때만 확인(재계산이 외부 호출을 일으키지 않게)
    const acq = row.acquisition_ym;
    const need = Array.from({ length: 6 }, (_, i) => addMonthsYm(acq, -i));
    if (need.some((ym) => !fetched.has(`${row.sigungu_code}|${ym}`))) summary.suggestionsSkipped.push(u.id);
    else {
      summary.suggestionsChecked++;
      let exp = null;
      for (const m of [1, 3, 6]) {
        const l = windowTrades(trades, addMonthsYm(acq, -(m - 1)), acq);
        if (l.length) { exp = { months: m, from: addMonthsYm(acq, -(m - 1)), to: acq, count: l.length, average: avgWon(l) }; break; }
      }
      const s = await get('/api/purchase-suggestion', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kaptCode: row.kapt_code, dong: row.dong, areaU: row.area_u, acquisitionYm: acq }),
      });
      if (!same(exp, s.body.suggestion)) fail(`${w} suggestion`, `expected ${JSON.stringify(exp)} got ${JSON.stringify(s.body.suggestion)}`);
    }
  }
}

// ---------- v3 2단계: 계약·호실·건물 상태 (명세 7.1, 7.2, 기준 날짜 TODAY) ----------
const TODAY = envValue('TODAY') || health.today;
const dayNo = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
function expUnitStatus(leases) {
  const on = leases.find((l) => l.start_date <= TODAY && TODAY <= l.end_date);
  if (on) return dayNo(on.end_date) - dayNo(TODAY) <= 120 ? 'EXPIRING' : 'LEASED';
  return leases.some((l) => l.start_date > TODAY) ? 'MOVE_IN' : 'VACANT';
}
summary.statusChecked = 0;
for (const b of list.items) {
  const bRow = db.prepare('SELECT * FROM buildings WHERE id = ?').get(b.id);
  const units = db.prepare('SELECT id FROM units WHERE building_id = ?').all(b.id);
  const st = units.map((u) => expUnitStatus(db.prepare('SELECT * FROM leases WHERE unit_id = ?').all(u.id)));
  const expStatus = !st.length ? 'REGISTERING' : st.includes('EXPIRING') ? 'CHECK' : 'OPERATING';
  const leasedN = st.filter((s) => s === 'LEASED' || s === 'EXPIRING').length;
  const exp = { status: expStatus, occupancy: { leased: leasedN, owned: bRow.owned_unit_count, rate: leasedN / bRow.owned_unit_count } };
  summary.statusChecked++;
  if (!same(exp, { status: b.status, occupancy: b.occupancy })) fail(`building ${b.id} status`, `expected ${JSON.stringify(exp)} got ${JSON.stringify({ status: b.status, occupancy: b.occupancy })}`);
  const detail = (await get(`/api/buildings/${b.id}`)).body;
  for (const u of detail.units) {
    const e = expUnitStatus(db.prepare('SELECT * FROM leases WHERE unit_id = ?').all(u.id));
    summary.statusChecked++;
    if (u.leaseStatus !== e) fail(`unit ${u.id} leaseStatus`, `expected ${e} got ${u.leaseStatus}`);
  }
}

// ---------- v3 3단계: 전월세 원본 대조, 환산 월세, 내 건물, 주변 전월세 (명세 7.5, 7.6) ----------
const rentLogs = db.prepare('SELECT * FROM rent_fetch_log').all();
summary.rentMonths = rentLogs.length;
summary.rentRowsChecked = 0;
const rentByMonth = new Map();
for (const log of rentLogs) {
  const pages = db.prepare('SELECT body FROM rent_raw_responses WHERE sgg_cd = ? AND deal_ym = ? ORDER BY page').all(log.sgg_cd, log.deal_ym);
  const parsed = [];
  for (const p of pages) {
    for (const b of itemsOf(p.body)) {
      parsed.push({
        aptSeq: tagValue(b, 'aptSeq'), area: areaUnits(tagValue(b, 'excluUseAr')), ym: log.deal_ym,
        deposit: manwon(tagValue(b, 'deposit') || '0') * 10000, monthly: manwon(tagValue(b, 'monthlyRent') || '0') * 10000,
      });
    }
  }
  rentByMonth.set(`${log.sgg_cd}|${log.deal_ym}`, parsed);
  const rows = db.prepare('SELECT * FROM rent_transactions WHERE sgg_cd = ? AND deal_ym = ? ORDER BY src_seq').all(log.sgg_cd, log.deal_ym);
  if (rows.length !== parsed.length || rows.length !== log.total_count) fail(`rent ${log.sgg_cd}/${log.deal_ym}`, `raw ${parsed.length} db ${rows.length} total ${log.total_count}`);
  rows.forEach((r, i) => {
    summary.rentRowsChecked++;
    const p = parsed[i];
    if (!p || (p.aptSeq || null) !== r.apt_seq || p.area !== r.area_u || p.deposit !== r.deposit || p.monthly !== r.monthly_rent) {
      fail(`rent ${log.sgg_cd}/${log.deal_ym} row ${i}`, `raw ${JSON.stringify(p)} db ${JSON.stringify({ apt: r.apt_seq, area: r.area_u, dep: r.deposit, mon: r.monthly_rent })}`);
    }
  });
}
const conv = (dep, mon, rate) => Math.round(mon + (dep * rate) / 100 / 12);
summary.analysisChecked = 0;
for (const b of list.items) {
  const a = (await get(`/api/buildings/${b.id}/analysis`)).body;
  const rate = a.conversion?.rate;
  const bRow = db.prepare('SELECT b.*, c.sigungu_code, c.bjd_code, c.bonbun, c.bubun FROM buildings b JOIN complexes c USING (kapt_code) WHERE b.id = ?').get(b.id);
  const units = db.prepare('SELECT * FROM units WHERE building_id = ? ORDER BY id').all(b.id);
  const leased = units.map((u) => ({ u, l: db.prepare('SELECT * FROM leases WHERE unit_id = ?').all(u.id).find((l) => l.start_date <= TODAY && TODAY <= l.end_date) })).filter((x) => x.l);
  let expMetrics = null;
  if (leased.length) {
    const c = leased.map(({ l }) => conv(l.deposit, l.monthly_rent, rate));
    const sqm = leased.map(({ u }) => u.area_u / 10000);
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expMetrics = {
      count: leased.length, averageMonthlyRent: Math.round(avg(leased.map((x) => x.l.monthly_rent))), averageDeposit: Math.round(avg(leased.map((x) => x.l.deposit))),
      averageConverted: Number.isFinite(rate) ? Math.round(avg(c)) : null, averageAreaSqm: Math.round(avg(sqm) * 10) / 10,
      convertedPerSqm: Number.isFinite(rate) ? Math.round(c.reduce((s, x) => s + x, 0) / sqm.reduce((s, x) => s + x, 0)) : null,
    };
  }
  summary.analysisChecked++;
  for (const u of units) if (domExp[u.id]) Object.assign(domExp[u.id], { metrics: expMetrics, rate });
  if (!same({ leasedUnits: leased.length, metrics: expMetrics }, a.myBuilding)) fail(`building ${b.id} myBuilding`, `expected ${JSON.stringify({ leasedUnits: leased.length, metrics: expMetrics })} got ${JSON.stringify(a.myBuilding)}`);

  // 주변 전월세: 같은 단지(지번 연결 집합)·±5㎡·6→12개월·3건
  for (const u of units) {
    const n = (await get(`/api/buildings/${b.id}/analysis?unit=${u.id}`)).body.nearby;
    if (!n || n.status !== 'ready') continue;
    const link = lotSeqs({ ...bRow });
    const all = [];
    for (const [k, list2] of rentByMonth) if (k.startsWith(`${bRow.sigungu_code}|`)) for (const r of list2) if (link.has(r.aptSeq) && Math.abs(r.area - u.area_u) <= 50000) all.push(r);
    let exp = null;
    for (const m of [6, 12]) {
      const from = addMonthsYm(AS_OF, -(m - 1));
      const l = all.filter((r) => r.ym >= from && r.ym <= AS_OF);
      if (l.length >= 3) {
        const c = l.map((r) => conv(r.deposit, r.monthly, rate));
        exp = { enough: true, months: m, count: c.length, average: Math.round(c.reduce((s, x) => s + x, 0) / c.length), min: Math.min(...c), max: Math.max(...c) };
        break;
      }
    }
    if (!exp) exp = { enough: false, count12: all.filter((r) => r.ym >= addMonthsYm(AS_OF, -11) && r.ym <= AS_OF).length };
    const got = exp.enough ? { enough: n.enough, months: n.months, count: n.count, average: n.average, min: n.min, max: n.max } : { enough: n.enough, count12: n.count12 };
    summary.analysisChecked++;
    if (domExp[u.id]) domExp[u.id].nearby = exp;
    if (!same(exp, got)) fail(`unit ${u.id} nearby`, `expected ${JSON.stringify(exp)} got ${JSON.stringify(got)}`);
  }
}

// ---------- 화면 값 비교 (--dom verify/out/dom.json, 추출은 verify/dom-extract.js) ----------
// 원 단위 금액 표기 재구현 (client/src/ui/format.js와 다른 코드): 12억 5,000만원 / 99만 7,403원 / 0원
function wonText(v) {
  if (v === 0) return '0원';
  const g = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const eok = Math.trunc(v / 1e8);
  const man = Math.trunc((v - eok * 1e8) / 1e4);
  const rest = v - eok * 1e8 - man * 1e4;
  return `${[eok ? `${g(eok)}억` : '', man ? `${g(man)}만` : '', rest ? g(rest) : ''].filter(Boolean).join(' ')}원`;
}
const dateText = (d) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
const DOM = arg('--dom', null);
if (DOM) {
  const dom = JSON.parse(fs.readFileSync(path.resolve(DOM), 'utf8'));
  summary.domValuesChecked = 0;
  const check = (where, exp, got) => {
    summary.domValuesChecked++;
    if (exp !== got) fail(`dom ${where}`, `expected ${JSON.stringify(exp)} got ${JSON.stringify(got)}`);
  };
  if (dom.asOf !== AS_OF) fail('dom', `asOf ${dom.asOf} ≠ ${AS_OF}`);
  for (const [id, e] of Object.entries(domExp)) {
    const d = dom.units[id];
    if (!d) { fail(`dom unit ${id}`, '화면 값이 없습니다'); continue; }
    // 호실 상세
    check(`unit ${id} purchase`, wonText(e.purchase), d.unit.purchase);
    check(`unit ${id} acquisition`, ymText(e.acquisitionYm), d.unit.acquisition);
    if (e.ref.value != null) {
      check(`unit ${id} reference`, wonText(e.ref.value), d.unit.reference);
      check(`unit ${id} reference-date`, dateText(e.ref.referenceDate), d.unit['reference-date']);
    }
    const shown = (await get(`/api/units/${id}`)).body.unit.lease;
    if (shown) {
      const l = db.prepare('SELECT * FROM leases WHERE id = ?').get(shown.id);
      check(`unit ${id} deposit`, wonText(l.deposit), d.unit.deposit);
      check(`unit ${id} rent`, l.lease_type === 'JEONSE' ? '전세' : wonText(l.monthly_rent), d.unit.rent);
      if (Number.isFinite(e.rate)) check(`unit ${id} converted`, wonText(conv(l.deposit, l.monthly_rent, e.rate)), d.unit.converted);
    }
    // 매매 시세 카드
    if (e.ref.value != null) {
      check(`unit ${id} sale reference`, wonText(e.ref.value), d.sale.reference);
      check(`unit ${id} sale basis`, `기준일 ${dateText(e.ref.referenceDate)} · 같은 단지·같은 면적 최근 거래 ${e.ref.count}건 기준`, d.sale.basis);
    }
    check(`unit ${id} sale purchase`, wonText(e.purchase), d.sale.purchase);
    for (const p of e.avg) check(`unit ${id} avg-${p.months}`, p.count ? `${wonText(p.average)} (${p.count}건)` : '거래 없음', d.sale[`avg-${p.months}`]);
    // 비교 3가지
    if (e.cmp) {
      const exp = domComparisons(e.cmp, e.asset);
      for (const k of ['sameFloor', 'sameComplex', 'neighborhood']) {
        for (const f of ['cond', 'count', 'median', 'complexes']) if (f in exp[k]) check(`unit ${id} ${k}.${f}`, exp[k][f], d.comparisons[k][f]);
        check(`unit ${id} ${k}.rows`, JSON.stringify(exp[k].rows), JSON.stringify(d.comparisons[k].rows));
      }
    }
    // 내 건물
    const m = e.metrics;
    if (m) {
      check(`unit ${id} my avg-rent`, wonText(m.averageMonthlyRent), d.myBuilding['avg-rent']);
      check(`unit ${id} my avg-deposit`, wonText(m.averageDeposit), d.myBuilding['avg-deposit']);
      check(`unit ${id} my avg-area`, `${m.averageAreaSqm.toFixed(1)}㎡`, d.myBuilding['avg-area']);
      if (m.averageConverted != null) check(`unit ${id} my avg-converted`, wonText(m.averageConverted), d.myBuilding['avg-converted']);
      if (m.convertedPerSqm != null) check(`unit ${id} my per-sqm`, `${String(m.convertedPerSqm).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`, d.myBuilding['per-sqm']);
    }
    // 주변 전월세
    const n = e.nearby;
    if (n?.enough) {
      check(`unit ${id} nearby avg`, wonText(n.average), d.nearby.avg);
      check(`unit ${id} nearby range`, `${wonText(n.min)} ~ ${wonText(n.max)}`, d.nearby.range);
      check(`unit ${id} nearby count`, `최근 ${n.months}개월 ${n.count}건`, d.nearby.count);
    }
  }
}

const result = {
  db: DB_PATH,
  asOf: health.asOf,
  months: logs.length,
  rowsChecked: checkedRows,
  countMismatches,
  rowMismatches,
  ...summary,
  mismatches: problems.length,
  problems,
};
console.log(JSON.stringify(result, null, 2));
process.exit(problems.length ? 1 : 0);
