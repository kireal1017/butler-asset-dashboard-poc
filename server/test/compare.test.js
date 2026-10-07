import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { toTradeRow } from '../src/external/rtms.js';
import { COMPARE, groupComplexAreas, median, neighborhoodComplexes, sameFloorTrades } from '../src/logic/compare.js';
import { findCandidates } from '../src/logic/match.js';
import { comparableTrades } from '../src/logic/price.js';

const ROWS_2016 = JSON.parse(fs.readFileSync(new URL('./fixtures/rtms-11350-201610-hagye.json', import.meta.url), 'utf8')).items
  .map((it, i) => toTradeRow(it, '11350', '201610', i));

const T = (o) => ({
  deal_ym: '202605', deal_day: 1, apt_seq: 'A', apt_nm: '우성', apt_dong: null, umd_cd: '10400', floor: 10,
  deal_amount: 100000, area_u: 849100, cdeal_type: null, dealing_gbn: '중개거래', ...o,
});
const P36 = { from: '202311', to: '202610' };
const P12 = { from: '202511', to: '202610' };

describe('median', () => {
  it('returns null for no trades and the middle value for odd counts', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([30, 10, 20])).toBe(20);
  });

  it('averages the two middle values for even counts and rounds to whole 만원', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([100000, 100001])).toBe(100001); // 100000.5 → 100001
  });
});

describe('3.3 같은 층 거래', () => {
  const sorted = (rows) => comparableTrades(rows, 849100);

  it('lists same-floor trades newest first, at most 5, with the total count', () => {
    const rows = Array.from({ length: 7 }, (_, i) => T({ deal_ym: `20260${i + 1}`, deal_amount: 100000 + i }));
    const r = sameFloorTrades(sorted(rows), 10, P36);
    expect(r.floorRange).toEqual({ min: 10, max: 10, widened: false });
    expect(r.count).toBe(7);
    expect(r.trades.map((t) => t.amount)).toEqual([100006, 100005, 100004, 100003, 100002]);
  });

  it('widens to ±2 floors only when the same floor has no trade, and shows the real floor', () => {
    const r = sameFloorTrades(sorted([T({ floor: 8 }), T({ floor: 12 }), T({ floor: 13 })]), 10, P36);
    expect(r.floorRange).toEqual({ min: 8, max: 12, widened: true });
    expect(r.trades.map((t) => t.floor).sort()).toEqual([12, 8]);
  });

  it('excludes floors below 1 when widening, and rows without a floor', () => {
    const r = sameFloorTrades(sorted([T({ floor: 0 }), T({ floor: -1 }), T({ floor: null }), T({ floor: 3 })]), 2, P36);
    expect(r.floorRange).toEqual({ min: 1, max: 4, widened: true });
    expect(r.trades.map((t) => t.floor)).toEqual([3]);
  });

  it('returns zero (not an error) when ±2 floors have nothing either', () => {
    const r = sameFloorTrades(sorted([T({ floor: 20 })]), 10, P36);
    expect(r).toMatchObject({ count: 0, trades: [], floorRange: { widened: true } });
  });

  it('excludes cancelled trades and keeps the period boundary (from month included, earlier excluded)', () => {
    const r = sameFloorTrades(sorted([T({ cdeal_type: 'O' }), T({ deal_ym: '202311' }), T({ deal_ym: '202310' })]), 10, P36);
    expect(r.count).toBe(1);
    expect(r.trades[0].ym).toBe('202311');
  });

  it('case A: 2016 same-floor trade is outside the default 36 months but listed with a longer period, and it is the purchase candidate', () => {
    const rows = ROWS_2016.filter((t) => t.apt_seq === '11350-75');
    const def = sameFloorTrades(sorted(rows), 10, P36);
    expect(def.trades.some((t) => t.ym === '201610')).toBe(false);
    const long = sameFloorTrades(sorted(rows), 10, { from: '201601', to: '202610' });
    const listed = long.trades.find((t) => t.ym === '201610' && t.day === 13);
    expect(listed).toMatchObject({ amount: 45850, floor: 10 });
    const cands = findCandidates(rows, { areaU: 849100, floor: 10, dong: '112', acquisitionYm: '201610' });
    expect(cands.some((c) => c.ym === listed.ym && c.day === listed.day && c.amount === listed.amount)).toBe(true);
  });

  it('includes the matched purchase trade itself (not excluded)', () => {
    const purchase = T({ deal_ym: '202401', deal_amount: 90000 });
    const r = sameFloorTrades(sorted([purchase]), 10, P36);
    expect(r.trades[0]).toMatchObject({ ym: '202401', amount: 90000 });
  });
});

