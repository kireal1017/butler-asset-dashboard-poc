<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { LoaderCircle } from 'lucide-vue-next';

const props = defineProps({
  /** primary | secondary | ghost | danger-confirm */
  variant: { type: String, default: 'secondary' },
  /** md(44px) | sm(36px 시각 높이, 터치 영역은 44px 유지) */
  size: { type: String, default: 'md' },
  type: { type: String, default: 'button' },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  /** 지정하면 router-link로 그린다 */
  to: { type: [String, Object], default: null },
});

const inert = computed(() => props.disabled || props.loading);
const classes = computed(() => ['ui-btn', `ui-btn--${props.variant}`, `ui-btn--${props.size}`, { 'ui-btn--block': props.block, 'is-loading': props.loading }]);
</script>

<template>
  <RouterLink v-if="to && !inert" :to="to" :class="classes">
    <slot name="icon" />
    <span class="ui-btn__label"><slot /></span>
  </RouterLink>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="inert"
    :aria-busy="loading || undefined"
  >
    <LoaderCircle v-if="loading" class="ui-btn__spinner" :size="18" aria-hidden="true" />
    <slot v-else name="icon" />
    <span class="ui-btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.ui-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-width: 0;
  min-height: var(--touch-min);
  margin: 0;
  padding: 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-standard), border-color var(--dur-hover) var(--ease-standard);
  -webkit-tap-highlight-color: transparent;
}
.ui-btn__label { overflow: hidden; text-overflow: ellipsis; }
.ui-btn--block { display: flex; width: 100%; }
.ui-btn--sm { min-height: 36px; padding: 0 var(--space-3); font-size: var(--fs-small); position: relative; }
/* 36px 버튼도 손가락 영역은 44px */
.ui-btn--sm::after { content: ''; position: absolute; inset: -4px 0; }

.ui-btn--primary { background: var(--accent); color: var(--text-inverse); }
.ui-btn--primary:hover:not(:disabled) { background: var(--accent-hover); }

.ui-btn--secondary { background: var(--bg-surface); color: var(--text-primary); border-color: var(--border-default); }
.ui-btn--secondary:hover:not(:disabled) { background: var(--bg-hover); }

.ui-btn--ghost { background: transparent; color: var(--text-primary); }
.ui-btn--ghost:hover:not(:disabled) { background: var(--bg-hover); }

/* 위험 동작은 평소에 강조하지 않고, 확인 단계에서만 이 변형을 쓴다 (DESIGN 11장) */
.ui-btn--danger-confirm { background: var(--danger); color: var(--text-inverse); }

.ui-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); border-color: var(--accent); }

.ui-btn:disabled { cursor: default; background: var(--bg-subtle); color: var(--text-disabled); border-color: var(--border-subtle); }
.ui-btn.is-loading:disabled { color: var(--text-secondary); }

.ui-btn__spinner { flex: none; animation: ui-btn-spin 0.8s linear infinite; }
@keyframes ui-btn-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ui-btn__spinner { animation-duration: 2s; } }
</style>
