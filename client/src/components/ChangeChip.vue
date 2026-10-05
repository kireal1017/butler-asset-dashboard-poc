<script setup>
import { computed } from 'vue';
import { formatSignedManwon, formatSignedRate } from '../utils/money.js';

// change: { kind: 'purchase' | 'previous', diff, rate } — 색은 보조, 의미는 부호와 글자가 전달한다 (PRD 7.5)
const props = defineProps({ change: { type: Object, required: true } });
const label = computed(() => (props.change.kind === 'purchase' ? '매입가 대비' : '직전 거래 대비'));
const tone = computed(() => (props.change.diff > 0 ? 'badge-up' : props.change.diff < 0 ? 'badge-down' : ''));
</script>

<template>
  <span class="badge chip" :class="tone" data-testid="change">
    <span>{{ label }}</span>
    <span data-testid="change-amount">{{ formatSignedManwon(change.diff) }}</span>
    <span>(<span data-testid="change-rate">{{ formatSignedRate(change.rate) }}</span>)</span>
  </span>
</template>

<style scoped>
.chip { gap: 6px; flex-wrap: wrap; white-space: normal; }
</style>
