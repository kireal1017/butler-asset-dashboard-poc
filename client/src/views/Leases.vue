<script setup>
// 4.9 계약 관리. 정렬은 서버(만료 임박 → 임대 중 → 시작 전 → 종료, 같은 상태는 종료일이 가까운 순).
import { computed, onMounted, ref } from 'vue';
import { CircleAlert, FileText } from 'lucide-vue-next';
import {
  AppHeader, Button, EmptyState, FilterChips, LeaseCard, NoticeBox, Page, SummaryCard, TextInput, unitName,
} from '../ui/index.js';
import { api } from '../utils/api.js';

const data = ref(null);
const error = ref('');
const query = ref('');
const filter = ref('ALL');

onMounted(async () => {
  try {
    data.value = await api('/leases');
  } catch (e) {
    error.value = e.message;
  }
});

const items = computed(() => data.value?.items ?? []);
const count = (s) => items.value.filter((l) => l.status === s).length;
const chipOptions = computed(() => [
  { value: 'ALL', label: '전체', count: items.value.length },
  { value: 'ACTIVE', label: '임대 중', count: count('ACTIVE') },
  { value: 'EXPIRING', label: '만료 임박', count: count('EXPIRING') },
  { value: 'ENDED', label: '종료', count: count('ENDED') },
]);
const expiring = computed(() => count('EXPIRING'));
// 화면에서만 거른다: 건물명, 동·호, 임차인 이름
const shown = computed(() => {
  const q = query.value.trim().toLowerCase().replace(/\s+/g, '');
  return items.value.filter((l) => (filter.value === 'ALL' || l.status === filter.value)
    && (!q || `${l.buildingName}${unitName(l)}${l.dong}${l.ho}${l.tenantName ?? ''}`.toLowerCase().replace(/\s+/g, '').includes(q)));
});
const noUnits = computed(() => data.value && data.value.unitCount === 0);
const newLease = { path: '/leases/new', query: { from: '/leases' } };
</script>

<template>
  <Page testid="leases">
    <AppHeader title="계약 관리" back="/">
      <template v-if="data && !noUnits" #action>
        <Button variant="primary" size="sm" :to="newLease" data-testid="lease-add">+ 계약 추가</Button>
      </template>
    </AppHeader>
    <NoticeBox v-if="error" kind="error" :text="error" />

    <template v-if="data">
      <EmptyState v-if="!items.length" :icon="FileText" title="아직 등록한 계약이 없어요" text="호실에 계약을 등록하면 만료일을 챙겨드려요." data-testid="leases-empty">
        <template #action>
          <Button v-if="noUnits" variant="primary" to="/buildings" data-testid="go-buildings">건물 관리로 가기</Button>
          <Button v-else variant="primary" :to="newLease" data-testid="lease-first">첫 계약 등록하기</Button>
        </template>
      </EmptyState>

      <template v-else>
        <SummaryCard
          label="전체 계약"
          :value="`${items.length}건`"
          :breakdown="[
            { label: '임대 중', value: count('ACTIVE') },
            { label: '만료 임박', value: expiring },
            { label: '종료', value: count('ENDED') },
          ]"
          data-testid="leases-summary"
        />
        <NoticeBox v-if="expiring" kind="warning" :icon="CircleAlert" title="만료가 가까운 계약이 있어요" :text="`계약 ${expiring}건이 120일 안에 끝나요.`" data-testid="expiring-warning">
          <template #action>
            <Button size="sm" data-testid="show-expiring" @click="filter = 'EXPIRING'">해당 계약만 보기</Button>
          </template>
        </NoticeBox>
        <TextInput v-model="query" type="search" placeholder="건물, 호실, 임차인 이름 검색" aria-label="건물, 호실, 임차인 이름 검색" data-testid="leases-search" />
        <FilterChips v-model="filter" :options="chipOptions" aria-label="계약 상태" data-testid="lease-chips" />
        <div class="list" data-testid="lease-list">
          <LeaseCard v-for="l in shown" :key="l.id" :lease="l" :today="data.today" :to="{ path: `/leases/${l.id}/edit`, query: { from: '/leases' } }" />
          <p v-if="!shown.length" class="none">조건에 맞는 계약이 없어요.</p>
        </div>
      </template>
    </template>
  </Page>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.none { margin: 0; padding: var(--space-4) 0; text-align: center; font-size: var(--fs-small); color: var(--text-secondary); }
</style>
