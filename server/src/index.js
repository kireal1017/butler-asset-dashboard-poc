import { loadConfig, maskKey } from './config.js';
import { openDb } from './db/index.js';
import { createApiClient } from './external/http.js';
import { countComplexes, loadSeoulComplexes } from './services/complexes.js';
import { createApp } from './app.js';
import { createCollector } from './collect/collector.js';
import { createRentStore } from './collect/rentStore.js';
import { fetchRentMonth } from './external/rent.js';
import { kstYm } from './logic/months.js';

const config = loadConfig();
if (!config.serviceKey) {
  console.error('DATA_GO_KR_SERVICE_KEY가 .env에 없습니다. .env.example을 참고해 주세요.');
  process.exit(1);
}

const db = openDb(config.dbPath);
const api = createApiClient({ db, serviceKey: config.serviceKey, devFault: config.devFault });
const collector = createCollector({ db, api });
// v3 전월세: 매매와 같은 큐 규칙, 전용 테이블
const rentCollector = createCollector({ db, api, fetchMonth: fetchRentMonth, store: createRentStore(db) });
const kstDate = (d) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const ctx = {
  db, api, collector, rentCollector, config, asOf: () => config.asOf ?? kstYm(new Date()), today: () => config.today ?? kstDate(new Date()),
};

if (countComplexes(db) === 0) {
  try {
    const r = await loadSeoulComplexes(db, api);
    console.log(`[init] 서울 단지 목록 ${r.loaded}건 적재`);
  } catch (e) {
    console.error('[init] 단지 목록 적재 실패:', maskKey(e.message, config.serviceKey));
  }
}

createApp(ctx).listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}  db=${config.dbPath}${config.devFault ? `  DEV-FAULT=${config.devFault}` : ''}`);
});
