// 개선 v2 비교 근거 (docs/IMPROVEMENT-SPEC.md 3.3~3.5, 4.2).
// GET은 DB만 읽는다. 빠진 달 수집은 POST(collectComparisons)만 시작한다.
import { COMPARE, groupComplexAreas, neighborhoodComplexes, sameFloorTrades } from '../logic/compare.js';
import { lastMonths, monthRange } from '../logic/months.js';
import { rangeStart } from '../logic/price.js';
import { initialMonths, startInitialCollection } from './assets.js';
import { resolveLink } from './linking.js';
import { assetTrades, getAsset } from './valuation.js';

// 같은 층 기간은 3년 탭과 같은 달이라 수집 작업(진행률)을 함께 쓴다. 단지·동네 12개월은 등록 수집 범위 안이다.
const floorJob = (id) => `series:${id}:${COMPARE.floorRange}`;
const assetJob = (id) => `asset:${id}`;

function periods(ctx, a) {
  const asOf = ctx.asOf();
  return {
    floor: monthRange(rangeStart(COMPARE.floorRange, asOf), asOf),
    complex: lastMonths(asOf, COMPARE.complexMonths),
    hood: lastMonths(asOf, COMPARE.hoodMonths),
    initial: initialMonths(asOf, a.acquisition_ym),
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

export function assetComparisons(ctx, id) {
  const { db } = ctx;
  const a = getAsset(ctx, id);
  const c = db.prepare('SELECT * FROM complexes WHERE kapt_code = ?').get(a.kapt_code);
  const sgg = c.sigungu_code;
  const p = periods(ctx, a);

  const floorState = sectionState(ctx, sgg, p.floor, floorJob(id));
  const sameFloor = { ...floorState, ...span(p.floor), floor: a.floor };
  if (floorState.status === 'ready') {
    const { sorted } = assetTrades(db, a, c);
    Object.assign(sameFloor, sameFloorTrades(sorted, a.floor, { from: sameFloor.from, to: sameFloor.to }));
  }

  // 단지 전체: 현재가와 같은 인자로 연결 집합을 구한다 (assetTrades와 같은 결과).
  const link = resolveLink(db, c, { assetAreaU: a.area_u });
  const linked = link.aptSeqs.length > 0;

  const complexState = sectionState(ctx, sgg, p.complex, assetJob(id));
  const sameComplex = { ...complexState, ...span(p.complex), linked };
  if (complexState.status === 'ready') {
    const rows = linked
      ? db.prepare(`SELECT * FROM trades WHERE sgg_cd = ? AND apt_seq IN (${link.aptSeqs.map(() => '?').join(',')}) AND deal_ym BETWEEN ? AND ?`)
        .all(sgg, ...link.aptSeqs, sameComplex.from, sameComplex.to)
      : [];
    Object.assign(sameComplex, groupComplexAreas(rows, a.area_u, { from: sameComplex.from, to: sameComplex.to }));
  }

  const hoodState = sectionState(ctx, sgg, p.hood, assetJob(id));
  const neighborhood = { ...hoodState, ...span(p.hood), dong: c.umd_name, linked };
  if (hoodState.status === 'ready') {
    if (linked) {
      const rows = db.prepare('SELECT * FROM trades WHERE sgg_cd = ? AND umd_cd = ? AND deal_ym BETWEEN ? AND ?')
        .all(sgg, c.bjd_code.slice(5, 10), neighborhood.from, neighborhood.to);
      Object.assign(neighborhood, neighborhoodComplexes(rows, a.area_u, link.aptSeqs, { from: neighborhood.from, to: neighborhood.to }));
    } else {
      // 내 단지를 제외할 수 없으므로 계산하지 않는다 (명세 3.5)
      Object.assign(neighborhood, { count: 0, complexCount: 0, median: null, complexes: [] });
    }
  }

  return { asOf: ctx.asOf(), sameFloor, sameComplex, neighborhood };
}

/** POST — 빠진 달만 수집한다. 이미 진행 중인 작업은 다시 시작하지 않는다. */
export function collectComparisons(ctx, id) {
  const a = getAsset(ctx, id);
  const sgg = ctx.db.prepare('SELECT sigungu_code FROM complexes WHERE kapt_code = ?').get(a.kapt_code).sigungu_code;
  const p = periods(ctx, a);
  if (missingOf(ctx, sgg, p.floor).length && !ctx.collector.progress(floorJob(id))?.running) {
    ctx.collector.ensure(sgg, p.floor, { jobId: floorJob(id) }).catch((e) => console.warn(`[compare] asset ${id}: ${e.message}`));
  }
  if (missingOf(ctx, sgg, [...p.complex, ...p.hood, ...p.initial]).length && !ctx.collector.progress(assetJob(id))?.running) {
    startInitialCollection(ctx, id);
  }
}
