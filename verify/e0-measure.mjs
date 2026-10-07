// 개선 v2 E0 실측 (docs/IMPROVEMENT-SPEC.md 5장 E0). 앱 코드(server/, client/)를 import하지 않는다.
// DB는 읽기 전용으로 열고, 현재가 범위(내 동이 속한 실거래 단지)만 서버 API(GET, 수집 없음)에서 읽는다.
// 사용: node verify/e0-measure.mjs [--api http://localhost:3001] [--out docs/e0-measure.md]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const API = arg('--api', 'http://localhost:3001');
const OUT = path.resolve(ROOT, arg('--out', 'docs/e0-measure.md'));
const DB_PATH = process.env.DB_PATH || path.join(os.homedir(), '.butler-poc', 'app.db');
const db = new Database(DB_PATH, { readonly: true });

const get = async (p) => (await fetch(`${API}${p}`)).json();
const health = await get('/api/health');
const AS_OF = health.asOf;

const addMonths = (ym, d) => {
  const n = +ym.slice(0, 4) * 12 + (+ym.slice(4) - 1) + d;
  return `${Math.floor(n / 12)}${String((n % 12) + 1).padStart(2, '0')}`;
};
const fromOf = (months) => addMonths(AS_OF, -(months - 1));
const inWindow = (t, months) => t.deal_ym >= fromOf(months) && t.deal_ym <= AS_OF;
const isDirect = (t) => t.dealing_gbn === '직거래';
const latestFirst = (a, b) => b.deal_ym.localeCompare(a.deal_ym) || b.deal_day - a.deal_day;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const sqm = (u) => (u / 10000).toFixed(2);
const won = (v) => {
  if (v === null || v === undefined) return '—';
  const eok = Math.trunc(v / 10000);
  const man = v - eok * 10000;
  return [eok ? `${eok}억` : '', man ? `${man.toLocaleString('en-US')}만` : ''].filter(Boolean).join(' ') || '0';
};
const ymText = (ym) => `${ym.slice(0, 4)}-${ym.slice(4)}`;

// 단지 전체: K-APT 지번과 같은 실거래 단지 + 저장된 연결 (owner 좁히기 없음)
function linkSet(a) {
  const umd = a.bjd_code.slice(5, 10);
  const seqs = new Set(db.prepare(`SELECT DISTINCT apt_seq FROM trades WHERE sgg_cd = ? AND umd_cd = ? AND bonbun = ? AND bubun = ?`)
    .all(a.sigungu_code, umd, a.bonbun, a.bubun).map((r) => r.apt_seq));
  for (const r of db.prepare('SELECT apt_seq FROM complex_trade_link_override WHERE kapt_code = ?').all(a.kapt_code)) seqs.add(r.apt_seq);
  return [...seqs].sort();
}

const assets = db.prepare(`SELECT a.*, c.name, c.sigungu_code, c.bjd_code, c.bonbun, c.bubun, c.umd_name
  FROM assets a JOIN complexes c USING (kapt_code) ORDER BY a.id`).all();
const tradesOf = db.prepare('SELECT * FROM trades WHERE sgg_cd = ? AND cdeal_type IS NULL');
const bySgg = new Map();
const sggTrades = (sgg) => {
  if (!bySgg.has(sgg)) bySgg.set(sgg, tradesOf.all(sgg));
  return bySgg.get(sgg);
};

const out = [];
const md = (s = '') => out.push(s);
const table = (head, rows) => {
  md(`| ${head.join(' | ')} |`);
  md(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) md(`| ${r.join(' | ')} |`);
  md();
};

const results = [];
for (const a of assets) {
  const detail = await get(`/api/assets/${a.id}`);
  const ownerSeqs = detail.scope.aptSeqs;
  const link = linkSet(a);
  const all = sggTrades(a.sigungu_code);
  const umd = a.bjd_code.slice(5, 10);
  const own = all.filter((t) => ownerSeqs.includes(t.apt_seq) && Math.abs(t.area_u - a.area_u) <= 1000 && t.floor !== null);
  const sameFloor = (months) => own.filter((t) => inWindow(t, months) && t.floor === a.floor);
  const widened = (months) => own.filter((t) => inWindow(t, months) && t.floor >= Math.max(1, a.floor - 2) && t.floor <= a.floor + 2);
  const complex = (months, winU) => all.filter((t) => link.includes(t.apt_seq) && inWindow(t, months) && Math.abs(t.area_u - a.area_u) <= winU);
  const hood = (months, winU) => link.length
    ? all.filter((t) => t.umd_cd === umd && !link.includes(t.apt_seq) && inWindow(t, months) && Math.abs(t.area_u - a.area_u) <= winU)
    : [];
  results.push({ a, ownerSeqs, link, own, sameFloor, widened, complex, hood, all, umd });
}

