<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Building2 } from 'lucide-vue-next';
import StatusBadge from './StatusBadge.vue';
import { BUILDING_STATUS } from './status.js';

// 건물 관리(4.2)의 건물 카드. 카드 전체가 건물 상세로 가는 링크.
const props = defineProps({
  building: { type: Object, required: true },
  to: { type: [String, Object], required: true },
});
const badge = computed(() => BUILDING_STATUS[props.building.status] ?? BUILDING_STATUS.REGISTERING);
const occ = computed(() => props.building.occupancy ?? { leased: 0, owned: props.building.ownedUnitCount, rate: 0 });
const pct = computed(() => Math.round((occ.value.rate || 0) * 100));
</script>

<template>
  <RouterLink :to="to" class="bcard" data-testid="building-card" :data-id="building.id" :data-status="building.status">
    <span class="bcard__top">
      <Building2 class="bcard__icon" :size="18" aria-hidden="true" />
      <span class="bcard__name" data-v="name">{{ building.name }}</span>
      <StatusBadge :tone="badge.tone" :text="badge.text" data-v="status" />
    </span>
    <span class="bcard__addr" data-v="address">{{ building.address }}</span>
    <span class="bcard__occ">
      <span class="bcard__rate">입주율 <span data-v="occupancy">{{ pct }}%</span></span>
      <span class="bcard__track" aria-hidden="true"><span class="bcard__bar" :style="{ width: `${pct}%` }" /></span>
      <span class="bcard__ratio" data-v="ratio" :aria-label="`보유 ${occ.owned}개 중 ${occ.leased}개 임대 중`">{{ occ.leased }}/{{ occ.owned }}</span>
    </span>
  </RouterLink>
</template>

<style scoped>
.bcard {
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
.bcard:hover { border-color: var(--border-strong); }
.bcard:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
.bcard__top { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.bcard__icon { flex: none; color: var(--text-secondary); }
.bcard__name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bcard__addr {
  margin: 2px 0 0 calc(18px + var(--space-2));
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bcard__occ {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-subtle);
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}
.bcard__rate { flex: none; color: var(--text-secondary); }
.bcard__rate span { color: var(--text-primary); font-weight: var(--fw-semibold); }
.bcard__track { flex: 1; height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--bg-subtle); }
.bcard__bar { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--accent); }
.bcard__ratio { flex: none; color: var(--text-primary); font-weight: var(--fw-medium); }
</style>
