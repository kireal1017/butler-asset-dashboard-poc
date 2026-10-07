<script setup>
import { onBeforeUnmount, ref } from 'vue';
import Button from './Button.vue';

// 되돌릴 수 없는 동작(삭제): 처음 누르면 확인 문구로 바뀌고(danger-confirm), 한 번 더 누르면 실행한다.
// 5초 안에 다시 누르지 않으면 원래대로 돌아간다.
const props = defineProps({
  label: { type: String, required: true },
  confirmLabel: { type: String, default: '정말 삭제할까요? 한 번 더 누르면 삭제돼요' },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm']);
const armed = ref(false);
let timer = null;

function click() {
  if (props.loading) return;
  if (!armed.value) {
    armed.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => { armed.value = false; }, 5000);
    return;
  }
  clearTimeout(timer);
  armed.value = false;
  emit('confirm');
}
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <Button :variant="armed ? 'danger-confirm' : 'secondary'" block :loading="loading" data-testid="confirm-delete" @click="click">
    {{ armed ? confirmLabel : label }}
  </Button>
</template>
