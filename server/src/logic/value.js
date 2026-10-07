// v3 매매 시세 계산 (docs/butler-poc-improvement-spec.md 7.3, 7.4, 7.7). DB 비의존 순수 함수.
// 입력 sorted는 기존 comparableTrades 결과(내 동이 속한 실거래 단지·같은 면적·해제 제외·시간순)다.
// 금액: 거래는 만원(trades.deal_amount), 결과는 원. 기간은 기준 월(AS_OF) 포함 거꾸로 N개월(사용자 결정 S3).
import crypto from 'node:crypto';
import { addMonths } from './months.js';

export const REFERENCE_MONTHS = 12;
export const PERIODS = [1, 3, 6];
export const SUGGESTION_SPANS = [1, 3, 6];
const WON = 10000;

const windowOf = (sorted, from, to) => sorted.filter((t) => t.deal_ym >= from && t.deal_ym <= to);
const ymd = (t) => `${t.deal_ym}${String(t.deal_day).padStart(2, '0')}`;
/** 만원 평균을 만원 단위로 반올림한 뒤 원으로 */
const averageWon = (list) => (list.length ? Math.round(list.reduce((s, t) => s + t.deal_amount, 0) / list.length) * WON : null);

/** 거래 자연 키 (trades의 src_seq는 달 교체 때 바뀌므로 쓰지 않는다) */
export const naturalKey = (t) => [t.deal_ym, t.deal_day, t.apt_seq, t.apt_dong ?? '', t.floor ?? '', t.deal_amount, t.area_u];

/** 근거 거래 집합의 해시. 같은 거래 묶음이면 같은 값 */
export function basisHash(list) {
  return crypto.createHash('sha256').update(JSON.stringify(list.map(naturalKey))).digest('hex').slice(0, 32);
}

/**
 * 7.3 최근 실거래 참고가: 기준 월 포함 최근 12개월 안의 마지막 거래(기존 currentPrice와 같은 범위·순서).
 * 12개월 안에 거래가 없으면 value null. 근거 = 12개월 집합 전체.
 */
export function referencePrice(sorted, asOf, months = REFERENCE_MONTHS) {
  const from = addMonths(asOf, -(months - 1));
  const list = windowOf(sorted, from, asOf);
  const last = list[list.length - 1] ?? null;
  return {
    from,
    to: asOf,
    count: list.length,
    value: last ? last.deal_amount * WON : null,
    referenceDate: last ? ymd(last) : null,
    trade: last,
    basisHash: basisHash(list),
    transactionIds: list.map(naturalKey),
  };
}

/** 7.4 기간별 실거래 평균: 최근 1·3·6개월(서로 포함 관계), 평균은 만원 단위 반올림 */
export function periodAverages(sorted, asOf, periods = PERIODS) {
  return periods.map((months) => {
    const from = addMonths(asOf, -(months - 1));
    const list = windowOf(sorted, from, asOf);
    return { months, from, to: asOf, count: list.length, average: averageWon(list) };
  });
}

/** 7.4 최근 12개월 거래의 최저·최고(원)와 건수 */
export function priceRange(sorted, asOf, months = REFERENCE_MONTHS) {
  const list = windowOf(sorted, addMonths(asOf, -(months - 1)), asOf);
  if (!list.length) return { count: 0, min: null, max: null };
  const amounts = list.map((t) => t.deal_amount * WON);
  return { count: list.length, min: Math.min(...amounts), max: Math.max(...amounts) };
}

/**
 * 7.4 가격 위치 막대 배치. 전체 범위 = min(매입가, 참고가, 최저가) ~ max(…), 양끝 5% 여유.
 * 위치는 0~1 비율. 거래 0건이면 막대를 그리지 않고(hidden), 1건이면 음영 대신 표식 하나(single).
 */
export function priceBarLayout(range, purchase, reference) {
  if (!range.count) return { hidden: true };
  const values = [range.min, range.max, purchase, reference].filter((v) => Number.isFinite(v));
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = (hi0 - lo0 || hi0 || 1) * 0.05;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const pos = (v) => (Number.isFinite(v) ? (v - lo) / (hi - lo) : null);
  return {
    hidden: false,
    lo,
    hi,
    single: range.count === 1 ? pos(range.min) : null,
    band: range.count > 1 ? { from: pos(range.min), to: pos(range.max) } : null,
    purchase: pos(purchase),
    reference: pos(reference),
  };
}

/**
 * 7.7 매입가 제안: 취득 연월 한 달 → 그 이전 3개월 → 6개월로 넓혀 처음 거래가 잡힌 기간의 평균.
 * sorted에는 그 기간의 같은 단지·같은 면적 거래가 들어 있어야 한다.
 */
export function purchaseSuggestion(sorted, acquisitionYm, spans = SUGGESTION_SPANS) {
  for (const months of spans) {
    const from = addMonths(acquisitionYm, -(months - 1));
    const list = windowOf(sorted, from, acquisitionYm);
    if (list.length) return { months, from, to: acquisitionYm, count: list.length, average: averageWon(list) };
  }
  return null;
}

/** 매입가 대비 등락(원). 비율은 기존 logic/price.js와 같은 규칙: 소수 첫째 자리, 0에서 먼 쪽으로 대칭 반올림 */
export function changeVsPurchase(reference, purchase) {
  if (!Number.isFinite(reference) || !purchase) return null;
  const diff = reference - purchase;
  return { diff, rate: (Math.sign(diff) * Math.round((Math.abs(diff) * 1000) / purchase)) / 10 };
}
