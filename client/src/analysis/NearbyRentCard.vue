<script setup>
// 자산 분석 상세 카드 ② 주변 전월세 시세 (spec 4.8-4, 7.6): 선택 호실과 같은 단지·비슷한 면적
import { computed } from 'vue';
import { Button, Card, InfoRow, formatWon } from '../ui/index.js';
import { RATE_MISSING } from './rateNote.js';

const props = defineProps({
  nearby: { type: Object, required: true },
});
const emit = defineEmits(['retry']);
const n = computed(() => props.nearby);
const verdictText = computed(() => {
  if (!n.value.verdict) return '';
  if (n.value.verdict === 'SIMILAR') return '내 환산 월세가 주변 평균과 비슷해요';
  return `내 환산 월세가 주변 평균보다 ${Math.abs(n.value.diffPct)}% ${n.value.verdict === 'LOWER' ? '낮아요' : '높아요'}`;
});
</script>

<template>
  <Card title="주변 전월세 시세" data-testid="card-nearby-rent">
    <p v-if="n.status === 'missing' || n.status === 'collecting'" class="muted" role="status" data-v="loading">
      전월세 실거래를 불러오는 중이에요<template v-if="n.progress?.total"> ({{ n.progress.total }}개월 중 {{ n.progress.done }}개월)</template>
    </p>
    <div v-else-if="n.status === 'failed'" class="stack" role="alert">
      <p class="muted">전월세 실거래를 불러오지 못했어요. {{ n.error }}</p>
      <Button variant="secondary" @click="emit('retry')">다시 시도</Button>
    </div>
    <p v-else-if="n.rateMissing" class="muted" data-v="rate-missing">{{ RATE_MISSING }}</p>
    <template v-else-if="n.enough">
      <dl class="rows">
        <InfoRow label="주변 평균 환산 월세" :value="formatWon(n.average)" emphasize data-v="avg" />
        <InfoRow label="범위" :value="`${formatWon(n.min)} ~ ${formatWon(n.max)}`" data-v="range" />
        <InfoRow label="거래" :value="`최근 ${n.months}개월 ${n.count}건`" data-v="count" />
      </dl>
      <p v-if="verdictText" class="verdict" data-v="verdict">{{ verdictText }}</p>
    </template>
    <div v-else class="scarce" data-v="scarce">
      <p>비교할 만한 최근 거래가 아직 충분하지 않아요 (최근 12개월 {{ n.count12 }}건).</p>
      <p>거래가 쌓이면 자동으로 보여드릴게요.</p>
    </div>
    <p class="source">출처 국토교통부 전월세 실거래가</p>
  </Card>
</template>

<style scoped>
.rows { margin: 0; }
.stack { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
.muted { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-secondary); }
.verdict { margin: var(--space-3) 0 0; font-size: var(--fs-body); line-height: var(--lh-body); font-weight: 600; color: var(--text-primary); }
.scarce { text-align: center; padding: var(--space-4) 0; }
.scarce p { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-secondary); }
.source { margin: var(--space-3) 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
</style>
