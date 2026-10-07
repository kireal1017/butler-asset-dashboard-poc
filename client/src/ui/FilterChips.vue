<script setup>
import { ref } from 'vue';

// 하나만 고르는 필터 칩. 모서리 8px(알약형 아님), 선택 시 accent-soft (DESIGN-mobile C7)
const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  /** [{ value, label, count? }] */
  options: { type: Array, required: true },
  ariaLabel: { type: String, default: '필터' },
});
const emit = defineEmits(['update:modelValue']);
const btns = ref([]);

function select(v) {
  if (v !== props.modelValue) emit('update:modelValue', v);
}

// 방향키로 이동하며 선택 (radiogroup 패턴)
function onKey(e, i) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const n = props.options.length;
  const next = (i + step + n) % n;
  select(props.options[next].value);
  btns.value[next]?.focus();
}
</script>

<template>
  <div class="chips" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      :ref="(el) => (btns[i] = el)"
      type="button"
      role="radio"
      class="chip"
      :aria-checked="o.value === modelValue"
      :tabindex="o.value === modelValue || (modelValue == null && i === 0) ? 0 : -1"
      @click="select(o.value)"
      @keydown="onKey($event, i)"
    >
      <span class="chip__face">
        {{ o.label }}<span v-if="o.count !== undefined && o.count !== null" class="chip__count">{{ o.count }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  gap: var(--space-2);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  font-family: var(--font-sans);
}
.chips::-webkit-scrollbar { display: none; }
/* 버튼은 44px 터치 영역, 보이는 칩은 34px */
.chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-min);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.chip__face {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  transition: background-color var(--dur-hover) var(--ease-standard), border-color var(--dur-hover) var(--ease-standard);
}
.chip__count { font-variant-numeric: tabular-nums; color: var(--text-tertiary); }
.chip:hover .chip__face { background: var(--bg-hover); }
.chip[aria-checked='true'] .chip__face {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-hover);
  font-weight: var(--fw-semibold);
}
.chip[aria-checked='true'] .chip__count { color: var(--accent-hover); }
.chip:focus-visible { outline: none; }
.chip:focus-visible .chip__face { box-shadow: var(--focus-ring); }
</style>
