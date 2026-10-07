import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { createCollector } from '../src/collect/collector.js';
import { comparableTrades, currentPrice } from '../src/logic/price.js';

const fixture = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const RECENT = fixture('rtms-11350-recent-hagye.json').items; // 2025-10 ~ 2026-09 하계동 실제 거래
const Y2016 = fixture('rtms-11350-201610-hagye.json').items; // 2016-10 하계동 실제 거래

const xmlOf = (items) => `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>${
  items.map((it) => `<item>${Object.entries(it).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`).join('')
}</items><totalCount>${items.length}</totalCount></body></response>`;
const ymOf = (t) => `${t.dealYear}${String(t.dealMonth).padStart(2, '0')}`;

/** 실제 하계동 거래로 월별 응답을 돌려주는 가짜 실거래 API. 실거래 외의 호출은 실패시키고 호출을 기록한다. */
function fakeApi(source = [...RECENT, ...Y2016]) {
  const api = {
    calls: [],
    source,
    devFault: null,
    request: async (name, url, params) => {
      api.calls.push(`${name}:${params.DEAL_YMD ?? ''}`);
      if (name !== 'rtms') throw new Error(`unexpected ${name}`);
      return xmlOf(api.source.filter((t) => ymOf(t) === params.DEAL_YMD));
    },
  };
  return api;
}

const LOOKUPS = {
  '104|501': { status: 'auto', dong: '104', ho: '501', areaU: 849500, floor: 5, ownerKnown: true },
  '112|1001': { status: 'auto', dong: '112', ho: '1001', areaU: 849100, floor: 10, ownerKnown: true },
};

function seed(db) {
  db.prepare(`INSERT INTO complexes (kapt_code, name, bjd_code, sigungu_code, sido, gu, umd_name, addr, bonbun, bubun, households, use_date, parking_ground, parking_under, detail_fetched_at)
    VALUES ('A13987303', '하계현대우성', '1135010400', '11350', '서울특별시', '노원구', '하계동', '서울특별시 노원구 하계동 270 하계현대우성', 270, 0, 1320, '19890301', 992, 0, 'x')`).run();
  // 동·호 조회 결과(대장)는 미리 저장해 두어 호실 저장 때 재사용된다 (lookupForSave)
  const ins = db.prepare('INSERT INTO unit_lookups (kapt_code, dong, ho, result, fetched_at) VALUES (?, ?, ?, ?, ?)');
  for (const [k, v] of Object.entries(LOOKUPS)) {
    const [dong, ho] = k.split('|');
    ins.run('A13987303', dong, ho, JSON.stringify(v), new Date().toISOString());
  }
}

let ctx;
let asOf;
beforeEach(() => {
  const db = openDb(':memory:');
  seed(db);
  const api = fakeApi();
  asOf = '202609';
  ctx = { db, api, collector: createCollector({ db, api }), asOf: () => asOf, today: () => '2026-09-30' };
});

const settle = () => new Promise((r) => setTimeout(r, 30));
const rtmsCalls = () => ctx.api.calls.filter((c) => c.startsWith('rtms:'));

async function building(app, body = {}) {
  return (await request(app).post('/api/buildings').send({ kaptCode: 'A13987303', name: '하계현대우성', ownedUnitCount: 2, ...body }).expect(201)).body.building;
}
async function unit(app, buildingId, body = {}) {
  const res = await request(app).post(`/api/buildings/${buildingId}/units`)
    .send({ dong: '112', ho: '1001', acquisitionYm: '201610', purchasePrice: 430000000, ...body }).expect(201);
  await settle();
  return res.body.unit;
}

describe('건물 (4.2, 4.3)', () => {
  it('creates a building, refuses duplicates and missing fields, and starts as 등록 중', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    expect(b).toMatchObject({ name: '하계현대우성', complexName: '하계현대우성', address: '서울특별시 노원구 하계동 270 하계현대우성', ownedUnitCount: 2, unitCount: 0, status: 'REGISTERING' });
    const dup = await request(app).post('/api/buildings').send({ kaptCode: 'A13987303', name: 'x' }).expect(409);
    expect(dup.body.error.message).toBe('이미 등록한 건물이에요.');
    const bad = await request(app).post('/api/buildings').send({ kaptCode: 'A13987303', name: '  ' }).expect(400);
    expect(bad.body.error.message).toBe('건물명과 주소는 필수예요.');
    const list = (await request(app).get('/api/buildings').expect(200)).body;
    expect(list.items).toHaveLength(1);
    expect(ctx.api.calls).toEqual([]); // 상세는 이미 저장되어 있어 외부 호출 없음
  });

  it('limits owned unit count to at least the registered units, and blocks deleting a building with units', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    expect((await request(app).put(`/api/buildings/${b.id}`).send({ ownedUnitCount: 0 }).expect(400)).body.error.code).toBe('BAD_INPUT');
    await request(app).put(`/api/buildings/${b.id}`).send({ ownedUnitCount: 1, description: '메모' }).expect(200);
    expect((await request(app).delete(`/api/buildings/${b.id}`).expect(409)).body.error.message).toBe('호실을 먼저 삭제해 주세요.');
    await request(app).delete(`/api/units/${u.id}`).expect(204);
    await request(app).delete(`/api/buildings/${b.id}`).expect(204);
  });
});

