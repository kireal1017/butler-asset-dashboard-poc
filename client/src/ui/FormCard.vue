<script setup>
// 입력 카드: 카드 위 소제목 + 카드 안에 필드를 세로로 쌓는다 (spec 3장)
defineProps({
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <section class="fcard">
    <h2 v-if="subtitle" class="fcard__subtitle">{{ subtitle }}</h2>
    <div class="fcard__box"><slot /></div>
  </section>
</template>

<style scoped>
.fcard { min-width: 0; font-family: var(--font-sans); }
.fcard__subtitle {
  margin: 0 0 var(--space-2);
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  color: var(--text-primary);
}
.fcard__box {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  min-width: 0;
  padding: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}
</style>
