// 화면 이동 보조: 한 번만 보이는 안내(라우트 history state)와 들어온 화면으로 돌아가기(query from).

/** 다음 화면에 한 번만 보여 줄 성공 안내를 실어 이동한다. 저장하지 않는다. */
export function pushWithNotice(router, to, notice) {
  const loc = typeof to === 'string' ? { path: to } : to;
  return router.push({ ...loc, state: { notice } });
}

/** 들어올 때 실린 안내를 꺼내고 지운다(새로고침·뒤로가기에서 다시 보이지 않게). */
export function takeNotice() {
  if (typeof window === 'undefined') return '';
  const s = window.history.state;
  const notice = s?.notice;
  if (!notice) return '';
  window.history.replaceState({ ...s, notice: null }, '');
  return String(notice);
}

/** query.from이 앱 안 경로이면 그것을, 아니면 fallback */
export function fromOr(route, fallback) {
  const f = route.query.from;
  return typeof f === 'string' && f.startsWith('/') && !f.startsWith('//') ? f : fallback;
}
