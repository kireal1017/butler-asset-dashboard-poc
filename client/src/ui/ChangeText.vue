<script setup>
import { computed } from 'vue';
import { changeDirection, describeChange, formatChange } from './format.js';

// 등락 표시 (DESIGN-mobile C4 = (c)): 배경 없이 글자 + ▲▼ + 부호. 색은 중립, 방향은 기호와 글자가 전한다.
const props = defineProps({
  /** 원 단위 차이 */
  diff: { type: Number, default: null },
  /** % (예: 51.2) */
  rate: { type: Number, default: null },
  /** 뒤에 붙는 기준 (예: 매입가 대비) */
  basis: { type: String, default: '' },
});
const dir = computed(() => changeDirection(props.diff));
const text = computed(() => formatChange(props.diff, props.rate));
const label = computed(() => `${props.basis ? `${props.basis} ` : ''}${describeChange(props.diff, props.rate)}`);
</script>

<template>
  <span v-if="diff !== null" class="chg" :class="`chg--${dir}`">
    <span class="chg__sr">{{ label }}</span>
    <span aria-hidden="true">{{ text }}</span><span v-if="basis" class="chg__basis" aria-hidden="true">{{ basis }}</span>
  </span>
</template>

<style scoped>
.chg {
  font-family: var(--font-sans);
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
  line-height: 1.45;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.chg--flat { color: var(--text-secondary); font-weight: var(--fw-medium); }
.chg__sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.chg__basis { margin-left: var(--space-1); color: var(--text-secondary); font-weight: var(--fw-regular); }
</style>
