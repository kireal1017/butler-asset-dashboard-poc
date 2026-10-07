// v3 임대 수준 계산 (docs/butler-poc-improvement-spec.md 7.5, 7.6). DB 비의존 순수 함수. 금액은 원, 비율은 %.
import { addMonths } from './months.js';

export const NEARBY_MIN_COUNT = 3;
export const NEARBY_SPANS = [6, 12];
export const SIMILAR_PCT = 3;

/** 환산 월세 = 월세 + 보증금 × 전월세전환율 ÷ 12 (원 단위 반올림) */
export function convertedMonthly(deposit, monthlyRent, ratePct) {
  if (!Number.isFinite(ratePct)) return null;
  return Math.round(monthlyRent + (deposit * ratePct) / 100 / 12);
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * 7.5 '내 건물' 지표: 임대 중·만료 임박 호실의 진행 중 계약만 넣는다.
 * @param {{ deposit: number, monthlyRent: number, areaU: number }[]} items
 */
export function myBuildingMetrics(items, ratePct) {
  if (!items.length) return null;
  const converted = items.map((x) => convertedMonthly(x.deposit, x.monthlyRent, ratePct));
  const areaSqm = items.map((x) => x.areaU / 10000);
  const hasRate = Number.isFinite(ratePct);
  return {
    count: items.length,
    averageMonthlyRent: Math.round(mean(items.map((x) => x.monthlyRent))),
    averageDeposit: Math.round(mean(items.map((x) => x.deposit))),
    averageConverted: hasRate ? Math.round(mean(converted)) : null,
    averageAreaSqm: Math.round(mean(areaSqm) * 10) / 10,
    convertedPerSqm: hasRate ? Math.round(converted.reduce((s, x) => s + x, 0) / areaSqm.reduce((s, x) => s + x, 0)) : null,
  };
}

/**
 * 7.6 주변 전월세: 최근 6개월, 3건 미만이면 12개월, 그래도 3건 미만이면 부족.
 * rows는 같은 단지·비슷한 면적 전월세 거래 { deal_ym, deposit, monthly_rent }.
 * mine(내 환산 월세)이 있으면 차이를 %로, ±3% 안이면 비슷해요.
 */
export function nearbyRent(rows, asOf, ratePct, mine = null) {
  if (!Number.isFinite(ratePct)) return { enough: false, rateMissing: true };
  let pick = null;
  for (const months of NEARBY_SPANS) {
    const from = addMonths(asOf, -(months - 1));
    const list = rows.filter((r) => r.deal_ym >= from && r.deal_ym <= asOf);
    if (list.length >= NEARBY_MIN_COUNT) {
      pick = { months, from, list };
      break;
    }
  }
  if (!pick) {
    const from12 = addMonths(asOf, -11);
    return { enough: false, count12: rows.filter((r) => r.deal_ym >= from12 && r.deal_ym <= asOf).length };
  }
  const conv = pick.list.map((r) => convertedMonthly(r.deposit, r.monthly_rent, ratePct));
  const average = Math.round(mean(conv));
  const out = { enough: true, months: pick.months, from: pick.from, to: asOf, count: conv.length, average, min: Math.min(...conv), max: Math.max(...conv) };
  if (Number.isFinite(mine)) {
    const pct = ((mine - average) / average) * 100;
    out.diffPct = (Math.sign(pct) * Math.round(Math.abs(pct)));
    out.verdict = Math.abs(pct) <= SIMILAR_PCT ? 'SIMILAR' : pct < 0 ? 'LOWER' : 'HIGHER';
  }
  return out;
}
