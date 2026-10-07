<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChangeChip from '../components/ChangeChip.vue';
import Disclaimer from '../components/Disclaimer.vue';
import ProgressBar from '../components/ProgressBar.vue';
import TrendChart from '../components/TrendChart.vue';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { formatManwon, formatYm } from '../utils/money.js';
import { formatArea, formatFloor, formatYmd } from '../utils/format.js';

const RANGE_LABEL = { '1y': '1년', '3y': '3년', '5y': '5년', '10y': '10년', hold: '보유' };
const CHART_KINDS = [['step', '계단'], ['line', '선'], ['bar', '막대']];

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const detail = ref(null);
const series = ref(null);
const range = ref('1y');
const chartKind = ref('step');
const loadingRange = ref('');
const progress = ref(null);
const error = ref('');
const confirmDelete = ref('');

const asset = computed(() => detail.value?.asset);

async function loadDetail() {
  try {
    detail.value = await api(`/assets/${id}`);
    if (detail.value.asset.status === 'collecting') detailPoll.start();
    else detailPoll.stop();
  } catch (e) {
    error.value = e.message;
    detailPoll.stop();
  }
}
const detailPoll = usePoll(loadDetail, 1500);

const seriesPoll = usePoll(async () => {
  progress.value = (await api(`/assets/${id}/progress?range=${loadingRange.value}`)).progress;
}, 800);

async function loadSeries(r) {
  range.value = r;
  loadingRange.value = r;
  progress.value = null;
  error.value = '';
  seriesPoll.start();
  try {
    const s = await api(`/assets/${id}/series?range=${r}`);
    if (range.value === r) series.value = s;
    await loadDetail();
  } catch (e) {
    error.value = e.message;
  } finally {
    seriesPoll.stop();
    loadingRange.value = '';
  }
}

onMounted(async () => {
  await loadDetail();
  if (detail.value) loadSeries('1y');
});

async function removePurchase() {
  await api(`/assets/${id}/purchase`, { method: 'DELETE' });
  confirmDelete.value = '';
  if (range.value === 'hold') range.value = '1y';
  await loadDetail();
  loadSeries(range.value);
}

async function removeAsset() {
  await api(`/assets/${id}`, { method: 'DELETE' });
  router.push('/');
}

const purchaseLine = computed(() => {
  const p = asset.value?.purchase;
  if (!p) return '';
  return p.source === 'matched' ? `${formatYmd(p.date)} 계약 · ${formatFloor(asset.value.floor)}` : `취득 ${formatYm(p.ym)}`;
});
</script>

