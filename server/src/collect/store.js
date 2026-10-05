// "시군구 × 월" 단위 교체 저장. 거래·원본 응답·fetch_log를 한 트랜잭션으로 바꾼다.

export function createMonthStore(db) {
  const delTrades = db.prepare('DELETE FROM trades WHERE sgg_cd = ? AND deal_ym = ?');
  const delRaw = db.prepare('DELETE FROM raw_responses WHERE sgg_cd = ? AND deal_ym = ?');
  const insTrade = db.prepare(`INSERT INTO trades (sgg_cd, deal_ym, src_seq, apt_seq, apt_nm, umd_cd, umd_nm, jibun, bonbun, bubun,
    area_u, area_raw, floor, apt_dong, deal_day, deal_amount, cdeal_type, cdeal_day, rgst_date, dealing_gbn, build_year)
    VALUES (@sgg_cd, @deal_ym, @src_seq, @apt_seq, @apt_nm, @umd_cd, @umd_nm, @jibun, @bonbun, @bubun,
    @area_u, @area_raw, @floor, @apt_dong, @deal_day, @deal_amount, @cdeal_type, @cdeal_day, @rgst_date, @dealing_gbn, @build_year)`);
  const insRaw = db.prepare('INSERT INTO raw_responses (sgg_cd, deal_ym, page, body, fetched_at) VALUES (?, ?, ?, ?, ?)');
  const upLog = db.prepare(`INSERT INTO fetch_log (sgg_cd, deal_ym, fetched_at, row_count, total_count) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (sgg_cd, deal_ym) DO UPDATE SET fetched_at = excluded.fetched_at, row_count = excluded.row_count, total_count = excluded.total_count`);
  const getLog = db.prepare('SELECT * FROM fetch_log WHERE sgg_cd = ? AND deal_ym = ?');

  const replaceMonth = db.transaction((sggCd, dealYm, { pages, rows, total }, fetchedAt) => {
    if (rows.length !== total) throw new Error(`${sggCd} ${dealYm}: ${rows.length}/${total}건만 수신해 저장하지 않았습니다`);
    delTrades.run(sggCd, dealYm);
    delRaw.run(sggCd, dealYm);
    for (const r of rows) insTrade.run(r);
    pages.forEach((body, i) => insRaw.run(sggCd, dealYm, i + 1, body, fetchedAt));
    upLog.run(sggCd, dealYm, fetchedAt, rows.length, total);
  });

  return {
    replaceMonth: (sggCd, dealYm, month, fetchedAt = new Date().toISOString()) => replaceMonth(sggCd, dealYm, month, fetchedAt),
    getLog: (sggCd, dealYm) => getLog.get(sggCd, dealYm),
  };
}
