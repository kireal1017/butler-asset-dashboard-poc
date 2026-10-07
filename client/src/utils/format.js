/** 849500 → "84.95㎡" (1/10000㎡ 정수, 뒤의 0은 생략) */
export function formatArea(areaU) {
  const whole = Math.floor(areaU / 10000);
  const frac = String(areaU % 10000).padStart(4, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}㎡`;
}

/** 20160721 → 2016.07.21 */
export const formatYmd = (ymd) => `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;

/** 1~9층 같은 표기 */
export const formatFloor = (f) => (f < 0 ? `지하 ${-f}층` : `${f}층`);

/** [849100, 849500] → "84.91·84.95㎡" (내 면적 묶음처럼 여러 신고 면적을 한 줄로) */
export const formatAreas = (areas) => `${areas.map((u) => formatArea(u).replace('㎡', '')).join('·')}㎡`;

/** 799100, 899100 → "79.91~89.91㎡" (조건 표시용이라 소수 둘째 자리까지) */
const sqm2 = (u) => String(Number((u / 10000).toFixed(2)));
export const formatAreaRange = (min, max) => `${sqm2(min)}~${sqm2(max)}㎡`;
