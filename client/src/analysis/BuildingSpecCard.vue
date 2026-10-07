<script setup>
// 자산 분석 상세 카드 ④ 건축물대장 (spec 4.8-6, 8.3): 값이 없는 행은 숨긴다
import { computed } from 'vue';
import { Button, Card, InfoRow, formatDate } from '../ui/index.js';

const props = defineProps({
  spec: { type: Object, required: true }, // { status, data }
  /** 준공 연차 계산 기준 연도(기준 월 AS_OF의 연도) */
  baseYear: { type: Number, required: true },
  retrying: { type: Boolean, default: false },
});
const emit = defineEmits(['retry']);
const d = computed(() => props.spec.data);
const rows = computed(() => {
  const x = d.value;
  if (!x) return [];
  const age = x.useApprovalDate ? props.baseYear - Number(x.useApprovalDate.slice(0, 4)) + 1 : null;
  return [
    ['주용도', x.mainPurpose],
    ['구조', x.structure],
    ['사용승인일', x.useApprovalDate ? `${formatDate(x.useApprovalDate)} · 준공 ${age}년차` : null],
    ['층수', x.groundFloors ? `지상 ${x.groundFloors}층${x.undergroundFloors ? ` · 지하 ${x.undergroundFloors}층` : ''}` : null],
    ['세대수', x.households ? `${x.households.toLocaleString('en-US')}세대` : null],
    ['주차 대수', x.parking ? `${x.parking.toLocaleString('en-US')}대` : null],
    ['연면적', x.totalArea ? `${Math.round(x.totalArea).toLocaleString('en-US')}㎡` : null],
  ].filter(([, v]) => v);
});
</script>

<template>
  <Card title="건축물대장" data-testid="card-building-spec">
    <dl v-if="spec.status === 'ready' && rows.length" class="rows">
      <InfoRow v-for="[label, value] in rows" :key="label" :label="label"><span :data-v="`spec-${label}`">{{ value }}</span></InfoRow>
    </dl>
    <div v-else-if="spec.status === 'failed' || (spec.status === 'ready' && !rows.length)" class="stack" role="alert">
      <p class="muted">건축물대장 정보를 불러오지 못했어요.</p>
      <Button variant="secondary" :loading="retrying" @click="emit('retry')">다시 시도</Button>
    </div>
    <p v-else class="muted" role="status">건축물대장 정보를 불러오는 중이에요</p>
    <p class="source">출처 국토교통부 건축물대장</p>
  </Card>
</template>

<style scoped>
.rows { margin: 0; }
.stack { display: flex; flex-direction: column; gap: var(--space-3); align-items: flex-start; }
.muted { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-secondary); }
.source { margin: var(--space-3) 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
</style>
