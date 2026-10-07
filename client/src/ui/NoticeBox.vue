<script setup>
import { computed } from 'vue';
import { Info, CircleCheck, TriangleAlert, CircleAlert } from 'lucide-vue-next';

// 화면 위쪽 한두 줄 메시지: info | success | warning | error (spec 3장)
const props = defineProps({
  kind: { type: String, default: 'info' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  /** 기본 아이콘 대신 쓸 Lucide 컴포넌트 (예: 건물 아이콘) */
  icon: { type: [Object, Function], default: null },
});

const DEFAULT_ICON = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };
const iconComp = computed(() => props.icon || DEFAULT_ICON[props.kind] || Info);
const role = computed(() => (props.kind === 'error' ? 'alert' : 'status'));
</script>

<template>
  <div class="notice" :class="`notice--${kind}`" :role="role">
    <component :is="iconComp" class="notice__icon" :size="18" aria-hidden="true" />
    <div class="notice__body">
      <p v-if="title" class="notice__title">{{ title }}</p>
      <p v-if="text || $slots.default" class="notice__text"><slot>{{ text }}</slot></p>
      <div v-if="$slots.action" class="notice__action"><slot name="action" /></div>
    </div>
  </div>
</template>

<style scoped>
.notice {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  color: var(--text-primary);
}
.notice__icon { flex: none; margin-top: 1px; }
.notice__body { flex: 1; min-width: 0; }
.notice__title {
  margin: 0;
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-body);
}
.notice__text {
  margin: 0;
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.notice__title + .notice__text { margin-top: 2px; }
.notice__action { margin-top: var(--space-2); }

/* 상태를 전하는 아이콘만 상태색을 쓴다. 글자는 중립색 (대비 확보) */
.notice--info { background: var(--info-soft); border-color: var(--info-soft); }
.notice--info .notice__icon { color: var(--info); }
.notice--success { background: var(--success-soft); border-color: var(--success-soft); }
.notice--success .notice__icon { color: var(--success); }
.notice--warning { background: var(--warning-soft); border-color: var(--warning-soft); }
.notice--warning .notice__icon { color: var(--warning); }
.notice--error { background: var(--danger-soft); border-color: var(--danger-soft); }
.notice--error .notice__icon { color: var(--danger); }
</style>
