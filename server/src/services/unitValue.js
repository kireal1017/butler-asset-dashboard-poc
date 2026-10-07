// v3 매매 시세 (docs/butler-poc-improvement-spec.md 4.8 카드 ③, 7.3, 7.4, 7.7).
// 참고가는 기록(unit_value_references)의 가장 최근 줄을 보여 주고, 기록은 호실 등록 직후와 새로고침 때만 갱신한다.
import { HttpError } from '../errors.js';
import { lastMonths, addMonths, monthRange } from '../logic/months.js';
import { recentTrades } from '../logic/price.js';
import {
  REFERENCE_MONTHS, changeVsPurchase, periodAverages, priceBarLayout, priceRange, purchaseSuggestion, referencePrice,
} from '../logic/value.js';
import { recentJob } from './comparisons.js';
import { complexOf, subjectTrades } from './valuation.js';

const WON = 10000;
const REFRESH_COOLDOWN_MS = 60 * 1000;
const refreshJob = (id) => `refresh:${id}`;

export function unitRow(db, id) {
  const u = db.prepare(`SELECT u.*, b.kapt_code, b.name AS building_name, h.acquisition_ym, h.purchase_price, h.value_checked_at
    FROM units u JOIN buildings b ON b.id = u.building_id LEFT JOIN unit_holdings h ON h.unit_id = u.id WHERE u.id = ?`).get(id);
  if (!u) throw new HttpError(404, 'NO_UNIT', '호실을 찾을 수 없어요.');
  return u;
}

export const subjectOf = (u) => ({ id: u.id, kaptCode: u.kapt_code, dong: u.dong, floor: u.floor, areaU: u.area_u, acquisitionYm: u.acquisition_ym });

export function latestReference(db, unitId) {
  return db.prepare('SELECT * FROM unit_value_references WHERE unit_id = ? ORDER BY id DESC LIMIT 1').get(unitId) ?? null;
}

/** 근거 거래 묶음이 직전 기록과 다르면 새 줄, 같으면 value_checked_at만 갱신 (7.3) */
export function recordReference(ctx, unitId) {
  const { db } = ctx;
  const u = unitRow(db, unitId);
  const { sorted } = subjectTrades(db, subjectOf(u));
  const ref = referencePrice(sorted, ctx.asOf());
  const prev = latestReference(db, unitId);
  const now = new Date().toISOString();
  if (prev && prev.basis_hash === ref.basisHash) {
    db.prepare('UPDATE unit_holdings SET value_checked_at = ? WHERE unit_id = ?').run(now, unitId);
    return { added: false, reference: prev };
  }
  db.prepare(`INSERT INTO unit_value_references (unit_id, value, source, basis, basis_hash, trade_count, reference_date, transaction_ids, as_of, fetched_at)
    VALUES (?, ?, 'RTMS', ?, ?, ?, ?, ?, ?, ?)`).run(
    unitId, ref.value, `같은 단지·같은 면적 최근 ${REFERENCE_MONTHS}개월 거래 ${ref.count}건`, ref.basisHash, ref.count,
    ref.referenceDate, JSON.stringify(ref.transactionIds), ctx.asOf(), now,
  );
  db.prepare('UPDATE unit_holdings SET value_checked_at = ? WHERE unit_id = ?').run(now, unitId);
  return { added: true, reference: latestReference(db, unitId) };
}

/** 최근 12개월 수집 상태: 호실 등록 작업·새로고침 작업 중 하나라도 돌고 있으면 collecting */
function collectState(ctx, u) {
  const sgg = complexOf(ctx.db, u.kapt_code).sigungu_code;
  const months = lastMonths(ctx.asOf(), REFERENCE_MONTHS);
  for (const job of [refreshJob(u.id), recentJob(u.id)]) {
    const p = ctx.collector.progress(job);
    if (p?.running) return { status: 'collecting', progress: { total: p.total, done: p.done } };
  }
  const missing = months.filter((ym) => ctx.collector.isMissing(sgg, ym));
  if (!missing.length) return { status: 'ready' };
  const failed = [recentJob(u.id), refreshJob(u.id)].map((j) => ctx.collector.progress(j)).find((p) => p?.failed);
  if (failed) return { status: 'failed', error: failed.error?.message ?? '실거래 자료를 불러오지 못했어요.' };
  return { status: 'missing', progress: { total: missing.length, done: 0 } };
}

