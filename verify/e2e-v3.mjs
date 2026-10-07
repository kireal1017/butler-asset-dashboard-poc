// v3 화면 E2E (실제 서버·실제 공공데이터). 헤드리스 Edge/Chrome을 DevTools 프로토콜로 조작한다(추가 패키지 없음).
// 순서: 기존 데이터 삭제(화면에서) → 빈 상태 → 건물·호실·계약 등록(실제 조회·수집) → 오류 상태 → 상세·분석 화면
//       → 화면 값 추출(verify/dom-extract.js) → verify/out/dom.json 저장. 단계마다 docs/screens/v3/에 캡처한다.
// 전제: API 서버(AS_OF·TODAY 고정)와 클라이언트 개발 서버가 떠 있어야 한다.
// 사용: node verify/e2e-v3.mjs [--app http://localhost:5173] [--browser <exe>] [--keep]
//   --keep  처음의 기존 데이터 삭제를 건너뛴다(이미 빈 DB일 때).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const APP = arg('--app', 'http://localhost:5173');
const BROWSER = arg('--browser', [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p)));
const SHOTS = path.join(ROOT, 'docs', 'screens', 'v3');
const OUT = path.join(ROOT, 'verify', 'out');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
// 이전 실행의 캡처를 지운다(00-로 시작하는 디자인 견본은 둔다)
for (const f of fs.readdirSync(SHOTS)) if (/^\d\d-/.test(f) && !f.startsWith('00-')) fs.unlinkSync(path.join(SHOTS, f));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------- 브라우저 ----------
const PORT = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'butler-e2e-'));
const proc = spawn(BROWSER, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--lang=ko-KR', '--window-size=390,844', 'about:blank',
], { stdio: 'ignore' });
let targets = null;
for (let i = 0; i < 50 && !targets; i++) {
  await sleep(200);
  targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => null);
}
if (!targets) throw new Error(`브라우저를 시작하지 못했어요: ${BROWSER}`);
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message));
    else resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
// 390×844 모바일, 1.5배 → 캡처 585×1266 (이전 캡처와 같은 크기)
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expr, ms = 30000, what = expr) => {
  const t0 = Date.now();
  for (;;) {
    const v = await evaluate(expr).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await sleep(250);
  }
};
const S = (sel) => JSON.stringify(sel);
const exists = (sel) => evaluate(`!!document.querySelector(${S(sel)})`);
const text = (sel) => evaluate(`document.querySelector(${S(sel)})?.textContent.replace(/\\s+/g, ' ').trim() ?? null`);
const click = (sel) => evaluate(`(() => { const e = document.querySelector(${S(sel)}); if (!e) throw new Error('no ' + ${S(sel)}); e.scrollIntoView({ block: 'center' }); e.click(); return true; })()`);
const clickText = (label, scope = 'button, a') => evaluate(`(() => {
  const e = [...document.querySelectorAll(${S(scope)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim() === ${S(label)} && !x.disabled);
  if (!e) throw new Error('no button ' + ${S(label)});
  e.scrollIntoView({ block: 'center' }); e.click(); return true; })()`);
