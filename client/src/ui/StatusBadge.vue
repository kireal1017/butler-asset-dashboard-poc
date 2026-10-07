<script setup>
// 상태 뱃지: 정상(ok)=success, 주의(warn)=warning, 중립(neutral). 알약형 999px.
// 의미는 글자가 전달하고, 점과 바탕색은 보조다. 12px 글자는 대비를 위해 text-primary로 쓴다.
defineProps({
  /** ok | warn | neutral */
  tone: { type: String, default: 'neutral' },
  text: { type: String, default: '' },
});
</script>

<template>
  <span class="ui-badge" :class="`ui-badge--${tone}`">
    <span class="ui-badge__dot" aria-hidden="true" />
    <slot>{{ text }}</slot>
  </span>
</template>

<style scoped>
.ui-badge {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  font-family: var(--font-sans);
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  line-height: 1;
  color: var(--text-primary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ui-badge__dot { width: 6px; height: 6px; border-radius: var(--radius-pill); flex: none; }
.ui-badge--ok { background: var(--success-soft); }
.ui-badge--ok .ui-badge__dot { background: var(--success); }
.ui-badge--warn { background: var(--warning-soft); }
.ui-badge--warn .ui-badge__dot { background: var(--warning); }
.ui-badge--neutral { background: var(--bg-subtle); color: var(--text-secondary); }
.ui-badge--neutral .ui-badge__dot { background: var(--text-tertiary); }
</style>
