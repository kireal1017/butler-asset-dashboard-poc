import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { toTradeRow } from '../src/external/rtms.js';
import { compareTrades, comparableTrades, currentPrice, monthlySeries, priceChange, rangeStart, recentTrades } from '../src/logic/price.js';
import { addMonths, lastMonths, monthRange, kstYm } from '../src/logic/months.js';

const load = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')).items;
const ROWS = [...load('rtms-11350-201610-hagye.json'), ...load('rtms-11350-recent-hagye.json')]
  .map((it, i) => toTradeRow(it, '11350', `${it.dealYear}${String(it.dealMonth).padStart(2, '0')}`, i));

const T = (o) => ({ deal_ym: '202601', deal_day: 1, apt_seq: 's', apt_dong: null, floor: 1, deal_amount: 100, area_u: 849500, cdeal_type: null, dealing_gbn: null, ...o });

describe('7.3 같은 면적·해제 제외 (실제 거래)', () => {
  it('uses only one building scope and excludes cancelled trades', () => {
    const 우성 = ROWS.filter((r) => r.apt_seq === '11350-75');
    const cmp = comparableTrades(우성, 849100);
    expect(cmp.length).toBeGreaterThan(0);
    expect(cmp.every((t) => t.apt_seq === '11350-75' && !t.cdeal_type && Math.abs(t.area_u - 849100) <= 1000)).toBe(true);
  });

  it('0.1㎡ boundary is inclusive and exact (84.85 vs 84.95, 84.84 excluded)', () => {
    const trades = [T({ area_u: 848500 }), T({ area_u: 848400, deal_day: 2 }), T({ area_u: 850500, deal_day: 3 }), T({ area_u: 850600, deal_day: 4 })];
    expect(comparableTrades(trades, 849500).map((t) => t.area_u)).toEqual([848500, 850500]);
  });

  it('excludes cancelled trades from price, change and series', () => {
    const trades = [T({ deal_amount: 100 }), T({ deal_day: 2, deal_amount: 200, cdeal_type: 'O' })];
    const s = comparableTrades(trades, 849500);
    expect(currentPrice(s).amount).toBe(100);
    expect(priceChange(s, null)).toBeNull();
    expect(monthlySeries(s, '202601', '202601')[0].value).toBe(100);
  });

  it('real cancelled trades exist in fixtures and are dropped', () => {
    const cancelled = ROWS.filter((r) => r.cdeal_type);
    expect(cancelled.length).toBeGreaterThan(0);
    const c = cancelled[0];
    expect(comparableTrades(ROWS.filter((r) => r.apt_seq === c.apt_seq), c.area_u)).not.toContain(c);
  });
});

describe('ordering (same day)', () => {
  it('is a total order: day → aptSeq → dong → floor → amount → area', () => {
    const a = T({ deal_day: 5, floor: 3, deal_amount: 500 });
    const b = T({ deal_day: 5, floor: 3, deal_amount: 400 });
    const c = T({ deal_day: 5, floor: 9, deal_amount: 100 });
    expect([a, c, b].sort(compareTrades)).toEqual([b, a, c]);
    expect(compareTrades(T({ apt_dong: '9' }), T({ apt_dong: '10' }))).toBeLessThan(0);
  });

  it('keeps identical duplicate trades (real data has 45 such groups)', () => {
    const dup = [T(), T()];
    expect(comparableTrades(dup, 849500)).toHaveLength(2);
  });
});

describe('7.4 / 7.5 현재가와 증감', () => {
  const s = comparableTrades([T({ deal_ym: '202512', deal_amount: 90000 }), T({ deal_ym: '202602', deal_amount: 99500, dealing_gbn: '직거래' })], 849500);

  it('current = latest trade with its month and direct-trade flag', () => {
    expect(currentPrice(s)).toMatchObject({ amount: 99500, ym: '202602', direct: true });
    expect(currentPrice([])).toBeNull();
  });

  it('change vs purchase price, one-decimal rate', () => {
    expect(priceChange(s, 87300)).toEqual({ kind: 'purchase', diff: 12200, rate: 14 });
    expect(priceChange(s, 112000)).toEqual({ kind: 'purchase', diff: -12500, rate: -11.2 });
  });

  it('change vs previous trade when no purchase price; null with one trade', () => {
    expect(priceChange(s, null)).toEqual({ kind: 'previous', diff: 9500, rate: 10.6 });
    expect(priceChange(s.slice(0, 1), null)).toBeNull();
    expect(priceChange([], 1000)).toBeNull();
  });

  it('rounds rates symmetrically away from zero (±2.45% → ±2.5%)', () => {
    const up = comparableTrades([T({ deal_amount: 2000 }), T({ deal_day: 2, deal_amount: 2049 })], 849500);
    const down = comparableTrades([T({ deal_amount: 2000 }), T({ deal_day: 2, deal_amount: 1951 })], 849500);
    expect(priceChange(up, null).rate).toBe(2.5);
    expect(priceChange(down, null).rate).toBe(-2.5);
  });

  it('recent trades newest first', () => {
    expect(recentTrades(s).map((t) => t.amount)).toEqual([99500, 90000]);
  });
});

describe('7.7 월별 시계열', () => {
  const s = comparableTrades([
    T({ deal_ym: '202510', deal_amount: 80000 }),
    T({ deal_ym: '202512', deal_day: 3, deal_amount: 85000 }),
    T({ deal_ym: '202512', deal_day: 20, deal_amount: 87000 }),
    T({ deal_ym: '202603', deal_amount: 90000 }),
  ], 849500);

  it('steps: last trade of the month, carry forward, seed from before the range', () => {
    const series = monthlySeries(s, '202511', '202604');
    expect(series.map((p) => p.value)).toEqual([80000, 87000, 87000, 87000, 90000, 90000]);
    expect(series.map((p) => p.trade?.amount ?? null)).toEqual([null, 87000, null, null, 90000, null]);
  });

  it('starts at the first in-range trade when nothing is stored before', () => {
    expect(monthlySeries(s, '202509', '202511').map((p) => p.value)).toEqual([null, 80000, 80000]);
  });

  it('range starts', () => {
    expect(rangeStart('1y', '202610', null)).toBe('202511');
    expect(rangeStart('10y', '202610', null)).toBe('201611');
    expect(rangeStart('hold', '202610', '201607')).toBe('201607');
    expect(rangeStart('hold', '202610', null)).toBeNull();
  });
});

describe('months', () => {
  it('handles year boundaries and KST', () => {
    expect(addMonths('202601', -1)).toBe('202512');
    expect(lastMonths('202602', 3)).toEqual(['202512', '202601', '202602']);
    expect(monthRange('202611', '202602')).toEqual([]);
    expect(kstYm(new Date('2026-10-31T15:00:00Z'))).toBe('202611');
  });
});
