<script setup>
// 4.4 건물 상세
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ChartColumn, DoorOpen, PencilLine } from 'lucide-vue-next';
import {
  AppHeader, Button, Card, EmptyState, FilterChips, MenuRow, NoticeBox, Page, StatTiles, UnitCard,
} from '../ui/index.js';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { takeNotice } from '../utils/nav.js';

const route = useRoute();
const id = Number(route.params.id);
const data = ref(null);
const error = ref('');
const notice = ref(takeNotice());
const filter = ref('ALL');

// 호실 등록 직후 수집 중인 호실이 있으면 끝날 때까지 다시 읽는다
const poll = usePoll(load, 2000);
async function load() {
  try {
    data.value = await api(`/buildings/${id}`);
    error.value = '';
  } catch (e) {
    error.value = e.message;
    poll.stop();
    return;
  }
  if (data.value.units.some((u) => u.status === 'collecting')) poll.start();
  else poll.stop();
}
onMounted(load);

const b = computed(() => data.value?.building);
const units = computed(() => data.value?.units ?? []);
const group = (u) => (u.leaseStatus === 'LEASED' || u.leaseStatus === 'EXPIRING' ? 'LEASED' : u.leaseStatus);
const count = (g) => units.value.filter((u) => group(u) === g).length;
const tiles = computed(() => [
  { label: '임대 중', value: b.value?.unitStats.leased ?? 0 },
  { label: '공실', value: b.value?.unitStats.vacant ?? 0 },
  { label: '입주 예정', value: b.value?.unitStats.moveIn ?? 0 },
]);
const chipOptions = computed(() => [
  { value: 'ALL', label: '전체', count: units.value.length },
  { value: 'LEASED', label: '임대 중', count: count('LEASED') },
  { value: 'VACANT', label: '공실', count: count('VACANT') },
  { value: 'MOVE_IN', label: '입주 예정', count: count('MOVE_IN') },
]);
const shown = computed(() => units.value.filter((u) => filter.value === 'ALL' || group(u) === filter.value));
const here = computed(() => route.fullPath);
const leaseNew = (u) => ({ path: '/leases/new', query: { unitId: u.id, from: here.value } });
</script>

<template>
  <Page testid="building-detail">
    <AppHeader :title="b?.name ?? '건물'" :sub="b?.address ?? ''" back="/buildings">
      <template v-if="b" #action>
        <Button variant="primary" size="sm" :to="`/buildings/${id}/units/new`" data-testid="unit-add">+ 호실 등록</Button>
      </template>
    </AppHeader>

    <NoticeBox v-if="notice" kind="success" :text="notice" data-testid="success-notice" />
    <NoticeBox v-if="error" kind="error" :text="error" />

    <template v-if="data">
      <StatTiles :tiles="tiles" data-testid="unit-tiles" />

      <EmptyState v-if="!units.length" :icon="DoorOpen" title="아직 등록한 호실이 없어요" text="호실을 등록하면 계약과 시세를 관리할 수 있어요." data-testid="units-empty">
        <template #action><Button variant="primary" :to="`/buildings/${id}/units/new`">첫 호실 등록하기</Button></template>
      </EmptyState>
      <template v-else>
        <FilterChips v-model="filter" :options="chipOptions" aria-label="호실 상태" />
        <div class="list" data-testid="unit-list">
          <UnitCard v-for="u in shown" :key="u.id" :unit="u" :to="`/units/${u.id}`" :lease-to="leaseNew(u)" />
          <p v-if="!shown.length" class="none">이 상태의 호실이 없어요.</p>
        </div>
      </template>

      <Card flush>
        <MenuRow :icon="ChartColumn" title="자산 분석" desc="주변 시세와 내 건물 위치" :to="`/analysis/${id}?from=${encodeURIComponent(here)}`" data-testid="menu-analysis" />
        <MenuRow :icon="PencilLine" title="건물 정보 수정" desc="이름·보유 호실 수·메모 수정, 건물 삭제" :to="`/buildings/${id}/edit`" data-testid="menu-edit" />
      </Card>
    </template>
  </Page>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.none { margin: 0; padding: var(--space-4) 0; text-align: center; font-size: var(--fs-small); color: var(--text-secondary); }
</style>
