import { fetchSidoComplexes } from '../external/kapt.js';

export async function loadSeoulComplexes(db, api) {
  const { items, totalCount } = await fetchSidoComplexes(api);
  if (items.length !== totalCount) throw new Error(`단지 목록 ${items.length}/${totalCount}건만 수신`);
  const upsert = db.prepare(`INSERT INTO complexes (kapt_code, name, bjd_code, sigungu_code, sido, gu, umd_name)
    VALUES (@kaptCode, @kaptName, @bjdCode, @sgg, @as1, @as2, @as3)
    ON CONFLICT (kapt_code) DO UPDATE SET name = excluded.name, bjd_code = excluded.bjd_code,
      sigungu_code = excluded.sigungu_code, sido = excluded.sido, gu = excluded.gu, umd_name = excluded.umd_name`);
  db.transaction(() => {
    for (const it of items) upsert.run({ ...it, sgg: String(it.bjdCode).slice(0, 5) });
  })();
  return { loaded: items.length, totalCount };
}

export function countComplexes(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM complexes').get().n;
}

const compact = (s) => s.replace(/\s+/g, '');

export function searchComplexes(db, query, limit = 30) {
  const q = compact(query ?? '');
  if (!q) return [];
  return db.prepare(`SELECT kapt_code AS kaptCode, name, gu, umd_name AS umdName
    FROM complexes WHERE REPLACE(name, ' ', '') LIKE ? ESCAPE '\\'
    ORDER BY INSTR(REPLACE(name, ' ', ''), ?), LENGTH(name), name LIMIT ?`)
    .all(`%${q.replace(/[%_\\]/g, '\\$&')}%`, q, limit);
}
