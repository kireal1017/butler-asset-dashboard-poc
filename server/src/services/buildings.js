// v3 건물·호실 (docs/butler-poc-improvement-spec.md 4.2~4.6, 6장, 7.2).
import { HttpError } from '../errors.js';
import { buildingStatus, occupancy } from '../logic/lease.js';
import { lastMonths } from '../logic/months.js';
import { REFERENCE_MONTHS } from '../logic/value.js';
import { ensureDetail } from './complexDetail.js';
import { recentJob } from './comparisons.js';
import { collectRent, conversionRate, ensureBuildingSpec, ensureConversionRate, leaseConverted } from './analysis.js';
import { unitLeaseState } from './leases.js';
import { cleanDong, cleanHo, lookupForSave, resolveUnitInput } from './unitLookup.js';
import { recordReference, subjectOf, unitRow, unitSummary } from './unitValue.js';
import { complexOf } from './valuation.js';

const now = () => new Date().toISOString();

function buildingRow(db, id) {
  const b = db.prepare('SELECT * FROM buildings WHERE id = ?').get(id);
  if (!b) throw new HttpError(404, 'NO_BUILDING', '건물을 찾을 수 없어요.');
  return b;
}

const addressOf = (c) => c.addr || [c.sido, c.gu, c.umd_name].filter(Boolean).join(' ');

/** 건물 상태(7.2)와 입주율: 호실별 임대 상태에서 계산하고 저장하지 않는다 */
function buildingView(ctx, b) {
  const { db } = ctx;
  const c = complexOf(db, b.kapt_code);
  const unitIds = db.prepare('SELECT id FROM units WHERE building_id = ?').all(b.id).map((r) => r.id);
  const statuses = unitIds.map((id) => unitLeaseState(db, id, ctx.today()).leaseStatus);
  const count = (s) => statuses.filter((x) => x === s).length;
  const unitCount = unitIds.length;
  return {
    id: b.id,
    kaptCode: b.kapt_code,
    name: b.name,
    complexName: c.name,
    address: addressOf(c),
    gu: c.gu,
    umdName: c.umd_name,
    ownedUnitCount: b.owned_unit_count,
    unitCount,
    description: b.description,
    status: buildingStatus(statuses),
    occupancy: occupancy(statuses, b.owned_unit_count),
    // 건물 상세 통계 타일: 만료 임박은 임대 중에 포함(7.1 화면별 집계)
    unitStats: { leased: count('LEASED') + count('EXPIRING'), expiring: count('EXPIRING'), vacant: count('VACANT'), moveIn: count('MOVE_IN') },
    createdAt: b.created_at,
  };
}

export function listBuildings(ctx) {
  const rows = ctx.db.prepare('SELECT * FROM buildings ORDER BY id').all();
  const items = rows.map((b) => buildingView(ctx, b));
  const by = (s) => items.filter((b) => b.status === s).length;
  return {
    asOf: ctx.asOf(),
    today: ctx.today(),
    summary: { total: items.length, operating: by('OPERATING'), registering: by('REGISTERING'), check: by('CHECK') },
    items,
  };
}

function unitView(ctx, u) {
  return {
    id: u.id,
    buildingId: u.building_id,
    buildingName: u.building_name,
    dong: u.dong,
    ho: u.ho,
    areaU: u.area_u,
    floor: u.floor,
    areaSource: u.area_source,
    acquisitionYm: u.acquisition_ym,
    purchasePrice: u.purchase_price,
    ...unitSummary(ctx, u),
    ...unitLeaseState(ctx.db, u.id, ctx.today()),
  };
}

const unitOrder = (a, b) => a.dong.localeCompare(b.dong, 'ko', { numeric: true }) || a.ho.localeCompare(b.ho, 'ko', { numeric: true });

export function getBuilding(ctx, id) {
  const b = buildingRow(ctx.db, id);
  const units = ctx.db.prepare('SELECT id FROM units WHERE building_id = ?').all(id).map((r) => unitRow(ctx.db, r.id)).sort(unitOrder);
  return { asOf: ctx.asOf(), building: buildingView(ctx, b), units: units.map((u) => unitView(ctx, u)) };
}

function validName(name) {
  const n = String(name ?? '').trim();
  return n || null;
}

