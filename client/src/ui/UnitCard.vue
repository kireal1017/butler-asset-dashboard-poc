<script setup>
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import Button from './Button.vue';
import ChangeText from './ChangeText.vue';
import ProgressLine from './ProgressLine.vue';
import StatusBadge from './StatusBadge.vue';
import { formatDate, formatWon, unitName } from './format.js';
import { unitBadge } from './status.js';

// 호실 카드 (spec 3.1). 카드를 누르면 호실 상세, ⑤ 버튼은 계약 등록(이 호실 선택)으로만 간다.
const props = defineProps({
  unit: { type: Object, required: true },
  to: { type: [String, Object], required: true },
  /** ⑤ 버튼이 갈 곳 (계약 등록, 이 호실이 미리 선택됨) */
  leaseTo: { type: [String, Object], required: true },
});
const router = useRouter();

const badge = computed(() => unitBadge(props.unit.leaseStatus, props.unit.dDay));
const hasLease = computed(() => ['LEASED', 'EXPIRING'].includes(props.unit.leaseStatus) && props.unit.lease);
const lease = computed(() => props.unit.lease);
const reference = computed(() => props.unit.reference);
const collecting = computed(() => !reference.value && ['collecting', 'missing'].includes(props.unit.status));
const failed = computed(() => !reference.value && props.unit.status === 'failed');

/** 보증금 5,000만원 · 월세 80만원 (· 김○○) / 보증금 3억 5,000만원 · 전세 */
const terms = (l) => [
  `보증금 ${formatWon(l.deposit)}`,
  l.leaseType === 'JEONSE' ? '전세' : `월세 ${formatWon(l.monthlyRent)}`,
  ...(l.tenantName ? [l.tenantName] : []),
].join(' · ');

function open(e) {
  // 카드 안 링크·버튼을 누른 경우는 그쪽 동작만
  if (e.target.closest('a, button')) return;
  router.push(props.to);
}
function registerLease(e) {
  e.stopPropagation();
  router.push(props.leaseTo);
}
</script>

<template>
  <article class="ucard" data-testid="unit-card" :data-id="unit.id" :data-status="unit.leaseStatus" @click="open">
    <!-- ① 제목과 상태 뱃지 -->
    <div class="ucard__top">
      <RouterLink :to="to" class="ucard__title" data-v="unit">{{ unitName(unit) }}</RouterLink>
      <StatusBadge :tone="badge.tone" :text="badge.text" data-v="status" />
    </div>

    <!-- 계약이 있을 때: 임대 상태가 위, 참고가는 아래 한 줄 -->
    <template v-if="hasLease">
      <p class="ucard__line" data-v="terms">{{ terms(lease) }}</p>
      <p class="ucard__sub" data-v="expiry">계약 만료 {{ formatDate(lease.endDate) }} (D-{{ unit.dDay }})</p>
      <div class="ucard__rule" />
      <ProgressLine v-if="collecting" :done="unit.progress?.done ?? 0" :total="unit.progress?.total ?? 0" />
      <p v-else-if="failed" class="ucard__muted">실거래 자료를 불러오지 못했어요.</p>
      <p v-else-if="!reference" class="ucard__muted" data-v="no-reference">최근 12개월 안에 같은 면적 거래가 없어요</p>
      <template v-else>
        <div class="ucard__refrow">
          <span class="ucard__reflabel">최근 실거래 참고가 <strong data-v="reference">{{ formatWon(reference.value) }}</strong></span>
          <ChangeText v-if="unit.change" :diff="unit.change.diff" :rate="unit.change.rate" data-v="change" />
        </div>
        <p class="ucard__sub" data-v="reference-date">기준일 {{ formatDate(reference.referenceDate) }}</p>
      </template>
    </template>

    <!-- 계약이 없을 때(공실·입주 예정): 참고가를 크게 -->
    <template v-else>
      <ProgressLine v-if="collecting" :done="unit.progress?.done ?? 0" :total="unit.progress?.total ?? 0" />
      <p v-else-if="failed" class="ucard__muted">실거래 자료를 불러오지 못했어요.</p>
      <p v-else-if="!reference" class="ucard__muted" data-v="no-reference">최근 12개월 안에 같은 면적 거래가 없어요</p>
      <template v-else>
        <p class="ucard__label">최근 실거래 참고가</p>
        <div class="ucard__big">
          <span class="ucard__value" data-v="reference">{{ formatWon(reference.value) }}</span>
          <ChangeText v-if="unit.change" :diff="unit.change.diff" :rate="unit.change.rate" basis="매입가 대비" data-v="change" />
        </div>
        <p class="ucard__sub" data-v="reference-date">기준일 {{ formatDate(reference.referenceDate) }}</p>
      </template>

      <p v-if="unit.leaseStatus === 'MOVE_IN' && lease" class="ucard__movein" data-v="move-in">
        {{ formatDate(lease.startDate) }} 입주 예정 · {{ terms(lease) }}
      </p>
      <Button v-else variant="secondary" block class="ucard__btn" data-testid="unit-lease-new" @click="registerLease">임대 계약 등록하기</Button>
    </template>
  </article>
</template>

<style scoped>
.ucard {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color var(--dur-hover) var(--ease-standard);
}
.ucard:hover { border-color: var(--border-strong); }
.ucard:focus-within { border-color: var(--accent); }
.ucard__top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-width: 0; margin-bottom: var(--space-2); }
.ucard__title {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: var(--touch-min); /* 터치 44px, 시각 줄 높이는 그대로 */
  margin: -10px 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  color: var(--text-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ucard__title:focus-visible { outline: none; border-radius: var(--radius-xs); box-shadow: var(--focus-ring); }
.ucard__line { margin: 0; font-size: var(--fs-body); line-height: var(--lh-body); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.ucard__sub { margin: 2px 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ucard__muted { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.ucard__rule { height: 1px; margin: var(--space-3) 0; background: var(--border-subtle); }
.ucard__refrow { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px var(--space-3); min-width: 0; }
.ucard__reflabel { font-size: var(--fs-small); color: var(--text-secondary); }
.ucard__reflabel strong { margin-left: 2px; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ucard__label { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.ucard__big { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px var(--space-3); min-width: 0; margin-top: 2px; }
.ucard__value { font-size: var(--fs-display-sm); font-weight: var(--fw-bold); line-height: var(--lh-tight); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ucard__movein {
  margin: var(--space-3) 0 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
  font-size: var(--fs-small);
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.ucard__btn { margin-top: var(--space-3); }
</style>
