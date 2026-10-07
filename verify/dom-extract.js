// 내장 브라우저에서 실행하는 화면 값 추출기 (v3).
// 호실마다 호실 상세(/units/:id)와 자산 분석 상세(/analysis/:buildingId?unit=:id)를 열어 data-v·data-k 값을 모은다.
// 결과는 window.__domOut에 두고, JSON으로 verify/out/dom.json에 저장한 뒤
// `node verify/recompute.mjs --dom verify/out/dom.json`으로 독립 재계산 값과 비교한다.
// 사용: javascript_tool로 이 파일 내용을 실행한 뒤(실행 시간 제한 때문에 기다리지 않음) window.__domOut을 읽는다.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, ms = 90000) => {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('timeout');
      await sleep(200);
    }
  };
  // 라우터로 이동한다(전체 새로고침 없이). 이동 후 이전 화면이 사라질 때까지 잠시 기다린다.
  const router = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
  const go = async (path) => {
    await router.push(path);
    await sleep(300);
  };
  const q = (root, sel) => root?.querySelector(sel);
  const vals = (root) => {
    const out = {};
    if (!root) return out;
    for (const el of root.querySelectorAll('[data-v]')) {
      if (el.closest('[data-testid="comparisons"]') && root.dataset?.testid !== 'comparisons') continue;
      out[el.dataset.v] = el.textContent.replace(/\s+/g, ' ').trim();
    }
    return out;
  };
  const section = (root, key) => {
    const s = q(root, `[data-compare="${key}"]`);
    const t = (v) => q(s, `[data-v="${v}"]`)?.textContent.trim() ?? null;
    return {
      cond: t('cond'),
      count: t('count'),
      median: t('median'),
      complexes: t('complexes'),
      rows: [...s.querySelectorAll('[data-row]')].map((li) => [...li.querySelectorAll('[data-k]')].map((e) => e.textContent.trim()).join('|')),
    };
  };

  window.__domOut = null;
  window.__domError = null;
  try {
    const list = await (await fetch('/api/buildings')).json();
    const out = { asOf: list.asOf, units: {} };
    for (const b of list.items) {
      const detail = await (await fetch(`/api/buildings/${b.id}`)).json();
      for (const u of detail.units) {
        // 호실 상세
        await go(`/units/${u.id}`);
        const unitRoot = await waitFor(() => q(document, '[data-testid="purchase-value"]') && !q(document, '[data-testid="purchase-value"] [data-testid="progress"]') && q(document, '[data-testid="unit-detail"]'));
        const unit = { ...vals(q(unitRoot, '[data-testid="lease-status"]')), ...vals(q(unitRoot, '[data-testid="purchase-value"]')) };

        // 자산 분석 상세: 매매 시세 · 비교 3가지 · 내 건물 · 주변 전월세 · 건축물대장이 모두 준비될 때까지 기다린다
        await go(`/analysis/${b.id}?unit=${u.id}`);
        await waitFor(() => {
          const sale = q(document, `[data-testid="sale-card"][data-unit="${u.id}"]`);
          const cmp = q(sale, '[data-testid="comparisons"]');
          const done = cmp && ['sameFloor', 'sameComplex', 'neighborhood'].every((k) => {
            const s = q(cmp, `[data-compare="${k}"]`);
            return s && (q(s, '[data-v="count"]') || q(s, '[data-v="empty"]'));
          });
          const nearby = q(document, `[data-testid="card-nearby-rent"][data-unit="${u.id}"]`);
          const spec = q(document, '[data-testid="card-building-spec"]');
          return done && nearby && !q(nearby, '[data-v="loading"]') && spec && !q(spec, '[role="status"]') && sale;
        });
        const more = q(document, '[data-testid="compare-more"]');
        if (more) {
          more.click();
          await sleep(200);
        }
        const sale = q(document, '[data-testid="sale-card"]');
        const cmp = q(sale, '[data-testid="comparisons"]');
        out.units[u.id] = {
          buildingId: b.id,
          unit,
          sale: vals(sale),
          comparisons: { sameFloor: section(cmp, 'sameFloor'), sameComplex: section(cmp, 'sameComplex'), neighborhood: section(cmp, 'neighborhood') },
          myBuilding: vals(q(document, '[data-testid="card-my-building"]')),
          nearby: vals(q(document, '[data-testid="card-nearby-rent"]')),
          spec: vals(q(document, '[data-testid="card-building-spec"]')),
        };
      }
    }
    window.__domOut = out;
  } catch (e) {
    window.__domError = String(e);
  }
})();