const referenceView = (r) => (r ? {
  value: r.value, referenceDate: r.reference_date, count: r.trade_count, basis: r.basis, asOf: r.as_of, fetchedAt: r.fetched_at,
} : null);

/** 호실 카드·호실 상세용 요약: 저장된 참고가와 매입가 대비 */
export function unitSummary(ctx, u) {
  const ref = latestReference(ctx.db, u.id);
  return {
    reference: referenceView(ref),
    change: ref ? changeVsPurchase(ref.value, u.purchase_price) : null,
    ...collectState(ctx, u),
  };
}

/** GET /api/units/:id/value — 자산 분석 상세 카드 ③ */
export function unitValue(ctx, id) {
  const { db } = ctx;
  const u = unitRow(db, id);
  const asOf = ctx.asOf();
  const { sorted } = subjectTrades(db, subjectOf(u));
  const ref = latestReference(db, id);
  const range = priceRange(sorted, asOf);
  const inWindow = sorted.filter((t) => t.deal_ym >= addMonths(asOf, -(REFERENCE_MONTHS - 1)) && t.deal_ym <= asOf);
  return {
    asOf,
    ...collectState(ctx, u),
    reference: referenceView(ref),
    acquisitionYm: u.acquisition_ym,
    purchasePrice: u.purchase_price,
    change: ref ? changeVsPurchase(ref.value, u.purchase_price) : null,
    periodAverages: periodAverages(sorted, asOf),
    range,
    bar: priceBarLayout(range, u.purchase_price, ref?.value ?? null),
    recentTrades: recentTrades(inWindow, 5).map((t) => ({ ...t, amount: t.amount * WON })),
  };
}

/** POST /api/units/:id/value/refresh — 최근 12개월을 다시 받고 참고가 기록을 갱신 (7.3) */
export function refreshUnitValue(ctx, id) {
  const u = unitRow(ctx.db, id);
  ctx.refreshedAt ??= new Map();
  if (ctx.collector.progress(refreshJob(id))?.running) return { started: false, running: true };
  const last = ctx.refreshedAt.get(id);
  if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
    throw new HttpError(429, 'REFRESH_COOLDOWN', '방금 새로고침했어요. 1분 뒤에 다시 시도해 주세요.');
  }
  const sgg = complexOf(ctx.db, u.kapt_code).sigungu_code;
  ctx.collector.ensure(sgg, lastMonths(ctx.asOf(), REFERENCE_MONTHS), { jobId: refreshJob(id), mode: 'force' })
    .then(() => recordReference(ctx, id))
    .catch((e) => console.warn(`[refresh] unit ${id}: ${e.message}`))
    .finally(() => ctx.refreshedAt.set(id, Date.now()));
  return { started: true };
}

/**
 * POST /api/purchase-suggestion — 취득 연월 1→3→6개월 같은 단지·같은 면적 평균 (7.7).
 * 필요한 달(취득 월 포함 이전 6개월) 중 없는 달만 수집한다.
 */
export async function suggestPurchase(ctx, { kaptCode, dong, areaU, acquisitionYm }) {
  if (!kaptCode || !dong || !Number.isInteger(Number(areaU)) || !/^\d{6}$/.test(String(acquisitionYm ?? ''))) {
    throw new HttpError(400, 'BAD_INPUT', '단지, 동, 면적, 취득 연월을 확인해 주세요.');
  }
  if (acquisitionYm > ctx.asOf()) throw new HttpError(400, 'BAD_INPUT', '취득 연월은 이번 달 이전이어야 해요.');
  const c = complexOf(ctx.db, kaptCode);
  if (!c) throw new HttpError(404, 'NO_COMPLEX', '단지를 찾을 수 없어요.');
  const months = monthRange(addMonths(acquisitionYm, -5), acquisitionYm);
  await ctx.collector.ensure(c.sigungu_code, months, { jobId: `suggest:${kaptCode}:${acquisitionYm}` });
  const { sorted } = subjectTrades(ctx.db, { id: 0, kaptCode, dong: String(dong), floor: null, areaU: Number(areaU) }, c);
  return { acquisitionYm, suggestion: purchaseSuggestion(sorted, acquisitionYm) };
}
