// PRD 7.1 단지 연결: K-APT 단지(kapt_code) ↔ 실거래 단지(aptSeq) 집합.

const AREA_TOLERANCE_U = 1000; // 0.1㎡ (1/10000㎡ 단위)

/** "서울특별시 노원구 하계동 271-3 하계극동건영벽산" → { bonbun: 271, bubun: 3 } */
export function parseLot(kaptAddr, umdName) {
  if (!kaptAddr || !umdName) return null;
  const esc = umdName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = kaptAddr.match(new RegExp(`${esc}\\s+(?:산\\s*)?(\\d+)(?:-(\\d+))?`));
  return m ? { bonbun: Number(m[1]), bubun: Number(m[2] ?? 0) } : null;
}

/**
 * 이름 정규화: 공백·"아파트"·괄호 내용·법정동명 접두어(하계동 → "하계") 제거, 끝의 단지 번호 1/1차 제거.
 * 예) 하계청구 → 청구, 한신1 → 한신, 장미(시영6) → 장미, 하계2차현대아파트 → 2차현대
 */
export function normalizeName(name, umdName = '') {
  let s = String(name).replace(/\s+/g, '').replace(/\([^)]*\)/g, '').replace(/아파트/g, '');
  const prefix = umdName.replace(/동$/, '');
  if (prefix && s.startsWith(prefix) && s.length > prefix.length) s = s.slice(prefix.length);
  s = s.replace(/(\d+)차?$/, (_, n) => (n === '1' ? '' : `${n}차`));
  return s;
}

export const sameArea = (a, b) => Math.abs(a - b) <= AREA_TOLERANCE_U;

/**
 * 연결 결정 (DB 비의존 순수 함수).
 * @param complex   { kaptCode, name, umdName }
 * @param lotSeqs   같은 법정동·지번의 실거래 단지 [{ aptSeq, aptNm }]
 * @param siblings  같은 법정동·지번의 다른 K-APT 단지 [{ name }]
 * @param overrides 저장된 오버라이드 aptSeq 목록
 * @param umdSeqs   같은 법정동의 모든 실거래 단지 [{ aptSeq, aptNm, areas: number[] }] (3b용)
 * @param umdComplexes 같은 법정동의 모든 K-APT 단지 이름 [{ kaptCode, name }] (3b 역방향 검사용)
 * @param assetAreaU 등록 중인 자산의 대장 면적 (3b 면적 교차 검사)
 */
export function decideLink({ complex, lotSeqs, siblings, overrides = [], umdSeqs = [], umdComplexes = [], assetAreaU = null }) {
  const norm = (s) => normalizeName(s, complex.umdName);
  const mine = norm(complex.name);
  let seqs = lotSeqs;
  let method = 'lot';

  if (siblings.length && lotSeqs.length) {
    const kaptNames = [mine, ...siblings.map((s) => norm(s.name))];
    const matched = lotSeqs.filter((s) => norm(s.aptNm) === mine);
    const unique = matched.length === 1 && kaptNames.filter((n) => n === mine).length === 1;
    if (!unique) {
      return { aptSeqs: [...new Set(overrides)], method: 'ambiguous', error: 'AMBIGUOUS_SHARED_LOT' };
    }
    seqs = matched;
    method = 'lot+name';
  }

  const result = new Set([...seqs.map((s) => s.aptSeq), ...overrides]);
  if (result.size) return { aptSeqs: [...result], method: seqs.length ? method : 'override' };

  // 3b. 지번으로 하나도 연결되지 않을 때만: 같은 법정동 안 정규화 이름 정확 일치 + 양방향 유일 + 면적 교차
  const cands = umdSeqs.filter((s) => norm(s.aptNm) === mine);
  const sameNameKapt = umdComplexes.filter((c) => norm(c.name) === mine);
  if (cands.length === 1 && sameNameKapt.length === 1 && assetAreaU !== null
    && cands[0].areas.some((a) => sameArea(a, assetAreaU))) {
    return { aptSeqs: [cands[0].aptSeq], method: 'name', newOverride: cands[0].aptSeq };
  }
  return { aptSeqs: [], method: 'none', error: cands.length > 1 || sameNameKapt.length > 1 ? 'AMBIGUOUS_NAME' : 'NOT_FOUND' };
}

/**
 * 자산의 동이 속한 실거래 단지 (사용자 결정 2026-10-05).
 * 1순위: 연결된 aptSeq 중 이 동이 aptDong으로 가장 많이 나온 곳.
 * 2순위: 대장 전용면적과 정확히 같은 면적의 거래가 있는 aptSeq가 하나뿐이면 그곳.
 * @param dongCounts    [{ aptSeq, count }]
 * @param exactAreaSeqs 자산 면적과 같은 area_u 거래가 있는 aptSeq 목록
 */
export function decideOwner(aptSeqs, dongCounts, exactAreaSeqs = []) {
  if (aptSeqs.length === 1) return { owner: aptSeqs[0], known: true, basis: 'single' };
  const sorted = [...dongCounts].filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  if (sorted.length && (sorted.length === 1 || sorted[0].count > sorted[1].count)) return { owner: sorted[0].aptSeq, known: true, basis: 'dong' };
  if (exactAreaSeqs.length === 1) return { owner: exactAreaSeqs[0], known: true, basis: 'area' };
  return { owner: null, known: false, basis: null };
}

/** 호수에서 층 추정: 1203 → 12, 101 → 1 */
export function floorFromHo(ho) {
  const n = Number(String(ho).replace(/\D/g, ''));
  return n >= 100 ? Math.floor(n / 100) : null;
}
