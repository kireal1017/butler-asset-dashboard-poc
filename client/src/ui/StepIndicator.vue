<script setup>
// 순서대로 등록하기의 단계 표시 "1 / 2" (spec 3.2)
defineProps({
  current: { type: Number, required: true },
  total: { type: Number, required: true },
  /** 이 단계 이름 (선택) */
  label: { type: String, default: '' },
});
</script>

<template>
  <p class="step" :aria-label="`${total}단계 중 ${current}단계${label ? `, ${label}` : ''}`">
    <span class="step__num" aria-hidden="true"><strong>{{ current }}</strong> / {{ total }}</span>
    <span v-if="label" class="step__label" aria-hidden="true">{{ label }}</span>
    <span class="step__bar" aria-hidden="true">
      <span v-for="n in total" :key="n" class="step__seg" :class="{ 'is-done': n <= current }" />
    </span>
  </p>
</template>

<style scoped>
.step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.step__num strong { color: var(--text-primary); font-weight: var(--fw-semibold); }
.step__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step__bar { display: flex; gap: var(--space-1); margin-left: auto; flex: none; }
.step__seg { width: 20px; height: 4px; border-radius: var(--radius-pill); background: var(--border-default); }
.step__seg.is-done { background: var(--accent); }
</style>
