import { HttpError } from '../errors.js';
import { comparableTrades, currentPrice, monthlySeries, priceChange, rangeStart, recentTrades, RANGE_MONTHS } from '../logic/price.js';
import { lastMonths, monthRange } from '../logic/months.js';
import { resolveLink, resolveScope } from './linking.js';
import { initialMonths } from './assets.js';

export function purchaseYm(a) {
  if (!a.purchase_price) return null;
  return a.purchase_source === 'matched' && a.purchase_date ? a.purchase_date.slice(0, 6) : a.acquisition_ym;
}

function complexOf(db, a) {
  return db.prepare('SELECT * FROM complexes WHERE kapt_code = ?').get(a.kapt_code);
}

/** 자산의 비교 범위(같은 단지·같은 면적)와 정렬된 거래 */
export function assetTrades(db, a, c = complexOf(db, a)) {
  const link = resolveLink(db, c, { assetAreaU: a.area_u });
  const scope = resolveScope(db, link.aptSeqs, a.dong, a.area_u);
  if (!scope.aptSeqs.length) return { scope, sorted: [] };
  const rows = db.prepare(`SELECT * FROM trades WHERE sgg_cd = ? AND apt_seq IN (${scope.aptSeqs.map(() => '?').join(',')})`)
    .all(c.sigungu_code, ...scope.aptSeqs);
  return { scope, sorted: comparableTrades(rows, a.area_u) };
}

function collectState(ctx, a, c) {
  const p = ctx.collector.progress(`asset:${a.id}`);
  const missing = initialMonths(ctx.asOf(), a.acquisition_ym).filter((ym) => ctx.collector.isMissing(c.sigungu_code, ym));
  if (p?.running) return { status: 'collecting', progress: { total: p.total, done: p.done } };
  if (!missing.length) return { status: 'ready' };
  if (p?.failed) return { status: 'failed', error: p.error?.message ?? '수집에 실패했습니다.' };
  return { status: 'collecting', progress: { total: missing.length, done: 0 } };
}

function purchaseView(a) {
  if (!a.purchase_price) return null;
  return { price: a.purchase_price, date: a.purchase_date, ym: purchaseYm(a), source: a.purchase_source };
}

export function assetSummary(ctx, a) {
  const c = complexOf(ctx.db, a);
  const { scope, sorted } = assetTrades(ctx.db, a, c);
  const state = collectState(ctx, a, c);
  const current = currentPrice(sorted);
  return {
    id: a.id,
    kaptCode: a.kapt_code,
    complexName: c.name,
    gu: c.gu,
    umdName: c.umd_name,
    dong: a.dong,
    ho: a.ho,
    floor: a.floor,
    areaU: a.area_u,
    areaSource: a.area_source,
    acquisitionYm: a.acquisition_ym,
    purchase: purchaseView(a),
    ownerKnown: scope.ownerKnown,
    ...state,
    status: state.status === 'ready' && !current ? 'no_trades' : state.status,
    current,
    change: priceChange(sorted, a.purchase_price),
  };
}

/**
 * 앱 재진입 시 재수집 (PRD 7.8): 자산이 있는 시군구마다 최근 3개월 중 없거나 30일 지난 달,
 * 그리고 등록 시 수집 범위에서 빠진 달(예: 서버 재시작으로 중단). 큐가 (시군구, 월)로 중복을 막는다.
 */
export function refreshOnOpen(ctx) {
  const assets = ctx.db.prepare('SELECT a.*, c.sigungu_code FROM assets a JOIN complexes c USING (kapt_code)').all();
  const recent = lastMonths(ctx.asOf(), 3);
  for (const sgg of new Set(assets.map((a) => a.sigungu_code))) {
    ctx.collector.ensure(sgg, recent, { mode: 'stale' }).catch((e) => console.warn(`[refresh] ${sgg}: ${e.message}`));
  }
  for (const a of assets) {
    const months = initialMonths(ctx.asOf(), a.acquisition_ym);
    if (months.some((ym) => ctx.collector.isMissing(a.sigungu_code, ym)) && !ctx.collector.progress(`asset:${a.id}`)?.running) {
      ctx.collector.ensure(a.sigungu_code, months, { jobId: `asset:${a.id}` }).catch((e) => console.warn(`[refresh] asset ${a.id}: ${e.message}`));
    }
  }
}

export function listAssets(ctx) {
  const rows = ctx.db.prepare('SELECT * FROM assets WHERE user_id = 1 ORDER BY id').all();
  return { asOf: ctx.asOf(), items: rows.map((a) => assetSummary(ctx, a)) };
}

export function getAsset(ctx, id) {
  const a = ctx.db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  if (!a) throw new HttpError(404, 'NO_ASSET', '자산을 찾을 수 없습니다.');
  return a;
}

export function assetDetail(ctx, id) {
  const a = getAsset(ctx, id);
  const c = complexOf(ctx.db, a);
  const { scope, sorted } = assetTrades(ctx.db, a, c);
  const total = (c.parking_ground ?? 0) + (c.parking_under ?? 0);
  return {
    asOf: ctx.asOf(),
    asset: assetSummary(ctx, a),
    scope: { aptSeqs: scope.aptSeqs, ownerKnown: scope.ownerKnown },
    recentTrades: recentTrades(sorted, 5),
    building: {
      useYear: c.use_date ? Number(c.use_date.slice(0, 4)) : null,
      households: c.households,
      parking: c.parking_ground === null && c.parking_under === null ? null : total,
    },
    ranges: [...Object.keys(RANGE_MONTHS), ...(a.purchase_price ? ['hold'] : [])],
  };
}

/** GET /api/assets/:id/series — 필요한 달이 없으면 수집한 뒤 응답 (collect=0이면 수집하지 않고 409) */
export async function assetSeries(ctx, id, range, { collect = true } = {}) {
  const a = getAsset(ctx, id);
  const c = complexOf(ctx.db, a);
  const asOf = ctx.asOf();
  const from = rangeStart(range, asOf, purchaseYm(a));
  if (!from) throw new HttpError(400, 'BAD_RANGE', range === 'hold' ? '매입가가 없어 보유 기간을 그릴 수 없습니다.' : '기간을 확인해 주세요.');
  const months = monthRange(from, asOf);
  const missing = months.filter((ym) => ctx.collector.isMissing(c.sigungu_code, ym));
  if (missing.length) {
    if (!collect) throw new HttpError(409, 'NOT_COLLECTED', `${missing.length}개월이 아직 수집되지 않았습니다.`);
    await ctx.collector.ensure(c.sigungu_code, months, { jobId: `series:${id}:${range}` });
  }
  const { sorted } = assetTrades(ctx.db, a, c);
  return {
    asOf, range, from, to: asOf,
    points: monthlySeries(sorted, from, asOf),
    purchase: purchaseView(a),
  };
}
