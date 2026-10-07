// 한국부동산원 R-ONE 전월세전환율 (docs/api-notes.md 8장 실측).
// 통계표 "지역별 전월세 전환율_아파트"(월), 지역 서울, 항목 "전월세 전환율"(%). 한 번에 많이 요청하면 연결이 끊기므로 pSize ≤ 100.
export const RONE = {
  base: 'https://www.reb.or.kr/r-one/openapi',
  statblId: 'A_2024_00156',
  clsId: '500006', // 서울
  itmId: '100001', // 전월세 전환율
  region: '서울',
};

export class RoneError extends Error {
  constructor(message) {
    super(message);
    this.code = 'EXTERNAL';
  }
}

/**
 * fromYm~toYm 서울 아파트 전월세전환율 중 가장 최근 달. 없으면 null.
 * @returns {Promise<{ ym: string, rate: number } | null>}
 */
export async function fetchSeoulConversionRate(key, fromYm, toYm, { fetchImpl = fetch } = {}) {
  if (!key) throw new RoneError('R-ONE 인증키가 없습니다.');
  const qs = new URLSearchParams({
    KEY: key, Type: 'json', pIndex: '1', pSize: '100', STATBL_ID: RONE.statblId, DTACYCLE_CD: 'MM', CLS_ID: RONE.clsId,
    START_WRTTIME: fromYm, END_WRTTIME: toYm,
  });
  let body;
  try {
    const res = await fetchImpl(`${RONE.base}/SttsApiTblData.do?${qs}`);
    body = JSON.parse(await res.text());
  } catch (e) {
    throw new RoneError(`전월세전환율을 불러오지 못했습니다. (${String(e.message).split(key).join('[KEY]')})`);
  }
  const head = body?.SttsApiTblData?.[0]?.head;
  const code = head?.[1]?.RESULT?.CODE;
  if (code && code !== 'INFO-000') {
    if (code === 'INFO-200') return null; // 데이터 없음
    throw new RoneError(`전월세전환율 응답 오류 ${code}`);
  }
  const rows = (body?.SttsApiTblData?.[1]?.row ?? [])
    .filter((r) => String(r.ITM_ID) === RONE.itmId && String(r.CLS_ID) === RONE.clsId && Number.isFinite(Number(r.DTA_VAL)));
  if (!rows.length) return null;
  const latest = rows.sort((a, b) => String(b.WRTTIME_IDTFR_ID).localeCompare(String(a.WRTTIME_IDTFR_ID)))[0];
  return { ym: String(latest.WRTTIME_IDTFR_ID), rate: Number(latest.DTA_VAL) };
}
