import { HttpError } from '../errors.js';
import { findCandidates, matchWindow, sameCandidate } from '../logic/match.js';
import { monthRange } from '../logic/months.js';
import { assetTrades, getAsset } from './valuation.js';

function validYm(ctx, ym) {
  if (!/^\d{6}$/.test(ym ?? '') || Number(ym.slice(4)) < 1 || Number(ym.slice(4)) > 12) {
    throw new HttpError(400, 'BAD_INPUT', '취득 연월을 확인해 주세요.');
  }
  if (ym > ctx.asOf()) throw new HttpError(400, 'BAD_INPUT', '취득 연월은 이번 달 이전이어야 합니다.');
  return ym;
}

/** POST /api/assets/:id/purchase/candidates — 저장되지 않은 달을 먼저 수집한 뒤 후보 반환 */
export async function purchaseCandidates(ctx, id, acquisitionYm) {
  const a = getAsset(ctx, id);
  const ym = validYm(ctx, acquisitionYm);
  const c = ctx.db.prepare('SELECT sigungu_code FROM complexes WHERE kapt_code = ?').get(a.kapt_code);
  const window = matchWindow(ym);
  await ctx.collector.ensure(c.sigungu_code, monthRange(window.from, window.to), { jobId: `match:${id}` });
  const { sorted } = assetTrades(ctx.db, { ...a, acquisition_ym: ym });
  return {
    window,
    candidates: findCandidates(sorted, { areaU: a.area_u, floor: a.floor, dong: a.dong, acquisitionYm: ym }),
  };
}

/** PUT /api/assets/:id/purchase — 매칭 확정(matched) 또는 직접 입력(manual) */
export async function savePurchase(ctx, id, body) {
  const a = getAsset(ctx, id);
  if (body.source === 'matched') {
    const ym = validYm(ctx, body.acquisitionYm ?? a.acquisition_ym);
    const { sorted } = assetTrades(ctx.db, a);
    const cand = findCandidates(sorted, { areaU: a.area_u, floor: a.floor, dong: a.dong, acquisitionYm: ym })
      .find((x) => sameCandidate(x, body.trade ?? {}));
    if (!cand) throw new HttpError(409, 'NOT_A_CANDIDATE', '선택한 거래를 후보에서 찾지 못했습니다. 다시 검색해 주세요.');
    ctx.db.prepare(`UPDATE assets SET purchase_price = ?, purchase_date = ?, purchase_source = 'matched', acquisition_ym = ? WHERE id = ?`)
      .run(cand.amount, `${cand.ym}${String(cand.day).padStart(2, '0')}`, ym, id);
  } else if (body.source === 'manual') {
    const ym = validYm(ctx, body.acquisitionYm);
    const price = Number(body.price);
    if (!Number.isInteger(price) || price <= 0 || price > 10_000_000) throw new HttpError(400, 'BAD_INPUT', '매입가를 만원 단위로 입력해 주세요.');
    ctx.db.prepare(`UPDATE assets SET purchase_price = ?, purchase_date = NULL, purchase_source = 'manual', acquisition_ym = ? WHERE id = ?`)
      .run(price, ym, id);
  } else {
    throw new HttpError(400, 'BAD_INPUT', '매입가 출처를 확인해 주세요.');
  }
  return getAsset(ctx, id);
}

/** DELETE /api/assets/:id/purchase */
export function deletePurchase(ctx, id) {
  getAsset(ctx, id);
  ctx.db.prepare(`UPDATE assets SET purchase_price = NULL, purchase_date = NULL, purchase_source = NULL, acquisition_ym = NULL WHERE id = ?`).run(id);
}
