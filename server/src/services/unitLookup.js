import { HttpError } from '../errors.js';
import { lookupExclusiveUnit } from '../external/bldrgst.js';
import { floorFromHo } from '../logic/link.js';
import { lastMonths } from '../logic/months.js';
import { ensureBasisForBjd, ensureDetail } from './complexDetail.js';
import { areaOptions, registerRowFilter, resolveLink, resolveScope } from './linking.js';

const LINK_FAIL_MSG = '이 단지는 실거래가를 연결할 수 없습니다. 다른 단지를 선택해 주세요.';
export const cleanDong = (s) => String(s ?? '').trim().replace(/동$/, '');
export const cleanHo = (s) => String(s ?? '').trim().replace(/호$/, '');

/** 단지를 준비하고 연결 집합을 구한다. 거래가 부족하면 최근 12개월 → 36개월로 넓혀 수집한다. */
export async function prepareComplex(ctx, kaptCode, { assetAreaU = null, jobId } = {}) {
  const { db, api, collector } = ctx;
  const c0 = await ensureDetail(db, api, kaptCode);
  if (!c0) throw new HttpError(404, 'NO_COMPLEX', '단지를 찾을 수 없습니다. 다시 검색해 주세요.');
  if (c0.bonbun === null) throw new HttpError(422, 'LINK_FAILED', LINK_FAIL_MSG);
  await ensureBasisForBjd(db, api, c0.bjd_code);
  const asOf = ctx.asOf();
  for (const span of [12, 36]) {
    await collector.ensure(c0.sigungu_code, lastMonths(asOf, span), { jobId });
    const link = resolveLink(db, c0, { assetAreaU });
    if (link.aptSeqs.length || link.error === 'AMBIGUOUS_SHARED_LOT' || link.error === 'AMBIGUOUS_NAME') return { complex: c0, link };
  }
  return { complex: c0, link: { aptSeqs: [], error: 'NOT_FOUND' } };
}

/** GET /api/units/lookup — 대장에서 전용면적·층 자동 조회, 실패 시 직접 입력 선택지 (PRD 7.2). 결과를 저장해 둔다. */
export async function lookupUnit(ctx, { kaptCode, dong, ho }) {
  const d = cleanDong(dong);
  const h = cleanHo(ho);
  if (!kaptCode || !d || !h) throw new HttpError(400, 'BAD_INPUT', '단지, 동, 호를 모두 입력해 주세요.');
  const { db, api } = ctx;
  const jobId = `lookup:${kaptCode}`;
  let { complex, link } = await prepareComplex(ctx, kaptCode, { jobId });

  const unit = await lookupExclusiveUnit(api, {
    sigunguCd: complex.sigungu_code, bjdongCd: complex.bjd_code.slice(5), bonbun: complex.bonbun, bubun: complex.bubun, dong: d, ho: h,
  }, registerRowFilter(db, complex));

  if (!link.aptSeqs.length && unit && link.error === 'NOT_FOUND') link = resolveLink(db, complex, { assetAreaU: unit.areaU });
  if (!link.aptSeqs.length) throw new HttpError(422, 'LINK_FAILED', LINK_FAIL_MSG, { reason: link.error });

  const scope = resolveScope(db, link.aptSeqs, d, unit?.areaU ?? null);
  const result = unit
    ? { status: 'auto', dong: d, ho: h, areaU: unit.areaU, floor: unit.floor, ownerKnown: scope.ownerKnown }
    : {
      status: 'manual',
      dong: d,
      ho: h,
      message: '건축물대장에서 이 호실을 찾지 못했습니다. 전용면적을 고르고 층을 확인해 주세요.',
      areaOptions: areaOptions(db, scope.aptSeqs),
      floorDefault: floorFromHo(h),
      ownerKnown: scope.ownerKnown,
    };
  db.prepare(`INSERT INTO unit_lookups (kapt_code, dong, ho, result, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (kapt_code, dong, ho) DO UPDATE SET result = excluded.result, fetched_at = excluded.fetched_at`)
    .run(kaptCode, d, h, JSON.stringify(result), new Date().toISOString());
  return result;
}

const LOOKUP_REUSE_MS = 60 * 60 * 1000;

/**
 * 호실 저장 때 쓰는 조회: 최근 1시간 안의 조회 결과가 있으면 그것을, 없으면 다시 조회한다.
 * (서버가 면적·층을 다시 확인하는 동작은 유지하고, 건축물대장 장애 때 저장이 막히지 않게 한다.)
 */
export async function lookupForSave(ctx, { kaptCode, dong, ho }) {
  const row = ctx.db.prepare('SELECT result, fetched_at FROM unit_lookups WHERE kapt_code = ? AND dong = ? AND ho = ?')
    .get(kaptCode, cleanDong(dong), cleanHo(ho));
  if (row && Date.now() - Date.parse(row.fetched_at) < LOOKUP_REUSE_MS) return JSON.parse(row.result);
  return lookupUnit(ctx, { kaptCode, dong, ho });
}

/** 저장할 면적·층을 정한다. 자동 조회 값은 그대로, 직접 입력은 실거래 면적 목록 안에서만 받는다. */
export function resolveUnitInput(looked, body) {
  if (looked.status === 'auto' && body.areaSource !== 'manual') {
    return { areaU: looked.areaU, floor: looked.floor, areaSource: 'auto' };
  }
  const areaU = Number(body.areaU);
  const floor = Number(body.floor);
  const options = looked.status === 'manual' ? looked.areaOptions.map((o) => o.areaU) : [looked.areaU];
  if (!options.includes(areaU)) throw new HttpError(400, 'BAD_INPUT', '전용면적은 목록에서 골라 주세요.');
  if (!Number.isInteger(floor) || floor < -10 || floor > 120) throw new HttpError(400, 'BAD_INPUT', '층을 확인해 주세요.');
  return { areaU, floor, areaSource: 'manual' };
}
