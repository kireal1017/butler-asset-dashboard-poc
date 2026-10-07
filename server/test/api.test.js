import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { createCollector } from '../src/collect/collector.js';

const fixture = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const RECENT = fixture('rtms-11350-recent-hagye.json').items;

const xmlOf = (items) => `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>${
  items.map((it) => `<item>${Object.entries(it).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`).join('')
}</items><totalCount>${items.length}</totalCount></body></response>`;

/** 실제 하계동 거래로 월별 응답을 돌려주는 가짜 API. 호출 수를 센다. */
function fakeApi() {
  const calls = [];
  return {
    calls,
    devFault: null,
    request: async (api, url, params) => {
      calls.push(`${api}:${params.DEAL_YMD ?? ''}`);
      if (api !== 'rtms') throw new Error(`unexpected ${api}`);
      const ym = params.DEAL_YMD;
      return xmlOf(RECENT.filter((t) => `${t.dealYear}${String(t.dealMonth).padStart(2, '0')}` === ym));
    },
  };
}

function seed(db) {
  db.prepare(`INSERT INTO complexes (kapt_code, name, bjd_code, sigungu_code, gu, umd_name, addr, bonbun, bubun, households, use_date, parking_ground, parking_under, detail_fetched_at)
    VALUES ('A13987303', '하계현대우성', '1135010400', '11350', '노원구', '하계동', '서울특별시 노원구 하계동 270 하계현대우성', 270, 0, 1320, '19890301', 992, 0, 'x')`).run();
  db.prepare(`INSERT INTO assets (kapt_code, dong, ho, floor, area_u, area_source, created_at) VALUES ('A13987303', '104', '501', 5, 849500, 'auto', 'x')`).run();
}

let ctx;
let asOf;
beforeEach(() => {
  const db = openDb(':memory:');
  seed(db);
  const api = fakeApi();
  asOf = '202609';
  ctx = { db, api, collector: createCollector({ db, api }), asOf: () => asOf };
});

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('GET /api/assets (재진입)', () => {
  it('collects missing months once, then repeated opens make no external calls', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets?refresh=1').expect(200);
    await settle();
    const first = ctx.api.calls.length;
    expect(first).toBe(12); // 최근 12개월, 하계동만이라 각 1페이지
    for (let i = 0; i < 3; i++) await request(app).get('/api/assets?refresh=1').expect(200);
    await settle();
    expect(ctx.api.calls.length).toBe(first);
  });

  it('crossing into a new month fetches only that month', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets?refresh=1');
    await settle();
    const before = ctx.api.calls.length;
    asOf = '202610';
    await request(app).get('/api/assets?refresh=1');
    await settle();
    expect(ctx.api.calls.slice(before)).toEqual(['rtms:202610']);
  });

  it('returns current price, change vs previous and status from stored trades', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets?refresh=1');
    await settle();
    const { body } = await request(app).get('/api/assets?refresh=1').expect(200);
    const a = body.items[0];
    expect(a).toMatchObject({ id: 1, complexName: '하계현대우성', status: 'ready', ownerKnown: true });
    expect(a.current.amount).toBeGreaterThan(0);
    expect(a.change.kind).toBe('previous');
  });
});

describe('series and detail', () => {
  it('series 1y has 12 monthly points and collect=0 refuses missing months', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets/1/series?range=3y&collect=0').expect(409);
    const { body } = await request(app).get('/api/assets/1/series?range=1y').expect(200);
    expect(body.points).toHaveLength(12);
    expect(body.points[0].ym).toBe('202510');
    await request(app).get('/api/assets/1/series?range=hold').expect(400);
  });

  it('detail exposes scope, recent trades, building info and ranges', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets/1/series?range=1y');
    const { body } = await request(app).get('/api/assets/1').expect(200);
    expect(body.scope).toEqual({ aptSeqs: ['11350-85'], ownerKnown: true });
    expect(body.recentTrades.length).toBeGreaterThan(0);
    expect(body.building).toEqual({ useYear: 1989, households: 1320, parking: 992 });
    expect(body.ranges).toEqual(['1y', '3y', '5y', '10y']);
  });
});

describe('polling without refresh', () => {
  it('does not restart a failed collection; only an explicit retry does', async () => {
    const failing = { calls: [], devFault: null, request: async (api, url, p) => { failing.calls.push(p.DEAL_YMD); throw new Error('down'); } };
    ctx.api = failing;
    ctx.collector = createCollector({ db: ctx.db, api: failing });
    const app = createApp(ctx);
    await request(app).get('/api/assets?refresh=1');
    await settle();
    const after = failing.calls.length;
    const { body } = await request(app).get('/api/assets');
    expect(body.items[0].status).toBe('failed');
    for (let i = 0; i < 3; i++) await request(app).get('/api/assets');
    await settle();
    expect(failing.calls.length).toBe(after);
    await request(app).post('/api/assets/1/collect').expect(202);
    await settle();
    expect(failing.calls.length).toBeGreaterThan(after);
  });
});

describe('purchase edits (review fixes)', () => {
  it('searching candidates for another month does not change the stored acquisition month', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets/1/series?range=1y');
    await request(app).put('/api/assets/1/purchase').send({ source: 'manual', acquisitionYm: '202512', price: 100000 }).expect(200);
    await request(app).post('/api/assets/1/purchase/candidates').send({ acquisitionYm: '202609' }).expect(200);
    const { body } = await request(app).get('/api/assets/1').expect(200);
    expect(body.asset.acquisitionYm).toBe('202512');
    expect(body.asset.purchase).toMatchObject({ price: 100000, ym: '202512', source: 'manual' });
    const hold = await request(app).get('/api/assets/1/series?range=hold&collect=0').expect(200);
    expect(hold.body.from).toBe('202512');
  });

  it('a failed job no longer shows as failed once its months are collected another way', async () => {
    let down = true;
    const api = { calls: [], devFault: null, request: async (name, url, p) => {
      if (down) throw new Error('down');
      return xmlOf(RECENT.filter((t) => `${t.dealYear}${String(t.dealMonth).padStart(2, '0')}` === p.DEAL_YMD));
    } };
    ctx.api = api;
    ctx.collector = createCollector({ db: ctx.db, api });
    const app = createApp(ctx);
    await request(app).get('/api/assets?refresh=1');
    await settle();
    expect((await request(app).get('/api/assets')).body.items[0].status).toBe('failed');
    down = false;
    await request(app).get('/api/assets/1/series?range=1y').expect(200);
    expect((await request(app).get('/api/assets')).body.items[0].status).toBe('ready');
  });
});

describe('error responses', () => {
  it('hides internal error messages even when the error carries a code', async () => {
    ctx.db.prepare = (() => { const orig = ctx.db.prepare.bind(ctx.db); return (sql) => { if (/FROM assets WHERE user_id/.test(sql)) { const e = new Error('database disk image is malformed'); e.code = 'SQLITE_CORRUPT'; throw e; } return orig(sql); }; })();
    const app = createApp(ctx);
    const res = await request(app).get('/api/assets').expect(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.message).not.toMatch(/malformed/);
  });
});
