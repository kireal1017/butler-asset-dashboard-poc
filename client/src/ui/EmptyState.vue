<script setup>
// 빈 상태 (DESIGN-mobile C11): 카드 테두리 안에 20px 선 아이콘 하나 + 굵은 한 줄 + 설명 1~2줄 + 버튼 하나.
// 일러스트·아이콘 배경 금지. 이 컴포넌트를 다른 카드 안에 넣지 않는다.
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  text: { type: String, default: '' },
});
</script>

<template>
  <section class="empty">
    <component :is="icon" v-if="icon" class="empty__icon" :size="20" aria-hidden="true" />
    <p class="empty__title">{{ title }}</p>
    <p v-if="text" class="empty__text">{{ text }}</p>
    <div v-if="$slots.action" class="empty__action"><slot name="action" /></div>
  </section>
</template>

<style scoped>
.empty {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: var(--space-8) var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  text-align: center;
}
.empty__icon { color: var(--text-secondary); margin-bottom: var(--space-3); }
.empty__title {
  margin: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  color: var(--text-primary);
}
.empty__text {
  margin: var(--space-1) 0 0;
  max-width: 30em;
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
}
.empty__action { margin-top: var(--space-5); }
</style>
