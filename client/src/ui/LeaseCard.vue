<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { FileText, User } from 'lucide-vue-next';
import StatusBadge from './StatusBadge.vue';
import { formatDate, formatWon, formatWonRaw, unitName } from './format.js';
import { daysBetween, leaseBadge } from './status.js';

// 계약 관리(4.9)의 계약 카드. 카드 전체가 계약 수정으로 가는 링크.
const props = defineProps({
  lease: { type: Object, required: true },
  /** 'YYYY-MM-DD' — 만료 임박 D-n 계산 기준(서버 TODAY) */
  today: { type: String, required: true },
  to: { type: [String, Object], required: true },
});
const badge = computed(() => leaseBadge(props.lease.status, daysBetween(props.today, props.lease.endDate)));
const rent = computed(() => (props.lease.leaseType === 'JEONSE' ? '전세' : `월 ${formatWon(props.lease.monthlyRent)}`));
</script>

<template>
  <RouterLink :to="to" class="lcard" data-testid="lease-card" :data-id="lease.id" :data-status="lease.status">
    <span class="lcard__top">
      <FileText class="lcard__icon" :size="18" aria-hidden="true" />
      <span class="lcard__unit" data-v="unit">{{ unitName(lease) }}</span>
      <StatusBadge :tone="badge.tone" :text="badge.text" data-v="status" />
    </span>
    <span class="lcard__meta">
      <span class="lcard__bname" data-v="building">{{ lease.buildingName }}</span>
      <span v-if="lease.tenantName" class="lcard__tenant" data-v="tenant"><User :size="14" aria-hidden="true" /> · {{ lease.tenantName }}</span>
    </span>
    <span class="lcard__period" data-v="period">{{ formatDate(lease.startDate) }} ~ {{ formatDate(lease.endDate) }} · {{ rent }}</span>
    <span class="lcard__deposit">보증금 <span data-v="deposit">{{ formatWonRaw(lease.deposit) }}</span></span>
  </RouterLink>
</template>

<style scoped>
.lcard {
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
  text-decoration: none;
  transition: border-color var(--dur-hover) var(--ease-standard);
}
.lcard:hover { border-color: var(--border-strong); }
.lcard:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
.lcard__top { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.lcard__icon { flex: none; color: var(--text-secondary); }
.lcard__unit {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lcard__meta, .lcard__period {
  margin-left: calc(18px + var(--space-2));
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.lcard__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0 var(--space-1); margin-top: 2px; }
.lcard__tenant { display: inline-flex; align-items: center; gap: 2px; }
.lcard__deposit {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
  font-size: var(--fs-small);
  color: var(--text-secondary);
}
.lcard__deposit span { color: var(--text-primary); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
</style>
