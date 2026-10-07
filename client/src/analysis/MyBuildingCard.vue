<script setup>
// 자산 분석 상세 카드 ① 내 건물 (spec 4.8-3, 7.5): 임대 중·만료 임박 호실의 진행 중 계약으로 계산
import { computed } from 'vue';
import { Button, Card, InfoRow, formatWon } from '../ui/index.js';
import { RATE_MISSING, rateLabel } from './rateNote.js';

const props = defineProps({
  myBuilding: { type: Object, required: true }, // { leasedUnits, metrics }
  conversion: { type: Object, default: null },
  /** 계약 등록 링크 (예: /leases/new?from=…) */
  leaseLink: { type: [String, Object], required: true },
});
const m = computed(() => props.myBuilding.metrics);
const won = (v) => formatWon(v);
</script>

<template>
  <Card title="내 건물" data-testid="card-my-building">
    <template v-if="m">
      <dl class="rows">
        <InfoRow label="평균 월세" :value="won(m.averageMonthlyRent)" data-v="avg-rent" />
        <InfoRow v-if="m.averageConverted !== null" label="환산 월세" :value="won(m.averageConverted)" emphasize data-v="avg-converted" />
        <InfoRow label="평균 보증금" :value="won(m.averageDeposit)" data-v="avg-deposit" />
        <InfoRow label="평균 면적" :value="`${m.averageAreaSqm.toFixed(1)}㎡`" data-v="avg-area" />
        <InfoRow v-if="m.convertedPerSqm !== null" label="㎡당 환산 월세" :value="`${m.convertedPerSqm.toLocaleString('en-US')}원`" data-v="per-sqm" />
      </dl>
      <p class="note">계약에 등록한 값이에요.</p>
      <p v-if="conversion" class="note">보증금은 <strong>{{ rateLabel(conversion) }}</strong>로 월세로 바꿔 더했어요 — 보증금을 빼고 월세만 보면 실제보다 낮아 보여요.</p>
      <p v-else class="note" data-v="rate-missing">{{ RATE_MISSING }}</p>
    </template>
    <div v-else class="empty" data-v="empty">
      <p class="empty__text">임대 중인 계약이 없어요. 계약을 등록하면 내 건물의 임대 수준을 볼 수 있어요.</p>
      <Button :to="leaseLink" variant="secondary">계약 등록하기</Button>
    </div>
  </Card>
</template>

<style scoped>
.rows { margin: 0; }
.note { margin: var(--space-2) 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
.note strong { font-weight: 600; color: var(--text-primary); }
.empty { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
.empty__text { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-secondary); }
</style>
