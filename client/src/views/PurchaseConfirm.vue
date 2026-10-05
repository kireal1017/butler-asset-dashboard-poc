<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Disclaimer from '../components/Disclaimer.vue';
import ProgressBar from '../components/ProgressBar.vue';
import YearMonthPicker from '../components/YearMonthPicker.vue';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { formatManwon, formatYm } from '../utils/money.js';
import { formatArea, formatFloor } from '../utils/format.js';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const asOf = ref('');
const ym = ref(String(route.query.ym ?? ''));
const mode = ref('pick'); // pick | loading | one | many | none | manual
const result = ref(null);
const selected = ref(0);
const price = ref('');
const error = ref('');
const busy = ref(false);
const progress = ref(null);

const poll = usePoll(async () => {
  progress.value = (await api(`/collect/progress?job=match:${id}`)).progress;
}, 800);

async function search() {
  error.value = '';
  mode.value = 'loading';
  poll.start();
  try {
    result.value = await api(`/assets/${id}/purchase/candidates`, { method: 'POST', body: { acquisitionYm: ym.value } });
    const n = result.value.candidates.length;
    mode.value = n === 0 ? 'none' : n === 1 ? 'one' : 'many';
    selected.value = 0;
  } catch (e) {
    error.value = e.message;
    mode.value = 'pick';
  } finally {
    poll.stop();
  }
}

onMounted(async () => {
  asOf.value = (await api('/health')).asOf;
  if (ym.value) search();
});

const windowText = computed(() => (result.value ? `${formatYm(result.value.window.from)} ~ ${formatYm(result.value.window.to)}` : ''));
const priceNum = computed(() => Number(price.value));
const priceValid = computed(() => Number.isInteger(priceNum.value) && priceNum.value > 0);

async function confirmTrade(c) {
  busy.value = true;
  error.value = '';
  try {
    await api(`/assets/${id}/purchase`, { method: 'PUT', body: { source: 'matched', acquisitionYm: ym.value, trade: c } });
    router.push(`/assets/${id}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function saveManual() {
  busy.value = true;
  error.value = '';
  try {
    await api(`/assets/${id}/purchase`, { method: 'PUT', body: { source: 'manual', acquisitionYm: ym.value, price: priceNum.value } });
    router.push(`/assets/${id}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function skip() {
  try {
    await api(`/assets/${id}/purchase`, { method: 'DELETE' });
  } finally {
    router.push('/');
  }
}
</script>

<template>
  <main class="page" data-testid="purchase-page">
    <header class="stack">
      <RouterLink :to="`/assets/${id}`" class="btn btn-text back">← 자산 상세</RouterLink>
      <h1 class="title-lg">매입 거래 확인</h1>
    </header>

    <section v-if="mode === 'pick'" class="stack">
      <span class="title-sm">취득 연월</span>
      <YearMonthPicker v-if="asOf" v-model="ym" :max-ym="asOf" />
      <button type="button" class="btn btn-primary btn-block" :disabled="ym.length !== 6" data-testid="search-candidates" @click="search">매입 거래 찾기</button>
    </section>

    <ProgressBar v-else-if="mode === 'loading'" :done="progress?.done ?? 0" :total="progress?.total ?? 0" label="검색 기간의 실거래 자료를 확인하는 중" />

    <template v-else>
      <p class="body-sm muted" data-testid="window">검색 기간 {{ windowText }} · 같은 단지·같은 면적·같은 층 거래 {{ result.candidates.length }}건</p>

      <section v-if="mode === 'one'" class="stack" data-testid="one-candidate">
        <h2 class="title-md">이 거래가 맞나요?</h2>
        <div class="card-cream stack candidate">
          <p class="amount-lg">{{ formatManwon(result.candidates[0].amount) }}</p>
          <p class="body-sm">{{ formatYm(result.candidates[0].ym) }} 계약 · {{ formatFloor(result.candidates[0].floor) }} · 전용 {{ formatArea(result.candidates[0].areaU) }}
            <span v-if="result.candidates[0].direct" class="badge">직거래</span></p>
        </div>
        <button type="button" class="btn btn-primary btn-block" :disabled="busy" data-testid="confirm-yes" @click="confirmTrade(result.candidates[0])">맞아요</button>
        <button type="button" class="btn btn-secondary btn-block" data-testid="confirm-no" @click="mode = 'manual'">아니에요, 직접 입력</button>
      </section>

      <section v-else-if="mode === 'many'" class="stack" data-testid="many-candidates">
        <h2 class="title-md">어떤 거래인가요?</h2>
        <label v-for="(c, i) in result.candidates" :key="i" class="card choice" :class="{ on: selected === i }">
          <input v-model="selected" type="radio" name="cand" :value="i" :data-testid="`cand-${i}`" />
          <span class="stack grow">
            <span class="title-md">{{ formatManwon(c.amount) }}</span>
            <span class="caption muted">{{ formatYm(c.ym) }}.{{ String(c.day).padStart(2, '0') }} 계약 · {{ formatFloor(c.floor) }} · 전용 {{ formatArea(c.areaU) }}{{ c.dongMatch ? ` · ${c.dong}동` : '' }}</span>
          </span>
          <span v-if="c.direct" class="badge">직거래</span>
        </label>
        <button type="button" class="btn btn-primary btn-block" :disabled="busy" data-testid="confirm-selected" @click="confirmTrade(result.candidates[selected])">이 거래로 저장</button>
        <button type="button" class="btn btn-secondary btn-block" data-testid="not-listed" @click="mode = 'manual'">여기에 없어요, 직접 입력</button>
      </section>

      <section v-if="mode === 'none' || mode === 'manual'" class="stack" data-testid="manual-entry">
        <template v-if="mode === 'none'">
          <h2 class="title-md">거래를 찾지 못했어요</h2>
          <p class="body-sm">상속, 증여, 분양이거나 실거래가 공개 이전의 취득은 자료에 없습니다. 매입가를 직접 입력해 주세요.</p>
        </template>
        <h2 v-else class="title-md">매입가 직접 입력</h2>
        <label class="caption muted" for="price">매입가 (만원)</label>
        <input id="price" v-model="price" class="input" inputmode="numeric" placeholder="예: 43000" data-testid="manual-price" />
        <p v-if="priceValid" class="body-sm" data-testid="manual-price-preview">{{ formatManwon(priceNum) }}</p>
        <button type="button" class="btn btn-primary btn-block" :disabled="!priceValid || busy" data-testid="save-manual" @click="saveManual">저장</button>
        <button type="button" class="btn btn-secondary btn-block" data-testid="skip" @click="skip">건너뛰기</button>
      </section>
    </template>

    <p v-if="error" class="card body-sm" role="alert">{{ error }}</p>
  </main>
  <Disclaimer />
</template>

<style scoped>
.back { align-self: flex-start; }
.candidate { gap: var(--s-xs); }
.amount-lg { font: 500 28px/1.15 var(--font-display); letter-spacing: var(--ls-display); }
.choice { display: flex; align-items: center; gap: var(--s-sm); padding: var(--s-md); cursor: pointer; }
.choice.on { border-color: var(--c-ink); }
.choice input { width: 20px; height: 20px; accent-color: var(--c-ink); flex: none; }
.grow { flex: 1; gap: 2px; min-width: 0; }
</style>
