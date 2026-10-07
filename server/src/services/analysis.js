// v3 자산 분석 상세 카드 ①·②·④와 전환율 (docs/butler-poc-improvement-spec.md 4.8, 7.5, 7.6, 8.2~8.4).
// GET은 저장된 값만 읽고, 외부 호출(전월세 수집·전환율·건축물대장)은 POST에서만 한다.
import { HttpError } from '../errors.js';
import { fetchBuildingSpec } from '../external/bldtitle.js';
import { fetchSeoulConversionRate, RONE } from '../external/rone.js';
import { COMPARE } from '../logic/compare.js';
import { lastMonths, addMonths } from '../logic/months.js';
import { convertedMonthly, myBuildingMetrics, nearbyRent } from '../logic/rent.js';
import { leasesOfUnit } from './leases.js';
import { unitStatus } from '../logic/lease.js';
import { resolveLink } from './linking.js';
import { unitRow } from './unitValue.js';
import { complexOf } from './valuation.js';

const RENT_MONTHS = 12;
const rentJob = (sgg) => `rent:${sgg}`;
const kstYm = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7).replace('-', '');

// ---------- 전월세전환율 (8.4) ----------
/** 저장된 가장 최근 전환율. R-ONE 값을 우선하고, 없으면 직접 입력 값 */
export function conversionRate(db) {
  const row = db.prepare(`SELECT * FROM conversion_rates WHERE region = ? ORDER BY CASE source WHEN 'RONE' THEN 0 ELSE 1 END, ym DESC LIMIT 1`).get(RONE.region);
  return row ? { region: row.region, ym: row.ym, rate: row.rate, source: row.source, fetchedAt: row.fetched_at } : null;
}

/** 이번 달에 받은 R-ONE 값이 없으면 받아 저장한다. 실패하면 .env의 직접 입력 값으로 대체(MANUAL). */
export async function ensureConversionRate(ctx) {
  const { db, config = {} } = ctx;
  const have = db.prepare(`SELECT fetched_at FROM conversion_rates WHERE region = ? AND source = 'RONE' ORDER BY fetched_at DESC LIMIT 1`).get(RONE.region);
  if (have && kstYm(new Date(have.fetched_at)) === kstYm()) return conversionRate(db);
  const save = db.prepare(`INSERT INTO conversion_rates (region, ym, rate, source, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (region, ym, source) DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at`);
  try {
    const asOf = ctx.asOf();
    const r = await (ctx.fetchConversionRate ?? fetchSeoulConversionRate)(config.roneKey, addMonths(asOf, -11), asOf);
    if (r) save.run(RONE.region, r.ym, r.rate, 'RONE', new Date().toISOString());
  } catch (e) {
    console.warn(`[rone] ${e.message}`);
  }
  if (!conversionRate(db) && Number.isFinite(config.manualRate) && /^\d{6}$/.test(config.manualRateYm ?? '')) {
    save.run(RONE.region, config.manualRateYm, config.manualRate, 'MANUAL', new Date().toISOString());
  }
  return conversionRate(db);
}

// ---------- 전월세 수집 (8.2) ----------
/** 최근 12개월 중 없는 달 + 가장 최근 달(하루 지난 경우)만 받는다 */
export function collectRent(ctx, sgg) {
  const months = lastMonths(ctx.asOf(), RENT_MONTHS);
  const latest = months[months.length - 1];
  const log = ctx.db.prepare('SELECT fetched_at FROM rent_fetch_log WHERE sgg_cd = ? AND deal_ym = ?').get(sgg, latest);
  const refreshLatest = log && Date.now() - Date.parse(log.fetched_at) > 24 * 3600 * 1000;
  const job = rentJob(sgg);
  return ctx.rentCollector.ensure(sgg, months, { jobId: job })
    .then(() => (refreshLatest ? ctx.rentCollector.ensure(sgg, [latest], { mode: 'force' }) : null));
}

function rentState(ctx, sgg) {
  const months = lastMonths(ctx.asOf(), RENT_MONTHS);
  const missing = months.filter((ym) => ctx.rentCollector.isMissing(sgg, ym));
  const p = ctx.rentCollector.progress(rentJob(sgg));
  if (p?.running) return { status: 'collecting', progress: { total: p.total, done: p.done } };
  if (!missing.length) return { status: 'ready' };
  if (p?.failed) return { status: 'failed', error: p.error?.message ?? '전월세 실거래를 불러오지 못했어요.' };
  return { status: 'missing', progress: { total: missing.length, done: 0 } };
}

