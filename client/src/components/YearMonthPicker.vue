<script setup>
import { computed } from 'vue';

// v-model: 'YYYYMM' 또는 ''
const model = defineModel({ type: String, default: '' });
const props = defineProps({ maxYm: { type: String, required: true }, minYear: { type: Number, default: 2006 }, idPrefix: { type: String, default: 'acq' } });

const year = computed({
  get: () => model.value.slice(0, 4),
  set: (y) => { model.value = y ? `${y}${model.value.slice(4) || '01'}` : ''; },
});
const month = computed({
  get: () => model.value.slice(4),
  set: (m) => { if (year.value) model.value = `${year.value}${m}`; },
});
const years = computed(() => {
  const out = [];
  for (let y = Number(props.maxYm.slice(0, 4)); y >= props.minYear; y--) out.push(String(y));
  return out;
});
const months = computed(() => {
  const max = year.value === props.maxYm.slice(0, 4) ? Number(props.maxYm.slice(4)) : 12;
  return Array.from({ length: max }, (_, i) => String(i + 1).padStart(2, '0'));
});
</script>

<template>
  <div class="row picker">
    <label class="sr" :for="`${idPrefix}-year`">연도</label>
    <select :id="`${idPrefix}-year`" v-model="year" class="input" data-testid="acq-year">
      <option value="">연도</option>
      <option v-for="y in years" :key="y" :value="y">{{ y }}년</option>
    </select>
    <label class="sr" :for="`${idPrefix}-month`">월</label>
    <select :id="`${idPrefix}-month`" v-model="month" class="input" :disabled="!year" data-testid="acq-month">
      <option v-for="m in months" :key="m" :value="m">{{ Number(m) }}월</option>
    </select>
  </div>
</template>

<style scoped>
.picker { gap: var(--s-xs); }
.picker .input { flex: 1; min-width: 0; padding-block: 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
