// 비교 근거 3가지 (docs/IMPROVEMENT-SPEC.md 3.3~3.5, v3에서 "로직 그대로" 유지).
// GET은 DB만 읽는다. 빠진 달 수집은 POST(collectComparisons)만 시작한다.
// v3: 입력이 자산 행에서 호실 subject로 바뀌었고, v3에 없는 취득 연월 앞뒤 수집은 뺐다.
import { COMPARE, groupComplexAreas, neighborhoodComplexes, sameFloorTrades } from '../logic/compare.js';
import { lastMonths, monthRange } from '../logic/months.js';
import { rangeStart } from '../logic/price.js';
import { resolveLink } from './linking.js';
import { complexOf, subjectTrades } from './valuation.js';

// 같은 층은 최근 3년, 단지·동네는 최근 12개월. 12개월은 호실 등록 때 받는 범위(recentJob)와 같다.
const floorJob = (id) => `floor:${id}`;
export const recentJob = (id) => `recent:${id}`;

function periods(ctx) {
  const asOf = ctx.asOf();
  return {
    floor: monthRange(rangeStart(COMPARE.floorRange, asOf), asOf),
    complex: lastMonths(asOf, COMPARE.complexMonths),
    hood: lastMonths(asOf, COMPARE.hoodMonths),
  };
}

const missingOf = (ctx, sgg, months) => months.filter((ym) => ctx.collector.isMissing(sgg, ym));

/** 섹션 상태: 빠진 달이 없으면 ready, 수집 중이면 collecting, 그 작업이 실패했으면 failed, 아니면 missing */
function sectionState(ctx, sgg, months, jobId) {
  const missing = missingOf(ctx, sgg, months);
  if (!missing.length) return { status: 'ready' };
  const p = ctx.collector.progress(jobId);
  if (p?.running) return { status: 'collecting', progress: { total: p.total, done: p.done } };
  if (p?.failed) return { status: 'failed', error: p.error?.message ?? '수집에 실패했습니다.' };
  return { status: 'missing', progress: { total: missing.length, done: 0 } };
}

const span = (months) => ({ months: months.length, from: months[0], to: months[months.length - 1] });

/** @param {import('./valuation.js').Subject} s */
export function subjectComparisons(ctx, s) {
  const { db } = ctx;
  const c = complexOf(db, s.kaptCode);
  const sgg = c.sigungu_code;
  const p = periods(ctx);

  const floorState = sectionState(ctx, sgg, p.floor, floorJob(s.id));
  const sameFloor = { ...floorState, ...span(p.floor), floor: s.floor };
  if (floorState.status === 'ready') {
    const { sorted } = subjectTrades(db, s, c);
    Object.assign(sameFloor, sameFloorTrades(sorted, s.floor, { from: sameFloor.from, to: sameFloor.to }));
  }

  // 단지 전체: 참고가와 같은 인자로 연결 집합을 구한다 (subjectTrades와 같은 결과).
  const link = resolveLink(db, c, { assetAreaU: s.areaU });
  const linked = link.aptSeqs.length > 0;

  const complexState = sectionState(ctx, sgg, p.complex, recentJob(s.id));
  const sameComplex = { ...complexState, ...span(p.complex), linked };
  if (complexState.status === 'ready') {
    const rows = linked
      ? db.prepare(`SELECT * FROM trades WHERE sgg_cd = ? AND apt_seq IN (${link.aptSeqs.map(() => '?').join(',')}) AND deal_ym BETWEEN ? AND ?`)
        .all(sgg, ...link.aptSeqs, sameComplex.from, sameComplex.to)
      : [];
    Object.assign(sameComplex, groupComplexAreas(rows, s.areaU, { from: sameComplex.from, to: sameComplex.to }));
  }

  const hoodState = sectionState(ctx, sgg, p.hood, recentJob(s.id));
  const neighborhood = { ...hoodState, ...span(p.hood), dong: c.umd_name, linked };
  if (hoodState.status === 'ready') {
    if (linked) {
      const rows = db.prepare('SELECT * FROM trades WHERE sgg_cd = ? AND umd_cd = ? AND deal_ym BETWEEN ? AND ?')
        .all(sgg, c.bjd_code.slice(5, 10), neighborhood.from, neighborhood.to);
      Object.assign(neighborhood, neighborhoodComplexes(rows, s.areaU, link.aptSeqs, { from: neighborhood.from, to: neighborhood.to }));
    } else {
      // 내 단지를 제외할 수 없으므로 계산하지 않는다 (명세 3.5)
      Object.assign(neighborhood, { count: 0, complexCount: 0, median: null, complexes: [] });
    }
  }

  return { asOf: ctx.asOf(), sameFloor, sameComplex, neighborhood };
}

/** POST — 빠진 달만 수집한다. 이미 진행 중인 작업은 다시 시작하지 않는다. */
export function collectComparisons(ctx, s) {
  const sgg = complexOf(ctx.db, s.kaptCode).sigungu_code;
  const p = periods(ctx);
  if (missingOf(ctx, sgg, p.floor).length && !ctx.collector.progress(floorJob(s.id))?.running) {
    ctx.collector.ensure(sgg, p.floor, { jobId: floorJob(s.id) }).catch((e) => console.warn(`[compare] unit ${s.id}: ${e.message}`));
  }
  if (missingOf(ctx, sgg, [...p.complex, ...p.hood]).length && !ctx.collector.progress(recentJob(s.id))?.running) {
    ctx.collector.ensure(sgg, p.complex, { jobId: recentJob(s.id) }).catch((e) => console.warn(`[compare] unit ${s.id}: ${e.message}`));
  }
}
