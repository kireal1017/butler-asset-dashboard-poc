// M0 probe: verifies the chain kaptCode → 지번 → aptSeq → 건축물대장(동·호) → 면적·층 → 같은 단지·같은 면적 거래
// for 하계동 complexes, picks golden case A, and writes key-free fixtures.
// Usage: node scripts/m0-probe.mjs [--refresh]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = readKey();
const CACHE_DIR = path.join(os.homedir(), '.butler-poc', 'm0-cache');
const FIXTURE_DIR = path.join(ROOT, 'server', 'test', 'fixtures');
const REFRESH = process.argv.includes('--refresh');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(FIXTURE_DIR, { recursive: true });

const SGG = '11350';
const BJDONG = '10400'; // 하계동
const UMD_NM = '하계동';
const TARGETS = ['A13987303', 'A13987306', 'A13987304', 'A13993501', 'A13923103', 'A13993503'];
const GOLDEN_MONTHS = ['201607', '201608', '201609', '201610'];
const RECENT_MONTHS = monthsBack('202609', 12);

const calls = { rtms: 0, aptList: 0, aptBasis: 0, bldRgst: 0 };

function readKey() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = env.match(/^DATA_GO_KR_SERVICE_KEY=(.*)$/m);
  if (!m) throw new Error('DATA_GO_KR_SERVICE_KEY missing in .env');
  return m[1].trim().replace(/^"|"$/g, '');
}

const mask = (s) => String(s).split(KEY).join('[KEY]').split(encodeURIComponent(KEY)).join('[KEY]');

