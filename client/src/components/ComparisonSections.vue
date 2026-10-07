<script setup>
// 개선 v2 비교 근거 3섹션 (docs/IMPROVEMENT-SPEC.md 3장). 참고 정보라 카드·그래프와 따로 불러온다.
// GET은 읽기만 한다. 빠진 달이 있으면 POST를 한 번 보내고, 수집 중인 동안만 폴링한다. 실패하면 "다시 시도"로만 재수집.
import { computed, onMounted, ref } from 'vue';
import ProgressBar from './ProgressBar.vue';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { formatManwon, formatYm } from '../utils/money.js';
import { formatAreaRange, formatAreas, formatFloor } from '../utils/format.js';

const props = defineProps({ assetId: { type: Number, required: true } });
const KEYS = ['sameFloor', 'sameComplex', 'neighborhood'];
const LIMIT = 5;

const data = ref(null);
const error = ref('');
const collectError = ref(''); // 수집 요청(POST) 자체가 실패한 경우. 다음 GET이 지우지 않는다.
const showAll = ref(false);
let posted = false;
let loading = false;

const poll = usePoll(load, 1500);

async function collect() {
  posted = true;
  try {
    await api(`/assets/${props.assetId}/comparisons/collect`, { method: 'POST' });
    collectError.value = '';
  } catch (e) {
    collectError.value = e.message;
  }
}

async function load() {
  if (loading) return; // 느린 응답이 겹쳐 오래된 진행률로 되돌아가지 않게
  loading = true;
  try {
    data.value = await api(`/assets/${props.assetId}/comparisons`);
    error.value = '';
  } catch (e) {
    error.value = e.message;
    poll.stop();
    return;
  } finally {
    loading = false;
  }
  const states = KEYS.map((k) => data.value[k].status);
  if (states.includes('missing') && !posted) await collect();
  if (states.includes('collecting') || (states.includes('missing') && !collectError.value)) poll.start();
  else poll.stop();
}

async function retry() {
  await collect();
  await load();
}

// 수집 요청이 실패한 채 빠진 달이 남은 섹션은 진행 막대 대신 실패 안내와 "다시 시도"를 보여 준다
const sec = computed(() => Object.fromEntries(KEYS.map((k) => {
  const v = data.value[k];
  return [k, v.status === 'missing' && collectError.value ? { ...v, status: 'failed', error: collectError.value } : v];
})));

onMounted(load);

const months = (n) => (n % 12 || n === 12 ? `최근 ${n}개월` : `최근 ${n / 12}년`);
const floorCond = computed(() => {
  const f = data.value?.sameFloor;
  if (!f) return [];
  const where = f.floorRange?.widened ? '±2층 기준' : formatFloor(f.floor);
  return [`같은 단지·같은 면적·${where}`, months(f.months)];
});
// 조건 표시는 덩어리 단위로만 줄바꿈한다 ("54.46~64.46㎡"가 ㎡ 앞에서 끊기지 않게)
const areaCond = (s, tail) => [...(s.areaRange ? [`전용 ${formatAreaRange(s.areaRange.min, s.areaRange.max)}`] : []), months(s.months), tail];
const pending = (s) => s.status === 'missing' || s.status === 'collecting';
const hoodList = computed(() => {
  const list = data.value?.neighborhood.complexes ?? [];
  return showAll.value ? list : list.slice(0, LIMIT);
});
</script>

