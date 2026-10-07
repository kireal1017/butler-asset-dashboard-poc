<script setup>
// 가로로 나란한 작은 타일 3개: 큰 숫자 + 라벨 (spec 3장)
defineProps({
  /** [{ value, label }] */
  tiles: { type: Array, required: true },
});
</script>

<template>
  <dl class="tiles">
    <div v-for="t in tiles" :key="t.label" class="tile">
      <dt class="tile__label">{{ t.label }}</dt>
      <dd class="tile__value">{{ t.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  font-family: var(--font-sans);
}
.tile {
  box-sizing: border-box;
  display: flex;
  flex-direction: column-reverse; /* 시각: 숫자 위, 라벨 아래 / 읽기 순서: dt → dd */
  justify-content: flex-end;
  min-width: 0;
  padding: var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}
.tile__value {
  margin: 0;
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: var(--lh-heading);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.tile__label {
  margin: 2px 0 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
