<script setup>
// 4.8 자산 분석 — 상세: ① 내 건물 ② 주변 전월세 ③ 매매 시세 ④ 건축물대장
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DoorOpen } from 'lucide-vue-next';
import {
  AppHeader, Button, Card, ChangeText, CompareSections, EmptyState, FilterChips, InfoRow, NoticeBox, Page, PriceBar,
  ProgressLine, SectionHead, formatDate, formatFloorKo, formatWon, formatYmDot, unitName,
} from '../ui/index.js';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { fromOr } from '../utils/nav.js';
import MyBuildingCard from '../analysis/MyBuildingCard.vue';
import NearbyRentCard from '../analysis/NearbyRentCard.vue';
import BuildingSpecCard from '../analysis/BuildingSpecCard.vue';

const route = useRoute();
const router = useRouter();
const buildingId = Number(route.params.buildingId);
const data = ref(null);
const error = ref('');

onMounted(async () => {
  try {
    data.value = await api(`/buildings/${buildingId}`);
  } catch (e) {
    error.value = e.message;
  }
});

const b = computed(() => data.value?.building);
const units = computed(() => data.value?.units ?? []);
const back = computed(() => fromOr(route, '/analysis'));

// 호실 선택: 기본은 첫 호실, 호실 상세에서 오면 그 호실(query.unit)
const selected = computed(() => {
  const q = Number(route.query.unit);
  return units.value.find((u) => u.id === q)?.id ?? units.value[0]?.id ?? null;
});
const chipOptions = computed(() => units.value.map((u) => ({ value: u.id, label: unitName(u) })));
function selectUnit(id) {
  router.replace({ query: { ...route.query, unit: id } });
}

// ---- 카드 ③ 매매 시세 ----
const value = ref(null);
const valueError = ref('');
const refreshing = ref(false);
const refreshMsg = ref('');
let loadSeq = 0;

const poll = usePoll(loadValue, 1500);
async function loadValue() {
  const id = selected.value;
  if (!id) return;
  const seq = ++loadSeq;
  try {
    const v = await api(`/units/${id}/value`);
    if (seq !== loadSeq || id !== selected.value) return;
    value.value = v;
    valueError.value = '';
    if (v.status === 'collecting') poll.start();
    else {
      poll.stop();
      refreshing.value = false;
    }
  } catch (e) {
    if (seq !== loadSeq) return;
    valueError.value = e.message;
    poll.stop();
    refreshing.value = false;
  }
}
watch(selected, (id) => {
  poll.stop();
  value.value = null;
  refreshing.value = false;
  refreshMsg.value = '';
  if (id) loadValue();
}, { immediate: true });

async function refresh() {
  refreshMsg.value = '';
  refreshing.value = true;
  try {
    await api(`/units/${selected.value}/value/refresh`, { method: 'POST' });
    await loadValue();
    poll.start();
  } catch (e) {
    refreshMsg.value = e.message;
    refreshing.value = false;
  }
}

const v = computed(() => value.value);
const reference = computed(() => v.value?.reference ?? null);
const collectingFirst = computed(() => v.value && !reference.value && ['collecting', 'missing'].includes(v.value.status));
const running = computed(() => refreshing.value || v.value?.status === 'collecting');
const periodText = (p) => (p.count ? `${formatWon(p.average)} (${p.count}건)` : '거래 없음');

// ---- 카드 ①·②·④ — 화면에 들어올 때 수집을 한 번 요청하고(POST), 준비될 때까지 GET으로 확인한다 ----
const analysis = ref(null);
const analysisError = ref('');
const specRetrying = ref(false);
const POLL_LIMIT = 60; // 1.5초 × 60 = 90초 뒤에는 멈춘다
let ticks = 0;
let analysisSeq = 0;

