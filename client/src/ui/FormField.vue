<script setup>
import { computed, provide, useId } from 'vue';

// 라벨은 입력 위, 필수는 *, 선택은 "(선택)", 도움말·오류는 입력 아래 (DESIGN 12장)
const props = defineProps({
  label: { type: String, required: true },
  required: { type: Boolean, default: false },
  optional: { type: Boolean, default: false },
  help: { type: String, default: '' },
  error: { type: String, default: '' },
  /** 바깥에서 입력 id를 정할 때 */
  id: { type: String, default: '' },
});

const autoId = useId();
const inputId = computed(() => props.id || `f-${autoId}`);
const helpId = computed(() => `${inputId.value}-help`);
const errorId = computed(() => `${inputId.value}-error`);
const describedBy = computed(() => [props.error && errorId.value, props.help && helpId.value].filter(Boolean).join(' ') || undefined);
const invalid = computed(() => Boolean(props.error));

// TextInput 등 안쪽 입력이 id·aria를 자동으로 받는다
provide('ui-field', { inputId, describedBy, invalid, required: computed(() => props.required) });
</script>

<template>
  <div class="field" :class="{ 'field--error': invalid }">
    <label class="field__label" :for="inputId">
      {{ label }}<span v-if="required" class="field__req" aria-hidden="true"> *</span><span v-if="required" class="sr-only"> (필수)</span><span v-else-if="optional" class="field__opt"> (선택)</span>
    </label>
    <slot :id="inputId" :described-by="describedBy" :invalid="invalid" />
    <p v-if="error" :id="errorId" class="field__error">{{ error }}</p>
    <p v-if="help" :id="helpId" class="field__help">{{ help }}</p>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-family: var(--font-sans); }
.field__label {
  font-size: var(--fs-small);
  font-weight: var(--fw-medium);
  line-height: 1.45;
  color: var(--text-primary);
}
.field__req { color: var(--danger); }
.field__opt { color: var(--text-secondary); font-weight: var(--fw-regular); }
.field__help, .field__error {
  margin: 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
}
.field__help { color: var(--text-secondary); }
.field__error { color: var(--danger); font-weight: var(--fw-medium); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
</style>
