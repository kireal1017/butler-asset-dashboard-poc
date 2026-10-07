<script setup>
// 4.2 건물 관리
import { computed, onMounted, ref } from 'vue';
import { Building2 } from 'lucide-vue-next';
import {
  AddCard, AppHeader, BuildingCard, Button, EmptyState, FilterChips, NoticeBox, Page, SummaryCard, TextInput,
} from '../ui/index.js';
import { api } from '../utils/api.js';

const data = ref(null);
const error = ref('');
const query = ref('');
const filter = ref('ALL');

onMounted(async () => {
  try {
    data.value = await api('/buildings');
  } catch (e) {
    error.value = e.message;
  }
});

const items = computed(() => data.value?.items ?? []);
const summary = computed(() => data.value?.summary ?? { total: 0, operating: 0, registering: 0, check: 0 });
const chipOptions = computed(() => [
  { value: 'ALL', label: '전체', count: summary.value.total },
  { value: 'OPERATING', label: '운영 중', count: summary.value.operating },
  { value: 'REGISTERING', label: '등록 중', count: summary.value.registering },
  { value: 'CHECK', label: '확인 필요', count: summary.value.check },
]);
// 서버 호출 없이 이름·주소 포함 여부로 거른다
const shown = computed(() => {
  const q = query.value.trim().toLowerCase();
  return items.value.filter((b) => (filter.value === 'ALL' || b.status === filter.value)
    && (!q || `${b.name} ${b.complexName} ${b.address}`.toLowerCase().includes(q)));
});
</script>

<template>
  <Page testid="buildings">
    <AppHeader title="건물 관리" back="/">
      <template #action>
        <Button variant="primary" size="sm" to="/buildings/new" data-testid="building-add">+ 건물 추가</Button>
      </template>
    </AppHeader>

    <NoticeBox v-if="error" kind="error" :text="error" />

    <template v-if="data">
      <EmptyState v-if="!items.length" :icon="Building2" title="아직 등록한 건물이 없어요" text="건물을 등록하면 호실과 계약을 관리할 수 있어요." data-testid="buildings-empty">
        <template #action><Button variant="primary" to="/buildings/new">첫 건물 등록하기</Button></template>
      </EmptyState>

      <template v-else>
        <SummaryCard
          label="전체 건물"
          :value="`${summary.total}개`"
          :breakdown="[
            { label: '운영 중', value: summary.operating },
            { label: '등록 중', value: summary.registering },
            { label: '확인 필요', value: summary.check },
          ]"
          data-testid="buildings-summary"
        />
        <TextInput v-model="query" type="search" placeholder="건물 이름 또는 주소 검색" aria-label="건물 이름 또는 주소 검색" data-testid="buildings-search" />
        <FilterChips v-model="filter" :options="chipOptions" aria-label="건물 상태" />
        <div class="list" data-testid="buildings-list">
          <BuildingCard v-for="b in shown" :key="b.id" :building="b" :to="`/buildings/${b.id}`" />
          <p v-if="!shown.length" class="none">조건에 맞는 건물이 없어요.</p>
        </div>
        <AddCard title="새 건물 추가하기" desc="건물 정보를 등록하고 관리를 시작해요" to="/buildings/new" />
      </template>
    </template>
  </Page>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.none { margin: 0; padding: var(--space-4) 0; text-align: center; font-size: var(--fs-small); color: var(--text-secondary); }
</style>