// ---------- 건축물대장 (8.3) ----------
export async function ensureBuildingSpec(ctx, buildingId, { force = false } = {}) {
  const { db } = ctx;
  const b = db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId);
  if (!b) throw new HttpError(404, 'NO_BUILDING', '건물을 찾을 수 없어요.');
  if (b.building_spec && !force) return JSON.parse(b.building_spec);
  const c = complexOf(db, b.kapt_code);
  if (c.bonbun === null || c.bonbun === undefined) return null;
  const spec = await fetchBuildingSpec(ctx.api, { sigunguCd: c.sigungu_code, bjdongCd: c.bjd_code.slice(5, 10), bonbun: c.bonbun, bubun: c.bubun });
  db.prepare('UPDATE buildings SET building_spec = ?, building_spec_fetched_at = ? WHERE id = ?').run(JSON.stringify(spec), new Date().toISOString(), buildingId);
  return spec;
}

// ---------- 화면용 묶음 ----------
const ongoingOf = (db, unitId, today) => {
  const s = unitStatus(leasesOfUnit(db, unitId), today);
  return s.status === 'LEASED' || s.status === 'EXPIRING' ? s.lease : null;
};

/** 호실 상세 '임대 현황'의 환산 월세 */
export function leaseConverted(lease, rate) {
  if (!lease || !rate) return null;
  return convertedMonthly(lease.deposit, lease.monthlyRent ?? lease.monthly_rent, rate.rate);
}

/** GET /api/buildings/:id/analysis?unit= — 카드 ① 내 건물, ② 주변 전월세(선택 호실), ④ 건축물대장 */
export function buildingAnalysis(ctx, buildingId, unitId = null) {
  const { db } = ctx;
  const b = db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId);
  if (!b) throw new HttpError(404, 'NO_BUILDING', '건물을 찾을 수 없어요.');
  const c = complexOf(db, b.kapt_code);
  const today = ctx.today();
  const rate = conversionRate(db);
  const units = db.prepare('SELECT id FROM units WHERE building_id = ? ORDER BY id').all(buildingId).map((r) => unitRow(db, r.id));

  const leased = units.map((u) => ({ u, lease: ongoingOf(db, u.id, today) })).filter((x) => x.lease);
  const myBuilding = {
    leasedUnits: leased.length,
    metrics: myBuildingMetrics(leased.map(({ u, lease }) => ({ deposit: lease.deposit, monthlyRent: lease.monthly_rent, areaU: u.area_u })), rate?.rate),
  };

  let nearby = null;
  const sel = units.find((u) => u.id === Number(unitId)) ?? units[0] ?? null;
  if (sel) {
    const state = rentState(ctx, c.sigungu_code);
    nearby = { unitId: sel.id, ...state };
    if (state.status === 'ready') {
      const link = resolveLink(db, c, { assetAreaU: sel.area_u });
      const rows = link.aptSeqs.length
        ? db.prepare(`SELECT deal_ym, deposit, monthly_rent FROM rent_transactions WHERE sgg_cd = ? AND apt_seq IN (${link.aptSeqs.map(() => '?').join(',')})
            AND ABS(area_u - ?) <= ? AND deal_ym BETWEEN ? AND ?`)
          .all(c.sigungu_code, ...link.aptSeqs, sel.area_u, COMPARE.areaWindowU, addMonths(ctx.asOf(), -(RENT_MONTHS - 1)), ctx.asOf())
        : [];
      const mineLease = ongoingOf(db, sel.id, today);
      const mine = mineLease ? convertedMonthly(mineLease.deposit, mineLease.monthly_rent, rate?.rate) : null;
      Object.assign(nearby, { areaRange: { min: sel.area_u - COMPARE.areaWindowU, max: sel.area_u + COMPARE.areaWindowU }, mine }, nearbyRent(rows, ctx.asOf(), rate?.rate, mine));
    }
  }

  const spec = b.building_spec ? { status: 'ready', data: JSON.parse(b.building_spec), fetchedAt: b.building_spec_fetched_at } : { status: b.building_spec_fetched_at ? 'failed' : 'missing' };
  return { asOf: ctx.asOf(), today, conversion: rate, myBuilding, nearby, spec };
}

/** POST /api/buildings/:id/analysis/collect — 전월세(12개월), 전환율, 건축물대장 중 필요한 것만 */
export function collectAnalysis(ctx, buildingId) {
  const b = ctx.db.prepare('SELECT * FROM buildings WHERE id = ?').get(buildingId);
  if (!b) throw new HttpError(404, 'NO_BUILDING', '건물을 찾을 수 없어요.');
  const sgg = complexOf(ctx.db, b.kapt_code).sigungu_code;
  if (!ctx.rentCollector.progress(rentJob(sgg))?.running) collectRent(ctx, sgg).catch((e) => console.warn(`[rent] ${sgg}: ${e.message}`));
  ensureConversionRate(ctx).catch((e) => console.warn(`[rone] ${e.message}`));
  if (!b.building_spec) {
    ensureBuildingSpec(ctx, buildingId).catch((e) => {
      ctx.db.prepare('UPDATE buildings SET building_spec_fetched_at = ? WHERE id = ? AND building_spec IS NULL').run(new Date().toISOString(), buildingId);
      console.warn(`[spec] building ${buildingId}: ${e.message}`);
    });
  }
}