const analysisPoll = usePoll(loadAnalysis, 1500);
const pending = (a) => ['collecting', 'missing'].includes(a.nearby?.status) || a.spec.status === 'missing' || !a.conversion;
async function loadAnalysis() {
  const seq = ++analysisSeq;
  try {
    const a = await api(`/buildings/${buildingId}/analysis${selected.value ? `?unit=${selected.value}` : ''}`);
    if (seq !== analysisSeq) return;
    analysis.value = a;
    analysisError.value = '';
    if (pending(a) && ++ticks < POLL_LIMIT) analysisPoll.start();
    else analysisPoll.stop();
  } catch (e) {
    if (seq !== analysisSeq) return;
    analysisError.value = e.message;
    analysisPoll.stop();
  }
}
async function collectAnalysis() {
  ticks = 0;
  try {
    await api(`/buildings/${buildingId}/analysis/collect`, { method: 'POST' });
  } catch (e) {
    analysisError.value = e.message;
  }
  await loadAnalysis();
}
onMounted(collectAnalysis);
// 건물 정보가 늦게 와서 호실이 null → id로 바뀔 때도 그 호실로 다시 읽는다
watch(selected, (id, prev) => {
  if (id === prev) return;
  ticks = 0;
  loadAnalysis();
});
async function retrySpec() {
  specRetrying.value = true;
  try {
    await api(`/buildings/${buildingId}/spec/refresh`, { method: 'POST' });
  } catch (e) {
    analysisError.value = e.message;
  }
  specRetrying.value = false;
  await loadAnalysis();
}
const leaseLink = computed(() => ({ path: '/leases/new', query: { ...(selected.value ? { unitId: selected.value } : {}), from: route.fullPath } }));
const baseYear = computed(() => Number(String(analysis.value?.asOf ?? '').slice(0, 4)));
</script>

