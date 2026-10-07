<script setup>
import { computed } from 'vue';
import SelectInput from './SelectInput.vue';

// 연·월 선택 (v-model: 'YYYYMM', 연도만 고른 상태는 'YYYY', 없으면 ''). 기준 월(maxYm) 이후는 고를 수 없다.
const model = defineModel({ type: String, default: '' });
const props = defineProps({
  maxYm: { type: String, required: true },
  minYear: { type: Number, default: 2006 },
  /** 연도 select의 id (FormField 라벨 연결) */
  id: { type: String, default: '' },
});

const year = computed(() => model.value.slice(0, 4));
const month = computed(() => model.value.slice(4));
const years = computed(() => {
  const out = [];
  for (let y = Number(props.maxYm.slice(0, 4)); y >= props.minYear; y -= 1) out.push({ value: String(y), label: `${y}년` });
  return out;
});
const months = computed(() => {
  const max = year.value === props.maxYm.slice(0, 4) ? Number(props.maxYm.slice(4)) : 12;
  return Array.from({ length: max }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: `${i + 1}월` }));
});

function setYear(y) {
  if (!y) { model.value = ''; return; }
  let m = month.value || '';
  const max = y === props.maxYm.slice(0, 4) ? props.maxYm.slice(4) : '12';
  if (m && m > max) m = max;
  model.value = `${y}${m}`;
}
function setMonth(m) {
  if (year.value) model.value = `${year.value}${m}`;
}
</script>

<template>
  <div class="ym">
    <SelectInput :id="id || undefined" :model-value="year" :options="years" placeholder="연도" aria-label="취득 연도" data-testid="acq-year" @update:model-value="setYear" />
    <SelectInput :id="`${id || 'ym'}-month`" :model-value="month" :options="months" placeholder="월" :disabled="!year" aria-label="취득 월" data-testid="acq-month" @update:model-value="setMonth" />
  </div>
</template>

<style scoped>
.ym { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-2); min-width: 0; }
</style>
