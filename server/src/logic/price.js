// PRD 7.3~7.5, 7.7. 입력 거래는 trades 행 형태 { deal_ym, deal_day, apt_seq, apt_dong, floor, deal_amount, area_u, cdeal_type, dealing_gbn }.
import { sameArea } from './link.js';
import { addMonths, monthRange } from './months.js';

/**
 * 거래 순서 (사용자 확정 2026-10-05): 계약일 → 단지 → 동 → 층 → 금액 → 면적.
 * 마지막 키까지 같으면 금액·면적도 같으므로 어느 행이 "마지막"이어도 표시값은 같다.
 */
export function compareTrades(a, b) {
  return (a.deal_ym.localeCompare(b.deal_ym))
    || (a.deal_day - b.deal_day)
    || a.apt_seq.localeCompare(b.apt_seq)
    || (a.apt_dong ?? '').localeCompare(b.apt_dong ?? '', 'ko', { numeric: true })
    || ((a.floor ?? 0) - (b.floor ?? 0))
    || (a.deal_amount - b.deal_amount)
    || (a.area_u - b.area_u);
}

export const isCancelled = (t) => Boolean(t.cdeal_type);

/** 같은 단지(범위는 호출자가 aptSeq로 거름)·같은 면적·해제 아님, 시간순 정렬 */
export function comparableTrades(trades, areaU) {
  return trades.filter((t) => !isCancelled(t) && sameArea(t.area_u, areaU)).sort(compareTrades);
}

const view = (t) => ({
  ym: t.deal_ym, day: t.deal_day, amount: t.deal_amount, floor: t.floor, areaU: t.area_u, dong: t.apt_dong, direct: t.dealing_gbn === '직거래',
});

/** 7.4 현재가: 가장 최근 거래 1건. 없으면 null */
export function currentPrice(sorted) {
  return sorted.length ? view(sorted[sorted.length - 1]) : null;
}

/** 비율(%) 소수 첫째 자리. 부호와 무관하게 0에서 먼 쪽으로 반올림한다 (+2.45 → +2.5, −2.45 → −2.5) */
const rate = (diff, base) => (Math.sign(diff) * Math.round((Math.abs(diff) * 1000) / base)) / 10;

/** 7.5 증감: 매입가가 있으면 매입가 대비, 없으면 직전 거래 대비, 1건뿐이면 null */
export function priceChange(sorted, purchasePrice) {
  if (!sorted.length) return null;
  const last = sorted[sorted.length - 1].deal_amount;
  if (purchasePrice) return { kind: 'purchase', diff: last - purchasePrice, rate: rate(last - purchasePrice, purchasePrice) };
  if (sorted.length < 2) return null;
  const prev = sorted[sorted.length - 2].deal_amount;
  return { kind: 'previous', diff: last - prev, rate: rate(last - prev, prev) };
}

export function recentTrades(sorted, n = 5) {
  return sorted.slice(-n).reverse().map(view);
}

/**
 * 7.7 월별 시계열 (from..to 포함).
 * value: 그 달 말까지의 가장 최근 거래 금액(없으면 직전 값 유지, 시작 전 거래도 없으면 null)
 * trade: 그 달에 거래가 있으면 그 달의 마지막 거래
 */
export function monthlySeries(sorted, fromYm, toYm) {
  const lastByMonth = new Map();
  let seed = null;
  for (const t of sorted) {
    if (t.deal_ym < fromYm) seed = t;
    else if (t.deal_ym <= toYm) lastByMonth.set(t.deal_ym, t);
  }
  let value = seed ? seed.deal_amount : null;
  return monthRange(fromYm, toYm).map((ym) => {
    const t = lastByMonth.get(ym);
    if (t) value = t.deal_amount;
    return { ym, value, trade: t ? view(t) : null };
  });
}

export const RANGE_MONTHS = { '1y': 12, '3y': 36, '5y': 60, '10y': 120 };

/** 기간 탭의 시작 월. hold는 매입 계약월(직접 입력이면 취득 연월)부터. */
export function rangeStart(range, asOf, purchaseYm) {
  if (range === 'hold') return purchaseYm ?? null;
  const n = RANGE_MONTHS[range];
  return n ? addMonths(asOf, -(n - 1)) : null;
}
