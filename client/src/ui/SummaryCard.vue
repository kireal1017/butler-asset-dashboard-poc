<script setup>
// 화면 맨 위 강조 카드: 라벨 + 큰 숫자, 구분선 아래 3칸 집계 (spec 3장)
defineProps({
  label: { type: String, required: true },
  /** 큰 숫자 (이미 형식을 맞춘 문자열). 슬롯 `value`로 대체 가능 */
  value: { type: [String, Number], default: '' },
  /** [{ label, value }] — 3칸 */
  breakdown: { type: Array, default: () => [] },
});
</script>

<template>
  <section class="sum" :aria-label="label">
    <p class="sum__label">{{ label }}</p>
    <p class="sum__value"><slot name="value">{{ value }}</slot></p>
    <dl v-if="breakdown.length" class="sum__grid">
      <div v-for="cell in breakdown" :key="cell.label" class="sum__cell">
        <dt class="sum__cell-label">{{ cell.label }}</dt>
        <dd class="sum__cell-value">{{ cell.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.sum {
  box-sizing: border-box;
  min-width: 0;
  padding: var(--space-5) var(--space-4) var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  color: var(--text-primary);
}
.sum__label {
  margin: 0;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  line-height: 1.45;
  color: var(--text-secondary);
}
.sum__value {
  margin: var(--space-1) 0 0;
  font-size: var(--fs-display);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.sum__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: var(--space-4) 0 0;
  padding: var(--space-3) 0 0;
  border-top: 1px solid var(--border-subtle);
}
.sum__cell { min-width: 0; padding: 0 var(--space-2); }
.sum__cell:first-child { padding-left: 0; }
.sum__cell + .sum__cell { border-left: 1px solid var(--border-subtle); }
.sum__cell-label {
  margin: 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sum__cell-value {
  margin: 2px 0 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
</style>
