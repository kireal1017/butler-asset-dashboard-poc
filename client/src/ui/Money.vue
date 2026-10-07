<script setup>
import { computed } from 'vue';
import { formatWon, formatWonRaw } from './format.js';

// 금액 표시: 기본 "6억 2,000만원"·"80만원", raw는 "50,000,000원" (spec 3장)
const props = defineProps({
  /** 원 단위 정수 */
  value: { type: Number, default: null },
  raw: { type: Boolean, default: false },
  /** 값이 없을 때 */
  empty: { type: String, default: '—' },
});
const text = computed(() => {
  if (props.value === null || props.value === undefined) return props.empty;
  return props.raw ? formatWonRaw(props.value) : formatWon(props.value);
});
</script>

<template>
  <span class="money">{{ text }}</span>
</template>

<style scoped>
.money { font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