describe('3.4 같은 단지의 비슷한 면적 (내 면적 고정 묶음)', () => {
  it('puts every trade within ±0.1㎡ of my area in one "mine" row listing the mixed areas (case A: 현대 84.95 + 우성 84.91)', () => {
    const rows = [
      T({ apt_seq: '11350-75', area_u: 849100, deal_amount: 110000 }),
      T({ apt_seq: '11350-85', area_u: 849500, deal_amount: 120000, deal_day: 2 }),
      T({ apt_seq: '11350-85', area_u: 849600, deal_amount: 115000, deal_day: 3 }),
      T({ apt_seq: '11350-85', area_u: 830000, deal_amount: 90000 }),
    ];
    const r = groupComplexAreas(rows, 849100, P12);
    expect(r.count).toBe(4);
    expect(r.median).toBe(112500);
    expect(r.groups[0]).toMatchObject({ mine: true, areas: [849100, 849500, 849600], count: 3 });
    expect(r.groups[0].latest.amount).toBe(115000);
    expect(r.groups[1]).toMatchObject({ mine: false, areas: [830000], count: 1 });
  });

  it('is deterministic on chained areas (84.80 / 84.89 / 84.98 with my area 84.89)', () => {
    const rows = [T({ area_u: 848000 }), T({ area_u: 848900 }), T({ area_u: 849800 })];
    const a = groupComplexAreas(rows, 848900, P12);
    const b = groupComplexAreas([...rows].reverse(), 848900, P12);
    expect(a).toEqual(b);
    expect(a.groups).toHaveLength(1);
    expect(a.groups[0].areas).toEqual([848000, 848900, 849800]);
  });

  it('orders other rows by closeness to my area, then smaller area; at most 5 rows', () => {
    const areas = [800000, 820000, 870000, 880000, 830000, 899100];
    const r = groupComplexAreas(areas.map((u) => T({ area_u: u })), 849100, P12);
    // 거리: 830000 1.91㎡, 870000 2.09㎡, 820000 2.91㎡, 880000 3.09㎡, 800000 4.91㎡, 899100 5㎡(6번째라 잘림)
    expect(r.groups.map((g) => g.areas[0])).toEqual([830000, 870000, 820000, 880000, 800000]);
    expect(r.count).toBe(6);
    const tie = groupComplexAreas([T({ area_u: 859100 }), T({ area_u: 839100 })], 849100, P12);
    expect(tie.groups.map((g) => g.areas[0])).toEqual([839100, 859100]);
  });

  it('keeps the ±0.1㎡ (1000) and ±5㎡ (50000) boundaries inclusive', () => {
    const r = groupComplexAreas([T({ area_u: 850100 }), T({ area_u: 850101 }), T({ area_u: 899100 }), T({ area_u: 899101 })], 849100, P12);
    expect(r.count).toBe(3);
    expect(r.groups[0]).toMatchObject({ mine: true, areas: [850100] });
    expect(r.areaRange).toEqual({ min: 799100, max: 899100 });
  });

  it('excludes cancelled trades and trades outside the period; direct deals follow the switch', () => {
    const rows = [T({}), T({ cdeal_type: 'O' }), T({ deal_ym: '202510' }), T({ dealing_gbn: '직거래', deal_amount: 50000 })];
    expect(groupComplexAreas(rows, 849100, P12).count).toBe(2);
    expect(groupComplexAreas(rows, 849100, { ...P12, includeDirect: false }).count).toBe(1);
  });

  it('returns an empty result for no trades', () => {
    expect(groupComplexAreas([], 849100, P12)).toMatchObject({ count: 0, median: null, groups: [] });
  });
});

describe('3.5 같은 법정동 비슷한 면적 단지 시세', () => {
  const rows = [
    T({ apt_seq: 'MINE', deal_amount: 999999 }),
    T({ apt_seq: 'X', apt_nm: '옛이름', deal_ym: '202512', deal_amount: 80000 }),
    T({ apt_seq: 'X', apt_nm: '새이름', deal_ym: '202606', deal_amount: 82000 }),
    T({ apt_seq: 'Y', apt_nm: '와이', deal_ym: '202609', deal_amount: 70000 }),
    T({ apt_seq: 'Z', apt_nm: '제트', area_u: 590000 }),
    T({ apt_seq: 'Y', apt_nm: '와이', deal_ym: '202608', cdeal_type: 'O' }),
  ];

  it('excludes my complex, counts per complex, names by the latest trade and orders by latest trade', () => {
    const r = neighborhoodComplexes(rows, 849100, ['MINE'], P12);
    expect(r.count).toBe(3);
    expect(r.complexCount).toBe(2);
    expect(r.median).toBe(80000);
    expect(r.complexes.map((c) => [c.aptSeq, c.name, c.count, c.latest.amount])).toEqual([
      ['Y', '와이', 1, 70000],
      ['X', '새이름', 2, 82000],
    ]);
  });

  it('applies the direct-deal switch to the median and counts', () => {
    const withDirect = [...rows, T({ apt_seq: 'Y', deal_ym: '202610', dealing_gbn: '직거래', deal_amount: 10000 })];
    expect(neighborhoodComplexes(withDirect, 849100, ['MINE'], P12).count).toBe(4);
    expect(neighborhoodComplexes(withDirect, 849100, ['MINE'], { ...P12, includeDirect: false }).count).toBe(3);
  });

  it('default settings are the values confirmed after E0', () => {
    expect(COMPARE).toMatchObject({ floorMonths: 36, floorWiden: 2, areaWindowU: 50000, complexMonths: 12, hoodMonths: 12, includeDirect: true });
  });
});
