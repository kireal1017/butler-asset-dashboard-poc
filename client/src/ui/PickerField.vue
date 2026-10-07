<script setup>
import { inject } from 'vue';
import { Search } from 'lucide-vue-next';

// 직접 타이핑하지 않고 눌러서 고르는 필드 (예: 주소 → 바텀시트). 입력과 같은 44px 모양.
defineProps({
  value: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  /** 읽기 전용(수정 화면의 주소 등) */
  readonly: { type: Boolean, default: false },
});
const emit = defineEmits(['open']);
defineOptions({ inheritAttrs: false });
const field = inject('ui-field', null);
</script>

<template>
  <p v-if="readonly" v-bind="$attrs" :id="field?.inputId.value" class="pick pick--ro">{{ value }}</p>
  <button
    v-else
    v-bind="$attrs"
    :id="field?.inputId.value"
    type="button"
    class="pick"
    :class="{ 'pick--empty': !value, 'pick--invalid': field?.invalid.value }"
    aria-haspopup="dialog"
    :aria-describedby="field?.describedBy.value"
    @click="emit('open')"
  >
    <span class="pick__text">{{ value || placeholder }}</span>
    <Search class="pick__icon" :size="18" aria-hidden="true" />
  </button>
</template>

<style scoped>
.pick {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  min-height: var(--touch-min);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 1.4;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard);
}
.pick:hover { border-color: var(--border-strong); }
.pick:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
.pick--empty { color: var(--text-tertiary); }
.pick--invalid { border-color: var(--danger); }
.pick__text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pick__icon { flex: none; color: var(--text-secondary); }
.pick--ro { cursor: default; background: var(--bg-subtle); border-color: var(--border-subtle); color: var(--text-primary); }
</style>
