import { fetchComplexBasis, fetchComplexDetail } from '../external/kapt.js';
import { parseLot } from '../logic/link.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function getComplex(db, kaptCode) {
  return db.prepare('SELECT * FROM complexes WHERE kapt_code = ?').get(kaptCode);
}

/** 기본 정보(주소→지번, 세대수, 사용승인일)를 한 번만 받아 저장한다. */
export async function ensureBasis(db, api, kaptCode) {
  const c = getComplex(db, kaptCode);
  if (!c) return null;
  if (c.addr) return c;
  const b = await fetchComplexBasis(api, kaptCode);
  const lot = parseLot(b?.kaptAddr, c.umd_name);
  db.prepare(`UPDATE complexes SET addr = ?, doro_juso = ?, bonbun = ?, bubun = ?, households = ?, dong_count = ?, use_date = ?
    WHERE kapt_code = ?`).run(b?.kaptAddr ?? '', b?.doroJuso ?? null, lot?.bonbun ?? null, lot?.bubun ?? null,
    num(b?.kaptdaCnt), num(b?.kaptDongCnt), b?.kaptUsedate ?? null, kaptCode);
  return getComplex(db, kaptCode);
}

/** 등록할 단지: 기본 정보 + 상세 정보(주차 대수) */
export async function ensureDetail(db, api, kaptCode) {
  let c = await ensureBasis(db, api, kaptCode);
  if (!c || c.detail_fetched_at) return c;
  const d = await fetchComplexDetail(api, kaptCode);
  db.prepare('UPDATE complexes SET parking_ground = ?, parking_under = ?, detail_fetched_at = ? WHERE kapt_code = ?')
    .run(num(d?.kaptdPcnt), num(d?.kaptdPcntu), new Date().toISOString(), kaptCode);
  return getComplex(db, kaptCode);
}

/** 같은 법정동 단지들의 기본 정보 (같은 지번 판정에 필요). 단지당 1회만 호출. */
export async function ensureBasisForBjd(db, api, bjdCode) {
  const codes = db.prepare('SELECT kapt_code FROM complexes WHERE bjd_code = ? AND addr IS NULL').all(bjdCode);
  for (const { kapt_code } of codes) await ensureBasis(db, api, kapt_code);
}
