import { describe, it, expect, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { createApiClient, DAILY_LIMITS, QuotaError, KeyNotRegisteredError, ExternalApiError, kstDate } from '../src/external/http.js';

const KEY = 'ab+c/d==Ef'; // Decoding 키처럼 +, /, = 를 포함
const URL_ = 'https://example.test/api';
const noSleep = () => Promise.resolve();
const silent = { warn: () => {} };

function setup({ responses, devFault = null, now = () => new Date('2026-10-05T15:30:00Z') } = {}) {
  const db = openDb(':memory:');
  const seen = [];
  const queue = [...(responses ?? [])];
  const fetchImpl = vi.fn(async (url) => {
    seen.push(url);
    const r = queue.shift() ?? { ok: true, status: 200, body: '<ok/>' };
    if (r.throw) throw new Error(r.throw);
    return { ok: r.ok ?? true, status: r.status ?? 200, text: async () => r.body ?? '' };
  });
  const api = createApiClient({ db, serviceKey: KEY, fetchImpl, now, sleep: noSleep, devFault, log: silent });
  return { db, api, seen, fetchImpl };
}

const usageRows = (db) => db.prepare('SELECT api, date_kst, count FROM api_usage').all();

describe('http client', () => {
  it('encodes the decoding key exactly once', async () => {
    const { api, seen } = setup();
    await api.request('rtms', URL_, { LAWD_CD: '11350' });
    const qs = new URL(seen[0]).searchParams;
    expect(qs.get('serviceKey')).toBe(KEY);
    expect(seen[0]).toContain(`serviceKey=${encodeURIComponent(KEY)}`);
    expect(seen[0]).not.toContain(encodeURIComponent(encodeURIComponent(KEY)));
  });

  it('supports the ServiceKey param name used by K-APT basis APIs', async () => {
    const { api, seen } = setup();
    await api.request('aptBasis', URL_, { kaptCode: 'A1' }, { keyParam: 'ServiceKey' });
    expect(new URL(seen[0]).searchParams.get('ServiceKey')).toBe(KEY);
  });

  it('retries twice then fails, counting every HTTP attempt, with key masked', async () => {
    const { api, db } = setup({ responses: [
      { throw: `boom ${KEY}` }, { ok: false, status: 503 }, { throw: `again ${encodeURIComponent(KEY)}` },
    ] });
    const err = await api.request('rtms', URL_, {}).catch((e) => e);
    expect(err).toBeInstanceOf(ExternalApiError);
    for (const text of [err.message, err.detail]) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(encodeURIComponent(KEY));
    }
    expect(err.message).toBe('실거래가 서버에서 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
    expect(usageRows(db)).toEqual([{ api: 'rtms', date_kst: '2026-10-06', count: 3 }]);
  });

  it('succeeds on a retry', async () => {
    const { api } = setup({ responses: [{ throw: 'net' }, { body: '<items/>' }] });
    await expect(api.request('rtms', URL_, {})).resolves.toBe('<items/>');
  });

  it('does not retry when the key is not registered', async () => {
    const { api, fetchImpl } = setup({ responses: [{ body: '<errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg>' }] });
    await expect(api.request('rtms', URL_, {})).rejects.toBeInstanceOf(KeyNotRegisteredError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('counts usage per KST date (UTC 15:30 = next day in KST)', () => {
    expect(kstDate(new Date('2026-10-05T14:59:00Z'))).toBe('2026-10-05');
    expect(kstDate(new Date('2026-10-05T15:00:00Z'))).toBe('2026-10-06');
  });

  it('stops before calling once 90% of the daily limit is used', async () => {
    const { api, db, fetchImpl } = setup();
    db.prepare('INSERT INTO api_usage VALUES (?, ?, ?)').run('rtms', '2026-10-06', DAILY_LIMITS.rtms * 0.9 - 1);
    await api.request('rtms', URL_, {});
    await expect(api.request('rtms', URL_, {})).rejects.toBeInstanceOf(QuotaError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(api.usage('rtms')).toBe(DAILY_LIMITS.rtms * 0.9);
  });

  it('dev fault quota blocks without writing usage', async () => {
    const { api, db, fetchImpl } = setup({ devFault: 'quota' });
    await expect(api.request('rtms', URL_, {})).rejects.toBeInstanceOf(QuotaError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(usageRows(db)).toEqual([]);
  });

  it('dev fault fetch fails without calling out or writing usage', async () => {
    const { api, db, fetchImpl } = setup({ devFault: 'fetch' });
    await expect(api.request('rtms', URL_, {})).rejects.toBeInstanceOf(ExternalApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(usageRows(db)).toEqual([]);
  });
});
