<script setup>
import { computed } from 'vue';
import TextInput from './TextInput.vue';

// 원 단위 금액 입력. 숫자만 받고 세 자리마다 쉼표를 찍어 보여 준다 (v-model은 숫자 문자열).
const model = defineModel({ type: String, default: '' });
defineOptions({ inheritAttrs: false });

const shown = computed(() => (model.value ? Number(model.value).toLocaleString('en-US') : ''));
function onInput(v) {
  model.value = String(v).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 13);
}
</script>

<template>
  <TextInput v-bind="$attrs" :model-value="shown" inputmode="numeric" suffix="원" autocomplete="off" @update:model-value="onInput" />
</template>
