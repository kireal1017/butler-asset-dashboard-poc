// v3 임대 계약 (docs/butler-poc-improvement-spec.md 4.9, 4.10, 7.1).
import { HttpError } from '../errors.js';
import { leaseStatus, overlaps, sortLeases, unitStatus } from '../logic/lease.js';
import { unitRow } from './unitValue.js';

const now = () => new Date().toISOString();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (s) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export const leasesOfUnit = (db, unitId) => db.prepare('SELECT * FROM leases WHERE unit_id = ? ORDER BY start_date').all(unitId);

export function leaseView(l, today) {
  return {
    id: l.id,
    unitId: l.unit_id,
    leaseType: l.lease_type,
    deposit: l.deposit,
    monthlyRent: l.monthly_rent,
    startDate: l.start_date,
    endDate: l.end_date,
    tenantName: l.tenant_name,
    status: leaseStatus(l, today),
  };
}

/** 호실의 임대 상태와 대표 계약(진행 중 또는 시작 전) */
export function unitLeaseState(db, unitId, today) {
  const s = unitStatus(leasesOfUnit(db, unitId), today);
  return { leaseStatus: s.status, dDay: s.dDay, lease: s.lease ? leaseView(s.lease, today) : null };
}

function rowOf(db, id) {
  const l = db.prepare('SELECT * FROM leases WHERE id = ?').get(id);
  if (!l) throw new HttpError(404, 'NO_LEASE', '계약을 찾을 수 없어요.');
  return l;
}

/** 입력 검증(4.10). 어기면 오류 박스 문구로 400 */
function validate(db, body, { unitId, exceptId = null }) {
  const leaseType = body.leaseType === 'JEONSE' ? 'JEONSE' : body.leaseType === 'MONTHLY' ? 'MONTHLY' : null;
  const deposit = Number(body.deposit);
  const monthlyRent = leaseType === 'JEONSE' ? 0 : Number(body.monthlyRent);
  const startDate = String(body.startDate ?? '');
  const endDate = String(body.endDate ?? '');
  const required = unitId && leaseType && body.deposit !== undefined && body.deposit !== '' && Number.isInteger(deposit) && deposit >= 0
    && (leaseType === 'JEONSE' || (body.monthlyRent !== undefined && body.monthlyRent !== '' && Number.isInteger(monthlyRent) && monthlyRent >= 0))
    && isRealDate(startDate) && isRealDate(endDate);
  if (!required) throw new HttpError(400, 'BAD_INPUT', '호실, 보증금, 계약 기간은 필수예요.');
  if (endDate <= startDate) throw new HttpError(400, 'BAD_PERIOD', '종료일은 시작일보다 뒤여야 해요.');
  const clash = leasesOfUnit(db, unitId).some((l) => l.id !== exceptId && overlaps(l, { start_date: startDate, end_date: endDate }));
  if (clash) throw new HttpError(400, 'OVERLAP', '같은 호실에 기간이 겹치는 계약이 있어요.');
  const tenantName = String(body.tenantName ?? '').trim() || null;
  return { leaseType, deposit, monthlyRent, startDate, endDate, tenantName };
}

/** GET /api/leases — 계약 관리 목록(정렬 포함) */
export function listLeases(ctx) {
  const today = ctx.today();
  const rows = ctx.db.prepare(`SELECT l.*, u.dong, u.ho, b.id AS building_id, b.name AS building_name
    FROM leases l JOIN units u ON u.id = l.unit_id JOIN buildings b ON b.id = u.building_id`).all();
  const unitCount = ctx.db.prepare('SELECT COUNT(*) n FROM units').get().n;
  return {
    today,
    unitCount,
    items: sortLeases(rows, today).map((l) => ({
      ...leaseView(l, today), dong: l.dong, ho: l.ho, buildingId: l.building_id, buildingName: l.building_name,
    })),
  };
}

export function getLease(ctx, id) {
  const l = rowOf(ctx.db, id);
  const u = unitRow(ctx.db, l.unit_id);
  return { lease: { ...leaseView(l, ctx.today()), dong: u.dong, ho: u.ho, buildingId: u.building_id, buildingName: u.building_name } };
}

/** POST /api/leases */
export function createLease(ctx, body) {
  const { db } = ctx;
  const unitId = Number(body.unitId);
  if (Number.isInteger(unitId) && unitId > 0) unitRow(db, unitId);
  const v = validate(db, body, { unitId: Number.isInteger(unitId) && unitId > 0 ? unitId : null });
  const at = now();
  const info = db.prepare(`INSERT INTO leases (unit_id, lease_type, deposit, monthly_rent, start_date, end_date, tenant_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(unitId, v.leaseType, v.deposit, v.monthlyRent, v.startDate, v.endDate, v.tenantName, at, at);
  return getLease(ctx, Number(info.lastInsertRowid));
}

/** PUT /api/leases/:id — 호실은 바꿀 수 없다 */
export function updateLease(ctx, id, body) {
  const l = rowOf(ctx.db, id);
  const v = validate(ctx.db, body, { unitId: l.unit_id, exceptId: id });
  ctx.db.prepare(`UPDATE leases SET lease_type = ?, deposit = ?, monthly_rent = ?, start_date = ?, end_date = ?, tenant_name = ?, updated_at = ?
    WHERE id = ?`).run(v.leaseType, v.deposit, v.monthlyRent, v.startDate, v.endDate, v.tenantName, now(), id);
  return getLease(ctx, id);
}

export function deleteLease(ctx, id) {
  rowOf(ctx.db, id);
  ctx.db.prepare('DELETE FROM leases WHERE id = ?').run(id);
}
