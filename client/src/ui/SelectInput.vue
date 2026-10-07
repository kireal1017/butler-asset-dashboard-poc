<script setup>
import { computed, inject } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

// 44px 선택 상자. TextInput과 같은 모양, FormField 안에서 id·aria를 받는다.
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  /** [{ value, label }] */
  options: { type: Array, required: true },
  placeholder: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
defineOptions({ inheritAttrs: false });

const field = inject('ui-field', null);
const invalid = computed(() => Boolean(field?.invalid.value));
function onChange(e) {
  const o = props.options[e.target.selectedIndex - (props.placeholder ? 1 : 0)];
  emit('update:modelValue', o ? o.value : '');
}
</script>

<template>
  <div class="sel" :class="{ 'sel--invalid': invalid, 'sel--disabled': disabled }">
    <select
      v-bind="$attrs"
      :id="$attrs.id || field?.inputId.value"
      class="sel__input"
      :disabled="disabled"
      :aria-invalid="invalid || undefined"
      :aria-describedby="field?.describedBy.value"
      :aria-required="field?.required.value || undefined"
      @change="onChange"
    >
      <option v-if="placeholder" value="" disabled :selected="modelValue === '' || modelValue === null">{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value" :selected="o.value === modelValue">{{ o.label }}</option>
    </select>
    <ChevronDown class="sel__icon" :size="16" aria-hidden="true" />
  </div>
</template>

<style scoped>
.sel {
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  height: var(--touch-min);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition: border-color var(--dur-hover) var(--ease-standard), box-shadow var(--dur-hover) var(--ease-standard);
}
.sel:focus-within { border-color: var(--accent); box-shadow: var(--focus-ring); }
.sel--invalid { border-color: var(--danger); }
.sel--disabled { background: var(--bg-subtle); }
.sel__input {
  appearance: none;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0 calc(var(--space-3) + 20px) 0 var(--space-3);
  border: 0;
  outline: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: 16px; /* iOS 자동 확대 방지 */
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  cursor: pointer;
}
.sel__input:disabled { color: var(--text-disabled); cursor: default; }
.sel__icon { position: absolute; right: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none; }
</style>
