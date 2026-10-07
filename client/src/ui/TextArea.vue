<script setup>
import { computed, inject } from 'vue';

// 여러 줄 입력. TextInput과 같은 테두리·초점 규칙.
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  rows: { type: Number, default: 3 },
});
const emit = defineEmits(['update:modelValue']);
defineOptions({ inheritAttrs: false });
const field = inject('ui-field', null);
const invalid = computed(() => Boolean(field?.invalid.value));
</script>

<template>
  <textarea
    v-bind="$attrs"
    :id="$attrs.id || field?.inputId.value"
    class="ta"
    :class="{ 'ta--invalid': invalid }"
    :rows="rows"
    :value="modelValue"
    :placeholder="placeholder"
    :aria-invalid="invalid || undefined"
    :aria-describedby="field?.describedBy.value"
    @input="emit('update:modelValue', $event.target.value)"
  />
</template>

<style scoped>
.ta {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 88px;
  margin: 0;
  padding: var(--space-3);
  resize: vertical;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  outline: none;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: var(--lh-body);
  color: var(--text-primary);
  transition: border-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard);
}
.ta::placeholder { color: var(--text-tertiary); }
.ta:focus { border-color: var(--accent); box-shadow: var(--focus-ring); }
.ta--invalid { border-color: var(--danger); }
</style>
