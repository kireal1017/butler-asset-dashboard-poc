import { comparableTrades } from '../logic/price.js';
import { lastMonths } from '../logic/months.js';
import { resolveLink, resolveScope } from './linking.js';

/**
 * 시세 계산 대상(subject): 호실 하나의 단지·동·층·면적.
 * v3에서 자산(assets 행) 대신 호실(units)을 받도록 입력부만 바꿨다. 계산(logic/*)은 그대로다.
 * @typedef {{ id: number, kaptCode: string, dong: string, floor: number, areaU: number, acquisitionYm?: string|null }} Subject
 */

export const complexOf = (db, kaptCode) => db.prepare('SELECT * FROM complexes WHERE kapt_code = ?').get(kaptCode);

/** 대상의 비교 범위(내 동이 속한 실거래 단지·같은 면적)와 정렬된 거래 (기존 assetTrades와 같은 계산) */
export function subjectTrades(db, s, c = complexOf(db, s.kaptCode)) {
  const link = resolveLink(db, c, { assetAreaU: s.areaU });
  const scope = resolveScope(db, link.aptSeqs, s.dong, s.areaU);
  if (!scope.aptSeqs.length) return { scope, sorted: [] };
  const rows = db.prepare(`SELECT * FROM trades WHERE sgg_cd = ? AND apt_seq IN (${scope.aptSeqs.map(() => '?').join(',')})`)
    .all(c.sigungu_code, ...scope.aptSeqs);
  return { scope, sorted: comparableTrades(rows, s.areaU) };
}

// 늦게 들어오는 해제 신고(14%가 계약 90일 이후, docs/data-quality.md)를 잡기 위해 최근 12개월을 다시 받는다.
export const REFRESH_MONTHS = 12;

/** 앱 재진입 시 재수집: 호실이 있는 시군구마다 최근 12개월 중 없거나 30일 지난 달. 큐가 (시군구, 월)로 중복을 막는다. */
export function refreshOnOpen(ctx) {
  const sggs = ctx.db.prepare(`SELECT DISTINCT c.sigungu_code AS sgg FROM units u
    JOIN buildings b ON b.id = u.building_id JOIN complexes c ON c.kapt_code = b.kapt_code`).all().map((r) => r.sgg);
  const recent = lastMonths(ctx.asOf(), REFRESH_MONTHS);
  for (const sgg of sggs) {
    ctx.collector.ensure(sgg, recent, { mode: 'stale' }).catch((e) => console.warn(`[refresh] ${sgg}: ${e.message}`));
  }
}
