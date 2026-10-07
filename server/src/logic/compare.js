// 개선 v2 비교 근거 (docs/IMPROVEMENT-SPEC.md 3.3~3.5). DB 비의존 순수 함수, 입력은 trades 행.
import { sameArea } from './link.js';
import { compareTrades, isCancelled, RANGE_MONTHS } from './price.js';

/** E0 실측 후 사용자 확정값 (2026-10-07, docs/e0-measure.md). 같은 층 기간은 3년 탭과 같은 달을 수집하도록 맞춘다. */
export const COMPARE = {
  floorRange: '3y',
  floorMonths: RANGE_MONTHS['3y'],
  floorWiden: 2,
  areaWindowU: 50000, // ±5㎡
  complexMonths: 12,
  hoodMonths: 12,
  includeDirect: true,
  listLimit: 5,
};

const isDirect = (t) => t.dealing_gbn === '직거래';
const inPeriod = (t, from, to) => t.deal_ym >= from && t.deal_ym <= to;

const view = (t) => ({
  ym: t.deal_ym, day: t.deal_day, amount: t.deal_amount, floor: t.floor, areaU: t.area_u, direct: isDirect(t),
});

/** 중앙값(만원). 짝수 건이면 가운데 두 값의 평균을 반올림한다. 0건이면 null. */
export function median(amounts) {
  if (!amounts.length) return null;
  const s = [...amounts].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * 3.3 같은 층 거래. sorted는 현재가와 같은 범위(comparableTrades 결과: 해제 제외·같은 면적·시간순).
 * 같은 층이 0건이면 ±widen층으로 넓힌다(1층 미만 제외). 층 값이 없는 거래는 제외.
 */
export function sameFloorTrades(sorted, floor, { from, to, widen = COMPARE.floorWiden, limit = COMPARE.listLimit }) {
  const inRange = sorted.filter((t) => t.floor !== null && t.floor !== undefined && inPeriod(t, from, to));
  let hits = inRange.filter((t) => t.floor === floor);
  let floorRange = { min: floor, max: floor, widened: false };
  if (!hits.length) {
    floorRange = { min: Math.max(1, floor - widen), max: floor + widen, widened: true };
    hits = inRange.filter((t) => t.floor >= floorRange.min && t.floor <= floorRange.max);
  }
  return { floorRange, count: hits.length, trades: hits.slice(-limit).reverse().map(view) };
}

/** 기간·면적 범위·해제·직거래 조건을 통과한 거래, 시간순 */
function windowTrades(trades, myAreaU, { from, to, windowU, includeDirect }) {
  return trades
    .filter((t) => !isCancelled(t) && inPeriod(t, from, to) && Math.abs(t.area_u - myAreaU) <= windowU && (includeDirect || !isDirect(t)))
    .sort(compareTrades);
}

/**
 * 3.4 같은 단지(단지 전체)의 비슷한 면적. 면적 묶음은 내 면적에 고정한다:
 * 내 면적과 ±0.1㎡ 이내는 모두 '내 면적' 한 줄, 나머지는 신고 면적값 그대로 한 줄.
 * 정렬: 내 면적 줄 → 내 면적과 가까운 순 → 작은 면적.
 */
export function groupComplexAreas(trades, myAreaU, {
  from, to, windowU = COMPARE.areaWindowU, includeDirect = COMPARE.includeDirect, limit = COMPARE.listLimit,
}) {
  const list = windowTrades(trades, myAreaU, { from, to, windowU, includeDirect });
  const groups = new Map();
  for (const t of list) {
    const mine = sameArea(t.area_u, myAreaU);
    const key = mine ? 'mine' : t.area_u;
    const g = groups.get(key) ?? { mine, areas: new Set(), count: 0, latest: null };
    g.areas.add(t.area_u);
    g.count++;
    g.latest = t;
    groups.set(key, g);
  }
  const rank = (g) => (g.mine ? -1 : Math.abs([...g.areas][0] - myAreaU));
  const sorted = [...groups.values()].sort((a, b) => rank(a) - rank(b) || [...a.areas][0] - [...b.areas][0]);
  return {
    areaRange: { min: myAreaU - windowU, max: myAreaU + windowU },
    count: list.length,
    median: median(list.map((t) => t.deal_amount)),
    groups: sorted.slice(0, limit).map((g) => ({
      mine: g.mine, areas: [...g.areas].sort((a, b) => a - b), count: g.count, latest: view(g.latest),
    })),
  };
}

/**
 * 3.5 같은 법정동의 비슷한 면적 단지 시세. trades는 같은 시군구·같은 법정동 거래.
 * 내 단지(연결된 aptSeq 전부)는 제외. 단지별 최근 거래·건수, 이름은 그 단지의 최근 거래 단지명. 최근 거래 순.
 */
export function neighborhoodComplexes(trades, myAreaU, excludeSeqs, {
  from, to, windowU = COMPARE.areaWindowU, includeDirect = COMPARE.includeDirect,
}) {
  const exclude = new Set(excludeSeqs);
  const list = windowTrades(trades.filter((t) => !exclude.has(t.apt_seq)), myAreaU, { from, to, windowU, includeDirect });
  const byComplex = new Map();
  for (const t of list) {
    const g = byComplex.get(t.apt_seq) ?? { aptSeq: t.apt_seq, count: 0, latest: null };
    g.count++;
    g.latest = t;
    byComplex.set(t.apt_seq, g);
  }
  const complexes = [...byComplex.values()]
    .sort((a, b) => compareTrades(b.latest, a.latest))
    .map((g) => ({ aptSeq: g.aptSeq, name: g.latest.apt_nm, count: g.count, latest: view(g.latest) }));
  return {
    areaRange: { min: myAreaU - windowU, max: myAreaU + windowU },
    count: list.length,
    complexCount: complexes.length,
    median: median(list.map((t) => t.deal_amount)),
    complexes,
  };
}
