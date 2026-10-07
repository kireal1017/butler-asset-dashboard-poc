<script setup>
// 4.6 호실 상세: 임대 현황(환산 월세 포함) + 매입과 시세 + 자산 분석으로 가는 메뉴 행
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ChartColumn, FileText } from 'lucide-vue-next';
import {
  AppHeader, Button, Card, ChangeText, EmptyState, InfoRow, MenuRow, NoticeBox, Page, ProgressLine, SectionHead, StatusBadge,
  formatAreaU, formatDate, formatFloorKo, formatWon, formatYmDot, unitBadge, unitName,
} from '../ui/index.js';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { fromOr } from '../utils/nav.js';
import { RATE_MISSING, rateLabel } from '../analysis/rateNote.js';

const route = useRoute();
const id = Number(route.params.id);
const data = ref(null);
const error = ref('');

const poll = usePoll(load, 2000);
async function load() {
  try {
    data.value = await api(`/units/${id}`);
    error.value = '';
  } catch (e) {
    error.value = e.message;
    poll.stop();
    return;
  }
  if (data.value.unit.status === 'collecting') poll.start();
  else poll.stop();
}
onMounted(load);

const u = computed(() => data.value?.unit);
const b = computed(() => data.value?.building);
const lease = computed(() => u.value?.lease ?? null);
const badge = computed(() => (u.value ? unitBadge(u.value.leaseStatus, u.value.dDay) : null));
const ongoing = computed(() => ['LEASED', 'EXPIRING'].includes(u.value?.leaseStatus));
const here = computed(() => route.fullPath);
const back = computed(() => fromOr(route, u.value ? `/buildings/${u.value.buildingId}` : '/buildings'));
const sub = computed(() => (u.value && b.value
  ? [b.value.name, `전용 ${formatAreaU(u.value.areaU)}`, formatFloorKo(u.value.floor)].join(' · ')
  : ''));
const reference = computed(() => u.value?.reference ?? null);
const collecting = computed(() => !reference.value && ['collecting', 'missing'].includes(u.value?.status));
</script>

<template>
  <Page testid="unit-detail">
    <AppHeader :title="u ? unitName(u) : '호실'" :sub="sub" :back="back">
      <template v-if="u" #action>
        <Button size="sm" :to="{ path: `/units/${id}/edit`, query: { from: here } }" data-testid="unit-edit">수정</Button>
      </template>
    </AppHeader>
    <NoticeBox v-if="error" kind="error" :text="error" />

    <template v-if="u">
      <!-- ① 임대 현황 -->
      <SectionHead title="임대 현황">
        <template v-if="lease" #action>
          <Button variant="ghost" size="sm" :to="{ path: `/leases/${lease.id}/edit`, query: { from: here } }" data-testid="lease-edit">수정</Button>
        </template>
      </SectionHead>
      <Card v-if="lease" data-testid="lease-status">
        <dl class="rows">
          <InfoRow label="상태"><StatusBadge :tone="badge.tone" :text="badge.text" data-v="status" /></InfoRow>
          <InfoRow v-if="lease.tenantName" label="임차인"><span data-v="tenant">{{ lease.tenantName }}</span></InfoRow>
          <InfoRow label="보증금"><span data-v="deposit">{{ formatWon(lease.deposit) }}</span></InfoRow>
          <InfoRow label="월세"><span data-v="rent">{{ lease.leaseType === 'JEONSE' ? '전세' : formatWon(lease.monthlyRent) }}</span></InfoRow>
          <InfoRow label="계약 기간">
            <span data-v="period">{{ formatDate(lease.startDate) }} ~ {{ formatDate(lease.endDate) }}<template v-if="ongoing"> (D-{{ u.dDay }})</template></span>
          </InfoRow>
          <InfoRow v-if="lease.converted !== null && lease.converted !== undefined" label="환산 월세" emphasize>
            <span data-v="converted">{{ formatWon(lease.converted) }}</span>
          </InfoRow>
        </dl>
        <p v-if="data.conversion" class="note" data-v="rate-note">보증금을 {{ rateLabel(data.conversion) }}로 월세로 바꿔 더한 값이에요.</p>
        <p v-else class="note" data-v="rate-missing">{{ RATE_MISSING }}</p>
      </Card>
      <EmptyState v-else :icon="FileText" title="등록한 계약이 없어요" text="계약을 등록하면 만료일과 임대 수준을 볼 수 있어요." data-testid="lease-empty">
        <template #action>
          <Button variant="primary" :to="{ path: '/leases/new', query: { unitId: id, from: here } }" data-testid="lease-first">첫 계약 등록하기</Button>
        </template>
      </EmptyState>

      <!-- ② 매입과 시세 -->
      <SectionHead title="매입과 시세" />
      <Card data-testid="purchase-value">
        <dl class="rows">
          <InfoRow label="취득 연월"><span data-v="acquisition">{{ formatYmDot(u.acquisitionYm) }}</span></InfoRow>
          <InfoRow label="매입가"><span data-v="purchase">{{ formatWon(u.purchasePrice) }}</span></InfoRow>
          <template v-if="reference">
            <InfoRow label="최근 실거래 참고가" emphasize><span data-v="reference">{{ formatWon(reference.value) }}</span></InfoRow>
            <InfoRow label="기준일"><span data-v="reference-date">{{ formatDate(reference.referenceDate) }}</span></InfoRow>
            <InfoRow v-if="u.change" label="매입가 대비"><ChangeText :diff="u.change.diff" :rate="u.change.rate" data-v="change" /></InfoRow>
          </template>
        </dl>
        <ProgressLine v-if="collecting" class="gap" :done="u.progress?.done ?? 0" :total="u.progress?.total ?? 0" />
        <p v-else-if="!reference && u.status === 'failed'" class="muted">실거래 자료를 불러오지 못했어요. 자산 분석에서 새로고침해 주세요.</p>
        <p v-else-if="!reference" class="muted" data-v="no-reference">최근 12개월 안에 같은 면적 거래가 없어요</p>
      </Card>

      <!-- 자산 분석 -->
      <Card flush>
        <MenuRow :icon="ChartColumn" title="자산 분석" desc="주변 시세와 실거래 자세히 보기"
          :to="{ path: `/analysis/${u.buildingId}`, query: { unit: id, from: here } }" data-testid="menu-analysis" />
      </Card>
    </template>
  </Page>
</template>

<style scoped>
.rows { margin: 0; }
.gap { margin-top: var(--space-3); }
.note { margin: var(--space-2) 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
.muted { margin: var(--space-2) 0 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
</style>
