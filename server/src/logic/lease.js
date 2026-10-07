// v3 계약·호실·건물 상태 (docs/butler-poc-improvement-spec.md 7.1, 7.2). DB 비의존 순수 함수.
// 날짜는 'YYYY-MM-DD' 문자열, 기준 날짜(today)는 주입한다(설정 TODAY, 검증 재현성).

export const EXPIRING_DAYS = 120;

const dayNumber = (ymd) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000);
/** to − from (일) */
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

/** 계약 자체의 상태: 시작 전 / 임대 중 / 만료 임박(종료일까지 120일 이하) / 종료 */
export function leaseStatus(lease, today) {
  if (lease.end_date < today) return 'ENDED';
  if (lease.start_date > today) return 'UPCOMING';
  return daysBetween(today, lease.end_date) <= EXPIRING_DAYS ? 'EXPIRING' : 'ACTIVE';
}

/** 호실 상태: 진행 중 계약이 있으면 임대 중/만료 임박, 없고 시작 전 계약이 있으면 입주 예정, 그 외 공실 */
export function unitStatus(leases, today) {
  const ongoing = leases.find((l) => l.start_date <= today && today <= l.end_date);
  if (ongoing) {
    return { status: leaseStatus(ongoing, today) === 'EXPIRING' ? 'EXPIRING' : 'LEASED', lease: ongoing, dDay: daysBetween(today, ongoing.end_date) };
  }
  const upcoming = leases.filter((l) => l.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) return { status: 'MOVE_IN', lease: upcoming, dDay: daysBetween(today, upcoming.start_date) };
  return { status: 'VACANT', lease: null, dDay: null };
}

/** 건물 상태(7.2): 호실 없음 → 등록 중, 만료 임박 호실 있음 → 확인 필요, 그 외 운영 중 */
export function buildingStatus(unitStatuses) {
  if (!unitStatuses.length) return 'REGISTERING';
  return unitStatuses.includes('EXPIRING') ? 'CHECK' : 'OPERATING';
}

/** 입주율 = (임대 중 + 만료 임박) ÷ 보유 호실 수 */
export function occupancy(unitStatuses, ownedUnitCount) {
  const leased = unitStatuses.filter((s) => s === 'LEASED' || s === 'EXPIRING').length;
  return { leased, owned: ownedUnitCount, rate: ownedUnitCount ? leased / ownedUnitCount : 0 };
}

/** 같은 호실의 두 계약 기간이 겹치는가 (양끝 포함) */
export const overlaps = (a, b) => a.start_date <= b.end_date && b.start_date <= a.end_date;

/** 계약 관리 정렬: 만료 임박 → 임대 중 → 시작 전 → 종료, 같은 상태 안에서는 종료일이 가까운 순 */
const ORDER = { EXPIRING: 0, ACTIVE: 1, UPCOMING: 2, ENDED: 3 };
export function sortLeases(leases, today) {
  return [...leases].sort((a, b) => {
    const sa = leaseStatus(a, today);
    const sb = leaseStatus(b, today);
    if (sa !== sb) return ORDER[sa] - ORDER[sb];
    return Math.abs(daysBetween(today, a.end_date)) - Math.abs(daysBetween(today, b.end_date)) || a.id - b.id;
  });
}
