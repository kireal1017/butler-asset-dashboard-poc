// 월(YYYYMM) 계산. 기준 월(asOf)은 KST.

export const kstYm = (d) => {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function addMonths(ym, delta) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}${String(mm + 1).padStart(2, '0')}`;
}

/** from..to 포함 범위의 월 목록 (오름차순). */
export function monthRange(from, to) {
  const out = [];
  for (let ym = from; ym <= to; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}

/** asOf 포함 최근 n개월. */
export const lastMonths = (asOf, n) => monthRange(addMonths(asOf, -(n - 1)), asOf);
