import { onBeforeUnmount } from 'vue';

/** 컴포넌트가 살아 있는 동안 fn을 주기적으로 호출한다. stop()으로 멈춘다. */
export function usePoll(fn, intervalMs = 1000) {
  let timer = null;
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (timer) return;
    timer = setInterval(fn, intervalMs);
  };
  onBeforeUnmount(stop);
  return { start, stop };
}
