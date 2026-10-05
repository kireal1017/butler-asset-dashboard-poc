<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Disclaimer from '../components/Disclaimer.vue';
import ProgressBar from '../components/ProgressBar.vue';
import YearMonthPicker from '../components/YearMonthPicker.vue';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { formatArea, formatFloor } from '../utils/format.js';

const router = useRouter();
const asOf = ref('');
const query = ref('');
const results = ref([]);
const complex = ref(null);
const dong = ref('');
const ho = ref('');
const lookup = ref(null); // 서버 응답 { status: 'auto' | 'manual', ... }
const manualArea = ref('');
const manualFloor = ref('');
const acquisitionYm = ref('');
const busy = ref('');
const error = ref('');
const progress = ref(null);

onMounted(async () => {
  asOf.value = (await api('/health')).asOf;
});

let searchTimer;
watch(query, (q) => {
  clearTimeout(searchTimer);
  if (complex.value && q === complex.value.name) return;
  complex.value = null;
  searchTimer = setTimeout(async () => {
    results.value = q.trim() ? (await api(`/complexes?query=${encodeURIComponent(q.trim())}`)).items : [];
  }, 200);
});

function pick(c) {
  complex.value = c;
  query.value = c.name;
  results.value = [];
  lookup.value = null;
}

watch([dong, ho], () => { lookup.value = null; });

const poll = usePoll(async () => {
  if (!complex.value) return;
  progress.value = (await api(`/collect/progress?job=${encodeURIComponent(`lookup:${complex.value.kaptCode}`)}`)).progress;
}, 800);

async function runLookup() {
  error.value = '';
  busy.value = 'lookup';
  progress.value = null;
  poll.start();
  try {
    const params = new URLSearchParams({ kaptCode: complex.value.kaptCode, dong: dong.value, ho: ho.value });
    lookup.value = await api(`/units/lookup?${params}`);
    if (lookup.value.status === 'manual') {
      manualArea.value = '';
      manualFloor.value = lookup.value.floorDefault ?? '';
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    poll.stop();
    busy.value = '';
  }
}

const canLookup = computed(() => complex.value && dong.value.trim() && ho.value.trim() && !busy.value);
const canSubmit = computed(() => lookup.value && !busy.value
  && (lookup.value.status === 'auto' || (manualArea.value && Number.isInteger(Number(manualFloor.value)) && manualFloor.value !== '')));

async function submit() {
  error.value = '';
  busy.value = 'submit';
  try {
    const body = { kaptCode: complex.value.kaptCode, dong: dong.value, ho: ho.value, acquisitionYm: acquisitionYm.value || null };
    if (lookup.value.status === 'manual') Object.assign(body, { areaSource: 'manual', areaU: Number(manualArea.value), floor: Number(manualFloor.value) });
    const { asset } = await api('/assets', { method: 'POST', body });
    if (asset.acquisition_ym) router.push(`/assets/${asset.id}/purchase?ym=${asset.acquisition_ym}`);
    else router.push('/');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <main class="page" data-testid="add-page">
    <header class="stack">
      <RouterLink to="/" class="btn btn-text back">← 내 자산</RouterLink>
      <h1 class="title-lg">자산 추가</h1>
    </header>

    <section class="stack">
      <label class="title-sm" for="complex-search">1. 단지 검색</label>
      <input id="complex-search" v-model="query" class="input" placeholder="단지명 일부 (예: 하계현대)" autocomplete="off" data-testid="complex-search" />
      <ul v-if="results.length" class="results card" data-testid="complex-results">
        <li v-for="c in results" :key="c.kaptCode">
          <button type="button" class="result" :data-kapt="c.kaptCode" @click="pick(c)">
            <span class="title-sm">{{ c.name }}</span>
            <span class="caption muted">{{ c.gu }} {{ c.umdName }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="query.trim() && !complex" class="caption muted">서울 단지 중 일치하는 이름이 없으면 공동주택관리정보시스템 미가입 단지일 수 있습니다.</p>
      <p v-if="complex" class="caption muted" data-testid="picked">{{ complex.gu }} {{ complex.umdName }} · {{ complex.name }}</p>
    </section>

    <section v-if="complex" class="stack">
      <span class="title-sm">2. 동·호 입력</span>
      <div class="row">
        <label class="unit"><input v-model="dong" class="input" inputmode="numeric" placeholder="동" data-testid="dong" /><span>동</span></label>
        <label class="unit"><input v-model="ho" class="input" inputmode="numeric" placeholder="호" data-testid="ho" /><span>호</span></label>
      </div>
      <button type="button" class="btn btn-secondary btn-block" :disabled="!canLookup" data-testid="lookup" @click="runLookup">전용면적·층 조회</button>
      <ProgressBar v-if="busy === 'lookup'" :done="progress?.done ?? 0" :total="progress?.total ?? 0" label="건축물대장과 실거래 자료를 확인하는 중" />
    </section>

    <section v-if="lookup" class="stack" data-testid="lookup-result">
      <span class="title-sm">3. 전용면적과 층</span>
      <div v-if="lookup.status === 'auto'" class="card-cream row between">
        <span>전용 <b data-testid="auto-area">{{ formatArea(lookup.areaU) }}</b></span>
        <span><b data-testid="auto-floor">{{ formatFloor(lookup.floor) }}</b></span>
        <span class="caption muted">건축물대장</span>
      </div>
      <div v-else class="stack">
        <p class="body-sm">{{ lookup.message }}</p>
        <label class="caption muted" for="manual-area">전용면적 (이 단지 실거래에 나온 면적)</label>
        <select id="manual-area" v-model="manualArea" class="input" data-testid="manual-area">
          <option value="" disabled>면적 선택</option>
          <option v-for="o in lookup.areaOptions" :key="o.areaU" :value="o.areaU">{{ formatArea(o.areaU) }} · 거래 {{ o.trades }}건</option>
        </select>
        <label class="caption muted" for="manual-floor">층 (호수에서 계산, 수정 가능)</label>
        <input id="manual-floor" v-model="manualFloor" class="input" inputmode="numeric" data-testid="manual-floor" />
      </div>
      <p v-if="lookup.ownerKnown === false" class="caption muted">동 소속을 확인할 수 없어 단지 전체 거래를 기준으로 계산합니다.</p>
    </section>

    <section v-if="lookup" class="stack">
      <span class="title-sm">4. 취득 연월 <span class="caption muted">(선택)</span></span>
      <YearMonthPicker v-if="asOf" v-model="acquisitionYm" :max-ym="asOf" />
      <p class="caption muted">입력하면 실거래가 자료에서 매입 거래를 찾아 "매입가 대비"를 보여드려요.</p>
    </section>

    <p v-if="error" class="card body-sm" role="alert" data-testid="error">{{ error }}</p>

    <button v-if="lookup" type="button" class="btn btn-primary btn-block" :disabled="!canSubmit" data-testid="submit" @click="submit">
      {{ busy === 'submit' ? '등록하는 중…' : '등록하고 불러오기' }}
    </button>
  </main>
  <Disclaimer />
</template>

<style scoped>
.back { align-self: flex-start; }
.results { list-style: none; margin: 0; padding: var(--s-xxs); max-height: 280px; overflow-y: auto; }
.result {
  width: 100%; min-height: 44px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: var(--s-xs) var(--s-sm); border: 0; background: transparent; border-radius: var(--r-sm); text-align: left; cursor: pointer;
}
.result:active { background: var(--c-surface-card); }
.unit { flex: 1; display: flex; align-items: center; gap: var(--s-xs); min-width: 0; }
.unit .input { min-width: 0; }
</style>
