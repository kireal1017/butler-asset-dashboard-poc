import { describe, it, expect } from 'vitest';
import { convertedMonthly, myBuildingMetrics, nearbyRent } from '../src/logic/rent.js';
import { summarizeTitle } from '../src/external/bldtitle.js';
import { toRentRow } from '../src/external/rent.js';

describe('7.5 환산 월세 (명세 검산값)', () => {
  it('보증금 5,000만원 · 월세 0원 · 4.56% → 19만원, 월세 80만원이면 99만원', () => {
    expect(convertedMonthly(50000000, 0, 4.56)).toBe(190000);
    expect(convertedMonthly(50000000, 800000, 4.56)).toBe(990000);
    expect(convertedMonthly(50000000, 800000, null)).toBeNull();
  });

  it('내 건물: 전용 84㎡, 보증금 5,000만원, 월세 80만원, 4.56% → ㎡당 11,786원', () => {
    expect(myBuildingMetrics([{ deposit: 50000000, monthlyRent: 800000, areaU: 840000 }], 4.56)).toEqual({
      count: 1, averageMonthlyRent: 800000, averageDeposit: 50000000, averageConverted: 990000, averageAreaSqm: 84, convertedPerSqm: 11786,
    });
    expect(myBuildingMetrics([], 4.56)).toBeNull();
    expect(myBuildingMetrics([{ deposit: 1, monthlyRent: 1, areaU: 840000 }], null)).toMatchObject({ averageConverted: null, convertedPerSqm: null });
  });
});

describe('7.6 주변 전월세', () => {
  const R = (ym, deposit, monthly) => ({ deal_ym: ym, deposit, monthly_rent: monthly });
  const rate = 4.8; // 보증금 1억 → 월 40만원

  it('uses 6 months when there are 3+ trades, with average, range and count', () => {
    const rows = [R('202610', 100000000, 600000), R('202608', 100000000, 800000), R('202605', 100000000, 1000000), R('202601', 0, 9999999)];
    expect(nearbyRent(rows, '202610', rate)).toEqual({ enough: true, months: 6, from: '202605', to: '202610', count: 3, average: 1200000, min: 1000000, max: 1400000 });
  });

  it('widens to 12 months under 3 trades, then reports not enough with the 12-month count', () => {
    const rows = [R('202610', 0, 1000000), R('202512', 0, 1000000), R('202511', 0, 1000000), R('202510', 0, 5)];
    expect(nearbyRent(rows, '202610', rate)).toMatchObject({ enough: true, months: 12, count: 3 });
    expect(nearbyRent(rows.slice(0, 2), '202610', rate)).toEqual({ enough: false, count12: 2 });
  });

  it('compares my converted rent: within ±3% is 비슷해요, otherwise 낮아요/높아요 with a rounded percent', () => {
    const rows = [R('202610', 0, 1000000), R('202609', 0, 1000000), R('202608', 0, 1000000)];
    expect(nearbyRent(rows, '202610', rate, 1030000)).toMatchObject({ verdict: 'SIMILAR', diffPct: 3 });
    expect(nearbyRent(rows, '202610', rate, 920000)).toMatchObject({ verdict: 'LOWER', diffPct: -8 });
    expect(nearbyRent(rows, '202610', rate, 1100000)).toMatchObject({ verdict: 'HIGHER', diffPct: 10 });
    expect(nearbyRent(rows, '202610', null)).toEqual({ enough: false, rateMissing: true });
  });

  it('parses a rent row: 만원 with commas → 원, blank contract type → null', () => {
    const r = toRentRow({ aptSeq: '11350-75', aptNm: '우성', excluUseAr: '84.91', floor: '10', dealDay: '3', deposit: '17,850', monthlyRent: '30', contractType: ' ' }, '11350', '202609', 0);
    expect(r).toMatchObject({ apt_seq: '11350-75', area_u: 849100, deposit: 178500000, monthly_rent: 300000, contract_type: null });
  });
});

describe('8.3 건축물대장 요약', () => {
  // docs/api-notes.md 8장 실측(하계동 270번지): 부속동도 주용도 '공동주택'
  const rows = [
    { dongNm: '중간기계실', mainPurpsCdNm: '공동주택', grndFlrCnt: 0, ugrndFlrCnt: 1, hhldCnt: 0, totArea: 283.125 },
    { dongNm: '110동', mainPurpsCdNm: '공동주택', grndFlrCnt: 15, ugrndFlrCnt: 1, strctCdNm: '철근콘크리트구조', useAprDay: '19881130', hhldCnt: 120, totArea: 12280.216 },
    { dongNm: '노인정', mainPurpsCdNm: '공동주택', grndFlrCnt: 1, ugrndFlrCnt: 0, hhldCnt: 0, totArea: 167.31 },
    { dongNm: '상가동', mainPurpsCdNm: '제1종근린생활시설', grndFlrCnt: 2, ugrndFlrCnt: 1, hhldCnt: 0, totArea: 955.17 },
  ];
  it('picks the tallest apartment row (not 1층), prefers recap households and hides zero parking', () => {
    const s = summarizeTitle(rows, { hhldCnt: 1320, totArea: 147781.069, totPkngCnt: 0, useAprDay: ' ' });
    expect(s).toMatchObject({ mainPurpose: '공동주택', structure: '철근콘크리트구조', useApprovalDate: '19881130', groundFloors: 15, undergroundFloors: 1, households: 1320, parking: null, totalArea: 147781.069, representative: '110동' });
  });
  it('falls back to summed values without a recap', () => {
    expect(summarizeTitle(rows, null)).toMatchObject({ households: 120, totalArea: 13685.821 });
    expect(summarizeTitle([], null)).toBeNull();
  });
});
