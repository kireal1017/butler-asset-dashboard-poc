<script setup>
import { onMounted, ref } from 'vue';

const devFault = ref(null);
onMounted(async () => {
  try {
    const r = await fetch('/api/health');
    devFault.value = (await r.json()).devFault;
  } catch {
    devFault.value = null;
  }
});
</script>

<template>
  <div v-if="devFault" class="fault-banner" role="status" data-testid="dev-fault-banner">
    결함 주입 모드: {{ devFault === 'quota' ? '한도 초과' : '수집 실패' }} (개발 전용)
  </div>
  <!-- 같은 화면에서 id만 바뀌어도(/assets/1 → /assets/2) 새로 마운트해 그 자산을 불러온다 -->
  <RouterView :key="$route.path" />
</template>

<style scoped>
.fault-banner {
  background: var(--c-brand-ochre);
  color: var(--c-ink);
  font: var(--t-caption);
  text-align: center;
  padding: var(--s-xs) var(--s-md);
}
</style>
