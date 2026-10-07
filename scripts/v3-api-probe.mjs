// v3 외부 API 실측 (실행 계획 0단계, G1). 인증키는 출력하지 않는다(오류 메시지에서도 가림).
// 대상: 아파트 전월세 실거래가, 건축HUB 표제부·총괄표제부, R-ONE(전월세전환율).
// 사용: node scripts/v3-api-probe.mjs [--rone-search 전월세전환율]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.DATA_GO_KR_SERVICE_KEY;
const RONE = env.RONE_API_KEY;
const secrets = [KEY, RONE, KEY && encodeURIComponent(KEY), RONE && encodeURIComponent(RONE)].filter(Boolean);
const mask = (s) => secrets.reduce((acc, k) => acc.split(k).join('***'), String(s));
const out = (...a) => console.log(mask(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')));

async function get(url, params) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${url}?${qs}`);
  const text = await res.text();
  return { status: res.status, text };
}

// ---------- 1. 아파트 전월세 실거래가 ----------
async function rent() {
  out('\n[1] 아파트 전월세 실거래가 RTMSDataSvcAptRent');
  const r = await get('https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
    { serviceKey: KEY, LAWD_CD: '11350', DEAL_YMD: '202609', pageNo: '1', numOfRows: '1000' });
  const code = r.text.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1];
  const msg = r.text.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1];
  const total = r.text.match(/<totalCount>([^<]*)<\/totalCount>/)?.[1];
  out('  HTTP', r.status, 'resultCode', code ?? '-', 'resultMsg', msg ?? r.text.slice(0, 160));
  if (!total) return { ok: false };
  const items = [...r.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const fields = items[0] ? [...items[0].matchAll(/<([A-Za-z0-9_]+)>/g)].map((m) => m[1]) : [];
  out('  totalCount', total, '첫 페이지', items.length, '건');
  out('  필드', fields.join(', '));
  const hagye = items.filter((b) => /하계현대우성|현대우성/.test(b) || /<umdNm>하계동<\/umdNm>/.test(b));
  out('  하계동 건수', hagye.length);
  if (hagye[0]) {
    const v = (t) => hagye[0].match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1];
    out('  예시', { aptNm: v('aptNm'), excluUseAr: v('excluUseAr'), floor: v('floor'), deposit: v('deposit'), monthlyRent: v('monthlyRent'), contractType: v('contractType'), dealDay: v('dealDay') });
  }
  return { ok: code === '000' && Number(total) > 0, total: Number(total) };
}

// ---------- 2. 건축HUB 표제부·총괄표제부 ----------
async function title() {
  out('\n[2] 건축HUB 표제부 getBrTitleInfo (하계동 270, 하계현대우성)');
  const p = { serviceKey: KEY, sigunguCd: '11350', bjdongCd: '10400', platGbCd: '0', bun: '0270', ji: '0000', _type: 'json', numOfRows: '100', pageNo: '1' };
  const r = await get('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo', p);
  let body;
  try { body = JSON.parse(r.text); } catch { out('  HTTP', r.status, '응답(앞부분)', r.text.slice(0, 200)); return { ok: false }; }
  const header = body.response?.header ?? {};
  const items = [].concat(body.response?.body?.items?.item ?? []);
  out('  HTTP', r.status, 'resultCode', header.resultCode, 'resultMsg', header.resultMsg, 'totalCount', body.response?.body?.totalCount);
  const rows = items.map((it) => ({ dongNm: it.dongNm, mainPurpsCdNm: it.mainPurpsCdNm, grndFlrCnt: it.grndFlrCnt, ugrndFlrCnt: it.ugrndFlrCnt, strctCdNm: it.strctCdNm, useAprDay: it.useAprDay, hhldCnt: it.hhldCnt, totArea: it.totArea }));
  for (const row of rows.slice(0, 12)) out('  ', row);
  const apt = rows.filter((x) => /공동주택|아파트/.test(x.mainPurpsCdNm ?? ''));
  const top = apt.sort((a, b) => Number(b.grndFlrCnt) - Number(a.grndFlrCnt))[0];
  out('  공동주택 줄', apt.length, '개, 지상 층수 최대 줄', top ?? '-');
  out('  주차 관련 필드', items[0] ? Object.keys(items[0]).filter((k) => /Park|park|Utcnt|Autocnt|indr|oudr/i.test(k)).join(', ') : '-');

  out('\n[2-1] 건축HUB 총괄표제부 getBrRecapTitleInfo');
  const r2 = await get('https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo', p);
  try {
    const b2 = JSON.parse(r2.text);
    const it2 = [].concat(b2.response?.body?.items?.item ?? []);
    out('  HTTP', r2.status, 'resultCode', b2.response?.header?.resultCode, 'totalCount', b2.response?.body?.totalCount);
    for (const it of it2.slice(0, 3)) out('  ', { bldNm: it.bldNm, mainPurpsCdNm: it.mainPurpsCdNm, hhldCnt: it.hhldCnt, totArea: it.totArea, useAprDay: it.useAprDay, totPkngCnt: it.totPkngCnt, indrAutoUtcnt: it.indrAutoUtcnt, oudrAutoUtcnt: it.oudrAutoUtcnt });
  } catch { out('  HTTP', r2.status, r2.text.slice(0, 200)); }
  return { ok: header.resultCode === '00' && apt.length > 0, topFloors: top?.grndFlrCnt };
}

// ---------- 3. R-ONE ----------
const RONE_BASE = 'https://www.reb.or.kr/r-one/openapi';
async function rone() {
  out('\n[3] R-ONE 통계표 검색 SttsApiTbl.do');
  const found = [];
  // 한 번에 1,000건을 요청하면 서버가 연결을 끊는다(2026-10-08 실측) → 100건씩
  for (let page = 1; page <= 20; page++) {
    const r = await get(`${RONE_BASE}/SttsApiTbl.do`, { KEY: RONE, Type: 'json', pIndex: String(page), pSize: '100' });
    let body;
    try { body = JSON.parse(r.text); } catch { out('  HTTP', r.status, '응답(앞부분)', r.text.slice(0, 300)); return { ok: false }; }
    const root = body.SttsApiTbl;
    if (!Array.isArray(root)) { out('  응답', JSON.stringify(body).slice(0, 300)); return { ok: false }; }
    const head = root[0]?.head ?? [];
    const rows = root[1]?.row ?? [];
    if (page === 1) out('  head', head);
    for (const row of rows) if (/전월세\s*전환율|전월세전환율/.test(row.STATBL_NM ?? '')) found.push(row);
    if (rows.length < 100) break;
  }
  out('  "전월세전환율" 통계표', found.length, '개');
  for (const f of found) out('   ', { STATBL_ID: f.STATBL_ID, STATBL_NM: f.STATBL_NM, DTACYCLE_CD: f.DTACYCLE_CD, DTACYCLE_NM: f.DTACYCLE_NM });
  if (!found.length) return { ok: false };

  // 월 주기 표 우선
  const tbl = found.find((f) => f.DTACYCLE_CD === 'MM') ?? found[0];
  out('\n[3-1] 항목 조회 SttsApiTblItm.do', tbl.STATBL_ID);
  const ri = await get(`${RONE_BASE}/SttsApiTblItm.do`, { KEY: RONE, Type: 'json', pIndex: '1', pSize: '100', STATBL_ID: tbl.STATBL_ID });
  let items = [];
  try { items = JSON.parse(ri.text).SttsApiTblItm?.[1]?.row ?? []; } catch { out('  ', ri.text.slice(0, 300)); }
  out('  항목', items.length, '개, 예시', items.slice(0, 5).map((x) => ({ ITM_ID: x.ITM_ID, ITM_NM: x.ITM_NM, CLS_ID: x.CLS_ID, CLS_NM: x.CLS_NM })));

  out('\n[3-2] 데이터 조회 SttsApiTblData.do (최근)');
  const rd = await get(`${RONE_BASE}/SttsApiTblData.do`, { KEY: RONE, Type: 'json', pIndex: '1', pSize: '100', STATBL_ID: tbl.STATBL_ID, DTACYCLE_CD: tbl.DTACYCLE_CD ?? 'MM', START_WRTTIME: '202601', END_WRTTIME: '202612' });
  let data = [];
  try {
    const b = JSON.parse(rd.text);
    data = b.SttsApiTblData?.[1]?.row ?? [];
    if (!data.length) out('  응답', JSON.stringify(b).slice(0, 300));
  } catch { out('  ', rd.text.slice(0, 300)); }
  const seoul = data.filter((d) => /서울/.test(`${d.CLS_NM ?? ''} ${d.CLS_FULLNM ?? ''}`));
  out('  행', data.length, '개, 서울 관련', seoul.length, '개');
  const latest = [...seoul].sort((a, b) => String(b.WRTTIME_IDTFR_ID).localeCompare(String(a.WRTTIME_IDTFR_ID))).slice(0, 6);
  for (const d of latest) out('   ', { WRTTIME: d.WRTTIME_IDTFR_ID, CLS_NM: d.CLS_NM, CLS_FULLNM: d.CLS_FULLNM, ITM_NM: d.ITM_NM, DTA_VAL: d.DTA_VAL, UI_NM: d.UI_NM });
  return { ok: seoul.length > 0, statblId: tbl.STATBL_ID };
}

const results = {};
for (const [name, fn] of [['rent', rent], ['title', title], ['rone', rone]]) {
  try { results[name] = await fn(); } catch (e) { out(`  [${name}] 오류`, e.message); results[name] = { ok: false, error: mask(e.message) }; }
}
out('\n요약', results);
