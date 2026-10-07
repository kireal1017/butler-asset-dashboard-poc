<script setup>
import { computed } from 'vue';

// 수집 진행 표시: 한 줄 안내 + 가는 막대. total을 모르면 막대가 좌우로 흐른다.
const props = defineProps({
  label: { type: String, default: '실거래 자료를 불러오는 중이에요' },
  done: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});
const pct = computed(() => (props.total ? Math.min(100, Math.round((props.done / props.total) * 100)) : null));
</script>

<template>
  <div class="prog" role="status" data-testid="progress">
    <p class="prog__label">{{ label }}<span v-if="total" class="prog__count"> · {{ total }}개월 중 {{ done }}개월</span></p>
    <div class="prog__track" aria-hidden="true">
      <div v-if="pct !== null" class="prog__bar" :style="{ width: `${Math.max(pct, 4)}%` }" />
      <div v-else class="prog__bar prog__bar--flow" />
    </div>
  </div>
</template>

<style scoped>
.prog { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; font-family: var(--font-sans); }
.prog__label { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.prog__count { font-variant-numeric: tabular-nums; }
.prog__track { position: relative; height: 4px; overflow: hidden; border-radius: var(--radius-pill); background: var(--bg-subtle); }
.prog__bar { height: 100%; border-radius: var(--radius-pill); background: var(--accent); transition: width 300ms var(--ease-standard); }
.prog__bar--flow { position: absolute; width: 30%; animation: prog-flow 1.2s var(--ease-standard) infinite; }
@keyframes prog-flow { from { left: -30%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) { .prog__bar--flow { animation: none; left: 0; width: 100%; opacity: 0.4; } }
</style>
