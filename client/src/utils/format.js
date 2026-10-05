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