<template>
  <main v-if="asset" class="page" :data-asset-id="asset.id" data-testid="detail">
    <header class="stack head">
      <RouterLink to="/" class="btn btn-text back">← 내 자산</RouterLink>
      <h1 class="title-lg">{{ asset.complexName }}</h1>
      <p class="body-sm muted">{{ asset.dong }}동 {{ asset.ho }}호 · 전용 {{ formatArea(asset.areaU) }} · {{ formatFloor(asset.floor) }}</p>
    </header>

    <section class="stack summary">
      <template v-if="asset.current">
        <p class="caption muted">최근 실거래가 · <span data-testid="deal-ym">{{ formatYm(asset.current.ym) }} 거래</span>
          <span v-if="asset.current.direct" class="badge direct">직거래</span></p>
        <p class="amount-xl" data-testid="current-price">{{ formatManwon(asset.current.amount) }}</p>
        <div v-if="asset.change"><ChangeChip :change="asset.change" /></div>
      </template>
      <ProgressBar v-else-if="asset.status === 'collecting'" :done="asset.progress?.done ?? 0" :total="asset.progress?.total ?? 0" />
      <p v-else class="body-sm muted" data-testid="no-trades">저장된 기간에 같은 면적의 거래 내역이 없습니다.</p>
      <p v-if="asset.ownerKnown === false" class="caption muted">동 소속을 확인할 수 없어 단지 전체 거래 기준입니다.</p>
    </section>

    <section class="stack chart-block">
      <div class="kinds" role="radiogroup" aria-label="그래프 형태">
        <button v-for="[k, label] in CHART_KINDS" :key="k" type="button" class="kind" role="radio" :aria-checked="chartKind === k"
          :data-kind="k" @click="chartKind = k">{{ label }}</button>
      </div>
      <TrendChart v-if="series" :points="series.points" :purchase="series.purchase" :kind="chartKind" />
      <p v-if="series && chartKind !== 'step'" class="caption muted">{{ chartKind === 'bar' ? '막대: 거래가 있는 달의 마지막 거래 금액' : '선: 실제 거래 금액을 시간순으로 연결' }}</p>
      <ProgressBar v-if="loadingRange" :done="progress?.done ?? 0" :total="progress?.total ?? 0" :label="`${RANGE_LABEL[loadingRange]} 자료를 불러오는 중`" />
      <div class="tabs" role="tablist" aria-label="기간">
        <button v-for="r in detail.ranges" :key="r" type="button" class="tab" role="tab" :aria-selected="range === r" :data-range="r"
          :disabled="Boolean(loadingRange)" @click="loadSeries(r)">{{ RANGE_LABEL[r] }}</button>
      </div>
    </section>

    <p v-if="error" class="card body-sm" role="alert">{{ error }}</p>

    <section class="card stack" data-testid="purchase">
      <h2 class="title-sm">내 매입 거래</h2>
      <template v-if="asset.purchase">
        <p class="title-md" data-testid="purchase-price">{{ formatManwon(asset.purchase.price) }}</p>
        <p class="body-sm muted">{{ purchaseLine }} <span class="badge">{{ asset.purchase.source === 'matched' ? '자동 매칭' : '직접 입력' }}</span></p>
        <div class="row">
          <RouterLink :to="`/assets/${id}/purchase?ym=${asset.acquisitionYm ?? asset.purchase.ym}`" class="btn btn-secondary" data-testid="edit-purchase">수정</RouterLink>
          <button v-if="confirmDelete !== 'purchase'" type="button" class="btn btn-secondary" data-testid="delete-purchase" @click="confirmDelete = 'purchase'">삭제</button>
          <template v-else>
            <button type="button" class="btn btn-primary" data-testid="delete-purchase-confirm" @click="removePurchase">매입가 삭제</button>
            <button type="button" class="btn btn-text" @click="confirmDelete = ''">취소</button>
          </template>
        </div>
      </template>
      <template v-else>
        <p class="body-sm muted">취득 연월을 입력하면 매입 거래를 찾아 매입가 대비를 보여드려요.</p>
        <RouterLink :to="`/assets/${id}/purchase`" class="btn btn-secondary" data-testid="enter-acquisition">취득 연월 입력</RouterLink>
      </template>
    </section>

    <section class="card stack" data-testid="recent-trades">
      <h2 class="title-sm">최근 거래 <span class="caption muted">같은 단지·같은 면적</span></h2>
      <p v-if="!detail.recentTrades.length" class="body-sm muted">거래 내역 없음</p>
      <ul v-else class="trades">
        <li v-for="(t, i) in detail.recentTrades" :key="i" class="row between" data-testid="recent-trade">
          <span class="body-sm"><span data-k="ym">{{ formatYm(t.ym) }}</span> · <span data-k="floor">{{ formatFloor(t.floor) }}</span>
            <span v-if="t.direct" class="badge direct">직거래</span></span>
          <span class="title-sm" data-k="amount">{{ formatManwon(t.amount) }}</span>
        </li>
      </ul>
    </section>

    <section class="card stack" data-testid="building">
      <h2 class="title-sm">건물 정보</h2>
      <dl class="info">
        <dt>준공 연도</dt><dd>{{ detail.building.useYear ? `${detail.building.useYear}년` : '정보 없음' }}</dd>
        <dt>세대수</dt><dd>{{ detail.building.households ? `${detail.building.households.toLocaleString()}세대` : '정보 없음' }}</dd>
        <dt>주차 대수</dt><dd>{{ detail.building.parking !== null ? `${detail.building.parking.toLocaleString()}대` : '정보 없음' }}</dd>
      </dl>
    </section>

    <section class="stack">
      <button v-if="confirmDelete !== 'asset'" type="button" class="btn btn-text danger" data-testid="delete-asset" @click="confirmDelete = 'asset'">자산 삭제</button>
      <div v-else class="card-cream stack" role="alertdialog" aria-label="자산 삭제 확인">
        <p class="body-sm">이 자산과 매입 정보를 삭제할까요?</p>
        <div class="row">
          <button type="button" class="btn btn-primary" data-testid="delete-asset-confirm" @click="removeAsset">삭제</button>
          <button type="button" class="btn btn-secondary" @click="confirmDelete = ''">취소</button>
        </div>
      </div>
    </section>
  </main>
  <main v-else class="page">
    <RouterLink to="/" class="btn btn-text">← 내 자산</RouterLink>
    <p v-if="error" class="card body-sm" role="alert">{{ error }}</p>
  </main>
  <Disclaimer />
</template>

<style scoped>
.back { align-self: flex-start; }
.head { gap: var(--s-xxs); }
.summary { gap: var(--s-xs); }
.chart-block { gap: var(--s-sm); }
.kinds { align-self: flex-end; display: flex; gap: 2px; padding: 2px; border-radius: var(--r-pill); background: var(--c-surface-card); }
.kind {
  min-height: 44px; padding: 4px 16px; border: 0; border-radius: var(--r-pill);
  background: transparent; color: var(--c-muted); font: var(--t-caption); cursor: pointer;
}
.kind[aria-checked='true'] { background: var(--c-canvas); color: var(--c-ink); box-shadow: 0 0 0 1px var(--c-hairline); }
.direct { margin-left: var(--s-xxs); padding: 2px 8px; }
.trades { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-sm); }
.info { display: grid; grid-template-columns: auto 1fr; gap: var(--s-xs) var(--s-md); margin: 0; font: var(--t-body-sm); }
.info dt { color: var(--c-muted); }
.info dd { margin: 0; text-align: right; }
.danger { align-self: center; color: var(--c-body); text-decoration: underline; }
</style>