md('# E0 실측 결과 — 개선 v2 비교 근거');
md();
md(`- 측정일: ${new Date().toISOString().slice(0, 10)}, 기준 월(AS_OF): ${ymText(AS_OF)}`);
md(`- DB: \`~/.butler-poc/app.db\` (읽기 전용), 스크립트: \`verify/e0-measure.mjs\` (앱 코드 import 없음)`);
md('- 모든 건수는 계약 해제 거래를 뺀 값이다. 중앙값은 만원 단위, 짝수 건이면 가운데 두 값의 평균을 반올림.');
md(`- 기간: 12개월 = ${ymText(fromOf(12))}~${ymText(AS_OF)}, 24개월 = ${ymText(fromOf(24))}~, 36개월 = ${ymText(fromOf(36))}~`);
md();

md('## 0. 대상 자산');
table(['id', '단지', '동·호', '층', '전용', '법정동', '현재가 범위(aptSeq)', '단지 전체(aptSeq)'],
  results.map((r) => [r.a.id, r.a.name, `${r.a.dong}동 ${r.a.ho}호`, r.a.floor, `${sqm(r.a.area_u)}㎡`, r.a.umd_name,
    r.ownerSeqs.join(', ') || '—', r.link.join(', ') || '—']));

md('## 1. 기본값 기준 세 섹션 건수');
md('기본값: 같은 층 36개월, 단지·동네 ±5㎡ 12개월, 직거래 포함.');
md();
table(['id', '같은 층', '±2층 확장 시', '같은 단지 ±5㎡ (중앙값)', '같은 법정동 ±5㎡ (중앙값)', '동네 단지 수'],
  results.map((r) => {
    const c = r.complex(12, 50000);
    const h = r.hood(12, 50000);
    return [r.a.id, r.sameFloor(36).length, r.widened(36).length, `${c.length}건 (${won(median(c.map((t) => t.deal_amount)))})`,
      r.link.length ? `${h.length}건 (${won(median(h.map((t) => t.deal_amount)))})` : '계산 안 함(연결 없음)', new Set(h.map((t) => t.apt_seq)).size];
  }));

md('## 2. 기간·면적 범위에 따른 건수');
md('### 2-1. 같은 층 (기간별)');
table(['id', '12개월', '24개월', '36개월', '±2층 12', '±2층 24', '±2층 36'],
  results.map((r) => [r.a.id, ...[12, 24, 36].map((m) => r.sameFloor(m).length), ...[12, 24, 36].map((m) => r.widened(m).length)]));
for (const [title, key] of [['2-2. 같은 단지 (단지 전체)', 'complex'], ['2-3. 같은 법정동 (내 단지 제외)', 'hood']]) {
  md(`### ${title}`);
  const head = ['id'];
  for (const m of [12, 24, 36]) for (const w of [3, 5, 10]) head.push(`${m}개월 ±${w}㎡`);
  table(head, results.map((r) => {
    const row = [r.a.id];
    for (const m of [12, 24, 36]) for (const w of [3, 5, 10]) row.push(r[key](m, w * 10000).length);
    return row;
  }));
}

md('## 3. 직거래 포함/제외 중앙값 (12개월, ±5㎡)');
table(['id', '단지 포함', '단지 제외', '차이', '직거래 수', '동네 포함', '동네 제외', '차이', '직거래 수'],
  results.map((r) => {
    const row = [r.a.id];
    for (const list of [r.complex(12, 50000), r.hood(12, 50000)]) {
      const inc = median(list.map((t) => t.deal_amount));
      const exc = median(list.filter((t) => !isDirect(t)).map((t) => t.deal_amount));
      row.push(won(inc), won(exc), inc !== null && exc !== null ? `${inc - exc >= 0 ? '+' : '−'}${won(Math.abs(inc - exc))}` : '—',
        list.filter(isDirect).length);
    }
    return row;
  }));

