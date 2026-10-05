import { HttpError } from '../errors.js';
import { lookupExclusiveUnit } from '../external/bldrgst.js';
import { floorFromHo } from '../logic/link.js';
import { addMonths, lastMonths } from '../logic/months.js';
import { ensureBasisForBjd, ensureDetail } from './complexDetail.js';
import { areaOptions, registerRowFilter, resolveLink, resolveScope } from './linking.js';

const LINK_FAIL_MSG = '이 단지는 실거래가를 연결할 수 없습니다. 다른 단지를 선택해 주세요.';
const cleanDong = (s) => String(s ?? '').trim().replace(/동$/, '');
const cleanHo = (s) => String(s ?? '').trim().replace(/호$/, '');

/** 단지를 준비하고 연결 집합을 구한다. 거래가 부족하면 최근 12개월 → 36개월로 넓혀 수집한다. */
async function prepareComplex(ctx, kaptCode, { assetAreaU = null, jobId } = {}) {
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

/** GET /api/units/lookup — 대장에서 전용면적·층 자동 조회, 실패 시 직접 입력 선택지 (PRD 7.2) */
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
  if (unit) {
    return { status: 'auto', dong: d, ho: h, areaU: unit.areaU, floor: unit.floor, ownerKnown: scope.ownerKnown };
  }
  return {
    status: 'manual',
    dong: d,
    ho: h,
    message: '건축물대장에서 이 호실을 찾지 못했습니다. 전용면적을 고르고 층을 확인해 주세요.',
    areaOptions: areaOptions(db, scope.aptSeqs),
    floorDefault: floorFromHo(h),
    ownerKnown: scope.ownerKnown,
  };
}

/** POST /api/assets — 자산 저장 후 수집 시작 (PRD 7.8: 최근 12개월 + 매칭 검색 4개월) */
export async function createAsset(ctx, body) {
  const { db } = ctx;
  const { kaptCode } = body;
  const dong = cleanDong(body.dong);
  const ho = cleanHo(body.ho);
  const acquisitionYm = body.acquisitionYm ? String(body.acquisitionYm) : null;
  if (acquisitionYm && !/^\d{6}$/.test(acquisitionYm)) throw new HttpError(400, 'BAD_INPUT', '취득 연월 형식이 올바르지 않습니다.');
  if (acquisitionYm && acquisitionYm > ctx.asOf()) throw new HttpError(400, 'BAD_INPUT', '취득 연월은 이번 달 이전이어야 합니다.');

  // 자동 조회 값은 서버가 다시 확인한다. 직접 입력은 실거래 면적 목록 안에서만 받는다.
  const looked = await lookupUnit(ctx, { kaptCode, dong, ho });
  let areaU;
  let floor;
  let areaSource;
  if (looked.status === 'auto' && body.areaSource !== 'manual') {
    areaU = looked.areaU;
    floor = looked.floor;
    areaSource = 'auto';
  } else {
    areaU = Number(body.areaU);
    floor = Number(body.floor);
    areaSource = 'manual';
    const options = looked.status === 'manual' ? looked.areaOptions.map((o) => o.areaU) : [looked.areaU];
    if (!options.includes(areaU)) throw new HttpError(400, 'BAD_INPUT', '전용면적은 목록에서 골라 주세요.');
    if (!Number.isInteger(floor) || floor < -10 || floor > 120) throw new HttpError(400, 'BAD_INPUT', '층을 확인해 주세요.');
  }

  const info = db.prepare(`INSERT INTO assets (user_id, kapt_code, dong, ho, floor, area_u, area_source, acquisition_ym, created_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`).run(kaptCode, dong, ho, floor, areaU, areaSource, acquisitionYm, new Date().toISOString());
  const id = Number(info.lastInsertRowid);
  startInitialCollection(ctx, id);
  return getAssetRow(db, id);
}

export function initialMonths(asOf, acquisitionYm) {
  const months = new Set(lastMonths(asOf, 12));
  if (acquisitionYm) for (let i = -3; i <= 0; i++) months.add(addMonths(acquisitionYm, i));
  return [...months].sort();
}

export function startInitialCollection(ctx, assetId) {
  const a = getAssetRow(ctx.db, assetId);
  const c = ctx.db.prepare('SELECT sigungu_code FROM complexes WHERE kapt_code = ?').get(a.kapt_code);
  ctx.collector.ensure(c.sigungu_code, initialMonths(ctx.asOf(), a.acquisition_ym), { jobId: `asset:${assetId}` })
    .catch((e) => console.warn(`[collect] asset ${assetId}: ${e.message}`));
}

export function getAssetRow(db, id) {
  return db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
}

export function deleteAsset(db, id) {
  const r = db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  if (!r.changes) throw new HttpError(404, 'NO_ASSET', '자산을 찾을 수 없습니다.');
}
