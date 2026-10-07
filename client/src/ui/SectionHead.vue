<script setup>
// 카드 위 소제목 줄: 왼쪽 제목, 오른쪽 동작 하나 (예: 수정, 새로고침). FormCard 소제목과 같은 글자.
defineProps({
  title: { type: String, required: true },
  as: { type: String, default: 'h2' },
});
</script>

<template>
  <div class="shead">
    <component :is="as" class="shead__title">{{ title }}</component>
    <div v-if="$slots.action" class="shead__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.shead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
  min-height: 36px;
  margin-bottom: calc(-1 * var(--space-2)); /* 아래 카드와 묶여 보이게 (블록 간격 16 → 8) */
  font-family: var(--font-sans);
}
.shead__title {
  min-width: 0;
  margin: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  color: var(--text-primary);
}
.shead__action { flex: none; display: flex; align-items: center; }
</style>
