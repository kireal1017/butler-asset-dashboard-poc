// 상태 → 뱃지 톤·문구 (spec 7.1, 7.2, DESIGN-mobile 3장 뱃지 3톤)

/** 호실 임대 상태 */
export function unitBadge(leaseStatus, dDay) {
  switch (leaseStatus) {
    case 'LEASED': return { tone: 'ok', text: '임대 중' };
    case 'EXPIRING': return { tone: 'warn', text: `만료 임박 D-${dDay}` };
    case 'MOVE_IN': return { tone: 'neutral', text: '입주 예정' };
    default: return { tone: 'neutral', text: '공실' };
  }
}

/** 건물 상태 */
export const BUILDING_STATUS = {
  OPERATING: { tone: 'ok', text: '운영 중' },
  REGISTERING: { tone: 'neutral', text: '등록 중' },
  CHECK: { tone: 'warn', text: '확인 필요' },
};

/** 계약 상태 (dDay = 종료일까지 남은 날) */
export function leaseBadge(status, dDay) {
  switch (status) {
    case 'ACTIVE': return { tone: 'ok', text: '임대 중' };
    case 'EXPIRING': return { tone: 'warn', text: `만료 임박 D-${dDay}` };
    case 'UPCOMING': return { tone: 'neutral', text: '시작 전' };
    default: return { tone: 'neutral', text: '종료' };
  }
}

const dayNumber = (ymd) => Math.floor(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000);
/** 'YYYY-MM-DD' 두 날짜 사이 일수 (to − from) */
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
