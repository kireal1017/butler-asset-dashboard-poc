// 내장 브라우저에서 실행하는 DOM 추출기 (AC-V1 DOM 비교, AC-U 점검).
// 홈과 각 자산 상세를 방문하고, 기간 탭을 모두 눌러 화면 값을 모은다. 결과 JSON을 verify/out/dom.json으로 저장해
// `node verify/recompute.mjs --dom verify/out/dom.json`으로 비교한다.
// 사용: javascript_tool로 이 파일 내용을 실행한 뒤(45초 제한 때문에 기다리지 않음) window.__domOut을 읽는다.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // recompute.mjs의 fnv1a와 같은 함수. 그래프 시계열을 "개수:해시"로 요약한다.
  const fnv1a = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  const digest = (pts) => { const a = pts.map((p) => [p.ym, p.value, p.trade]); return `${a.length}:${fnv1a(JSON.stringify(a))}`; };
  const text = (root, id) => root.querySelector(`[data-testid="${id}"]`)?.textContent.trim() ?? null;
  const waitFor = async (fn, ms = 60000) => {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await sleep(200);
    }
  };
  const go = async (path) => {
    history.pushState({}, '', path);
    dispatchEvent(new PopStateEvent('popstate'));
    await sleep(400);
  };
  const uiChecks = [];
  const check = (where) => {
    const de = document.documentElement;
    uiChecks.push({
      where,
      horizontalOverflow: de.scrollWidth > de.clientWidth,
      disclaimer: Boolean(document.querySelector('[data-testid="disclaimer"]')),
    });
  };
  const pick = (root) => ({
    currentPrice: text(root, 'current-price'),
    dealYm: text(root, 'deal-ym'),
    changeAmount: text(root, 'change-amount'),
    changeRate: text(root, 'change-rate'),
  });

  const out = { assets: {}, uiChecks };
  await go('/');
  await waitFor(() => document.querySelector('[data-testid="home"] [data-testid="add-asset"]'));
  await waitFor(() => !document.querySelector('[data-testid="progress"]'));
  check('home');
  const ids = [...document.querySelectorAll('[data-testid="asset-card"]')].map((c) => c.dataset.assetId);
  for (const card of document.querySelectorAll('[data-testid="asset-card"]')) {
    out.assets[card.dataset.assetId] = { home: pick(card) };
  }

  for (const id of ids) {
    await go(`/assets/${id}`);
    const root = await waitFor(() => document.querySelector(`[data-testid="detail"][data-asset-id="${id}"]`));
    await waitFor(() => document.querySelector('[data-testid="trend-chart"]'));
    const d = { ...pick(root), purchasePrice: text(root, 'purchase-price'), series: {} };
    d.recentTrades = [...root.querySelectorAll('[data-testid="recent-trade"]')].map((li) =>
      ['ym', 'floor', 'amount'].map((k) => li.querySelector(`[data-k="${k}"]`).textContent.trim()).join('|'));
    for (const tab of root.querySelectorAll('[role="tab"][data-range]')) {
      tab.click();
      await sleep(300);
      await waitFor(() => !tab.disabled && tab.getAttribute('aria-selected') === 'true' && !document.querySelector('.chart-block [data-testid="progress"]'), 600000);
      await sleep(300);
      const chart = root.querySelector('[data-testid="trend-chart"]');
      d.series[tab.dataset.range] = digest(JSON.parse(chart.dataset.series));
      check(`detail ${id} ${tab.dataset.range}`);
    }
    out.assets[id].detail = d;
  }
  await go('/');
  window.__domOut = JSON.stringify(out);
})().catch((e) => { window.__domErr = String(e); });