<template>
  <div class="stack sections" data-testid="comparisons">
    <p v-if="error" class="card body-sm" role="alert">{{ error }}</p>

    <template v-if="data">
      <!-- [신규 1] 같은 층 거래 -->
      <section class="card stack" data-compare="sameFloor">
        <h2 class="title-sm">같은 층 거래 <span class="caption muted" data-v="cond"><span v-for="(p, i) in floorCond" :key="i" class="nb">{{ i ? ` · ${p}` : p }}</span></span></h2>
        <ProgressBar v-if="pending(sec.sameFloor)" testid="compare-progress" label="비교 자료를 불러오는 중"
          :done="sec.sameFloor.progress?.done ?? 0" :total="sec.sameFloor.progress?.total ?? 0" />
        <div v-else-if="sec.sameFloor.status === 'failed'" class="stack" role="alert">
          <p class="body-sm">실거래 자료를 불러오지 못했습니다. {{ sec.sameFloor.error }}</p>
          <button type="button" class="btn btn-secondary" data-testid="compare-retry" @click="retry">다시 시도</button>
        </div>
        <template v-else>
          <p v-if="!sec.sameFloor.count" class="body-sm muted" data-v="empty">최근 3년간 비슷한 층 거래가 없어요</p>
          <template v-else>
            <p class="caption muted">거래 <span data-v="count">{{ sec.sameFloor.count }}</span>건</p>
            <ul class="rows">
              <li v-for="(t, i) in sec.sameFloor.trades" :key="i" class="row between" data-row>
                <span class="body-sm"><span data-k="ym">{{ formatYm(t.ym) }}</span> · <span data-k="floor">{{ formatFloor(t.floor) }}</span>
                  <span v-if="t.direct" class="badge direct">직거래</span></span>
                <span class="title-sm" data-k="amount">{{ formatManwon(t.amount) }}</span>
              </li>
            </ul>
          </template>
        </template>
      </section>

      <!-- [신규 2] 같은 단지의 비슷한 면적 -->
      <section class="card stack" data-compare="sameComplex">
        <h2 class="title-sm">같은 단지의 비슷한 면적
          <span class="caption muted" data-v="cond"><span v-for="(p, i) in areaCond(sec.sameComplex, '단지 전체 기준')" :key="i" class="nb">{{ i ? ` · ${p}` : p }}</span></span></h2>
        <ProgressBar v-if="pending(sec.sameComplex)" testid="compare-progress" label="비교 자료를 불러오는 중"
          :done="sec.sameComplex.progress?.done ?? 0" :total="sec.sameComplex.progress?.total ?? 0" />
        <div v-else-if="sec.sameComplex.status === 'failed'" class="stack" role="alert">
          <p class="body-sm">실거래 자료를 불러오지 못했습니다. {{ sec.sameComplex.error }}</p>
          <button type="button" class="btn btn-secondary" data-testid="compare-retry" @click="retry">다시 시도</button>
        </div>
        <template v-else>
          <p v-if="!sec.sameComplex.linked" class="body-sm muted" data-v="empty">실거래 자료에서 이 단지를 찾지 못했어요</p>
          <p v-else-if="!sec.sameComplex.count" class="body-sm muted" data-v="empty">최근 12개월간 비슷한 면적 거래가 없어요</p>
          <template v-else>
            <p class="body-sm">중앙값 <span class="title-sm" data-v="median">{{ formatManwon(sec.sameComplex.median) }}</span>
              · 거래 <span data-v="count">{{ sec.sameComplex.count }}</span>건</p>
            <ul class="rows">
              <li v-for="(g, i) in sec.sameComplex.groups" :key="i" class="row between" data-row>
                <span class="label">
                  <span class="body-sm line"><span data-k="area">{{ formatAreas(g.areas) }}</span>
                    <span v-if="g.mine" class="badge mine" data-k="mine">내 면적</span></span>
                  <span class="caption muted line">최근 <span data-k="ym">{{ formatYm(g.latest.ym) }}</span> · <span data-k="count">{{ g.count }}건</span>
                    <span v-if="g.latest.direct" class="badge direct">직거래</span></span>
                </span>
                <span class="title-sm" data-k="amount">{{ formatManwon(g.latest.amount) }}</span>
              </li>
            </ul>
          </template>
        </template>
      </section>

      <!-- [신규 3] 같은 동네 비슷한 면적 단지 시세 -->
      <section class="card stack" data-compare="neighborhood">
        <h2 class="title-sm">{{ sec.neighborhood.dong }} 비슷한 면적 단지 시세
          <span class="caption muted" data-v="cond"><span v-for="(p, i) in areaCond(sec.neighborhood, '우리 단지 제외')" :key="i" class="nb">{{ i ? ` · ${p}` : p }}</span></span></h2>
        <ProgressBar v-if="pending(sec.neighborhood)" testid="compare-progress" label="비교 자료를 불러오는 중"
          :done="sec.neighborhood.progress?.done ?? 0" :total="sec.neighborhood.progress?.total ?? 0" />
        <div v-else-if="sec.neighborhood.status === 'failed'" class="stack" role="alert">
          <p class="body-sm">실거래 자료를 불러오지 못했습니다. {{ sec.neighborhood.error }}</p>
          <button type="button" class="btn btn-secondary" data-testid="compare-retry" @click="retry">다시 시도</button>
        </div>
        <template v-else>
          <p v-if="!sec.neighborhood.linked" class="body-sm muted" data-v="empty">내 단지를 실거래 자료에서 찾지 못해 동네 시세를 계산하지 않았어요</p>
          <p v-else-if="!sec.neighborhood.count" class="body-sm muted" data-v="empty">최근 12개월간 이 동네에 비슷한 면적 거래가 없어요</p>
          <template v-else>
            <p class="body-sm">중앙값 <span class="title-sm" data-v="median">{{ formatManwon(sec.neighborhood.median) }}</span>
              · 거래 <span data-v="count">{{ sec.neighborhood.count }}</span>건 · 단지 <span data-v="complexes">{{ sec.neighborhood.complexCount }}</span>곳</p>
            <ul class="rows">
              <li v-for="c in hoodList" :key="c.aptSeq" class="row between" data-row>
                <span class="label">
                  <span class="body-sm line" data-k="name">{{ c.name }}</span>
                  <span class="caption muted line">최근 <span data-k="ym">{{ formatYm(c.latest.ym) }}</span> · <span data-k="count">{{ c.count }}건</span>
                    <span v-if="c.latest.direct" class="badge direct">직거래</span></span>
                </span>
                <span class="title-sm" data-k="amount">{{ formatManwon(c.latest.amount) }}</span>
              </li>
            </ul>
            <button v-if="sec.neighborhood.complexes.length > LIMIT" type="button" class="btn btn-text more" data-testid="compare-more"
              :aria-expanded="showAll" @click="showAll = !showAll">
              {{ showAll ? '접기' : `더 보기 (${sec.neighborhood.complexes.length - LIMIT}곳)` }}</button>
          </template>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sections { gap: var(--s-md); }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-sm); }
.rows li { gap: var(--s-xs); }
.label { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rows .title-sm { flex-shrink: 0; }
.direct, .mine { margin-left: var(--s-xxs); padding: 2px 8px; }
.more { align-self: center; }
.nb { white-space: nowrap; }
</style>