/** POST /api/buildings — 주소(단지)와 건물명은 필수, 같은 단지는 한 번만 */
export async function createBuilding(ctx, body) {
  const { db } = ctx;
  const kaptCode = String(body.kaptCode ?? '');
  const name = validName(body.name);
  if (!kaptCode || !name) throw new HttpError(400, 'BAD_INPUT', '건물명과 주소는 필수예요.');
  if (!complexOf(db, kaptCode)) throw new HttpError(404, 'NO_COMPLEX', '주소를 다시 검색해 주세요.');
  if (db.prepare('SELECT 1 FROM buildings WHERE kapt_code = ?').get(kaptCode)) throw new HttpError(409, 'DUP_BUILDING', '이미 등록한 건물이에요.');
  const owned = body.ownedUnitCount === undefined || body.ownedUnitCount === '' ? 1 : Number(body.ownedUnitCount);
  if (!Number.isInteger(owned) || owned < 1) throw new HttpError(400, 'BAD_INPUT', '보유 호실 수는 1 이상이어야 해요.');
  // 지번·주소를 채운다. 실패해도 등록은 끝낸다(검색 목록의 구·동 주소로 표시).
  await ensureDetail(db, ctx.api, kaptCode).catch((e) => console.warn(`[building] detail ${kaptCode}: ${e.message}`));
  const info = db.prepare('INSERT INTO buildings (kapt_code, name, owned_unit_count, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(kaptCode, name, owned, String(body.description ?? '').trim() || null, now());
  const id = Number(info.lastInsertRowid);
  // 건축물대장(8.3)은 등록 직후 받아 둔다. 실패해도 건물 등록은 끝낸다(카드에서 '다시 시도').
  ensureBuildingSpec(ctx, id).catch((e) => {
    db.prepare('UPDATE buildings SET building_spec_fetched_at = ? WHERE id = ? AND building_spec IS NULL').run(now(), id);
    console.warn(`[spec] building ${id}: ${e.message}`);
  });
  return buildingView(ctx, buildingRow(db, id));
}

/** PUT /api/buildings/:id — 이름·보유 호실 수·메모. 보유 호실 수는 등록한 호실 수보다 작게 할 수 없다 */
export function updateBuilding(ctx, id, body) {
  const { db } = ctx;
  const b = buildingRow(db, id);
  const name = body.name === undefined ? b.name : validName(body.name);
  if (!name) throw new HttpError(400, 'BAD_INPUT', '건물명과 주소는 필수예요.');
  const owned = body.ownedUnitCount === undefined ? b.owned_unit_count : Number(body.ownedUnitCount);
  const unitCount = db.prepare('SELECT COUNT(*) n FROM units WHERE building_id = ?').get(id).n;
  if (!Number.isInteger(owned) || owned < 1) throw new HttpError(400, 'BAD_INPUT', '보유 호실 수는 1 이상이어야 해요.');
  if (owned < unitCount) throw new HttpError(400, 'OWNED_BELOW_UNITS', `이미 등록한 호실이 ${unitCount}개라 그보다 작게 할 수 없어요.`);
  const description = body.description === undefined ? b.description : String(body.description ?? '').trim() || null;
  db.prepare('UPDATE buildings SET name = ?, owned_unit_count = ?, description = ? WHERE id = ?').run(name, owned, description, id);
  return buildingView(ctx, buildingRow(db, id));
}

/** DELETE /api/buildings/:id — 호실이 있으면 지우지 않는다 */
export function deleteBuilding(ctx, id) {
  buildingRow(ctx.db, id);
  if (ctx.db.prepare('SELECT 1 FROM units WHERE building_id = ?').get(id)) throw new HttpError(409, 'HAS_UNITS', '호실을 먼저 삭제해 주세요.');
  ctx.db.prepare('DELETE FROM buildings WHERE id = ?').run(id);
}

/**
 * 호실 등록 직후 (4.5 등록하면 3): 매매 최근 12개월 중 없는 달 → 첫 참고가 기록 → 전월세 수집·전환율.
 * 전월세·전환율이 실패해도 등록 결과에는 영향이 없다.
 */
export function startUnitCollection(ctx, unitId) {
  const u = unitRow(ctx.db, unitId);
  const sgg = complexOf(ctx.db, u.kapt_code).sigungu_code;
  return ctx.collector.ensure(sgg, lastMonths(ctx.asOf(), REFERENCE_MONTHS), { jobId: recentJob(unitId) })
    .then(() => recordReference(ctx, unitId))
    .catch((e) => console.warn(`[collect] unit ${unitId}: ${e.message}`))
    .then(() => (ctx.rentCollector ? Promise.allSettled([collectRent(ctx, sgg), ensureConversionRate(ctx)]) : null));
}

const PRICE_MAX = 1e13;
function validPurchase(body, asOf) {
  const acquisitionYm = String(body.acquisitionYm ?? '');
  const purchasePrice = Number(body.purchasePrice);
  if (!/^\d{6}$/.test(acquisitionYm) || !Number.isInteger(purchasePrice) || purchasePrice <= 0 || purchasePrice > PRICE_MAX) return null;
  if (acquisitionYm > asOf) throw new HttpError(400, 'BAD_INPUT', '취득 연월은 이번 달 이전이어야 해요.');
  return { acquisitionYm, purchasePrice };
}

/** POST /api/buildings/:id/units */
export async function createUnit(ctx, buildingId, body) {
  const { db } = ctx;
  const b = buildingRow(db, buildingId);
  const dong = cleanDong(body.dong);
  const ho = cleanHo(body.ho);
  const purchase = validPurchase(body, ctx.asOf());
  if (!dong || !ho || !purchase) throw new HttpError(400, 'BAD_INPUT', '동·호, 취득 연월, 매입가는 필수예요.');
  const count = db.prepare('SELECT COUNT(*) n FROM units WHERE building_id = ?').get(buildingId).n;
  if (count >= b.owned_unit_count) throw new HttpError(409, 'UNITS_FULL', '보유 호실을 모두 등록했어요.');
  if (db.prepare('SELECT 1 FROM units WHERE building_id = ? AND dong = ? AND ho = ?').get(buildingId, dong, ho)) {
    throw new HttpError(409, 'DUP_UNIT', '이미 등록한 호실이에요.');
  }
  const looked = await lookupForSave(ctx, { kaptCode: b.kapt_code, dong, ho });
  const { areaU, floor, areaSource } = resolveUnitInput(looked, body);
  const id = db.transaction(() => {
    const at = now();
    const info = db.prepare('INSERT INTO units (building_id, dong, ho, area_u, floor, area_source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(buildingId, dong, ho, areaU, floor, areaSource, at);
    const unitId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO unit_holdings (unit_id, acquisition_ym, purchase_price, registered_at) VALUES (?, ?, ?, ?)')
      .run(unitId, purchase.acquisitionYm, purchase.purchasePrice, at);
    return unitId;
  })();
  startUnitCollection(ctx, id);
  return unitView(ctx, unitRow(db, id));
}

export function getUnit(ctx, id) {
  const u = unitRow(ctx.db, id);
  const unit = unitView(ctx, u);
  // 호실 상세 '임대 현황'의 환산 월세 (3단계): 전환율이 없으면 null → 화면은 행을 숨기고 안내
  const conversion = conversionRate(ctx.db);
  if (unit.lease) unit.lease.converted = leaseConverted(unit.lease, conversion);
  return { asOf: ctx.asOf(), unit, building: buildingView(ctx, buildingRow(ctx.db, u.building_id)), conversion };
}

/** PUT /api/units/:id — 동·호·면적·층은 바꾸지 않고 취득 연월과 매입가만 (4.5 호실 수정) */
export function updateUnit(ctx, id, body) {
  unitRow(ctx.db, id);
  const purchase = validPurchase(body, ctx.asOf());
  if (!purchase) throw new HttpError(400, 'BAD_INPUT', '취득 연월과 매입가를 확인해 주세요.');
  ctx.db.prepare('UPDATE unit_holdings SET acquisition_ym = ?, purchase_price = ? WHERE unit_id = ?').run(purchase.acquisitionYm, purchase.purchasePrice, id);
  return getUnit(ctx, id);
}

/** DELETE /api/units/:id — 계약·참고가 기록을 함께 지운다(ON DELETE CASCADE) */
export function deleteUnit(ctx, id) {
  unitRow(ctx.db, id);
  ctx.db.prepare('DELETE FROM units WHERE id = ?').run(id);
}

export { subjectOf };
