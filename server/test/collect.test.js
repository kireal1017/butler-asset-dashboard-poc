import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/index.js';
import { parseAreaU, parseTradeXml, toTradeRow, fetchTradeMonth } from '../src/external/rtms.js';
import { createMonthStore } from '../src/collect/store.js';
import { createCollector } from '../src/collect/collector.js';

const PAGE1 = fs.readFileSync(new URL('./fixtures/rtms-11350-201610-page1.xml', import.meta.url), 'utf8');
const REAL = parseTradeXml(PAGE1);

/** 실제 응답 항목으로 페이지를 다시 조립한다 (totalCount는 지정값). */
function pageXml(items, totalCount) {
  const body = items.map((it) => `<item>${Object.entries(it).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`).join('');
  return `<?xml version="1.0"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>${body}</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>${totalCount}</totalCount></body></response>`;
}

function fakeApi(pagesByYm) {
  const calls = [];
  return {
    calls,
    request: async (apiName, url, params) => {
      calls.push(`${params.DEAL_YMD}:${params.pageNo}`);
      const pages = pagesByYm[params.DEAL_YMD];
      return pages[Number(params.pageNo) - 1];
    },
  };
}

describe('rtms parsing', () => {
  it('parses the real 2016-10 page (1,000 of 1,249)', () => {
    expect(REAL.total).toBe(1249);
    expect(REAL.items).toHaveLength(1000);
  });

  it('converts amounts with commas, areas without rounding, blank dong to null', () => {
    const row = toTradeRow({ ...REAL.items[0], dealAmount: '43,000', excluUseAr: '84.9746', aptDong: '' }, '11350', '201610', 0);
    expect(row).toMatchObject({ deal_amount: 43000, area_u: 849746, apt_dong: null, bonbun: 939 });
  });

  it.each([['84.95', 849500], ['84.9', 849000], ['59', 590000], ['84.9746', 849746]])('parseAreaU %s', (s, u) => expect(parseAreaU(s)).toBe(u));

  it('rejects error responses', () => {
    expect(() => parseTradeXml('<response><header><resultCode>99</resultCode><resultMsg>ERR</resultMsg></header></response>')).toThrow('99');
  });

  it('follows pages until totalCount', async () => {
    const api = fakeApi({ 201610: [pageXml(REAL.items.slice(0, 3), 5), pageXml(REAL.items.slice(3, 5), 5)] });
    const m = await fetchTradeMonth(api, '11350', '201610');
    expect(api.calls).toEqual(['201610:1', '201610:2']);
    expect(m.rows).toHaveLength(5);
    expect(m.rows.map((r) => r.src_seq)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('month store (replace per 구 × 월)', () => {
  it('refuses a partial month and leaves existing rows untouched', () => {
    const db = openDb(':memory:');
    const store = createMonthStore(db);
    const rows = REAL.items.slice(0, 2).map((it, i) => toTradeRow(it, '11350', '201610', i));
    store.replaceMonth('11350', '201610', { pages: ['p1'], rows, total: 2 });
    expect(() => store.replaceMonth('11350', '201610', { pages: ['p1'], rows: rows.slice(0, 1), total: 2 })).toThrow('1/2');
    expect(db.prepare('SELECT COUNT(*) n FROM trades').get().n).toBe(2);
  });

  it('keeps identical legitimate trades and updates cancellation flags on refetch', () => {
    const db = openDb(':memory:');
    const store = createMonthStore(db);
    const twin = { ...REAL.items[0], cdealType: '' };
    const first = [twin, twin].map((it, i) => toTradeRow(it, '11350', '201610', i));
    store.replaceMonth('11350', '201610', { pages: ['a'], rows: first, total: 2 });
    expect(db.prepare('SELECT COUNT(*) n FROM trades').get().n).toBe(2);
    const second = [{ ...twin, cdealType: 'O' }, twin].map((it, i) => toTradeRow(it, '11350', '201610', i));
    store.replaceMonth('11350', '201610', { pages: ['b', 'c'], rows: second, total: 2 });
    expect(db.prepare("SELECT COUNT(*) n FROM trades WHERE cdeal_type = 'O'").get().n).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM raw_responses').get().n).toBe(2);
    expect(store.getLog('11350', '201610')).toMatchObject({ row_count: 2, total_count: 2 });
  });
});

describe('collector', () => {
  const pages = { 201609: [pageXml(REAL.items.slice(0, 2), 2)], 201610: [pageXml(REAL.items.slice(2, 4), 2)] };

  it('fetches only missing months and dedups concurrent requests', async () => {
    const db = openDb(':memory:');
    const api = fakeApi(pages);
    const col = createCollector({ db, api });
    await Promise.all([
      col.ensure('11350', ['201609', '201610'], { jobId: 'a' }),
      col.ensure('11350', ['201610'], { jobId: 'b' }),
    ]);
    expect(api.calls.sort()).toEqual(['201609:1', '201610:1']);
    expect(col.progress('a')).toMatchObject({ total: 2, done: 2, failed: 0, running: false });
    await col.ensure('11350', ['201609', '201610']);
    expect(api.calls).toHaveLength(2);
  });

  it('stale mode refetches months older than 30 days', async () => {
    const db = openDb(':memory:');
    const api = fakeApi(pages);
    let t = new Date('2026-10-01T00:00:00Z');
    const col = createCollector({ db, api, now: () => t });
    await col.ensure('11350', ['201609']);
    t = new Date('2026-10-20T00:00:00Z');
    await col.ensure('11350', ['201609'], { mode: 'stale' });
    expect(api.calls).toHaveLength(1);
    t = new Date('2026-11-02T00:00:00Z');
    await col.ensure('11350', ['201609'], { mode: 'stale' });
    expect(api.calls).toHaveLength(2);
  });

  it('reports failures in progress and rejects', async () => {
    const db = openDb(':memory:');
    const api = { request: async () => { throw new Error('down'); } };
    const col = createCollector({ db, api });
    await expect(col.ensure('11350', ['201609'], { jobId: 'x' })).rejects.toThrow('down');
    expect(col.progress('x')).toMatchObject({ total: 1, done: 0, failed: 1, running: false });
    expect(db.prepare('SELECT COUNT(*) n FROM fetch_log').get().n).toBe(0);
  });
});