describe('호실 (4.5, 4.6)', () => {
  it('registers a unit from the saved lookup, collects 12 months in the background and records the first reference', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    expect(u).toMatchObject({ dong: '112', ho: '1001', areaU: 849100, floor: 10, areaSource: 'auto', acquisitionYm: '201610', purchasePrice: 430000000 });
    expect(ctx.api.calls.filter((c) => !c.startsWith('rtms:'))).toEqual([]); // 대장 재조회 없음
    expect(rtmsCalls()).toHaveLength(12);
    const refs = ctx.db.prepare('SELECT * FROM unit_value_references WHERE unit_id = ?').all(u.id);
    expect(refs).toHaveLength(1);

    const detail = (await request(app).get(`/api/units/${u.id}`).expect(200)).body;
    expect(detail.unit.status).toBe('ready');
    expect(detail.unit.reference.value).toBeGreaterThan(0);
    expect(detail.building.status).toBe('OPERATING');
  });

  it('reference equals the existing currentPrice (in 원) of the same scope when it is within 12 months', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const rows = ctx.db.prepare("SELECT * FROM trades WHERE apt_seq = '11350-75'").all();
    const cur = currentPrice(comparableTrades(rows, 849100));
    const v = (await request(app).get(`/api/units/${u.id}/value`).expect(200)).body;
    expect(v.reference.value).toBe(cur.amount * 10000);
    expect(v.reference.referenceDate).toBe(`${cur.ym}${String(cur.day).padStart(2, '0')}`);
    expect(v.periodAverages.map((p) => p.months)).toEqual([1, 3, 6]);
    expect(v.bar.hidden).toBe(false);
    expect(v.bar.purchase).toBeLessThan(v.bar.band?.from ?? v.bar.single); // 2016 매입가는 최근 범위 왼쪽 바깥
    expect(v.recentTrades.length).toBeLessThanOrEqual(5);
    for (const t of v.recentTrades) expect(t.amount % 10000).toBe(0);
    expect(v.change.diff).toBe(v.reference.value - 430000000);
  });

  it('refuses missing fields, duplicates and a full building with the spec messages', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    expect((await request(app).post(`/api/buildings/${b.id}/units`).send({ dong: '112', ho: '1001' }).expect(400)).body.error.message)
      .toBe('동·호, 취득 연월, 매입가는 필수예요.');
    await unit(app, b.id);
    expect((await request(app).post(`/api/buildings/${b.id}/units`).send({ dong: '112', ho: '1001', acquisitionYm: '201610', purchasePrice: 1 }).expect(409)).body.error.message)
      .toBe('이미 등록한 호실이에요.');
    await unit(app, b.id, { dong: '104', ho: '501' });
    expect((await request(app).post(`/api/buildings/${b.id}/units`).send({ dong: '109', ho: '101', acquisitionYm: '201610', purchasePrice: 1 }).expect(409)).body.error.message)
      .toBe('보유 호실을 모두 등록했어요.');
  });

  it('edits only acquisition month and purchase price, and deleting a unit removes its references', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const r = (await request(app).put(`/api/units/${u.id}`).send({ acquisitionYm: '201701', purchasePrice: 450000000, dong: '999' }).expect(200)).body;
    expect(r.unit).toMatchObject({ dong: '112', acquisitionYm: '201701', purchasePrice: 450000000 });
    await request(app).delete(`/api/units/${u.id}`).expect(204);
    expect(ctx.db.prepare('SELECT COUNT(*) n FROM unit_value_references').get().n).toBe(0);
    expect(ctx.db.prepare('SELECT COUNT(*) n FROM unit_holdings').get().n).toBe(0);
  });
});

