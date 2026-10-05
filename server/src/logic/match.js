// PRD 7.6 매입 거래 매칭
import { sameArea } from './link.js';
import { addMonths } from './months.js';
import { compareTrades, isCancelled } from './price.js';

/** 검색 기간: 입력한 달과 그 앞 3개월 */
export const matchWindow = (acquisitionYm) => ({ from: addMonths(acquisitionYm, -3), to: acquisitionYm });

/**
 * 후보: 같은 단지(호출자가 aptSeq로 거름)·같은 면적·같은 층·해제 아님·검색 기간 안.
 * 동 정보가 있고 같으면 맨 위, 다르면 제외, 없으면 그대로 둔다. 같은 그룹 안에서는 최근 거래가 위.
 */
export function findCandidates(trades, { areaU, floor, dong, acquisitionYm }) {
  const { from, to } = matchWindow(acquisitionYm);
  const inScope = trades.filter((t) => !isCancelled(t) && sameArea(t.area_u, areaU) && t.floor === floor
    && t.deal_ym >= from && t.deal_ym <= to && (!t.apt_dong || t.apt_dong === String(dong)));
  const newestFirst = (a, b) => compareTrades(b, a);
  const matched = inScope.filter((t) => t.apt_dong).sort(newestFirst);
  const unknown = inScope.filter((t) => !t.apt_dong).sort(newestFirst);
  return [...matched, ...unknown].map((t) => ({
    aptSeq: t.apt_seq,
    ym: t.deal_ym,
    day: t.deal_day,
    floor: t.floor,
    areaU: t.area_u,
    amount: t.deal_amount,
    dong: t.apt_dong,
    dongMatch: Boolean(t.apt_dong),
    direct: t.dealing_gbn === '직거래',
  }));
}

/** 확정 요청이 실제 후보 중 하나인지 값으로 확인한다. */
export const sameCandidate = (a, b) => ['aptSeq', 'ym', 'day', 'floor', 'areaU', 'amount'].every((k) => a[k] === b[k]);
