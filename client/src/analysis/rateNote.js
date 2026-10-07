// 전월세전환율 주석 문구 (spec 4.6, 4.8, 7.5): 비율·지역·기준월, 직접 입력 값이면 표시
import { formatYmDot } from '../ui/format.js';

export const RATE_MISSING = '전월세전환율을 불러오지 못해 환산 월세를 계산하지 못했어요.';

/** 4.74 → "4.74%" (소수 둘째 자리까지, 뒤의 0 생략) */
export const formatPct = (r) => `${Number(r.toFixed(2))}%`;

export function rateLabel(conversion) {
  if (!conversion) return '';
  const manual = conversion.source === 'MANUAL' ? ' (직접 입력한 값)' : '';
  return `전월세전환율 ${formatPct(conversion.rate)}(${conversion.region ?? '서울'}, 기준 ${formatYmDot(conversion.ym)})${manual}`;
}
