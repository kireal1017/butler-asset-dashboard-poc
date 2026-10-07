<script setup>
// 정보 묶음 하나 = 카드 하나. 카드 안에 카드를 넣지 않는다 (DESIGN-mobile C12).
defineProps({
  as: { type: String, default: 'section' },
  /** 카드 맨 위 작은 그룹 제목 (선택) */
  title: { type: String, default: '' },
  /** 안쪽 여백 없이 (메뉴 행·정보 행처럼 행이 가장자리까지 닿을 때) */
  flush: { type: Boolean, default: false },
});
</script>

<template>
  <component :is="as" class="ui-card" :class="{ 'ui-card--flush': flush }">
    <h3 v-if="title" class="ui-card__title">{{ title }}</h3>
    <slot />
  </component>
</template>

<style scoped>
.ui-card {
  box-sizing: border-box;
  min-width: 0;
  margin: 0;
  padding: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  color: var(--text-primary);
}
.ui-card--flush { padding: 0; overflow: hidden; }
.ui-card__title {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  line-height: var(--lh-caption);
  color: var(--text-secondary);
}
.ui-card--flush .ui-card__title { margin: 0; padding: var(--space-3) var(--space-4) var(--space-1); }
</style>
