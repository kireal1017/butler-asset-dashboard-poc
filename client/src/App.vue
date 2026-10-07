<script setup>
import { onMounted, ref } from 'vue';
import Disclaimer from './components/Disclaimer.vue';

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
  <div class="app">
    <div v-if="devFault" class="fault-banner" role="status" data-testid="dev-fault-banner">
      결함 주입 모드: {{ devFault === 'quota' ? '한도 초과' : '수집 실패' }} (개발 전용)
    </div>
    <!-- 같은 화면에서 id만 바뀌어도(/units/1 → /units/2) 새로 마운트해 그 호실을 불러온다 -->
    <RouterView :key="$route.path" />
    <Disclaimer />
  </div>
</template>

<style scoped>
.app {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg-app);
  font-family: var(--font-sans);
}
.fault-banner {
  padding: var(--space-2) var(--space-4);
  background: var(--warning-soft);
  color: var(--text-primary);
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  text-align: center;
}
</style>
