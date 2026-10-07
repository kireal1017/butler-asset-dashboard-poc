<script setup>
import { ref } from 'vue';

// 등록 방식 전환 (spec 3.2): 두 칸짜리 선택. 기본은 'step'(순서대로).
const props = defineProps({
  /** 'step' | 'all' */
  modelValue: { type: String, default: 'step' },
  options: {
    type: Array,
    default: () => [
      { value: 'step', label: '순서대로 등록하기' },
      { value: 'all', label: '한 번에 등록하기' },
    ],
  },
  ariaLabel: { type: String, default: '등록 방식' },
});
const emit = defineEmits(['update:modelValue']);
const btns = ref([]);

function onKey(e, i) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const next = (i + 1) % props.options.length;
  emit('update:modelValue', props.options[next].value);
  btns.value[next]?.focus();
}
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      :ref="(el) => (btns[i] = el)"
      type="button"
      role="radio"
      class="seg__btn"
      :aria-checked="o.value === modelValue"
      :tabindex="o.value === modelValue ? 0 : -1"
      @click="emit('update:modelValue', o.value)"
      @keydown="onKey($event, i)"
    >{{ o.label }}</button>
  </div>
</template>

<style scoped>
.seg {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  min-width: 0;
  padding: 2px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
}
.seg__btn {
  min-width: 0;
  min-height: 40px; /* 바깥 테두리·여백 포함 44px */
  margin: 0;
  padding: 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-standard), color var(--dur-hover) var(--ease-standard);
}
.seg__btn[aria-checked='true'] {
  background: var(--bg-surface);
  border-color: var(--border-default);
  color: var(--text-primary);
  font-weight: var(--fw-semibold);
  box-shadow: var(--shadow-sm);
}
.seg__btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
</style>
