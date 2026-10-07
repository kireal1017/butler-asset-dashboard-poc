<script setup>
// 화면 틀: 모바일 폭(최대 480px), 좌우 16px, 블록 사이 16px. 화면마다 data-testid를 붙인다.
defineProps({
  testid: { type: String, required: true },
});
</script>

<template>
  <main class="page" :data-testid="testid">
    <slot />
  </main>
</template>

<style scoped>
.page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: var(--page-max-v3);
  min-width: 0;
  margin: 0 auto;
  padding: 0 var(--page-gutter) var(--space-8);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-primary);
}
</style>
