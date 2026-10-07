// 전월세 "시군구 × 월" 단위 교체 저장 (매매 store.js와 같은 규칙, 전월세 전용 테이블).

export function createRentStore(db) {
  const delRows = db.prepare('DELETE FROM rent_transactions WHERE sgg_cd = ? AND deal_ym = ?');
  const delRaw = db.prepare('DELETE FROM rent_raw_responses WHERE sgg_cd = ? AND deal_ym = ?');
  const insRow = db.prepare(`INSERT INTO rent_transactions (sgg_cd, deal_ym, src_seq, apt_seq, apt_nm, umd_nm, jibun, area_u, floor, deal_day,
    deposit, monthly_rent, contract_type, contract_term)
    VALUES (@sgg_cd, @deal_ym, @src_seq, @apt_seq, @apt_nm, @umd_nm, @jibun, @area_u, @floor, @deal_day,
    @deposit, @monthly_rent, @contract_type, @contract_term)`);
  const insRaw = db.prepare('INSERT INTO rent_raw_responses (sgg_cd, deal_ym, page, body, fetched_at) VALUES (?, ?, ?, ?, ?)');
  const upLog = db.prepare(`INSERT INTO rent_fetch_log (sgg_cd, deal_ym, fetched_at, row_count, total_count) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (sgg_cd, deal_ym) DO UPDATE SET fetched_at = excluded.fetched_at, row_count = excluded.row_count, total_count = excluded.total_count`);
  const getLog = db.prepare('SELECT * FROM rent_fetch_log WHERE sgg_cd = ? AND deal_ym = ?');

  const replaceMonth = db.transaction((sggCd, dealYm, { pages, rows, total }, fetchedAt) => {
    if (rows.length !== total) throw new Error(`${sggCd} ${dealYm}: 전월세 ${rows.length}/${total}건만 수신해 저장하지 않았습니다`);
    delRows.run(sggCd, dealYm);
    delRaw.run(sggCd, dealYm);
    for (const r of rows) insRow.run(r);
    pages.forEach((body, i) => insRaw.run(sggCd, dealYm, i + 1, body, fetchedAt));
    upLog.run(sggCd, dealYm, fetchedAt, rows.length, total);
  });

  return {
    replaceMonth: (sggCd, dealYm, month, fetchedAt = new Date().toISOString()) => replaceMonth(sggCd, dealYm, month, fetchedAt),
    getLog: (sggCd, dealYm) => getLog.get(sggCd, dealYm),
  };
}
