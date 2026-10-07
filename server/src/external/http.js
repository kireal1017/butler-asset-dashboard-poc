import { maskKey } from '../config.js';

// 개발계정 일일 트래픽 (PRD 5장). 90%에 도달하면 추가 호출을 멈춘다.
export const DAILY_LIMITS = { rtms: 10000, rent: 10000, bldRgst: 10000, aptList: 5000, aptBasis: 5000 };
export const STOP_RATIO = 0.9;
const LABELS = { rtms: '실거래가', rent: '전월세 실거래가', bldRgst: '건축물대장', aptList: '단지 목록', aptBasis: '단지 정보' };
const RETRY_DELAYS_MS = [1000, 3000];

export class QuotaError extends Error {
  constructor(api) {
    super(`오늘 ${LABELS[api] ?? api} 조회 한도의 90%에 도달해 추가 조회를 멈췄습니다. 내일 다시 시도해 주세요.`);
    this.code = 'QUOTA';
    this.api = api;
  }
}

export class KeyNotRegisteredError extends Error {
  constructor(api) {
    super(`${LABELS[api] ?? api} 인증키가 아직 등록되지 않았습니다. 공공데이터포털 활용신청 상태를 확인해 주세요.`);
    this.code = 'KEY_NOT_REGISTERED';
    this.api = api;
  }
}

export class ExternalApiError extends Error {
  constructor(api, detail) {
    super(`${LABELS[api] ?? api} 서버에서 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.`);
    this.code = 'EXTERNAL';
    this.api = api;
    this.detail = detail; // 로그용 (키는 가려진 상태)
  }
}

export const kstDate = (d) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * 공공데이터 호출 클라이언트.
 * - 키는 URLSearchParams로 한 번만 인코딩한다 (Decoding 키 전제).
 * - HTTP 요청 1회(페이지·재시도 포함)마다 api_usage를 KST 날짜 기준으로 1 올린다.
 * - devFault: 'quota'면 한도 도달로, 'fetch'면 호출 실패로 처리하고 DB에는 아무것도 쓰지 않는다.
 */
export function createApiClient({ db, serviceKey, fetchImpl = fetch, now = () => new Date(), sleep, devFault = null, log = console }) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const getUsage = db.prepare('SELECT count FROM api_usage WHERE api = ? AND date_kst = ?');
  const bump = db.prepare(`INSERT INTO api_usage (api, date_kst, count) VALUES (?, ?, 1)
    ON CONFLICT (api, date_kst) DO UPDATE SET count = count + 1`);

  function usage(api) {
    return getUsage.get(api, kstDate(now()))?.count ?? 0;
  }

  function isBlocked(api) {
    if (devFault === 'quota') return true;
    return usage(api) >= DAILY_LIMITS[api] * STOP_RATIO;
  }

  async function request(api, url, params, { keyParam = 'serviceKey' } = {}) {
    if (!(api in DAILY_LIMITS)) throw new Error(`unknown api ${api}`);
    const qs = new URLSearchParams({ [keyParam]: serviceKey, ...params });
    let lastError;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await wait(RETRY_DELAYS_MS[attempt - 1]);
      if (isBlocked(api)) throw new QuotaError(api);
      if (devFault === 'fetch') {
        lastError = new ExternalApiError(api, `${api} 호출 실패(결함 주입)`);
        continue;
      }
      bump.run(api, kstDate(now()));
      try {
        const res = await fetchImpl(`${url}?${qs}`);
        const body = await res.text();
        if (/SERVICE_KEY_IS_NOT_REGISTERED/.test(body)) throw new KeyNotRegisteredError(api);
        if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(body)) throw new QuotaError(api);
        if (!res.ok) throw new ExternalApiError(api, `${api} HTTP ${res.status}`);
        return body;
      } catch (e) {
        if (e instanceof KeyNotRegisteredError || e instanceof QuotaError) throw e;
        lastError = new ExternalApiError(api, maskKey(e.message, serviceKey));
        log.warn?.(`[api] ${api} attempt ${attempt + 1} failed: ${lastError.detail}`);
      }
    }
    throw lastError;
  }

  return { request, usage, isBlocked, devFault };
}