md('## 4. 필드 결측 비율 (전 기간, 수집된 모든 거래)');
const missRows = [];
for (const sgg of [...new Set(assets.map((a) => a.sigungu_code))]) {
  const r = db.prepare(`SELECT COUNT(*) n,
    SUM(umd_cd IS NULL OR umd_cd = '') umd, SUM(apt_seq IS NULL OR apt_seq = '') seq, SUM(floor IS NULL) fl,
    SUM(apt_nm IS NULL OR apt_nm = '') nm, MIN(deal_ym) mn, MAX(deal_ym) mx FROM trades WHERE sgg_cd = ?`).get(sgg);
  const pct = (x) => `${x} (${((x / r.n) * 100).toFixed(2)}%)`;
  missRows.push([sgg, `${ymText(r.mn)}~${ymText(r.mx)}`, r.n.toLocaleString('en-US'), pct(r.umd), pct(r.seq), pct(r.fl), pct(r.nm)]);
}
table(['시군구', '기간', '거래 행', '법정동 코드 결측', 'aptSeq 결측', '층 결측', '단지명 결측'], missRows);

md('## 5. ±5㎡ 범위 안의 면적 분포 (12개월, 다른 평형 계열 섞임 확인)');
md('범위 안 신고 면적값과 건수. 내 면적과 ±0.1㎡ 이내는 **굵게**.');
md();
for (const r of results) {
  for (const [label, list] of [['같은 단지', r.complex(12, 50000)], ['같은 법정동', r.hood(12, 50000)]]) {
    const counts = new Map();
    for (const t of list) counts.set(t.area_u, (counts.get(t.area_u) ?? 0) + 1);
    const parts = [...counts].sort((x, y) => x[0] - y[0])
      .map(([u, n]) => (Math.abs(u - r.a.area_u) <= 1000 ? `**${sqm(u)}㎡×${n}**` : `${sqm(u)}㎡×${n}`));
    md(`- 자산 ${r.a.id} ${label}: ${parts.join(', ') || '없음'}`);
  }
}
md();

md('## 6. 사례 A 같은 층 거래 목록');
const caseA = results.find((r) => r.a.kapt_code === 'A13987303' && String(r.a.dong) === '112' && String(r.a.ho) === '1001');
if (caseA) {
  const list36 = caseA.sameFloor(36).sort(latestFirst);
  md(`자산 ${caseA.a.id} (${caseA.a.name} ${caseA.a.dong}동 ${caseA.a.ho}호, ${caseA.a.floor}층, ${sqm(caseA.a.area_u)}㎡), 기본 36개월: ${list36.length}건`);
  md();
  table(['계약일', '층', '금액', '면적', '직거래'], list36.map((t) => [`${ymText(t.deal_ym)}-${String(t.deal_day).padStart(2, '0')}`, t.floor, won(t.deal_amount), `${sqm(t.area_u)}㎡`, isDirect(t) ? '예' : '']));
  const old = caseA.own.filter((t) => t.floor === caseA.a.floor && ['201607', '201610'].includes(t.deal_ym));
  md(`- 기간 밖 확인: 2016년 같은 층 거래 ${old.map((t) => `${ymText(t.deal_ym)}-${t.deal_day} ${won(t.deal_amount)}`).join(', ') || '없음'} → 기본 36개월 목록에 ${old.some((t) => inWindow(t, 36)) ? '포함됨(예상과 다름)' : '없음(정답)'}`);
  md();
} else {
  md('사례 A 자산이 DB에 없습니다.');
  md();
}

md('## 7. 같은 층 거래 0건 자산 (36개월)');
const zero = results.filter((r) => r.sameFloor(36).length === 0);
md(zero.length ? zero.map((r) => `- 자산 ${r.a.id} ${r.a.name} ${r.a.dong}동 ${r.a.ho}호 ${r.a.floor}층: ±2층 확장 시 ${r.widened(36).length}건`).join('\n')
  : '- 없음 → ±2층 확장은 단위 테스트(가짜 데이터)로 확인한다.');
md();

md('## 8. 수집된 달 (필요 기간 커버리지)');
for (const sgg of [...new Set(assets.map((a) => a.sigungu_code))]) {
  const have = new Set(db.prepare('SELECT deal_ym FROM fetch_log WHERE sgg_cd = ?').all(sgg).map((r) => r.deal_ym));
  const need36 = Array.from({ length: 36 }, (_, i) => addMonths(AS_OF, -i));
  md(`- ${sgg}: 수집 ${have.size}개월, 최근 36개월 중 빠진 달 ${need36.filter((m) => !have.has(m)).length}개`);
}
md();

// 사람이 쓴 해석(<!-- manual --> 아래)은 다시 실행해도 보존한다.
const MARK = '<!-- manual -->';
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const manual = prev.includes(MARK) ? prev.slice(prev.indexOf(MARK)) : `${MARK}\n`;
fs.writeFileSync(OUT, `${out.join('\n')}\n${manual}`);
console.log(`e0-measure: ${results.length} assets → ${path.relative(ROOT, OUT)}`);
