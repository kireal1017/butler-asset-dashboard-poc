import { fetchTradeMonth } from '../external/rtms.js';
import { createMonthStore } from './store.js';

const STALE_MS = 30 * 24 * 3600 * 1000;

/**
 * 실거래 수집기.
 * - 외부 호출은 단일 큐에서 순차로 처리한다 (PRD 5.5).
 * - 큐 키는 (sgg_cd, deal_ym). 대기·실행 중인 달은 다시 넣지 않고 같은 Promise를 돌려준다.
 * - 진행률은 요청 묶음(job)마다 "n개월 중 m개월"로 기록한다.
 */
export function createCollector({ db, api, now = () => new Date() }) {
  const store = createMonthStore(db);
  const inflight = new Map(); // `${sgg}|${ym}` -> Promise
  const jobs = new Map(); // jobId -> { total, done, failed, error, running }
  let chain = Promise.resolve();

  const key = (sgg, ym) => `${sgg}|${ym}`;

  function isMissing(sgg, ym) {
    return !store.getLog(sgg, ym);
  }

  function isStale(sgg, ym) {
    const log = store.getLog(sgg, ym);
    return !log || now().getTime() - Date.parse(log.fetched_at) > STALE_MS;
  }

  function enqueue(sgg, ym) {
    const k = key(sgg, ym);
    if (inflight.has(k)) return inflight.get(k);
    const p = (chain = chain.catch(() => {}).then(async () => {
      const month = await fetchTradeMonth(api, sgg, ym);
      store.replaceMonth(sgg, ym, month, now().toISOString());
    })).finally(() => inflight.delete(k));
    inflight.set(k, p);
    return p;
  }

  /**
   * months 중 필요한 달을 수집한다.
   * mode 'missing' — fetch_log에 없는 달만, 'stale' — 없거나 30일 지난 달.
   */
  async function ensure(sgg, months, { jobId = null, mode = 'missing' } = {}) {
    const need = months.filter((ym) => (mode === 'stale' ? isStale(sgg, ym) : isMissing(sgg, ym)));
    const job = { total: need.length, done: 0, failed: 0, error: null, running: true };
    if (jobId) jobs.set(jobId, job);
    const results = await Promise.allSettled(need.map((ym) => enqueue(sgg, ym).then(() => { job.done++; }, (e) => {
      job.failed++;
      job.error ??= e;
      throw e;
    })));
    job.running = false;
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
    return { fetched: need.length };
  }

  return {
    ensure,
    isMissing,
    progress: (jobId) => jobs.get(jobId) ?? null,
  };
}
