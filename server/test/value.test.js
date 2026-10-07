import { describe, it, expect } from 'vitest';
import { comparableTrades, currentPrice, priceChange } from '../src/logic/price.js';
import {
  basisHash, changeVsPurchase, periodAverages, priceBarLayout, priceRange, purchaseSuggestion, referencePrice,
} from '../src/logic/value.js';

const T = (o) => ({
  deal_ym: '202605', deal_day: 1, apt_seq: 'A', apt_dong: null, floor: 10, deal_amount: 100000, area_u: 849100,
  cdeal_type: null, dealing_gbn: '중개거래', ...o,
});
const sorted = (rows) => comparableTrades(rows, 849100);

describe('7.3 참고가 (최근 12개월 제한)', () => {
  it('is the same trade as the existing currentPrice when the last trade is inside 12 months', () => {
    const rows = sorted([T({ deal_ym: '202401' }), T({ deal_ym: '202609', deal_day: 12, deal_amount: 125000 }), T({ deal_ym: '202603' })]);
    const r = referencePrice(rows, '202610');
    const c = currentPrice(rows);
    expect(r.value).toBe(c.amount * 10000);
    expect(r).toMatchObject({ value: 1250000000, referenceDate: '20260912', count: 2, from: '202511', to: '202610' });
  });

  it('is null when the only trades are older than 12 months (boundary: asOf−11 included, asOf−12 excluded)', () => {
    expect(referencePrice(sorted([T({ deal_ym: '202510' })]), '202610')).toMatchObject({ value: null, count: 0, referenceDate: null });
    expect(referencePrice(sorted([T({ deal_ym: '202511' })]), '202610')).toMatchObject({ count: 1, referenceDate: '20251101' });
  });

  it('basis hash is stable for the same trades and changes when a trade is added', () => {
    const a = sorted([T({ deal_ym: '202606' }), T({ deal_ym: '202607' })]);
    const b = sorted([T({ deal_ym: '202606' }), T({ deal_ym: '202607' })]);
    expect(basisHash(a)).toBe(basisHash(b));
    expect(basisHash(a)).not.toBe(basisHash([...a, T({ deal_ym: '202608' })]));
    expect(referencePrice(a, '202610').basisHash).toBe(referencePrice(b, '202610').basisHash);
  });
});

describe('7.4 기간별 평균·가격 범위·위치 막대', () => {
  const rows = sorted([
    T({ deal_ym: '202610', deal_amount: 120000 }),
    T({ deal_ym: '202609', deal_amount: 110001 }),
    T({ deal_ym: '202608', deal_amount: 100000 }),
    T({ deal_ym: '202605', deal_amount: 90000 }),
    T({ deal_ym: '202604', deal_amount: 80000 }),
  ]);

  it('averages the last 1·3·6 months including the base month, rounded to 만원, with counts', () => {
    expect(periodAverages(rows, '202610')).toEqual([
      { months: 1, from: '202610', to: '202610', count: 1, average: 1200000000 },
      { months: 3, from: '202608', to: '202610', count: 3, average: 1100000000 }, // (120000+110001+100000)/3 = 110000.33 → 110000만
      { months: 6, from: '202605', to: '202610', count: 4, average: 1050000000 }, // 420001/4 = 105000.25 → 105000만
    ]);
    expect(periodAverages(sorted([T({ deal_ym: '202601' })]), '202610')[0]).toMatchObject({ count: 0, average: null });
  });

  it('price range covers 12 months', () => {
    expect(priceRange(rows, '202610')).toEqual({ count: 5, min: 800000000, max: 1200000000 });
    expect(priceRange([], '202610')).toEqual({ count: 0, min: null, max: null });
  });

  it('bar spans min(purchase, reference, low)…max with 5% padding; a 2016 purchase sits left outside the band', () => {
    const bar = priceBarLayout({ count: 5, min: 800000000, max: 1200000000 }, 430000000, 1200000000);
    expect(bar.hidden).toBe(false);
    expect(bar.purchase).toBeCloseTo(0.05 / 1.1, 6); // 왼쪽 여유 5% 안쪽 끝
    expect(bar.purchase).toBeLessThan(bar.band.from);
    expect(bar.reference).toBeCloseTo(1.05 / 1.1, 6);
    expect(bar.single).toBeNull();
  });

  it('one trade shows a single marker, zero trades hides the bar', () => {
    expect(priceBarLayout({ count: 1, min: 500000000, max: 500000000 }, 400000000, 500000000)).toMatchObject({ band: null, single: expect.any(Number) });
    expect(priceBarLayout({ count: 0, min: null, max: null }, 400000000, null)).toEqual({ hidden: true });
  });
});

describe('7.7 매입가 제안', () => {
  const rows = sorted([T({ deal_ym: '201607', deal_amount: 43000 }), T({ deal_ym: '201608', deal_amount: 44000 }), T({ deal_ym: '201605', deal_amount: 40000 })]);

  it('uses the acquisition month when it has trades', () => {
    expect(purchaseSuggestion(sorted([T({ deal_ym: '201610', deal_amount: 45850 })]), '201610'))
      .toEqual({ months: 1, from: '201610', to: '201610', count: 1, average: 458500000 });
  });

  it('widens to 3 then 6 months and reports the period', () => {
    expect(purchaseSuggestion(rows, '201610')).toEqual({ months: 3, from: '201608', to: '201610', count: 1, average: 440000000 });
    expect(purchaseSuggestion(sorted([T({ deal_ym: '201606', deal_amount: 40000 })]), '201610')).toMatchObject({ months: 6, from: '201605', count: 1 });
  });

  it('returns null when 6 months have no trade', () => {
    expect(purchaseSuggestion(sorted([T({ deal_ym: '201604' })]), '201610')).toBeNull();
  });
});

describe('매입가 대비 (원 단위)', () => {
  it('matches the existing priceChange for 만원-multiple inputs, including symmetric rounding', () => {
    for (const [last, purchase] of [[125000, 43000], [43000, 125000], [100245, 100000], [99755, 100000], [100000, 100000]]) {
      const old = priceChange([T({ deal_amount: last })], purchase);
      const v3 = changeVsPurchase(last * 10000, purchase * 10000);
      expect(v3).toEqual({ diff: old.diff * 10000, rate: old.rate });
    }
  });

  it('is null without a reference price', () => {
    expect(changeVsPurchase(null, 430000000)).toBeNull();
  });
});