describe('새로고침 (7.3)', () => {
  it('refetches 12 months, keeps the record when the basis is unchanged, adds one when it changes, and has a 1-minute cooldown', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const before = rtmsCalls().length;
    expect((await request(app).post(`/api/units/${u.id}/value/refresh`).expect(202)).body).toMatchObject({ started: true });
    await settle();
    expect(rtmsCalls().length - before).toBe(12);
    const count = () => ctx.db.prepare('SELECT COUNT(*) n FROM unit_value_references WHERE unit_id = ?').get(u.id).n;
    expect(count()).toBe(1);
    expect((await request(app).post(`/api/units/${u.id}/value/refresh`).expect(429)).body.error.code).toBe('REFRESH_COOLDOWN');

    ctx.refreshedAt.clear();
    // 근거 거래 하나(우성 84.91㎡의 가장 최근 거래)가 사라진 것처럼 응답을 바꾼다
    const mine = ctx.api.source.filter((t) => t.aptSeq === '11350-75' && String(t.excluUseAr).startsWith('84.91'))
      .sort((a, b) => ymOf(a).localeCompare(ymOf(b)) || Number(a.dealDay) - Number(b.dealDay));
    const gone = mine[mine.length - 1];
    ctx.api.source = ctx.api.source.filter((t) => t !== gone);
    await request(app).post(`/api/units/${u.id}/value/refresh`).expect(202);
    await settle();
    expect(count()).toBe(2);
  });
});

describe('비교 3가지 (GET 읽기 전용, POST 수집)', () => {
  it('GET makes no external call; same-floor needs 3 years which POST collects', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const before = rtmsCalls().length;
    let c = (await request(app).get(`/api/units/${u.id}/comparisons`).expect(200)).body;
    expect([c.sameFloor.status, c.sameComplex.status, c.neighborhood.status]).toEqual(['missing', 'ready', 'ready']);
    expect(c.sameFloor.progress).toEqual({ total: 24, done: 0 });
    expect(rtmsCalls().length).toBe(before);
    await request(app).post(`/api/units/${u.id}/comparisons/collect`).expect(202);
    await settle();
    expect(rtmsCalls().length - before).toBe(24);
    c = (await request(app).get(`/api/units/${u.id}/comparisons`).expect(200)).body;
    expect(c.sameFloor.status).toBe('ready');
    expect(c.sameComplex.groups[0].areas).toEqual(expect.arrayContaining([849100, 849500]));
  });
});

describe('매입가 제안 (7.7)', () => {
  it('collects only the acquisition window and averages the same complex·area, widening 1→3→6 months', async () => {
    const app = createApp(ctx);
    const r = (await request(app).post('/api/purchase-suggestion').send({ kaptCode: 'A13987303', dong: '112', areaU: 849100, acquisitionYm: '201610' }).expect(200)).body;
    expect(rtmsCalls().sort()).toEqual(['rtms:201605', 'rtms:201606', 'rtms:201607', 'rtms:201608', 'rtms:201609', 'rtms:201610']);
    expect(r.suggestion).toMatchObject({ months: 1, from: '201610', to: '201610' });
    expect(r.suggestion.count).toBeGreaterThan(0);
    expect(r.suggestion.average % 10000).toBe(0);
    await request(app).post('/api/purchase-suggestion').send({ kaptCode: 'A13987303', dong: '112', areaU: 849100, acquisitionYm: '209901' }).expect(400);
  });
});

describe('재수집 12개월 (앱 열 때)', () => {
  it('after 30 days, re-fetches only the latest 12 months for sigungu with units', async () => {
    let now = new Date('2026-09-15T00:00:00Z');
    ctx.collector = createCollector({ db: ctx.db, api: ctx.api, now: () => now });
    const app = createApp(ctx);
    const b = await building(app);
    await unit(app, b.id);
    await request(app).post('/api/units/1/comparisons/collect').expect(202);
    await settle();
    const before = rtmsCalls().length;
    await request(app).get('/api/buildings?refresh=1');
    await settle();
    expect(rtmsCalls().length).toBe(before);
    now = new Date('2026-10-16T00:00:00Z');
    await request(app).get('/api/buildings?refresh=1');
    await settle();
    const refetched = rtmsCalls().slice(before).map((c) => c.split(':')[1]).sort();
    expect(refetched).toEqual(['202510', '202511', '202512', '202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608', '202609']);
  });
});

describe('경로와 오류', () => {
  it('v2 asset routes are gone', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets').expect(404);
    await request(app).post('/api/assets').send({}).expect(404);
  });

  it('hides internal error messages even when the error carries a code', async () => {
    const orig = ctx.db.prepare.bind(ctx.db);
    ctx.db.prepare = (sql) => {
      if (/FROM buildings ORDER BY id/.test(sql)) { const e = new Error('database disk image is malformed'); e.code = 'SQLITE_CORRUPT'; throw e; }
      return orig(sql);
    };
    const res = await request(createApp(ctx)).get('/api/buildings').expect(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toMatch(/malformed/);
  });
});

