// PRD 7.9 금액 표기. 입력은 만원 단위 정수.
const MINUS = '−'; // U+2212

const group = (n) => n.toLocaleString('en-US');

/** 12억 4,000만 / 12억 / 9,500만 / 0원 */
export function formatManwon(manwon) {
  const v = Math.abs(manwon);
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  if (eok && rest) return `${group(eok)}억 ${group(rest)}만`;
  if (eok) return `${group(eok)}억`;
  if (rest) return `${group(rest)}만`;
  return '0원';
}

/** +1억 2,000만 / −1,500만 / 0원 */
export function formatSignedManwon(manwon) {
  if (manwon === 0) return '0원';
  return `${manwon > 0 ? '+' : MINUS}${formatManwon(manwon)}`;
}

/** +10.7% / −3.0% */
export function formatSignedRate(rate) {
  const r = (Math.sign(rate) * Math.round(Math.abs(rate) * 10)) / 10;
  if (r === 0) return '0.0%';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}%`;
}

/** 202608 → 2026.08 */
export const formatYm = (ym) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
