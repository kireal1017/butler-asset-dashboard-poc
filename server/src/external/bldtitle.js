// 국토교통부 건축HUB 표제부·총괄표제부 (JSON). 실측: docs/api-notes.md 8장.
// 한 지번에 동별로 여러 줄이 나온다. 부속동(기계실·노인정·관리사무소)도 주용도가 '공동주택'이라
// "공동주택 줄 중 지상 층수가 가장 큰 줄"을 대표로 쓴다(1층으로 잘못 표시되는 오류 방지).
const TITLE_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo';
const RECAP_URL = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const pos = (v) => (num(v) > 0 ? num(v) : null);
const text = (v) => (String(v ?? '').trim() || null);

async function items(api, url, params) {
  const body = JSON.parse(await api.request('bldRgst', url, { ...params, _type: 'json', numOfRows: '100', pageNo: '1' }));
  const code = body?.response?.header?.resultCode;
  if (code && code !== '00') throw Object.assign(new Error(`건축물대장 응답 오류 ${code}`), { code: 'EXTERNAL' });
  return [].concat(body?.response?.body?.items?.item ?? []);
}

/** 대표 줄 고르기와 요약 (순수 함수, 테스트 대상) */
export function summarizeTitle(rows, recap) {
  const apt = rows.filter((r) => /공동주택|아파트/.test(r.mainPurpsCdNm ?? ''));
  const rep = [...(apt.length ? apt : rows)].sort((a, b) => (num(b.grndFlrCnt) ?? 0) - (num(a.grndFlrCnt) ?? 0))[0] ?? null;
  if (!rep) return null;
  const sum = (list, f) => list.reduce((s, r) => s + (num(r[f]) ?? 0), 0);
  const parkingRows = rows.reduce((s, r) => s + ['indrAutoUtcnt', 'oudrAutoUtcnt', 'indrMechUtcnt', 'oudrMechUtcnt'].reduce((t, f) => t + (num(r[f]) ?? 0), 0), 0);
  const recapParking = recap ? ['indrAutoUtcnt', 'oudrAutoUtcnt', 'indrMechUtcnt', 'oudrMechUtcnt'].reduce((t, f) => t + (num(recap[f]) ?? 0), 0) : 0;
  return {
    mainPurpose: text(rep.mainPurpsCdNm),
    structure: text(rep.strctCdNm),
    useApprovalDate: text(rep.useAprDay) ?? text(recap?.useAprDay),
    groundFloors: pos(rep.grndFlrCnt),
    undergroundFloors: num(rep.ugrndFlrCnt) ?? null,
    households: pos(recap?.hhldCnt) ?? pos(sum(apt, 'hhldCnt')),
    // 주차는 대장 값이 비거나 0인 단지가 있어(하계현대우성 총괄 0) 0이면 표시하지 않는다
    parking: pos(recap?.totPkngCnt) ?? pos(recapParking) ?? pos(parkingRows),
    totalArea: pos(recap?.totArea) ?? pos(sum(rows, 'totArea')),
    representative: text(rep.dongNm),
  };
}

/** 지번으로 표제부·총괄표제부를 받아 요약한다 */
export async function fetchBuildingSpec(api, { sigunguCd, bjdongCd, bonbun, bubun }) {
  const params = { sigunguCd, bjdongCd, platGbCd: '0', bun: String(bonbun).padStart(4, '0'), ji: String(bubun ?? 0).padStart(4, '0') };
  const rows = await items(api, TITLE_URL, params);
  let recap = null;
  try {
    recap = (await items(api, RECAP_URL, params))[0] ?? null;
  } catch {
    recap = null; // 총괄표제부는 보조 정보
  }
  return summarizeTitle(rows, recap);
}
