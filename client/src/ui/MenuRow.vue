<script setup>
import { RouterLink } from 'vue-router';
import { ChevronRight } from 'lucide-vue-next';

// 메뉴 행: 왼쪽 아이콘, 가운데 제목·설명, 오른쪽 ›. 행 전체를 누른다 (spec 3장)
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  desc: { type: String, default: '' },
  to: { type: [String, Object], default: null },
});
const emit = defineEmits(['click']);
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
    class="mrow"
    @click="emit('click', $event)"
  >
    <component :is="icon" v-if="icon" class="mrow__icon" :size="20" aria-hidden="true" />
    <span class="mrow__text">
      <span class="mrow__title">{{ title }}</span>
      <span v-if="desc" class="mrow__desc">{{ desc }}</span>
    </span>
    <ChevronRight class="mrow__chev" :size="18" aria-hidden="true" />
  </component>
</template>

<style scoped>
.mrow {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  min-height: 60px;
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: transparent;
  border: 0;
  font-family: var(--font-sans);
  text-align: left;
  text-decoration: none;
  color: var(--text-primary);
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-standard);
}
.mrow + .mrow { border-top: 1px solid var(--border-subtle); }
.mrow:hover { background: var(--bg-hover); }
.mrow:focus-visible { outline: none; box-shadow: inset var(--focus-ring); }
.mrow__icon { flex: none; color: var(--text-secondary); }
.mrow__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.mrow__title { font-size: var(--fs-body); font-weight: var(--fw-semibold); line-height: var(--lh-body); }
.mrow__desc {
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mrow__chev { flex: none; color: var(--text-tertiary); }
</style>
