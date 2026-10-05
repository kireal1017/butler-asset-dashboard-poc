import { decideLink, decideOwner, normalizeName } from '../logic/link.js';

const umdCdOf = (complex) => complex.bjd_code.slice(5, 10);

function siblingsOf(db, c) {
  return db.prepare(`SELECT kapt_code AS kaptCode, name FROM complexes
    WHERE bjd_code = ? AND bonbun = ? AND bubun = ? AND kapt_code <> ?`).all(c.bjd_code, c.bonbun, c.bubun, c.kapt_code);
}

/** DB에 저장된 거래로 K-APT 단지의 실거래 단지 집합을 정한다 (PRD 7.1, 계획 M2.1). */
export function resolveLink(db, c, { assetAreaU = null } = {}) {
  if (c.bonbun === null || c.bonbun === undefined) return { aptSeqs: [], method: 'none', error: 'NO_LOT' };
  const umdCd = umdCdOf(c);
  const lotSeqs = db.prepare(`SELECT DISTINCT apt_seq AS aptSeq, apt_nm AS aptNm FROM trades
    WHERE sgg_cd = ? AND umd_cd = ? AND bonbun = ? AND bubun = ?`).all(c.sigungu_code, umdCd, c.bonbun, c.bubun);
  const overrides = db.prepare('SELECT apt_seq FROM complex_trade_link_override WHERE kapt_code = ?').all(c.kapt_code).map((r) => r.apt_seq);
  const input = { complex: { kaptCode: c.kapt_code, name: c.name, umdName: c.umd_name }, lotSeqs, siblings: siblingsOf(db, c), overrides };
  if (!lotSeqs.length && !overrides.length) {
    const rows = db.prepare(`SELECT apt_seq AS aptSeq, apt_nm AS aptNm, GROUP_CONCAT(DISTINCT area_u) AS areas FROM trades
      WHERE sgg_cd = ? AND umd_cd = ? GROUP BY apt_seq, apt_nm`).all(c.sigungu_code, umdCd);
    input.umdSeqs = rows.map((r) => ({ ...r, areas: String(r.areas).split(',').map(Number) }));
    input.umdComplexes = db.prepare('SELECT kapt_code AS kaptCode, name FROM complexes WHERE bjd_code = ?').all(c.bjd_code);
    input.assetAreaU = assetAreaU;
  }
  const decision = decideLink(input);
  if (decision.newOverride) {
    db.prepare(`INSERT OR IGNORE INTO complex_trade_link_override (kapt_code, apt_seq, reason, created_at) VALUES (?, ?, ?, ?)`)
      .run(c.kapt_code, decision.newOverride, 'PRD 7.1 2단계: 같은 법정동 정규화 이름 정확 일치 + 면적 교차', new Date().toISOString());
  }
  return decision;
}

/** 자산의 동이 속한 실거래 단지. 모르면 연결 집합 전체를 쓴다. */
export function resolveScope(db, aptSeqs, dong, areaU = null) {
  let dongCounts = [];
  let exactAreaSeqs = [];
  if (aptSeqs.length > 1) {
    const inList = aptSeqs.map(() => '?').join(',');
    dongCounts = db.prepare(`SELECT apt_seq AS aptSeq, COUNT(*) AS count FROM trades
      WHERE apt_seq IN (${inList}) AND apt_dong = ? GROUP BY apt_seq`).all(...aptSeqs, String(dong));
    if (areaU !== null) {
      exactAreaSeqs = db.prepare(`SELECT DISTINCT apt_seq AS aptSeq FROM trades WHERE apt_seq IN (${inList}) AND area_u = ?`)
        .all(...aptSeqs, areaU).map((r) => r.aptSeq);
    }
  }
  const { owner, known, basis } = decideOwner(aptSeqs, dongCounts, exactAreaSeqs);
  return { aptSeqs: known ? [owner] : aptSeqs, ownerKnown: known, ownerBasis: basis };
}

/** 같은 지번 대장에 섞인 다른 단지 호실을 거르는 함수 (api-notes 3장 4항). */
export function registerRowFilter(db, c) {
  const sibs = siblingsOf(db, c);
  if (!sibs.length) return () => true;
  const norm = (s) => normalizeName(s, c.umd_name);
  const mine = norm(c.name);
  const others = new Set(sibs.map((s) => norm(s.name)));
  return (row) => {
    const b = norm(row.bldNm || '');
    return !b || b === mine || !others.has(b);
  };
}

export function areaOptions(db, aptSeqs) {
  if (!aptSeqs.length) return [];
  return db.prepare(`SELECT area_u AS areaU, COUNT(*) AS trades FROM trades WHERE apt_seq IN (${aptSeqs.map(() => '?').join(',')})
    AND cdeal_type IS NULL GROUP BY area_u ORDER BY area_u`).all(...aptSeqs);
}
