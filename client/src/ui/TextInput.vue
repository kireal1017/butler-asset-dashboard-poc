<script setup>
import { computed, inject } from 'vue';

// 44px 입력. FormField 안에 두면 id·aria-describedby·aria-invalid를 자동으로 받는다.
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  inputmode: { type: String, default: undefined },
  /** 단위 꼬리표 (예: 만원) */
  suffix: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
defineOptions({ inheritAttrs: false });

const field = inject('ui-field', null);
const isInvalid = computed(() => props.invalid || Boolean(field?.invalid.value));
</script>

<template>
  <div class="ti" :class="{ 'ti--invalid': isInvalid }">
    <input
      v-bind="$attrs"
      :id="$attrs.id || field?.inputId.value"
      class="ti__input"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :inputmode="inputmode"
      :aria-invalid="isInvalid || undefined"
      :aria-describedby="field?.describedBy.value"
      :aria-required="field?.required.value || undefined"
      @input="emit('update:modelValue', $event.target.value)"
    />
    <span v-if="suffix" class="ti__suffix" aria-hidden="true">{{ suffix }}</span>
  </div>
</template>

<style scoped>
.ti {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-width: 0;
  height: var(--touch-min);
  padding: 0 var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard);
}
.ti:focus-within { border-color: var(--accent); box-shadow: var(--focus-ring); }
.ti--invalid { border-color: var(--danger); }
.ti--invalid:focus-within { border-color: var(--danger); }
.ti__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px; /* iOS 자동 확대 방지 */
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.ti__input::placeholder { color: var(--text-tertiary); }
.ti__suffix { flex: none; margin-left: var(--space-2); font-family: var(--font-sans); font-size: var(--fs-body); color: var(--text-secondary); }
</style>