<template>
  <Page testid="analysis-detail">
    <AppHeader :title="b?.name ?? '자산 분석'" :sub="b?.address ?? ''" :back="back" />
    <NoticeBox v-if="error" kind="error" :text="error" />

    <template v-if="data">
      <EmptyState v-if="!units.length" :icon="DoorOpen" title="등록한 호실이 없어요" text="호실을 등록하면 시세를 분석해 드려요." data-testid="analysis-no-units">
        <template #action><Button variant="primary" :to="`/buildings/${buildingId}/units/new`">호실 등록하기</Button></template>
      </EmptyState>

      <template v-else>
        <FilterChips v-if="units.length > 1" :model-value="selected" :options="chipOptions" aria-label="호실 선택" data-testid="unit-chips" @update:model-value="selectUnit" />
        <NoticeBox v-if="analysisError" kind="error" :text="analysisError" />

        <!-- ① 내 건물 · ② 주변 전월세 시세 -->
        <template v-if="analysis">
          <MyBuildingCard :my-building="analysis.myBuilding" :conversion="analysis.conversion" :lease-link="leaseLink" />
          <NearbyRentCard v-if="analysis.nearby" :nearby="analysis.nearby" @retry="collectAnalysis" />
        </template>

        <!-- ③ 매매 시세 -->
        <SectionHead title="매매 시세">
          <template #action>
            <Button size="sm" :loading="running" :disabled="!v" data-testid="value-refresh" @click="refresh">새로고침</Button>
          </template>
        </SectionHead>
        <NoticeBox v-if="refreshMsg" kind="error" :text="refreshMsg" data-testid="refresh-error" />
        <NoticeBox v-if="valueError" kind="error" :text="valueError" />

        <Card v-if="v" data-testid="sale-card" :data-unit="selected">
          <!-- 1·2 참고가와 근거 -->
          <ProgressLine v-if="collectingFirst" :done="v.progress?.done ?? 0" :total="v.progress?.total ?? 0" />
          <template v-else-if="reference">
            <p class="ref__label">최근 실거래 참고가</p>
            <p class="ref__value" data-v="reference">{{ formatWon(reference.value) }}</p>
            <p class="ref__basis" data-v="basis">기준일 {{ formatDate(reference.referenceDate) }} · 같은 단지·같은 면적 최근 거래 {{ reference.count }}건 기준</p>
          </template>
          <p v-else class="muted" data-v="no-reference">최근 12개월 안에 같은 면적 거래가 없어요</p>

          <!-- 3 매입 -->
          <dl class="rows block">
            <InfoRow label="취득 연월"><span data-v="acquisition">{{ formatYmDot(v.acquisitionYm) }}</span></InfoRow>
            <InfoRow label="매입가"><span data-v="purchase">{{ formatWon(v.purchasePrice) }}</span></InfoRow>
            <InfoRow v-if="v.change" label="매입가 대비"><ChangeText :diff="v.change.diff" :rate="v.change.rate" data-v="change" /></InfoRow>
          </dl>

          <!-- 4 기간별 실거래 평균 -->
          <section class="part" data-testid="period-averages">
            <h3 class="part__title">기간별 실거래 평균</h3>
            <p class="part__note">같은 단지·같은 면적 기준이에요. 실거래 신고가 늦게 올라와 최근 1개월은 건수가 적을 수 있어요.</p>
            <dl class="rows">
              <InfoRow v-for="p in v.periodAverages" :key="p.months" :label="`최근 ${p.months}개월`">
                <span :data-v="`avg-${p.months}`">{{ periodText(p) }}</span>
              </InfoRow>
            </dl>
          </section>

          <!-- 5 가격 위치 막대 -->
          <section class="part">
            <h3 class="part__title">가격 위치</h3>
            <PriceBar :bar="v.bar" :range="v.range" :purchase="v.purchasePrice" :reference="reference?.value ?? null" />
          </section>

          <!-- 6 비교 3가지 -->
          <section class="part part--flush">
            <CompareSections :key="selected" :unit-id="selected" />
          </section>

          <!-- 7 최근 실거래 -->
          <section class="part" data-testid="recent-trades">
            <h3 class="part__title">최근 실거래</h3>
            <p v-if="!v.recentTrades.length" class="muted" data-v="recent-empty">최근 12개월 안에 같은 면적 거래가 없어요.</p>
            <ul v-else class="trades">
              <li v-for="(t, i) in v.recentTrades" :key="i" class="trade" data-row>
                <span class="trade__date" data-k="date">{{ formatDate(`${t.ym}${String(t.day).padStart(2, '0')}`) }}</span>
                <span class="trade__floor" data-k="floor">{{ formatFloorKo(t.floor) }}<span v-if="t.direct" class="tag">직거래</span></span>
                <span class="trade__amt" data-k="amount">{{ formatWon(t.amount) }}</span>
              </li>
            </ul>
          </section>

          <p class="source">출처 국토교통부 실거래가</p>
        </Card>

        <!-- ④ 건축물대장 -->
        <BuildingSpecCard v-if="analysis" :spec="analysis.spec" :base-year="baseYear" :retrying="specRetrying" @retry="retrySpec" />
      </template>
    </template>
  </Page>
</template>

<style scoped>
.ref__label { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.ref__value {
  margin: 2px 0 0;
  font-size: var(--fs-display);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}
.ref__basis { margin: var(--space-1) 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.muted { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.rows { margin: 0; }
.block { margin-top: var(--space-3); }
.part { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border-default); min-width: 0; }
.part--flush { padding-top: 0; }
.part__title { margin: 0; font-size: var(--fs-body); font-weight: var(--fw-semibold); line-height: var(--lh-body); }
.part__note { margin: 2px 0 var(--space-1); font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
.part__title + .pbar, .part__title + .muted, .part__title + .trades { margin-top: var(--space-2); }
.trades { list-style: none; margin: var(--space-2) 0 0; padding: 0; }
.trade {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  min-height: 40px;
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}
.trade + .trade { border-top: 1px solid var(--border-subtle); }
.trade__date { color: var(--text-secondary); }
.trade__floor { color: var(--text-primary); }
.trade__amt { font-size: var(--fs-body); font-weight: var(--fw-semibold); white-space: nowrap; }
.tag {
  display: inline-block;
  margin-left: var(--space-1);
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-subtle);
  font-size: var(--fs-caption);
  line-height: 18px;
  color: var(--text-secondary);
}
.source { margin: var(--space-4) 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
</style>
