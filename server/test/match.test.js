import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { toTradeRow } from '../src/external/rtms.js';
import { findCandidates, matchWindow, sameCandidate } from '../src/logic/match.js';

const golden = JSON.parse(fs.readFileSync(new URL('../../verify/golden-case-a.json', import.meta.url), 'utf8'));
const ROWS_2016 = JSON.parse(fs.readFileSync(new URL('./fixtures/rtms-11350-201610-hagye.json', import.meta.url), 'utf8')).items
  .map((it, i) => toTradeRow(it, '11350', '201610', i));

const T = (o) => ({ deal_ym: '201609', deal_day: 1, apt_seq: 's', apt_dong: null, floor: 10, deal_amount: 100, area_u: 849100, cdeal_type: null, dealing_gbn: null, ...o });
const asset = { areaU: 849100, floor: 10, dong: '112', acquisitionYm: '201610' };

describe('7.6 매입 거래 매칭', () => {
  it('window is the month and the three before', () => {
    expect(matchWindow('201610')).toEqual({ from: '201607', to: '201610' });
    expect(matchWindow('201602')).toEqual({ from: '201511', to: '201602' });
  });

  it('keeps same area, same floor, non-cancelled trades inside the window only', () => {
    const c = findCandidates([
      T({}),
      T({ floor: 11 }),
      T({ area_u: 859200 }),
      T({ cdeal_type: 'O' }),
      T({ deal_ym: '201606' }),
      T({ deal_ym: '201611' }),
    ], asset);
    expect(c).toHaveLength(1);
  });

  it('puts dong-matched trades first, drops other dongs, keeps blank dongs', () => {
    const c = findCandidates([
      T({ deal_ym: '201610', deal_amount: 300 }),
      T({ deal_ym: '201608', apt_dong: '112', deal_amount: 200 }),
      T({ deal_ym: '201609', apt_dong: '111', deal_amount: 999 }),
    ], asset);
    expect(c.map((x) => [x.amount, x.dongMatch])).toEqual([[200, true], [300, false]]);
  });

  it('returns 0, 1 or many candidates', () => {
    expect(findCandidates([], asset)).toEqual([]);
    expect(findCandidates([T({})], asset)).toHaveLength(1);
    expect(findCandidates([T({ deal_day: 2 }), T({ deal_day: 5 })], asset).map((x) => x.day)).toEqual([5, 2]);
  });

  it('keeps both of two identical real trades as separate candidates', () => {
    expect(findCandidates([T({}), T({})], asset)).toHaveLength(2);
  });

  it('identifies a candidate by value', () => {
    const [c] = findCandidates([T({})], asset);
    expect(sameCandidate(c, { ...c })).toBe(true);
    expect(sameCandidate(c, { ...c, amount: 101 })).toBe(false);
  });

  it('real 2016-10 data: a 우성 84.91 10th-floor trade in the window is a candidate', () => {
    const 우성 = ROWS_2016.filter((r) => r.apt_seq === golden.expectedTrade.aptSeq);
    const c = findCandidates(우성, { areaU: 849100, floor: 10, dong: golden.dong, acquisitionYm: '201610' });
    expect(c.every((x) => x.floor === 10 && x.ym === '201610' && x.aptSeq === '11350-75')).toBe(true);
  });
});
