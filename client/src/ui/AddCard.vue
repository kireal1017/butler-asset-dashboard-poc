<script setup>
import { RouterLink } from 'vue-router';
import { Plus } from 'lucide-vue-next';

// 목록 맨 아래 점선 카드: 왼쪽 제목·설명, 오른쪽 + (spec 3장). 카드 전체가 하나의 누름 영역.
defineProps({
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  to: { type: [String, Object], default: null },
});
const emit = defineEmits(['add']);
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
    class="add"
    @click="emit('add')"
  >
    <span class="add__text">
      <span class="add__title">{{ title }}</span>
      <span v-if="desc" class="add__desc">{{ desc }}</span>
    </span>
    <span class="add__plus" aria-hidden="true"><Plus :size="20" /></span>
  </component>
</template>

<style scoped>
.add {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  min-height: 72px;
  margin: 0;
  padding: var(--space-4);
  background: transparent;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  text-align: left;
  text-decoration: none;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-standard), border-color var(--dur-hover) var(--ease-standard);
}
.add:hover { background: var(--bg-surface); border-color: var(--accent); }
.add:focus-visible { outline: none; box-shadow: var(--focus-ring); border-color: var(--accent); }
.add__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.add__title { font-size: var(--fs-body); font-weight: var(--fw-semibold); line-height: var(--lh-body); }
.add__desc { font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.add__plus {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-min);
  height: var(--touch-min);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--accent);
}
</style>
