// 회귀 비교 공용 함수 (verify/regress-prep.mjs, verify/regress-compare.mjs). 앱 코드를 import하지 않는다.
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

// 비교 중 바뀌면 안 되는 테이블과 정렬 키
const TABLES = {
  trades: 'sgg_cd, deal_ym, src_seq',
  fetch_log: 'sgg_cd, deal_ym',
  complex_trade_link_override: 'kapt_code, apt_seq',
  assets: 'id',
  api_usage: 'api, date_kst',
};

/** DB 파일의 데이터 테이블별 SHA-256 */
export function tableHashes(file) {
  const db = new Database(file, { readonly: true });
  try {
    const out = {};
    for (const [t, order] of Object.entries(TABLES)) {
      const h = crypto.createHash('sha256');
      let n = 0;
      for (const row of db.prepare(`SELECT * FROM ${t} ORDER BY ${order}`).iterate()) {
        h.update(JSON.stringify(row));
        h.update('\n');
        n++;
      }
      out[t] = `${n}:${h.digest('hex').slice(0, 16)}`;
    }
    return out;
  } finally {
    db.close();
  }
}

export const addMonths = (ym, d) => {
  const n = +ym.slice(0, 4) * 12 + (+ym.slice(4) - 1) + d;
  return `${Math.floor(n / 12)}${String((n % 12) + 1).padStart(2, '0')}`;
};

export function monthRange(from, to) {
  const out = [];
  for (let ym = from; ym <= to; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}
