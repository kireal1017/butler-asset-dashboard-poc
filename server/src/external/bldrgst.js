import { parseAreaU } from './rtms.js';

const URL_ = 'https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo';

// 단지마다 표기가 다르다: "104동"+"501" / "1동"+"402호" 등 (docs/api-notes.md 3장)
const VARIANTS = [
  (d, h) => [`${d}동`, h],
  (d, h) => [d, h],
  (d, h) => [`${d}동`, `${h}호`],
  (d, h) => [d, `${h}호`],
];

// 기타용도가 있으면 그것으로 판단한다. 같은 호에 "대피소" 같은 부속 전유부가 주용도 "아파트"로 함께 붙어 있다 (하계동 273 610동 1301).
const RESIDENTIAL = /아파트|공동주택|주택/;
export const isResidential = (r) => (r.etcPurps?.trim() ? RESIDENTIAL.test(r.etcPurps) : RESIDENTIAL.test(r.mainPurpsCdNm ?? ''));

/**
 * 동·호의 전유부(전용면적·층)를 찾는다. accept(row)가 false인 행(예: 같은 지번의 다른 단지 호실)은 건너뛴다.
 * @returns { areaU, floor, bldNm, dongNm, hoNm } | null
 */
export async function lookupExclusiveUnit(api, { sigunguCd, bjdongCd, bonbun, bubun, dong, ho }, accept = () => true) {
  for (const variant of VARIANTS) {
    const [dongNm, hoNm] = variant(dong, ho);
    const body = JSON.parse(await api.request('bldRgst', URL_, {
      sigunguCd, bjdongCd, platGbCd: '0',
      bun: String(bonbun).padStart(4, '0'), ji: String(bubun).padStart(4, '0'),
      dongNm, hoNm, numOfRows: '50', pageNo: '1', _type: 'json',
    }));
    const rows = [].concat(body.response?.body?.items?.item ?? []);
    // 전유부 중 주거 용도만 (같은 동·호 표기의 창고·상가 등 부속 호실 제외)
    const own = rows.find((r) => r.exposPubuseGbCdNm === '전유' && isResidential(r) && accept(r));
    if (own) {
      return { areaU: parseAreaU(String(own.area)), floor: Number(own.flrNo), bldNm: (own.bldNm || '').trim(), dongNm, hoNm };
    }
  }
  return null;
}