const fill = (sel, value) => evaluate(`(() => {
  const e = document.querySelector(${S(sel)}); if (!e) throw new Error('no ' + ${S(sel)});
  const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${S(String(value))});
  e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const choose = (sel, value) => evaluate(`(() => {
  const e = document.querySelector(${S(sel)}); if (!e) throw new Error('no ' + ${S(sel)});
  e.value = ${S(String(value))}; e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`);
const settle = () => sleep(400);
const go = async (p) => {
  await send('Page.navigate', { url: `${APP}${p}` });
  await waitFor('document.readyState === "complete" && !!document.querySelector("[data-testid]")', 20000, `load ${p}`);
  await settle();
};
const routePath = () => evaluate('location.pathname + location.search');
const api = (p, init) => fetch(`${APP}/api${p}`, init).then((r) => r.json());

// 화면마다 점검(AC19·AC20): 390px 가로 넘침, 하단 고지, 글자 12px 이상, 누를 수 있는 요소 44px 이상
const pageIssues = [];
async function pageCheck(name) {
  const r = await evaluate(`(() => {
    const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const small = [...document.querySelectorAll('body *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
      .map((e) => e.textContent.trim().slice(0, 20));
    const targets = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=radio]')].filter(vis)
      .map((e) => {
        // 실제 누름 영역: 입력은 44px 바깥 틀(.ti/.sel), 버튼은 ::after로 넓힌 영역까지 더한다
        const box = (e.matches('input, select') && e.parentElement.matches('.ti, .sel') ? e.parentElement : e).getBoundingClientRect();
        const a = getComputedStyle(e, '::after');
        const ext = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0;
        return { e, h: box.height + ext, w: box.width };
      })
      .filter(({ h, w }) => Math.min(h, w) < 44)
      .map(({ e, h }) => (e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 20) + ' ' + Math.round(h) + 'px');
    return { overflow: document.documentElement.scrollWidth > 390, disclaimer: !!document.querySelector('.footer'), small, targets };
  })()`);
  if (r.overflow) pageIssues.push(`${name}: 가로 넘침`);
  if (!r.disclaimer) pageIssues.push(`${name}: 하단 고지 없음`);
  if (r.small.length) pageIssues.push(`${name}: 12px 미만 글자 ${JSON.stringify(r.small.slice(0, 3))}`);
  if (r.targets.length) pageIssues.push(`${name}: 44px 미만 터치 ${JSON.stringify(r.targets.slice(0, 4))}`);
}

let shotNo = 0;
/** 화면 캡처. full이면 페이지 전체 높이로 찍는다. 찍기 전에 화면 점검을 한다. */
async function shot(name, { full = false, top = true } = {}) {
  if (top) await evaluate('window.scrollTo(0, 0)');
  await sleep(250);
  await pageCheck(name);
  const params = { format: 'jpeg', quality: 88 };
  if (full) {
    const h = await evaluate('Math.ceil(document.documentElement.scrollHeight)');
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: 390, height: Math.max(h, 844), scale: 1 };
  }
  const r = await send('Page.captureScreenshot', params);
  const file = `${String(++shotNo).padStart(2, '0')}-${name}.jpg`;
  fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64'));
  console.log(`  📷 ${file}`);
  return file;
}
const scrollTo = (sel) => evaluate(`document.querySelector(${S(sel)})?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); true`);

// ---------- 시나리오 데이터 (실제 단지·실제 동호, v2에서 조회가 확인된 호실) ----------
const B1 = { kapt: 'A13987303', query: '하계현대우성', owned: 2, desc: '노원구 하계동 보유 아파트' };
const B2 = { kapt: 'A10027118', query: '경희궁자이', owned: 1 };
const B3 = { kapt: 'A13704104', query: '반포자이', owned: 1 };

try {
  // ===== 0. 기존 데이터 삭제 (화면에서: 계약 → 건물 삭제 막힘 → 호실 → 건물) =====
  if (!process.argv.includes('--keep')) {
    const before = await api('/buildings');
    for (const b of before.items) {
      const d = await api(`/buildings/${b.id}`);
      for (const u of d.units) {
        const leases = (await api('/leases')).items.filter((l) => l.unitId === u.id);
        for (const l of leases) {
          await go(`/leases/${l.id}/edit`);
          await click('[data-testid="confirm-delete"]');
          await settle();
          await click('[data-testid="confirm-delete"]');
          await waitFor('location.pathname !== ' + S(`/leases/${l.id}/edit`), 10000, 'lease deleted');
        }
      }
      if (d.units.length) {
        await go(`/buildings/${b.id}/edit`);
        await click('[data-testid="confirm-delete"]');
        await settle();
        await click('[data-testid="confirm-delete"]');
        await waitFor('!!document.querySelector("[data-testid=form-error]")', 10000, 'blocked delete');
        ok('건물 삭제는 호실이 있으면 막힘', (await text('[data-testid="form-error"]'))?.includes('호실을 먼저 삭제해 주세요'));
      }
      for (const u of d.units) {
        await go(`/units/${u.id}/edit`);
        await click('[data-testid="confirm-delete"]');
        await settle();
        await click('[data-testid="confirm-delete"]');
        await waitFor('location.pathname !== ' + S(`/units/${u.id}/edit`), 10000, 'unit deleted');
      }
      await go(`/buildings/${b.id}/edit`);
      await click('[data-testid="confirm-delete"]');
      await settle();
      await click('[data-testid="confirm-delete"]');
      await waitFor('location.pathname === "/buildings"', 10000, 'building deleted');
    }
    ok('기존 데이터 삭제', (await api('/buildings')).items.length === 0 && (await api('/leases')).items.length === 0);
  }

  // ===== 1. 메뉴와 빈 상태 =====
  await go('/');
  ok('전체 메뉴', await exists('[data-testid="menu-buildings"]') && await exists('[data-testid="menu-analysis"]') && await exists('[data-testid="menu-leases"]'));
  await shot('menu');
  await click('[data-testid="menu-buildings"]');
  await waitFor('!!document.querySelector("[data-testid=buildings-empty]")');
  ok('건물 없음 상태', true);
  await shot('buildings-empty');
  await go('/leases');
  await waitFor('!!document.querySelector("[data-testid=leases-empty]")');
  await shot('leases-empty');
  await go('/analysis');
  await waitFor('!!document.querySelector("[data-testid=analysis-empty]")');
  await shot('analysis-empty');

  // ===== 2. 건물 등록 (단계별: 주소 검색 바텀시트 → 건물 정보) =====
  async function registerBuilding(b, { shots = false, oneShot = false } = {}) {
    await go('/buildings');
    await click('[data-testid="building-add"]');
    await waitFor('!!document.querySelector("[data-testid=address-field]")');
    if (shots) await shot('building-new-step1');
    if (oneShot) {
      // 한 번에 등록하기: 주소 없이 저장하면 오류 박스, 저장 안 됨
      await clickText('한 번에 등록하기', '[data-testid="mode-toggle"] button');
      await waitFor('!!document.querySelector("[data-testid=building-name]")');
      await clickText('건물 등록');
      await waitFor('!!document.querySelector("[data-testid=form-error]")', 10000, 'required error');
      ok('필수값 없이 건물 등록 막힘', (await api('/buildings')).items.length === 2, await text('[data-testid="form-error"]'));
      await shot('building-new-oneshot-error');
    }
    await click('[data-testid="address-field"]');
    await waitFor('!!document.querySelector("[data-testid=address-query]")');
    await fill('[data-testid="address-query"]', b.query);
    await click('[data-testid="address-search"]');
    await waitFor(`!!document.querySelector('[data-kapt="${b.kapt}"]')`, 20000, `search ${b.query}`);
    if (shots) await shot('building-address-sheet', { top: false });
    await click(`[data-kapt="${b.kapt}"]`);
    await settle();
    if (!oneShot) await clickText('다음');
    await waitFor('!!document.querySelector("[data-testid=building-name]")');
    await fill('[data-testid="owned-count"]', b.owned);
    if (b.desc) await fill('[data-testid="building-desc"]', b.desc);
    if (shots) await shot('building-new-step2');
    await clickText('건물 등록');
    await waitFor('/^\\/buildings\\/\\d+$/.test(location.pathname)', 20000, 'building saved');
    return Number((await routePath()).match(/\d+/)[0]);
  }
  const id1 = await registerBuilding(B1, { shots: true });
  await waitFor('!!document.querySelector("[data-testid=building-detail]")');
  ok('건물 등록 → 건물 상세', true, `id ${id1}`);
  await shot('building-detail-new');

  // 같은 건물 다시 등록 → 409
  await go('/buildings/new');
  await click('[data-testid="address-field"]');
  await fill('[data-testid="address-query"]', B1.query);
  await click('[data-testid="address-search"]');
  await waitFor(`!!document.querySelector('[data-kapt="${B1.kapt}"]')`, 20000);
  await click(`[data-kapt="${B1.kapt}"]`);
  await settle();
  await clickText('다음');
  await waitFor('!!document.querySelector("[data-testid=owned-count]")');
  await fill('[data-testid="owned-count"]', 1);
  await clickText('건물 등록');
  await waitFor('!!document.querySelector("[data-testid=form-error]")', 10000, 'duplicate error');
  ok('같은 건물 중복 등록 막힘', (await text('[data-testid="form-error"]'))?.includes('이미 등록한 건물이에요'));
  await shot('building-duplicate-error');

  // ===== 3. 호실 등록 (동·호 → 건축물대장 조회 → 취득 연월 → 매입가 제안) =====
  async function registerUnit(bId, u, { shots = false, oneShot = false } = {}) {
    await go(`/buildings/${bId}/units/new`);
    await waitFor('!!document.querySelector("[data-testid=dong]")');
    await fill('[data-testid="dong"]', u.dong);
    await fill('[data-testid="ho"]', u.ho);
    await waitFor('!!document.querySelector("[data-testid=lookup-result]") || !!document.querySelector("[data-testid=lookup-manual]") || !!document.querySelector("[data-testid=lookup-error]")', 60000, `lookup ${u.dong}-${u.ho}`);
    const lookup = await text('[data-testid="lookup-result"]');
    if (shots) await shot('unit-new-step1');
    if (oneShot) {
      // 등록 방식을 바꿔도 입력값이 남는다
      await clickText('한 번에 등록하기', '[data-testid="mode-toggle"] button');
      await settle();
      ok('등록 방식 전환 후 동·호 유지', (await evaluate('document.querySelector("[data-testid=dong]").value + "-" + document.querySelector("[data-testid=ho]").value')) === `${u.dong}-${u.ho}`);
    } else await clickText('다음');
    await waitFor('!!document.querySelector("[data-testid=acq-year]")');
    await choose('[data-testid="acq-year"]', u.acq.slice(0, 4));
    await settle();
    await choose('[data-testid="acq-month"]', u.acq.slice(4));
    await waitFor('(() => { const s = document.querySelector("[data-testid=suggestion]"); return s && s.dataset.state !== "loading"; })()', 60000, 'suggestion');
    const suggestion = await text('[data-v="suggestion"]');
    if (u.price === 'suggest') {
      await click('[data-testid="suggestion-apply"]');
    } else {
      await fill('[data-testid="purchase-price"]', u.price);
    }
    await settle();
    if (shots) await shot('unit-new-step2');
    await clickText('호실 등록');
    await waitFor('/^\\/units\\/\\d+$/.test(location.pathname) || /^\\/buildings\\/\\d+$/.test(location.pathname)', 20000, 'unit saved');
    const units = (await api(`/buildings/${bId}`)).units;
    const saved = units.find((x) => x.dong === u.dong && x.ho === u.ho);
    return { id: saved?.id, lookup, suggestion, saved };
  }
  const u1 = await registerUnit(id1, { dong: '112', ho: '1001', acq: '201610', price: 430000000 }, { shots: true });
  ok('호실 조회(건축물대장) 112동 1001호', u1.lookup?.includes('84.91') && u1.lookup?.includes('10층'), u1.lookup);
  ok('매입가 제안(취득 시점 실거래)', !!u1.suggestion, u1.suggestion);
  ok('호실 등록 저장값', u1.saved?.purchasePrice === 430000000 && u1.saved?.acquisitionYm === '201610', JSON.stringify({ p: u1.saved?.purchasePrice, ym: u1.saved?.acquisitionYm }));
  // 등록 직후 상세: 수집 중이면 그 상태를 찍는다
  await go(`/units/${u1.id}`);
  if (await exists('[data-testid="progress"]')) await shot('unit-detail-collecting');
  await waitFor('!!document.querySelector("[data-v=reference]") || !!document.querySelector("[data-v=no-reference]")', 180000, 'unit value ready');
  await shot('unit-detail-no-lease', { full: true });

  const u2 = await registerUnit(id1, { dong: '112', ho: '501', acq: '201610', price: 438500000 });
  ok('두 번째 호실 등록', !!u2.id, u2.lookup);
  // 보유 호실을 모두 등록하면 등록 화면이 막힘
  await go(`/buildings/${id1}/units/new`);
  await waitFor('!!document.querySelector("[data-testid=units-full]")', 10000, 'units full');
  ok('보유 호실 수만큼 등록하면 더 못 넣음', true);
  await shot('unit-new-full');

  // ===== 4. 계약 등록 (검증 오류 → 정상 등록 → 겹침 오류) =====
  async function openLeaseForm(unitId) {
    await go(`/leases/new?unitId=${unitId}`);
    await waitFor('!!document.querySelector("[data-testid=lease-deposit]")');
  }
  async function fillLease(l) {
    if (l.type === 'JEONSE') await clickText('전세', '[data-testid="lease-type"] button');
    await fill('[data-testid="lease-deposit"]', l.deposit);
    if (l.type !== 'JEONSE') await fill('[data-testid="lease-rent"]', l.rent);
    await fill('[data-testid="lease-start"]', l.start);
    await fill('[data-testid="lease-end"]', l.end);
    if (l.tenant) await fill('[data-testid="lease-tenant"]', l.tenant);
    await settle();
  }
  // 종료일이 시작일보다 앞
  await openLeaseForm(u1.id);
  await fillLease({ deposit: 50000000, rent: 800000, start: '2025-02-01', end: '2025-01-31' });
  await clickText('계약 등록');
  await waitFor('!!document.querySelector("[data-testid=form-error]") || !!document.querySelector("[aria-invalid=true]")', 10000, 'date error');
  const dateErr = await evaluate('document.querySelector("[data-testid=form-error]")?.textContent ?? [...document.querySelectorAll("[role=alert], .ff__error")].map((e) => e.textContent).join(" ")');
  ok('계약 종료일 검증', /종료일은 시작일보다 뒤/.test(dateErr), dateErr.trim());
  await shot('lease-form-error');
  // 정상 등록 (월세, 120일 안에 만료 → 만료 임박)
  await openLeaseForm(u1.id);
  await fillLease({ deposit: 50000000, rent: 800000, start: '2025-02-01', end: '2027-01-31' });
  await shot('lease-form');
  await clickText('계약 등록');
  await waitFor('!location.pathname.startsWith("/leases/new")', 15000, 'lease saved');
  // 같은 호실 기간 겹침
  await openLeaseForm(u1.id);
  await fillLease({ deposit: 30000000, rent: 900000, start: '2026-12-01', end: '2028-11-30' });
  await clickText('계약 등록');
  await waitFor('!!document.querySelector("[data-testid=form-error]")', 10000, 'overlap error');
  ok('같은 호실 기간 겹침 막힘', (await text('[data-testid="form-error"]'))?.includes('겹치는 계약'));
  // 두 번째 호실: 전세, 임대 중
  await openLeaseForm(u2.id);
  await fillLease({ type: 'JEONSE', deposit: 400000000, start: '2025-09-01', end: '2027-08-31' });
  await clickText('계약 등록');
  await waitFor('!location.pathname.startsWith("/leases/new")', 15000, 'lease 2 saved');

  // ===== 5. 다른 건물들 (다른 구, 매입가 제안 적용) =====
  const id2 = await registerBuilding(B2);
  const u3 = await registerUnit(id2, { dong: '207', ho: '604', acq: '202003', price: 'suggest' });
  ok('경희궁자이2단지 207동 604호 조회', !!u3.id && !!u3.lookup, u3.lookup);
  ok('제안 금액 적용 저장', !!u3.saved?.purchasePrice, String(u3.saved?.purchasePrice));
  await openLeaseForm(u3.id);
  await fillLease({ deposit: 100000000, rent: 2500000, start: '2026-03-01', end: '2028-02-29' });
  await clickText('계약 등록');
  await waitFor('!location.pathname.startsWith("/leases/new")', 15000, 'lease 3 saved');
  const id3 = await registerBuilding(B3, { oneShot: true });
  ok('호실 없는 건물 상태 = 등록 중', (await api(`/buildings/${id3}`)).building.status === 'REGISTERING');
  await go('/buildings');
  await waitFor('document.querySelectorAll("[data-testid=building-card]").length === 3');
  await shot('buildings-registering');
  const u4 = await registerUnit(id3, { dong: '108', ho: '102', acq: '201401', price: 'suggest' }, { oneShot: true });
  await shot('unit-saved-oneshot');
  ok('호실 등록 후 등록 중 → 운영 중', (await api(`/buildings/${id3}`)).building.status === 'OPERATING');
  ok('반포자이 108동 102호 조회', !!u4.id, u4.lookup);

  // ===== 6. 목록과 상세 =====
  await go('/buildings');
  await waitFor('document.querySelectorAll("[data-testid=building-card]").length === 3');
  const summary = await api('/buildings');
  ok('건물 목록 3개 · 상태 집계', summary.summary.total === 3, JSON.stringify(summary.summary));
  await shot('buildings', { full: true });
  await go(`/buildings/${id1}`);
  await waitFor('document.querySelectorAll("[data-testid=unit-card]").length === 2');
  await shot('building-detail', { full: true });
  await go(`/units/${u1.id}`);
  await waitFor('!!document.querySelector("[data-v=converted]")', 30000, 'converted rent');
  ok('호실 상세 환산 월세 표시', true, await text('[data-v="converted"]'));
  await shot('unit-detail', { full: true });
  await go('/leases');
  await waitFor('document.querySelectorAll("[data-testid=lease-card]").length === 3');
  ok('계약 목록 3건', true);
  await shot('leases', { full: true });
  if (await exists('[data-testid="show-expiring"]')) {
    await click('[data-testid="show-expiring"]');
    await settle();
    ok('만료 임박 필터', (await evaluate('document.querySelectorAll("[data-testid=lease-card]").length')) === 1);
    await shot('leases-expiring');
  }
  await go('/analysis');
  await waitFor('document.querySelectorAll("[data-testid=analysis-building]").length === 3');
  await shot('analysis-list');

  // 자산 분석 상세 (호실 1): 모든 카드가 준비될 때까지
  await go(`/analysis/${id1}?unit=${u1.id}`);
  await waitFor(`(() => {
    const ready = (k) => { const s = document.querySelector('[data-compare="' + k + '"]'); return s && (s.querySelector('[data-v=count]') || s.querySelector('[data-v=empty]')); };
    const nb = document.querySelector('[data-testid=card-nearby-rent][data-unit="${u1.id}"]'); const sp = document.querySelector('[data-testid=card-building-spec]');
    return ready('sameFloor') && ready('sameComplex') && ready('neighborhood') && nb && !nb.querySelector('[data-v=loading]') && sp && !sp.querySelector('[role=status]') && document.querySelector('[data-v=reference]');
  })()`, 240000, 'analysis ready');
  await shot('analysis-detail-top');
  await scrollTo('[data-testid="sale-card"]');
  await shot('analysis-detail-sale', { top: false });
  await scrollTo('[data-testid="comparisons"]');
  await shot('analysis-detail-compare', { top: false });
  await scrollTo('[data-testid="card-building-spec"]');
  await shot('analysis-detail-spec', { top: false });
  await shot('analysis-detail-full', { full: true });
  ok('건축물대장 표시', (await text('[data-testid="card-building-spec"]'))?.includes('사용승인일'));
  // 호실 바꾸기 (칩)
  await clickText('112동 501호', '[data-testid="unit-chips"] button');
  await waitFor(`document.querySelector('[data-testid=sale-card]')?.dataset.unit === '${u2.id}' && !!document.querySelector('[data-v=reference]')`, 60000, 'unit switch');
  ok('분석 화면 호실 전환', true);
  // 참고가 새로고침 → 1분 안 재시도 제한
  await click('[data-testid="value-refresh"]');
  await waitFor('!document.querySelector("[data-testid=value-refresh][aria-busy=true]")', 60000);
  await sleep(1500);
  const r2 = await fetch(`${APP}/api/units/${u2.id}/value/refresh`, { method: 'POST' });
  ok('참고가 새로고침 1분 제한(429)', r2.status === 429, String(r2.status));

  // 다른 건물 분석 (서초, 계약 없음)
  await go(`/analysis/${id3}`);
  await waitFor('!!document.querySelector("[data-testid=card-my-building] [data-v=empty]") && !!document.querySelector("[data-v=reference], [data-v=no-reference]")', 180000, 'analysis B3');
  await shot('analysis-detail-no-lease');

  // ===== 7. 수정 화면 =====
  await go(`/buildings/${id1}/edit`);
  await waitFor('!!document.querySelector("[data-testid=building-name]")');
  await shot('building-edit');
  await go(`/units/${u1.id}/edit`);
  await waitFor('!!document.querySelector("[data-testid=purchase-price]")');
  await shot('unit-edit');
  const lease1 = (await api('/leases')).items.find((l) => l.unitId === u1.id);
  await go(`/leases/${lease1.id}/edit`);
  await waitFor('!!document.querySelector("[data-testid=lease-deposit]")');
  await fill('[data-testid="lease-tenant"]', '하계 1001호 임차인');
  await clickText('저장');
  await waitFor(`!location.pathname.endsWith('/edit')`, 15000, 'lease edit saved');
  ok('계약 수정 저장', (await api(`/leases/${lease1.id}`)).lease.tenantName === '하계 1001호 임차인');
  await go('/leases');
  await waitFor('document.querySelectorAll("[data-testid=lease-card]").length === 3');
  ok('임차인 이름이 계약 카드에 보임', (await evaluate('document.querySelector("[data-testid=lease-list]").textContent')).includes('하계 1001호 임차인'));
  await go(`/units/${u1.id}`);
  await waitFor('!!document.querySelector("[data-v=tenant]")', 10000, 'tenant on unit');
  ok('임차인 이름이 호실 화면에 보임', (await text('[data-v="tenant"]')) === '하계 1001호 임차인');

  // ===== 8. 화면 값 추출 → verify/out/dom.json =====
  const extractor = fs.readFileSync(path.join(ROOT, 'verify', 'dom-extract.js'), 'utf8');
  await go('/');
  await evaluate(extractor);
  await waitFor('window.__domOut || window.__domError', 300000, 'dom extract');
  const err = await evaluate('window.__domError');
  ok('화면 값 추출', !err, err ?? '');
  if (!err) fs.writeFileSync(path.join(OUT, 'dom.json'), JSON.stringify(await evaluate('window.__domOut'), null, 2));
} catch (e) {
  ok('시나리오 실행', false, e.message);
  await shot('error-state').catch(() => {});
} finally {
  ok('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  ok(`화면 점검 (캡처 ${shotNo}장: 가로 넘침·하단 고지·글자 12px·터치 44px)`, pageIssues.length === 0, pageIssues.slice(0, 8).join(' / '));
  ws.close();
  proc.kill();
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  const failed = results.filter((r) => !r.pass);
  fs.writeFileSync(path.join(OUT, 'e2e-result.json'), JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
}
