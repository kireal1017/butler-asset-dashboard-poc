<script setup>
defineProps({ done: { type: Number, default: 0 }, total: { type: Number, default: 0 }, label: { type: String, default: '실거래 자료를 불러오는 중' } });
</script>

<template>
  <div class="progress stack" role="status" data-testid="progress">
    <p class="body-sm">{{ label }}<template v-if="total"> ({{ total }}개월 중 {{ done }}개월)</template></p>
    <div class="track"><div class="bar" :style="{ width: total ? `${Math.round((done / total) * 100)}%` : '15%' }" /></div>
  </div>
</template>

<style scoped>
.progress { gap: var(--s-xs); }
.track { height: 6px; border-radius: var(--r-pill); background: var(--c-surface-strong); overflow: hidden; }
.bar { height: 100%; background: var(--c-ink); border-radius: var(--r-pill); transition: width 0.3s; }
</style>
