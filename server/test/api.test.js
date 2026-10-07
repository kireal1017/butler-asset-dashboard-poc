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

describe('개선 v2 비교 근거 (GET /comparisons, POST /comparisons/collect)', () => {
  it('GET reads only: sections are missing and no external call is made, repeatedly', async () => {
    const app = createApp(ctx);
    for (let i = 0; i < 3; i++) {
      const { body } = await request(app).get('/api/assets/1/comparisons').expect(200);
      expect([body.sameFloor.status, body.sameComplex.status, body.neighborhood.status]).toEqual(['missing', 'missing', 'missing']);
      expect(body.sameFloor).toMatchObject({ months: 36, from: '202310', to: '202609', progress: { total: 36, done: 0 } });
    }
    await settle();
    expect(ctx.api.calls).toEqual([]);
  });

  it('POST collects each missing month once (same-floor shares the 3y tab job), then all sections are ready', async () => {
    const app = createApp(ctx);
    await request(app).post('/api/assets/1/comparisons/collect').expect(202);
    const during = (await request(app).get('/api/assets/1/progress?range=3y')).body.progress;
    expect(during.total).toBe(36);
    await settle();
    expect(ctx.api.calls).toHaveLength(36);
    expect(new Set(ctx.api.calls).size).toBe(36);
    await request(app).post('/api/assets/1/comparisons/collect').expect(202);
    await settle();
    expect(ctx.api.calls).toHaveLength(36);
    const { body } = await request(app).get('/api/assets/1/comparisons').expect(200);
    expect([body.sameFloor.status, body.sameComplex.status, body.neighborhood.status]).toEqual(['ready', 'ready', 'ready']);
  });

  it('case A complex: "mine" row mixes 현대·우성 areas, neighborhood excludes both and is titled by 법정동', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets/1/series?range=3y');
    const { body } = await request(app).get('/api/assets/1/comparisons').expect(200);
    expect(body.sameComplex.linked).toBe(true);
    expect(body.sameComplex.groups[0].mine).toBe(true);
    expect(body.sameComplex.groups[0].areas).toEqual(expect.arrayContaining([849100, 849500]));
    expect(body.sameComplex.count).toBeGreaterThan(0);
    expect(body.neighborhood.dong).toBe('하계동');
    expect(body.neighborhood.complexes.map((c) => c.aptSeq)).not.toEqual(expect.arrayContaining(['11350-75']));
    expect(body.neighborhood.complexes.map((c) => c.aptSeq)).not.toEqual(expect.arrayContaining(['11350-85']));
    expect(body.neighborhood.complexCount).toBe(body.neighborhood.complexes.length);
    expect(body.sameFloor.floor).toBe(5);
  });

  it('a failed collection is not restarted by GET polling; only POST retries, and the quota message is passed through', async () => {
    const quota = { calls: [], devFault: null, request: async (api, url, p) => {
      quota.calls.push(p.DEAL_YMD);
      throw Object.assign(new Error('오늘 실거래가 조회 한도의 90%에 도달해 추가 조회를 멈췄습니다. 내일 다시 시도해 주세요.'), { code: 'QUOTA' });
    } };
    ctx.api = quota;
    ctx.collector = createCollector({ db: ctx.db, api: quota });
    const app = createApp(ctx);
    await request(app).post('/api/assets/1/comparisons/collect').expect(202);
    await settle();
    const after = quota.calls.length;
    const { body } = await request(app).get('/api/assets/1/comparisons');
    expect(body.sameFloor.status).toBe('failed');
    expect(body.sameFloor.error).toContain('한도');
    expect(body.sameComplex.status).toBe('failed');
    for (let i = 0; i < 3; i++) await request(app).get('/api/assets/1/comparisons');
    await settle();
    expect(quota.calls.length).toBe(after);
    await request(app).post('/api/assets/1/comparisons/collect').expect(202);
    await settle();
    expect(quota.calls.length).toBeGreaterThan(after);
  });

  it('an asset without any linked trade complex: empty complex section, neighborhood not computed', async () => {
    ctx.db.prepare(`INSERT INTO complexes (kapt_code, name, bjd_code, sigungu_code, gu, umd_name, bonbun, bubun)
      VALUES ('A00000001', '연결없는단지', '1135010400', '11350', '노원구', '하계동', 9999, 0)`).run();
    ctx.db.prepare(`INSERT INTO assets (kapt_code, dong, ho, floor, area_u, area_source, created_at) VALUES ('A00000001', '1', '101', 1, 849100, 'manual', 'x')`).run();
    const app = createApp(ctx);
    await request(app).get('/api/assets/1/series?range=3y');
    const { body } = await request(app).get('/api/assets/2/comparisons').expect(200);
    expect(body.sameComplex).toMatchObject({ status: 'ready', linked: false, count: 0, groups: [] });
    expect(body.neighborhood).toMatchObject({ status: 'ready', linked: false, count: 0, complexes: [], median: null });
    expect(body.sameFloor).toMatchObject({ status: 'ready', count: 0 });
  });

  it('unknown asset is 404 for both GET and POST', async () => {
    const app = createApp(ctx);
    await request(app).get('/api/assets/99/comparisons').expect(404);
    await request(app).post('/api/assets/99/comparisons/collect').expect(404);
  });
});

describe('개선 v2 4.3 재수집 12개월', () => {
  it('after 30 days, re-fetches only the latest 12 months; older months are not called', async () => {
    let now = new Date('2026-09-15T00:00:00Z');
    ctx.collector = createCollector({ db: ctx.db, api: ctx.api, now: () => now });
    const app = createApp(ctx);
    await request(app).get('/api/assets/1/series?range=3y').expect(200);
    await settle();
    const before = ctx.api.calls.length;
    expect(before).toBe(36);
    await request(app).get('/api/assets?refresh=1');
    await settle();
    expect(ctx.api.calls.length).toBe(before); // 30일 전에는 재수집 없음
    now = new Date('2026-09-28T00:00:00Z'); // 같은 기준 월(202609), 30일 경과 전
    await request(app).get('/api/assets?refresh=1');
    await settle();
    expect(ctx.api.calls.length).toBe(before);
    now = new Date('2026-10-16T00:00:00Z'); // 31일 경과, 기준 월은 asOf로 202609 유지
    await request(app).get('/api/assets?refresh=1');
    await settle();
    const refetched = ctx.api.calls.slice(before).map((c) => c.split(':')[1]).sort();
    expect(refetched).toEqual(['202510', '202511', '202512', '202601', '202602', '202603', '202604', '202605', '202606', '202607', '202608', '202609']);
  });
});
