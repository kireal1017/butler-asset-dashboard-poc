<script setup>
// 카드 안의 한 줄: 왼쪽 라벨, 오른쪽 값. 카드에서 가장 중요한 값 하나만 emphasize (spec 3장)
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  emphasize: { type: Boolean, default: false },
});
</script>

<template>
  <div class="irow" :class="{ 'irow--em': emphasize }">
    <dt class="irow__label">{{ label }}</dt>
    <dd class="irow__value"><slot>{{ value }}</slot></dd>
  </div>
</template>

<style scoped>
.irow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
  min-width: 0;
  min-height: 40px;
  padding: var(--space-2) 0;
  box-sizing: border-box;
  font-family: var(--font-sans);
}
.irow + .irow { border-top: 1px solid var(--border-subtle); }
.irow__label {
  flex: none;
  max-width: 45%;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-secondary);
}
.irow__value {
  min-width: 0;
  margin: 0;
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  line-height: var(--lh-body);
  color: var(--text-primary);
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.irow--em .irow__value { font-size: var(--fs-h3); font-weight: var(--fw-bold); }
</style>