function monthsBack(fromYm, n) {
  const out = [];
  let y = Number(fromYm.slice(0, 4));
  let m = Number(fromYm.slice(4));
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}${String(m).padStart(2, '0')}`);
    if (--m === 0) { m = 12; y--; }
  }
  return out;
}

async function call(kind, base, params, keyName = 'serviceKey') {
  const qs = new URLSearchParams({ [keyName]: KEY, ...params });
  const cacheId = crypto.createHash('sha1').update(base + JSON.stringify(params)).digest('hex');
  const cacheFile = path.join(CACHE_DIR, `${kind}-${cacheId}.txt`);
  if (!REFRESH && fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf8');
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, attempt * 1500));
    try {
      calls[kind]++;
      const res = await fetch(`${base}?${qs}`);
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      if (/SERVICE_KEY_IS_NOT_REGISTERED|LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(body)) {
        throw new Error(`API auth/quota error: ${body.slice(0, 300)}`);
      }
      fs.writeFileSync(cacheFile, body);
      return body;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(mask(`${kind} ${base} failed: ${lastErr.message}`));
}

// ---- RTMS (상세) ----
function parseRtmsItems(xml) {
  const items = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const it = {};
    for (const [, k, v] of block.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) it[k] = v.trim();
    items.push(it);
  }
  const total = Number((xml.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] || 0);
  return { items, total };
}

async function fetchRtmsMonth(ym) {
  const base = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
  const pages = [];
  let page = 1;
  let all = [];
  let total = 0;
  do {
    const xml = await call('rtms', base, { LAWD_CD: SGG, DEAL_YMD: ym, numOfRows: '1000', pageNo: String(page) });
    const parsed = parseRtmsItems(xml);
    total = parsed.total;
    pages.push(xml);
    all = all.concat(parsed.items.map((it, i) => ({ ...it, _ym: ym, _page: page, _idx: i })));
    page++;
  } while (all.length < total);
  if (all.length !== total) throw new Error(`RTMS ${ym}: got ${all.length} of ${total}`);
  return { items: all, total, pages };
}

// ---- K-APT ----
async function fetchSeoulList() {
  const body = await call('aptList', 'https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4',
    { sidoCode: '11', numOfRows: '4000', pageNo: '1' });
  return JSON.parse(body).response.body;
}

async function fetchBasis(kaptCode) {
  const body = await call('aptBasis', 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5',
    { kaptCode }, 'ServiceKey');
  return JSON.parse(body).response.body.item;
}

async function fetchDetail(kaptCode) {
  const body = await call('aptBasis', 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5',
    { kaptCode }, 'ServiceKey');
  return JSON.parse(body).response.body.item;
}

// ---- 건축물대장 ----
async function fetchExpos(bun, ji, extra = {}, rows = 100) {
  const body = await call('bldRgst', 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo', {
    sigunguCd: SGG, bjdongCd: BJDONG, platGbCd: '0',
    bun: String(bun).padStart(4, '0'), ji: String(ji).padStart(4, '0'),
    numOfRows: String(rows), pageNo: '1', _type: 'json', ...extra,
  });
  const b = JSON.parse(body).response.body;
  return { total: Number(b.totalCount), items: [].concat(b.items?.item || []) };
}

const VARIANTS = [(d, h) => [`${d}동`, h], (d, h) => [d, h], (d, h) => [`${d}동`, `${h}호`], (d, h) => [d, `${h}호`]];

async function lookupUnit(bun, ji, dong, ho, onlyVariant = null) {
  const order = onlyVariant === null ? VARIANTS.map((_, i) => i) : [onlyVariant];
  for (const vi of order) {
    const [dongNm, hoNm] = VARIANTS[vi](dong, ho);
    const r = await fetchExpos(bun, ji, { dongNm, hoNm }, 30);
    const own = r.items.find((x) => x.exposPubuseGbCdNm === '전유');
    if (own) return { dongNm, hoNm, variant: vi, area: own.area, floor: own.flrNo, flrNoNm: own.flrNoNm };
  }
  return null;
}

// ---- 7.1 helpers ----
function parseJibun(kaptAddr) {
  const m = kaptAddr.match(new RegExp(`${UMD_NM}\\s+(\\d+)(?:-(\\d+))?`));
  return m ? { bonbun: Number(m[1]), bubun: Number(m[2] || 0) } : null;
}

const normalizeName = (s) => s
  .replace(/\s+/g, '').replace(/아파트/g, '').replace(/\([^)]*\)/g, '')
  .replace(new RegExp(`^${UMD_NM.replace('동', '')}`), '')
  .replace(/(\d+)차?$/, (_, n) => (n === '1' ? '' : `${n}차`));

const areaU = (s) => {
  const [i, f = ''] = String(s).split('.');
  return Number(i) * 10000 + Number((f + '0000').slice(0, 4));
};
const decimals = (s) => (String(s).split('.')[1] || '').length;

// ---- main ----
const out = { complexes: [], golden: null, facts: {} };

const list = await fetchSeoulList();
out.facts.seoulComplexTotal = list.totalCount;
out.facts.seoulComplexItems = list.items.length;
const hagye = list.items.filter((x) => x.as3 === UMD_NM);

const months = {};
for (const ym of [...GOLDEN_MONTHS, ...RECENT_MONTHS]) months[ym] = await fetchRtmsMonth(ym);
const allTrades = Object.values(months).flatMap((m) => m.items);
const hagyeTrades = allTrades.filter((t) => t.umdNm === UMD_NM);

// response-order stability: compare cached page vs. a fresh call for 2016-10 page 1
if (REFRESH || !fs.existsSync(path.join(CACHE_DIR, 'order-check.json'))) {
  const base = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
  const params = { LAWD_CD: SGG, DEAL_YMD: '201610', numOfRows: '1000', pageNo: '1' };
  calls.rtms++;
  const fresh = await (await fetch(`${base}?${new URLSearchParams({ serviceKey: KEY, ...params })}`)).text();
  const sig = (xml) => parseRtmsItems(xml).items.map((t) => [t.aptSeq, t.dealDay, t.floor, t.dealAmount].join('|'));
  const a = sig(months['201610'].pages[0]);
  const b = sig(fresh);
  fs.writeFileSync(path.join(CACHE_DIR, 'order-check.json'),
    JSON.stringify({ sameOrder: a.join() === b.join(), sameSet: [...a].sort().join() === [...b].sort().join() }));
}
out.facts.responseOrder = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, 'order-check.json'), 'utf8'));

// decimals of areas
out.facts.maxRtmsAreaDecimals = Math.max(...allTrades.map((t) => decimals(t.excluUseAr)));

// RTMS complexes in 하계동 keyed by aptSeq
const rtmsComplexes = new Map();
for (const t of hagyeTrades) {
  if (!rtmsComplexes.has(t.aptSeq)) {
    rtmsComplexes.set(t.aptSeq, { aptSeq: t.aptSeq, aptNm: t.aptNm, bonbun: Number(t.bonbun), bubun: Number(t.bubun), umdCd: t.umdCd });
  }
}

let maxBldDecimals = 0;
for (const kaptCode of TARGETS) {
  const k = hagye.find((x) => x.kaptCode === kaptCode);
  const basis = await fetchBasis(kaptCode);
  const jibun = parseJibun(basis.kaptAddr);
  const entry = { kaptCode, kaptName: k?.kaptName ?? basis.kaptName, kaptAddr: basis.kaptAddr, jibun, steps: {} };
  out.complexes.push(entry);
  if (!jibun) { entry.failure = 'kaptAddr에서 지번 파싱 실패'; continue; }

  // step: 지번 → aptSeq set, then name rule if several K-APT complexes share the lot
  let seqs = [...rtmsComplexes.values()].filter((c) => c.bonbun === jibun.bonbun && c.bubun === jibun.bubun);
  const siblings = [];
  for (const other of hagye) {
    if (other.kaptCode === kaptCode) continue;
    const ob = await fetchBasis(other.kaptCode);
    if (ob && JSON.stringify(parseJibun(ob.kaptAddr)) === JSON.stringify(jibun)) siblings.push(other);
  }
  if (siblings.length) {
    const mine = normalizeName(entry.kaptName);
    const matched = seqs.filter((c) => normalizeName(c.aptNm) === mine);
    const reverseOk = matched.every((c) => [entry, ...siblings.map((s) => ({ kaptName: s.kaptName }))]
      .filter((x) => normalizeName(x.kaptName) === normalizeName(c.aptNm)).length === 1);
    entry.steps.sharedLot = { siblings: siblings.map((s) => s.kaptName), normalized: mine, matched: matched.map((c) => c.aptNm) };
    seqs = matched.length === 1 && reverseOk ? matched : [];
  }
  entry.steps.aptSeqs = seqs.map((c) => `${c.aptSeq}(${c.aptNm})`);
  if (!seqs.length) { entry.failure = '지번/이름으로 실거래 단지 연결 실패'; continue; }

  // step: 대장 — sample units on the lot, then look one up by 동·호
  const sample = await fetchExpos(jibun.bonbun, jibun.bubun, {}, 100);
  const unit = sample.items.find((x) => x.exposPubuseGbCdNm === '전유' && /아파트/.test(x.etcPurps || x.mainPurpsCdNm || ''));
  entry.steps.registerRows = sample.total;
  if (!unit) { entry.failure = '건축물대장 전유부 없음'; continue; }
  const dong = String(unit.dongNm).replace(/동$/, '').trim();
  const ho = String(unit.hoNm).replace(/호$/, '').trim();
  const looked = await lookupUnit(jibun.bonbun, jibun.bubun, dong, ho);
  if (!looked) { entry.failure = `동·호 조회 실패 (${unit.dongNm} ${unit.hoNm})`; continue; }
  maxBldDecimals = Math.max(maxBldDecimals, decimals(looked.area));
  entry.steps.unit = { input: `${dong}동 ${ho}호`, ...looked };

  // step: same complex, same area trades (|Δ| ≤ 0.1㎡), not cancelled
  const setSeq = new Set(seqs.map((c) => c.aptSeq));
  const same = hagyeTrades.filter((t) => setSeq.has(t.aptSeq) && Math.abs(areaU(t.excluUseAr) - areaU(looked.area)) <= 1000);
  entry.steps.sameAreaTrades = same
    .filter((t) => t.cdealType !== 'O')
    .map((t) => `${t.dealYear}.${t.dealMonth.padStart(2, '0')}.${t.dealDay.padStart(2, '0')} ${t.floor}층 ${t.excluUseAr}㎡ ${t.dealAmount}만 ${t.aptDong || '-'}`);
  entry.steps.cancelledSameArea = same.filter((t) => t.cdealType === 'O').length;
  entry.ok = true;
}
out.facts.maxBldAreaDecimals = maxBldDecimals;


// ---- golden case A: 2016-07~10, non-cancelled, linked complex, unit exists with same floor/area ----
// 동 → aptSeq map learned from trades that carry aptDong (one K-APT complex can hold several RTMS complexes)
const dongOwners = new Map();
for (const t of hagyeTrades) {
  if (!t.aptDong) continue;
  const k = `${t.aptSeq}|${t.aptDong}`;
  dongOwners.set(k, (dongOwners.get(k) || 0) + 1);
}
const dongsOf = (aptSeq) => [...dongOwners.keys()].filter((k) => k.startsWith(`${aptSeq}|`)).map((k) => k.split('|')[1]);
out.facts.dongMap = Object.fromEntries([...new Set(hagyeTrades.map((t) => t.aptSeq))]
  .map((s) => [s, dongsOf(s).sort((a, b) => Number(a) - Number(b)).join(',')]).filter(([, v]) => v));

const linked = out.complexes.filter((c) => c.ok);
const GOLDEN_CALL_BUDGET = 80;
const goldenStart = calls.bldRgst;
for (const c of linked) {
  if (out.golden) break;
  const seqs = new Set(c.steps.aptSeqs.map((s) => s.split('(')[0]));
  const cands = hagyeTrades.filter((t) => GOLDEN_MONTHS.includes(t._ym) && seqs.has(t.aptSeq) && t.cdealType !== 'O');
  for (const t of cands) {
    const floor = Number(t.floor);
    if (floor < 2) continue;
    if (calls.bldRgst - goldenStart > GOLDEN_CALL_BUDGET) break;
    // only dongs that recent trades attribute to this trade's aptSeq
    for (const dong of dongsOf(t.aptSeq).slice(0, 3)) {
      for (const line of ['01', '02', '03', '04']) {
        const u = await lookupUnit(c.jibun.bonbun, c.jibun.bubun, dong, `${floor}${line}`, c.steps.unit.variant);
        if (u && Number(u.floor) === floor && Math.abs(areaU(u.area) - areaU(t.excluUseAr)) <= 1000) {
          out.golden = {
            kaptCode: c.kaptCode, kaptName: c.kaptName, dong, ho: `${floor}${line}`, dongOwnerAptSeq: t.aptSeq,
            area: u.area, floor, acquisitionYm: '201610',
            expectedTrade: {
              aptSeq: t.aptSeq, aptNm: t.aptNm, dealYmd: `${t.dealYear}${t.dealMonth.padStart(2, '0')}${t.dealDay.padStart(2, '0')}`,
              floor: t.floor, excluUseAr: t.excluUseAr, dealAmount: Number(t.dealAmount.replace(/,/g, '')), aptDong: t.aptDong || null,
            },
          };
          break;
        }
      }
      if (out.golden) break;
    }
    if (out.golden) break;
  }
}

// ---- edge-case search in stored 노원 months ----
const nowon = allTrades;
const byKey = new Map();
for (const t of nowon) {
  const k = [t.aptSeq, t._ym, t.dealDay, t.floor, t.excluUseAr, t.dealAmount, t.aptDong].join('|');
  byKey.set(k, (byKey.get(k) || 0) + 1);
}
out.facts.identicalDuplicateGroups = [...byKey.values()].filter((n) => n > 1).length;
const sameDayMulti = new Map();
for (const t of nowon) {
  const k = [t.aptSeq, t._ym, t.dealDay, t.excluUseAr].join('|');
  sameDayMulti.set(k, (sameDayMulti.get(k) || 0) + 1);
}
out.facts.sameDaySameAreaGroups = [...sameDayMulti.values()].filter((n) => n > 1).length;
out.facts.cancelledTrades = nowon.filter((t) => t.cdealType === 'O').length;
const areasBySeq = new Map();
for (const t of nowon) {
  if (!areasBySeq.has(t.aptSeq)) areasBySeq.set(t.aptSeq, new Set());
  areasBySeq.get(t.aptSeq).add(areaU(t.excluUseAr));
}
let boundaryPairs = 0;
for (const set of areasBySeq.values()) {
  const arr = [...set].sort((a, b) => a - b);
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const d = arr[j] - arr[i];
    if (d >= 900 && d <= 1100) boundaryPairs++;
  }
}
out.facts.areaPairsNearTolerance = boundaryPairs;
out.facts.directTrades2016 = nowon.filter((t) => t._ym.startsWith('2016') && t.dealingGbn === '직거래').length;
out.facts.directTradesRecent = nowon.filter((t) => !t._ym.startsWith('2016') && t.dealingGbn === '직거래').length;
out.facts.emptyDong2016 = nowon.filter((t) => t._ym.startsWith('2016') && !t.aptDong).length + '/' + nowon.filter((t) => t._ym.startsWith('2016')).length;
out.facts.emptyDongRecent = nowon.filter((t) => !t._ym.startsWith('2016') && !t.aptDong).length + '/' + nowon.filter((t) => !t._ym.startsWith('2016')).length;
out.facts.monthTotals = Object.fromEntries(Object.entries(months).map(([ym, m]) => [ym, m.total]));

// parking fields (P9)
const detail = await fetchDetail(TARGETS[0]);
out.facts.detailParkingFields = Object.fromEntries(Object.entries(detail || {}).filter(([k]) => /pcnt|park/i.test(k)));

// ---- fixtures (key-free, 하계동 only) ----
writeFixture('rtms-11350-201610-hagye.json', {
  note: 'RTMSDataSvcAptTradeDev 노원구 2016-10, 하계동 행만 추출. totalCount는 원본(노원구 전체) 값.',
  totalCount: months['201610'].total, items: months['201610'].items.filter((t) => t.umdNm === UMD_NM),
});
writeFixture('rtms-11350-recent-hagye.json', {
  note: `RTMSDataSvcAptTradeDev 노원구 ${RECENT_MONTHS[0]}~${RECENT_MONTHS.at(-1)}, 하계동 행만.`,
  items: RECENT_MONTHS.flatMap((ym) => months[ym].items.filter((t) => t.umdNm === UMD_NM)),
});
writeFixture('rtms-11350-201610-page1.xml', months['201610'].pages[0]);
writeFixture('aptlist-seoul-hagye.json', { totalCount: list.totalCount, items: hagye });
for (const c of out.complexes) writeFixture(`aptbasis-${c.kaptCode}.json`, await fetchBasis(c.kaptCode));
if (out.golden) {
  const g = out.complexes.find((c) => c.kaptCode === out.golden.kaptCode);
  const u = await fetchExpos(g.jibun.bonbun, g.jibun.bubun, { dongNm: `${out.golden.dong}동`, hoNm: out.golden.ho }, 30);
  writeFixture('bldrgst-golden-unit.json', u);
}

function writeFixture(name, data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (text.includes(KEY) || text.includes(encodeURIComponent(KEY))) throw new Error(`fixture ${name} contains key`);
  fs.writeFileSync(path.join(FIXTURE_DIR, name), text);
}

fs.mkdirSync(path.join(ROOT, 'verify'), { recursive: true });
if (out.golden) fs.writeFileSync(path.join(ROOT, 'verify', 'golden-case-a.json'), JSON.stringify(out.golden, null, 2));

// ---- report ----
console.log(mask(JSON.stringify({ ...out, calls }, null, 2)));
const okCount = out.complexes.filter((c) => c.ok).length;
console.error(`\n[m0] linked complexes: ${okCount}/${out.complexes.length}, golden: ${out.golden ? 'yes' : 'NO'}, calls: ${JSON.stringify(calls)}`);
process.exit(okCount >= 3 && out.golden ? 0 : 1);
