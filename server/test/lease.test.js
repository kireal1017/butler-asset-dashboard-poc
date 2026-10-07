import { describe, it, expect } from 'vitest';
import { buildingStatus, daysBetween, leaseStatus, occupancy, overlaps, sortLeases, unitStatus } from '../src/logic/lease.js';

const L = (id, start, end) => ({ id, start_date: start, end_date: end });
const TODAY = '2026-10-08';

describe('7.1 계약·호실 상태', () => {
  it('120 days left is 만료 임박, 121 days is 임대 중', () => {
    expect(daysBetween(TODAY, '2027-02-05')).toBe(120);
    expect(leaseStatus(L(1, '2025-02-06', '2027-02-05'), TODAY)).toBe('EXPIRING');
    expect(leaseStatus(L(1, '2025-02-06', '2027-02-06'), TODAY)).toBe('ACTIVE');
    expect(unitStatus([L(1, '2025-02-06', '2027-02-05')], TODAY)).toMatchObject({ status: 'EXPIRING', dDay: 120 });
    expect(unitStatus([L(1, '2025-02-06', '2027-02-06')], TODAY)).toMatchObject({ status: 'LEASED', dDay: 121 });
  });

  it('start day and end day count as ongoing; ended and upcoming are classified', () => {
    expect(leaseStatus(L(1, TODAY, '2028-01-01'), TODAY)).toBe('ACTIVE');
    expect(leaseStatus(L(1, '2024-01-01', TODAY), TODAY)).toBe('EXPIRING');
    expect(leaseStatus(L(1, '2024-01-01', '2026-10-07'), TODAY)).toBe('ENDED');
    expect(leaseStatus(L(1, '2026-11-01', '2028-10-31'), TODAY)).toBe('UPCOMING');
  });

  it('unit is 입주 예정 with only an upcoming lease, 공실 with none or only ended', () => {
    expect(unitStatus([L(1, '2026-11-01', '2028-10-31')], TODAY)).toMatchObject({ status: 'MOVE_IN', dDay: 24 });
    expect(unitStatus([L(1, '2020-01-01', '2022-01-01')], TODAY)).toMatchObject({ status: 'VACANT', lease: null });
    expect(unitStatus([], TODAY).status).toBe('VACANT');
    // 진행 중 계약이 있으면 시작 전 계약보다 우선
    expect(unitStatus([L(2, '2027-09-01', '2029-08-31'), L(1, '2025-09-01', '2027-08-31')], TODAY)).toMatchObject({ status: 'LEASED', lease: { id: 1 } });
  });
});

describe('7.2 건물 상태·입주율', () => {
  it('등록 중 without units, 확인 필요 with an expiring unit, otherwise 운영 중', () => {
    expect(buildingStatus([])).toBe('REGISTERING');
    expect(buildingStatus(['LEASED', 'EXPIRING'])).toBe('CHECK');
    expect(buildingStatus(['LEASED', 'VACANT', 'MOVE_IN'])).toBe('OPERATING');
  });

  it('occupancy counts leased + expiring over owned units', () => {
    expect(occupancy(['LEASED', 'EXPIRING', 'VACANT', 'MOVE_IN'], 5)).toEqual({ leased: 2, owned: 5, rate: 0.4 });
    expect(occupancy(['LEASED'], 1)).toEqual({ leased: 1, owned: 1, rate: 1 });
  });
});

describe('겹침·정렬', () => {
  it('detects overlapping periods inclusive of both ends', () => {
    expect(overlaps(L(1, '2025-01-01', '2026-12-31'), L(2, '2026-12-31', '2028-12-31'))).toBe(true);
    expect(overlaps(L(1, '2025-01-01', '2026-12-30'), L(2, '2026-12-31', '2028-12-31'))).toBe(false);
  });

  it('sorts 만료 임박 → 임대 중 → 시작 전 → 종료, then nearest end date', () => {
    const leases = [
      L(1, '2020-01-01', '2022-01-01'), // 종료
      L(2, '2025-01-01', '2028-01-01'), // 임대 중 (먼 종료)
      L(3, '2026-11-01', '2028-10-31'), // 시작 전
      L(4, '2025-01-01', '2026-12-01'), // 만료 임박
      L(5, '2025-01-01', '2027-06-01'), // 임대 중 (가까운 종료)
    ];
    expect(sortLeases(leases, TODAY).map((l) => l.id)).toEqual([4, 5, 2, 3, 1]);
  });
});
