// AC-V1 독립 재계산. 앱 코드(server/, client/)를 import하지 않는다 (verify/check-imports.mjs가 강제).
// 1) 저장된 원본 응답(raw_responses)을 이 파일의 파서로 다시 읽어 trades·fetch_log와 대조한다.
// 2) PRD 7장 문장대로 현재가·증감·최근 거래·월별 시계열을 다시 계산해 서버 API 응답과 비교한다.
// 3) --dom <file>: 화면에서 추출한 값(verify/dom-extract.js 결과)과도 비교한다.
// 4) 개선 v2 비교 근거 3섹션(같은 층·같은 단지·같은 법정동)을 명세 문장대로 다시 계산해 API·화면과 비교한다.
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
const DOM_FILE = arg('--dom', null);

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

// ---------- API 비교 ----------
const get = async (p) => {
  const r = await fetch(`${API}${p}`);
  return { status: r.status, body: await r.json() };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const health = (await get('/api/health')).body;
if (health.devFault) fail('health', `결함 주입이 켜져 있습니다 (${health.devFault})`);
const list = (await get('/api/assets')).body;
const AS_OF = envValue('AS_OF') || health.asOf;
if (AS_OF !== health.asOf) fail('asOf', `env AS_OF ${AS_OF} ≠ server ${health.asOf}`);
const assetRow = db.prepare('SELECT a.*, c.sigungu_code, c.bjd_code, c.bonbun, c.bubun, c.umd_name FROM assets a JOIN complexes c USING (kapt_code) WHERE a.id = ?');
const summary = { assets: 0, seriesChecked: 0, seriesSkipped: [], comparisonsChecked: 0, domChecked: 0, scopeChecked: 0, scopeTrustedSharedLot: [] };
const expectedForDom = {};

for (const item of list.items) {
  summary.assets++;
  const w = `asset ${item.id}`;
  const detail = (await get(`/api/assets/${item.id}`)).body;
  const asset = assetRow.get(item.id);
  const sgg = asset.sigungu_code;
  const ind = independentScope(asset);
  const apiScope = [...detail.scope.aptSeqs].sort();
  let scope = ind.seqs;
  if (ind.shared) {
    summary.scopeTrustedSharedLot.push(item.id);
    if (!apiScope.every((s) => ind.seqs.includes(s))) fail(w, `scope ${apiScope} not within lot ${ind.seqs}`);
    scope = apiScope;
  } else {
    summary.scopeChecked++;
    if (!same(apiScope, ind.seqs)) fail(w, `scope expected ${ind.seqs} got ${apiScope}`);
  }
  if (item.areaU !== asset.area_u) fail(w, `area api ${item.areaU} ≠ db ${asset.area_u}`);
  const trades = comparable(sgg, scope, asset.area_u);
  const last = trades[trades.length - 1];
  const expCurrent = last ? { amount: last.amount, ym: last.ym, day: last.day, direct: last.direct } : null;
  const gotCurrent = item.current ? { amount: item.current.amount, ym: item.current.ym, day: item.current.day, direct: item.current.direct } : null;
  if (!same(expCurrent, gotCurrent)) fail(w, `current expected ${JSON.stringify(expCurrent)} got ${JSON.stringify(gotCurrent)}`);
  const expChange = expectedChange(trades, asset.purchase_price ?? null);
  if (!same(expChange, item.change)) fail(w, `change expected ${JSON.stringify(expChange)} got ${JSON.stringify(item.change)}`);
  const expRecent = trades.slice(-5).reverse().map((t) => [t.ym, t.day, t.floor, t.amount]);
  const gotRecent = detail.recentTrades.map((t) => [t.ym, t.day, t.floor, t.amount]);
  if (!same(expRecent, gotRecent)) fail(w, `recent expected ${JSON.stringify(expRecent)} got ${JSON.stringify(gotRecent)}`);

  const expRanges = ['1y', '3y', '5y', '10y', ...(asset.purchase_price ? ['hold'] : [])];
  if (!same(expRanges, detail.ranges)) fail(w, `ranges expected ${expRanges} got ${detail.ranges}`);
  const series = {};
  for (const range of expRanges) {
    const r = await get(`/api/assets/${item.id}/series?range=${range}&collect=0`);
    if (r.status === 409) { summary.seriesSkipped.push(`${item.id}:${range}`); continue; }
    const from = independentFrom(range, AS_OF, asset);
    if (r.body.from !== from || r.body.to !== AS_OF) fail(`${w} ${range}`, `range expected ${from}~${AS_OF} got ${r.body.from}~${r.body.to}`);
    const exp = expectedSeries(trades, from, AS_OF);
    const got = r.body.points.map((p) => ({ ym: p.ym, value: p.value, trade: p.trade ? p.trade.amount : null }));
    summary.seriesChecked++;
    if (!same(exp, got)) {
      const i = exp.findIndex((e, k) => !same(e, got[k]));
      fail(`${w} ${range}`, `series differs at ${i}: expected ${JSON.stringify(exp[i])} got ${JSON.stringify(got[i])}`);
    }
    series[range] = exp;
  }

  const cmp = await get(`/api/assets/${item.id}/comparisons`);
  let expCompare = null;
  const KEYS = ['sameFloor', 'sameComplex', 'neighborhood'];
  if (cmp.status !== 200) fail(`${w} comparisons`, `status ${cmp.status}`);
  else if (KEYS.some((k) => cmp.body[k].status !== 'ready')) {
    fail(`${w} comparisons`, `not ready: ${KEYS.map((k) => cmp.body[k].status)}`);
  } else {
    const exp = expectedComparisons(asset, scope, AS_OF);
    const got = apiComparisons(cmp.body);
    for (const k of KEYS) {
      summary.comparisonsChecked++;
      if (!same(exp[k], got[k])) fail(`${w} comparisons.${k}`, `expected ${JSON.stringify(exp[k])} got ${JSON.stringify(got[k])}`);
    }
    if (cmp.body.neighborhood.dong !== asset.umd_name) fail(`${w} comparisons.dong`, `${cmp.body.neighborhood.dong} ≠ ${asset.umd_name}`);
    expCompare = domComparisons(exp, asset);
  }

  expectedForDom[item.id] = {
    compare: expCompare,
    currentPrice: expCurrent ? won(expCurrent.amount) : null,
    dealYm: expCurrent ? `${ymText(expCurrent.ym)} 거래` : null,
    changeAmount: expChange ? signed(expChange.diff) : null,
    changeRate: expChange ? signedRate(expChange.rate) : null,
    purchasePrice: asset.purchase_price ? won(asset.purchase_price) : null,
    recentTrades: trades.slice(-5).reverse().map((t) => `${ymText(t.ym)}|${t.floor}층|${won(t.amount)}`),
    series,
  };
}

// ---------- DOM 비교 ----------
if (DOM_FILE) {
  const dom = JSON.parse(fs.readFileSync(DOM_FILE, 'utf8'));
  for (const [id, views] of Object.entries(dom.assets ?? {})) {
    const exp = expectedForDom[id];
    if (!exp) { fail(`dom ${id}`, 'API에 없는 자산'); continue; }
    for (const [where, got] of Object.entries(views)) {
      for (const k of ['currentPrice', 'dealYm', 'changeAmount', 'changeRate', 'purchasePrice']) {
        if (got[k] === undefined) continue;
        summary.domChecked++;
        if ((got[k] ?? null) !== exp[k]) fail(`dom ${id} ${where}.${k}`, `expected ${JSON.stringify(exp[k])} got ${JSON.stringify(got[k])}`);
      }
      if (got.recentTrades) {
        summary.domChecked++;
        if (!same(got.recentTrades, exp.recentTrades)) fail(`dom ${id} ${where}.recentTrades`, `expected ${JSON.stringify(exp.recentTrades)} got ${JSON.stringify(got.recentTrades)}`);
      }
      // 개선 v2 비교 근거: 섹션별 조건·건수·중앙값·목록 문자열
      for (const [key, sec] of Object.entries(got.compare ?? {})) {
        const e = exp.compare?.[key];
        for (const [k, v] of Object.entries(sec)) {
          summary.domChecked++;
          if (!same(v ?? null, e?.[k] ?? null)) fail(`dom ${id} ${where}.compare.${key}.${k}`, `expected ${JSON.stringify(e?.[k])} got ${JSON.stringify(v)}`);
        }
      }
      // 그래프 data-series는 [ym, value, trade] 배열의 JSON을 FNV-1a로 요약해 비교한다 (dom-extract.js와 같은 함수)
      for (const [range, digest] of Object.entries(got.series ?? {})) {
        summary.domChecked++;
        const e = (exp.series[range] ?? []).map((p) => [p.ym, p.value, p.trade]);
        const expDigest = `${e.length}:${fnv1a(JSON.stringify(e))}`;
        if (digest !== expDigest) fail(`dom ${id} ${where}.series.${range}`, `chart data-series ${digest} ≠ recompute ${expDigest}`);
      }
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
