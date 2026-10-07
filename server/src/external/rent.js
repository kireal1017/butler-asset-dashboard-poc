// 국토교통부 아파트 전월세 실거래가 (XML, 공공데이터포털 15126474). 실측: docs/api-notes.md 8장.
// 매매와 같은 "시군구 × 월" 구조다. 금액은 만원 문자열(쉼표 포함) → 원 정수로 바꿔 저장한다.
import { PAGE_SIZE, parseAreaU, parseTradeXml } from './rtms.js';

const URL_ = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
const manwonToWon = (s) => Number(String(s ?? '0').replace(/,/g, '').trim() || 0) * 10000;
const intOrNull = (s) => (s === undefined || String(s).trim() === '' ? null : Number(s));

export function toRentRow(it, sggCd, dealYm, srcSeq) {
  return {
    sgg_cd: sggCd,
    deal_ym: dealYm,
    src_seq: srcSeq,
    apt_seq: it.aptSeq || null,
    apt_nm: it.aptNm,
    umd_nm: it.umdNm || null,
    jibun: it.jibun || null,
    area_u: parseAreaU(it.excluUseAr),
    floor: intOrNull(it.floor),
    deal_day: Number(it.dealDay),
    deposit: manwonToWon(it.deposit),
    monthly_rent: manwonToWon(it.monthlyRent),
    contract_type: String(it.contractType ?? '').trim() || null,
    contract_term: String(it.contractTerm ?? '').trim() || null,
  };
}

/** 한 "시군구 × 월"의 모든 페이지 */
export async function fetchRentMonth(api, sggCd, dealYm) {
  const pages = [];
  const rows = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const xml = await api.request('rent', URL_, { LAWD_CD: sggCd, DEAL_YMD: dealYm, numOfRows: String(PAGE_SIZE), pageNo: String(page) });
    const parsed = parseTradeXml(xml);
    total = parsed.total;
    pages.push(xml);
    for (const it of parsed.items) rows.push(toRentRow(it, sggCd, dealYm, rows.length));
    if (rows.length >= total || parsed.items.length === 0) break;
  }
  return { pages, rows, total };
}
