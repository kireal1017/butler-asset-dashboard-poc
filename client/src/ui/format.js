// v3 금액·등락 표기 (spec 3장). 입력은 원 단위 정수.
const MINUS = '−'; // U+2212
const EOK = 100_000_000;
const MAN = 10_000;

const group = (n) => n.toLocaleString('en-US');

/** 억·만·원 조각으로 나눈다. 반환 조각에는 단위가 붙어 있고, 마지막 조각 뒤에 '원'을 붙일지는 호출자가 정한다. */
function parts(absWon) {
  const eok = Math.floor(absWon / EOK);
  const man = Math.floor((absWon % EOK) / MAN);
  const won = absWon % MAN;
  const out = [];
  if (eok) out.push(`${group(eok)}억`);
  if (man) out.push(`${group(man)}만`);
  if (won) out.push(group(won));
  return out;
}

function toInt(won) {
  if (won === null || won === undefined || Number.isNaN(Number(won))) return null;
  return Math.round(Number(won));
}

/**
 * 6억 2,000만원 / 1억원 / 80만원 / 80만 5,000원 / 9,000원 / 0원 / −1,500만원
 * null·undefined는 빈 문자열.
 */
export function formatWon(won) {
  const v = toInt(won);
  if (v === null) return '';
  if (v === 0) return '0원';
  const sign = v < 0 ? MINUS : '';
  return `${sign}${parts(Math.abs(v)).join(' ')}원`;
}

/** 원 단위 그대로: 50,000,000원 */
export function formatWonRaw(won) {
  const v = toInt(won);
  if (v === null) return '';
  const sign = v < 0 ? MINUS : '';
  return `${sign}${group(Math.abs(v))}원`;
}

/** 등락 금액(부호 없음, 끝이 '만'이면 '원'을 붙이지 않음): 2억 1,000만 / 1,500만 / 5,000원 */
export function formatWonCompact(won) {
  const v = toInt(won);
  if (v === null) return '';
  const abs = Math.abs(v);
  if (abs === 0) return '0원';
  const p = parts(abs);
  const last = p[p.length - 1];
  return last.endsWith('억') || last.endsWith('만') ? p.join(' ') : `${p.join(' ')}원`;
}

/** +51.2% / −2.1% / 0.0% (소수 한 자리, 0에서 멀어지는 쪽 반올림) */
export function formatRate(rate) {
  const r = (Math.sign(rate) * Math.round(Math.abs(rate) * 10)) / 10;
  if (r === 0) return '0.0%';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}%`;
}

/** 'up' | 'down' | 'flat' */
export function changeDirection(diffWon) {
  const v = toInt(diffWon);
  if (!v) return 'flat';
  return v > 0 ? 'up' : 'down';
}

/**
 * ▲ 2억 1,000만 (+51.2%) / ▼ 1,500만 (−2.1%) / 변동 없음 (0.0%)
 * rate가 없으면 괄호를 생략한다.
 */
export function formatChange(diffWon, rate) {
  const dir = changeDirection(diffWon);
  const rateText = rate === null || rate === undefined || Number.isNaN(Number(rate)) ? '' : ` (${formatRate(Number(rate))})`;
  if (dir === 'flat') return `변동 없음${rateText}`;
  return `${dir === 'up' ? '▲' : '▼'} ${formatWonCompact(diffWon)}${rateText}`;
}

/** 스크린리더용: 상승 2억 1,000만원, 51.2퍼센트 */
export function describeChange(diffWon, rate) {
  const dir = changeDirection(diffWon);
  const r = rate === null || rate === undefined ? '' : `, ${Math.abs(Math.round(Number(rate) * 10) / 10).toFixed(1)}퍼센트`;
  if (dir === 'flat') return `변동 없음${r}`;
  return `${dir === 'up' ? '상승' : '하락'} ${formatWon(Math.abs(toInt(diffWon)))}${r}`;
}

// ---- 날짜·면적·층 표기 (v3 화면 공통) ----

/** '2027-08-31' 또는 '20270831' → 2027.08.31 */
export function formatDate(d) {
  if (!d) return '';
  const s = String(d).replace(/-/g, '');
  if (!/^\d{8}$/.test(s)) return '';
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

/** '201610' → 2016.10 */
export function formatYmDot(ym) {
  if (!/^\d{6}$/.test(String(ym ?? ''))) return '';
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** '201610' → 2016년 10월 */
export function formatYmKo(ym) {
  if (!/^\d{6}$/.test(String(ym ?? ''))) return '';
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

/** 기간 '201608'~'201610' → 2016년 8월~10월 / 2016년 11월~2017년 1월 / 같으면 2016년 10월 */
export function formatYmSpanKo(from, to) {
  if (!from || from === to) return formatYmKo(to);
  if (from.slice(0, 4) === to.slice(0, 4)) return `${formatYmKo(from)}~${Number(to.slice(4, 6))}월`;
  return `${formatYmKo(from)}~${formatYmKo(to)}`;
}

/** 1/10000㎡ 정수 → 84.91㎡ (뒤의 0 생략) */
export function formatAreaU(areaU) {
  if (!Number.isFinite(areaU)) return '';
  const whole = Math.floor(areaU / 10000);
  const frac = String(areaU % 10000).padStart(4, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''}㎡`;
}

/** 10 → 10층, −1 → 지하 1층 */
export const formatFloorKo = (f) => (Number.isFinite(f) ? (f < 0 ? `지하 ${-f}층` : `${f}층`) : '');

/** 112, 1001 → 112동 1001호 */
export const unitName = (u) => (u ? `${u.dong}동 ${u.ho}호` : '');
