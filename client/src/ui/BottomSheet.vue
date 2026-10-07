<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { X } from 'lucide-vue-next';

// 바텀시트 (DESIGN-mobile C9): 뒤를 어둡게, 아래에서 220ms로 올라옴, 위 두 모서리만 12px.
// 열리면 첫 입력에 초점, Esc·배경 누름·X로 닫힘, 열린 동안 뒤 화면 스크롤 잠금.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  closeLabel: { type: String, default: '닫기' },
});
const emit = defineEmits(['update:modelValue', 'close']);

const panel = ref(null);
const closeBtn = ref(null);
const titleId = `sheet-${useId()}`;
let restoreFocus = null;
let prevOverflow = '';
let locked = false;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function close() {
  emit('update:modelValue', false);
  emit('close');
}

function lock() {
  if (locked) return;
  prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  locked = true;
}
function unlock() {
  if (!locked) return;
  document.body.style.overflow = prevOverflow;
  locked = false;
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
    return;
  }
  if (e.key !== 'Tab' || !panel.value) return;
  // 시트 안에서만 초점이 돈다
  const items = [...panel.value.querySelectorAll(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (typeof document === 'undefined') return;
    if (open) {
      restoreFocus = document.activeElement;
      lock();
      document.addEventListener('keydown', onKeydown);
      await nextTick();
      const firstInput = panel.value?.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
      (firstInput || closeBtn.value)?.focus({ preventScroll: true });
    } else {
      document.removeEventListener('keydown', onKeydown);
      unlock();
      if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus({ preventScroll: true });
      restoreFocus = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeydown);
  unlock();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="modelValue" class="sheet">
        <div class="sheet__dim" aria-hidden="true" @click="close" />
        <div
          ref="panel"
          class="sheet__panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <header class="sheet__head">
            <h2 :id="titleId" class="sheet__title">{{ title }}</h2>
            <button ref="closeBtn" type="button" class="sheet__close" :aria-label="closeLabel" @click="close">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="sheet__body"><slot /></div>
          <footer v-if="$slots.footer" class="sheet__foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-family: var(--font-sans);
}
.sheet__dim { position: absolute; inset: 0; background: var(--bg-dim); }
.sheet__panel {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--page-max-v3);
  max-height: 88vh;
  max-height: 88dvh;
  background: var(--bg-surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-floating);
  color: var(--text-primary);
}
.sheet__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}
.sheet__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sheet__close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-min);
  height: var(--touch-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.sheet__close:hover { background: var(--bg-hover); }
.sheet__close:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-4);
}
.sheet__foot {
  padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-subtle);
}
.sheet__body:last-child { padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px)); }

/* 열림·닫힘: 배경은 흐려지고 패널은 아래에서 */
.sheet-enter-active, .sheet-leave-active { transition: opacity var(--dur-sheet) var(--ease-standard); }
.sheet-enter-active .sheet__panel, .sheet-leave-active .sheet__panel { transition: transform var(--dur-sheet) var(--ease-standard); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .sheet__panel, .sheet-leave-to .sheet__panel { transform: translateY(100%); }
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active .sheet__panel, .sheet-leave-active .sheet__panel { transition: none; }
}
</style>
