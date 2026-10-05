// 서울 단지 목록을 (다시) 적재한다: npm run load-complexes -w server
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { createApiClient } from '../external/http.js';
import { countComplexes, loadSeoulComplexes } from '../services/complexes.js';

const config = loadConfig();
const db = openDb(config.dbPath);
const api = createApiClient({ db, serviceKey: config.serviceKey });
const r = await loadSeoulComplexes(db, api);
console.log(`loaded ${r.loaded} / totalCount ${r.totalCount}; complexes rows = ${countComplexes(db)}`);
