// 국토교통부 아파트 매매 실거래가 상세 자료 (XML)
const URL_ = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
export const PAGE_SIZE = 1000;

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function parseTradeXml(xml) {
  const code = (xml.match(/<resultCode>([^<]*)<\/resultCode>/) || [])[1];
  if (code && code !== '000' && code !== '00') {
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1] ?? 'unknown';
    throw new Error(`실거래가 응답 오류 ${code}: ${msg}`);
  }
  const items = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const it = {};
    for (const [, k, v] of block.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) it[k] = decodeXml(v).trim();
    items.push(it);
  }
  const total = Number((xml.match(/<totalCount>(\d+)<\/totalCount>/) || [])[1] ?? NaN);
  if (!Number.isFinite(total)) throw new Error('실거래가 응답에 totalCount가 없습니다');
  return { items, total };
}

/** "84.9746" → 849746 (1/10000㎡ 정수, 반올림 없이 문자열에서 변환) */
export function parseAreaU(s) {
  const [i, f = ''] = String(s).trim().split('.');
  if (!/^\d+$/.test(i) || !/^\d{0,4}$/.test(f)) throw new Error(`면적 형식 오류: ${s}`);
  return Number(i) * 10000 + Number(f.padEnd(4, '0'));
}

const intOrNull = (s) => (s === undefined || s === '' ? null : Number(s));

export function toTradeRow(it, sggCd, dealYm, srcSeq) {
  return {
    sgg_cd: sggCd,
    deal_ym: dealYm,
    src_seq: srcSeq,
    apt_seq: it.aptSeq,
    apt_nm: it.aptNm,
    umd_cd: it.umdCd || null,
    umd_nm: it.umdNm || null,
    jibun: it.jibun || null,
    bonbun: intOrNull(it.bonbun),
    bubun: intOrNull(it.bubun),
    area_u: parseAreaU(it.excluUseAr),
    area_raw: it.excluUseAr,
    floor: intOrNull(it.floor),
    apt_dong: it.aptDong ? it.aptDong.replace(/동$/, '') : null,
    deal_day: Number(it.dealDay),
    deal_amount: Number(String(it.dealAmount).replace(/,/g, '')),
    cdeal_type: it.cdealType || null,
    cdeal_day: it.cdealDay || null,
    rgst_date: it.rgstDate || null,
    dealing_gbn: it.dealingGbn || null,
    build_year: intOrNull(it.buildYear),
  };
}

/** 한 "시군구 × 월"의 모든 페이지를 받는다. */
export async function fetchTradeMonth(api, sggCd, dealYm) {
  const pages = [];
  const rows = [];
  let total = 0;
  for (let page = 1; ; page++) {
    const xml = await api.request('rtms', URL_, { LAWD_CD: sggCd, DEAL_YMD: dealYm, numOfRows: String(PAGE_SIZE), pageNo: String(page) });
    const parsed = parseTradeXml(xml);
    total = parsed.total;
    pages.push(xml);
    for (const it of parsed.items) rows.push(toTradeRow(it, sggCd, dealYm, rows.length));
    if (rows.length >= total || parsed.items.length === 0) break;
  }
  return { pages, rows, total };
}
