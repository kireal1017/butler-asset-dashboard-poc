<script setup>
import Button from './Button.vue';

// 폼 맨 아래 두 버튼: 왼쪽 보조(취소·이전), 오른쪽 주(등록·다음) (spec 3장, 3.2)
defineProps({
  cancelLabel: { type: String, default: '취소' },
  submitLabel: { type: String, required: true },
  submitDisabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** form 안에서 submit 이벤트를 쓰려면 'submit' */
  submitType: { type: String, default: 'button' },
});
const emit = defineEmits(['cancel', 'submit']);
</script>

<template>
  <div class="fbtns">
    <Button variant="secondary" block :disabled="loading" @click="emit('cancel')">{{ cancelLabel }}</Button>
    <Button
      variant="primary"
      block
      :type="submitType"
      :disabled="submitDisabled"
      :loading="loading"
      @click="submitType === 'button' && emit('submit')"
    >{{ submitLabel }}</Button>
  </div>
</template>

<style scoped>
.fbtns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: var(--space-2);
  min-width: 0;
}
</style>
