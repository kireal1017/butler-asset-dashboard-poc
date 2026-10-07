<script setup>
import { RouterLink, useRouter } from 'vue-router';
import { ChevronLeft } from 'lucide-vue-next';

const props = defineProps({
  title: { type: String, required: true },
  /** 제목 아래 작은 보조 줄 (주소 등) */
  sub: { type: String, default: '' },
  /** false: 뒤로가기 없음 / true: 이전 화면 / 경로: 그 화면으로 */
  back: { type: [Boolean, String, Object], default: false },
  backLabel: { type: String, default: '뒤로 가기' },
});
const emit = defineEmits(['back']);
const router = useRouter();

function goBack() {
  emit('back');
  if (props.back === true) router.back();
}
</script>

<template>
  <header class="hdr">
    <RouterLink
      v-if="back && back !== true"
      :to="back"
      class="hdr__back"
      :aria-label="backLabel"
      @click="emit('back')"
    >
      <ChevronLeft :size="20" aria-hidden="true" />
    </RouterLink>
    <button v-else-if="back" type="button" class="hdr__back" :aria-label="backLabel" @click="goBack">
      <ChevronLeft :size="20" aria-hidden="true" />
    </button>

    <div class="hdr__text">
      <h1 class="hdr__title">{{ title }}</h1>
      <p v-if="sub" class="hdr__sub">{{ sub }}</p>
    </div>

    <div v-if="$slots.action" class="hdr__action"><slot name="action" /></div>
  </header>
</template>

<style scoped>
.hdr {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  min-height: 56px;
  padding: var(--space-2) 0;
  font-family: var(--font-sans);
}
.hdr__back {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-min);
  height: var(--touch-min);
  margin: 0 0 0 calc(-1 * var(--space-3));
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}
.hdr__back:hover { background: var(--bg-hover); }
.hdr__back:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.hdr__text { flex: 1; min-width: 0; }
.hdr__title {
  margin: 0;
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: var(--lh-heading);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hdr__sub {
  margin: 2px 0 0;
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hdr__action { flex: none; display: flex; align-items: center; }
</style>