describe('임대 계약 (4.9, 4.10, 7.1, 7.2) — TODAY 2026-09-30', () => {
  const lease = (unitId, o = {}) => ({ unitId, leaseType: 'MONTHLY', deposit: 50000000, monthlyRent: 800000, startDate: '2025-09-01', endDate: '2027-08-31', tenantName: '김임차', ...o });

  it('validates required fields, period order and overlaps with the spec messages', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const msg = async (body) => (await request(app).post('/api/leases').send(body).expect(400)).body.error.message;
    expect(await msg({ unitId: u.id, leaseType: 'MONTHLY' })).toBe('호실, 보증금, 계약 기간은 필수예요.');
    expect(await msg(lease(u.id, { endDate: '2025-09-01' }))).toBe('종료일은 시작일보다 뒤여야 해요.');
    await request(app).post('/api/leases').send(lease(u.id)).expect(201);
    expect(await msg(lease(u.id, { startDate: '2027-08-31', endDate: '2029-08-30' }))).toBe('같은 호실에 기간이 겹치는 계약이 있어요.');
    await request(app).post('/api/leases').send(lease(u.id, { startDate: '2027-09-01', endDate: '2029-08-31' })).expect(201);
  });

  it('stores 전세 with zero rent and lets tenant name be empty', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const r = (await request(app).post('/api/leases').send(lease(u.id, { leaseType: 'JEONSE', deposit: 350000000, monthlyRent: 999, tenantName: '' })).expect(201)).body.lease;
    expect(r).toMatchObject({ leaseType: 'JEONSE', deposit: 350000000, monthlyRent: 0, tenantName: null, status: 'ACTIVE' });
  });

  it('drives unit status, building status, occupancy and the lease list order', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u1 = await unit(app, b.id);
    const u2 = await unit(app, b.id, { dong: '104', ho: '501' });
    let detail = (await request(app).get(`/api/buildings/${b.id}`)).body;
    expect(detail.units.map((u) => u.leaseStatus)).toEqual(['VACANT', 'VACANT']);
    expect(detail.building).toMatchObject({ status: 'OPERATING', occupancy: { leased: 0, owned: 2 } });

    await request(app).post('/api/leases').send(lease(u1.id, { endDate: '2027-01-28' })).expect(201); // TODAY+120 = 2027-01-28
    await request(app).post('/api/leases').send(lease(u2.id, { startDate: '2026-11-01', endDate: '2028-10-31' })).expect(201);
    detail = (await request(app).get(`/api/buildings/${b.id}`)).body;
    const byId = Object.fromEntries(detail.units.map((u) => [u.id, u]));
    expect(byId[u1.id]).toMatchObject({ leaseStatus: 'EXPIRING', dDay: 120 });
    expect(byId[u2.id]).toMatchObject({ leaseStatus: 'MOVE_IN' });
    expect(detail.building).toMatchObject({ status: 'CHECK', occupancy: { leased: 1, owned: 2, rate: 0.5 }, unitStats: { leased: 1, expiring: 1, vacant: 0, moveIn: 1 } });
    const list = (await request(app).get('/api/buildings')).body;
    expect(list.summary).toEqual({ total: 1, operating: 0, registering: 0, check: 1 });
    const leases = (await request(app).get('/api/leases')).body;
    expect(leases.items.map((l) => l.status)).toEqual(['EXPIRING', 'UPCOMING']);
    expect(leases.items[0]).toMatchObject({ dong: '112', ho: '1001', buildingName: '하계현대우성' });
  });

  it('edits keep the unit, delete removes the lease, and deleting a unit removes its leases', async () => {
    const app = createApp(ctx);
    const b = await building(app);
    const u = await unit(app, b.id);
    const l = (await request(app).post('/api/leases').send(lease(u.id)).expect(201)).body.lease;
    const e = (await request(app).put(`/api/leases/${l.id}`).send(lease(999, { monthlyRent: 900000 })).expect(200)).body.lease;
    expect(e).toMatchObject({ unitId: u.id, monthlyRent: 900000 });
    await request(app).delete(`/api/leases/${l.id}`).expect(204);
    await request(app).post('/api/leases').send(lease(u.id)).expect(201);
    await request(app).delete(`/api/units/${u.id}`).expect(204);
    expect(ctx.db.prepare('SELECT COUNT(*) n FROM leases').get().n).toBe(0);
  });
});
