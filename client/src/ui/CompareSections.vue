<script setup>
// 비교 3가지 (v2 ComparisonSections를 v3 디자인으로 옮김, 로직·표시 값 그대로).
// 매매 시세 카드 안에 들어가므로 카드가 아니라 구분선으로 나눈 소단락으로 그린다(카드 안 카드 금지).
// GET은 읽기만 한다. 빠진 달이 있으면 POST를 한 번 보내고, 수집 중인 동안만 폴링한다. 실패하면 "다시 시도"로만 재수집.
import { computed, onMounted, ref } from 'vue';
import Button from './Button.vue';
import ProgressLine from './ProgressLine.vue';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { formatManwon, formatYm } from '../utils/money.js';
import { formatAreaRange, formatAreas, formatFloor } from '../utils/format.js';

const props = defineProps({ unitId: { type: Number, required: true } });
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
    await api(`/units/${props.unitId}/comparisons/collect`, { method: 'POST' });
    collectError.value = '';
  } catch (e) {
    collectError.value = e.message;
  }
}

async function load() {
  if (loading) return; // 느린 응답이 겹쳐 오래된 진행률로 되돌아가지 않게
  loading = true;
  try {
    data.value = await api(`/units/${props.unitId}/comparisons`);
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
  <div class="cmp" data-testid="comparisons">
    <p v-if="error" class="cmp__msg" role="alert">{{ error }}</p>

    <template v-if="data">
      <!-- 같은 층 거래 -->
      <section class="cmp__sec" data-compare="sameFloor">
        <h3 class="cmp__title">같은 층 거래</h3>
        <p class="cmp__cond" data-v="cond"><span v-for="(p, i) in floorCond" :key="i" class="nb">{{ i ? ` · ${p}` : p }}</span></p>
        <ProgressLine v-if="pending(sec.sameFloor)" label="비교 자료를 불러오는 중이에요"
          :done="sec.sameFloor.progress?.done ?? 0" :total="sec.sameFloor.progress?.total ?? 0" />
        <div v-else-if="sec.sameFloor.status === 'failed'" class="cmp__fail" role="alert">
          <p class="cmp__msg">실거래 자료를 불러오지 못했어요. {{ sec.sameFloor.error }}</p>
          <Button size="sm" data-testid="compare-retry" @click="retry">다시 시도</Button>
        </div>
        <template v-else>
          <p v-if="!sec.sameFloor.count" class="cmp__msg" data-v="empty">최근 3년간 비슷한 층 거래가 없어요</p>
          <template v-else>
            <p class="cmp__stat">거래 <span data-v="count">{{ sec.sameFloor.count }}</span>건</p>
            <ul class="cmp__rows">
              <li v-for="(t, i) in sec.sameFloor.trades" :key="i" class="cmp__row" data-row>
                <span class="cmp__left"><span data-k="ym">{{ formatYm(t.ym) }}</span> · <span data-k="floor">{{ formatFloor(t.floor) }}</span>
                  <span v-if="t.direct" class="cmp__tag">직거래</span></span>
                <span class="cmp__amt" data-k="amount">{{ formatManwon(t.amount) }}</span>
              </li>
            </ul>
          </template>
        </template>
      </section>

      <!-- 같은 단지의 비슷한 면적 -->
      <section class="cmp__sec" data-compare="sameComplex">
        <h3 class="cmp__title">같은 단지의 비슷한 면적</h3>
        <p class="cmp__cond" data-v="cond"><span v-for="(p, i) in areaCond(sec.sameComplex, '단지 전체 기준')" :key="i" class="nb">{{ i ? ` · ${p}` : p }}</span></p>
        <ProgressLine v-if="pending(sec.sameComplex)" label="비교 자료를 불러오는 중이에요"
          :done="sec.sameComplex.progress?.done ?? 0" :total="sec.sameComplex.progress?.total ?? 0" />
        <div v-else-if="sec.sameComplex.status === 'failed'" class="cmp__fail" role="alert">
          <p class="cmp__msg">실거래 자료를 불러오지 못했어요. {{ sec.sameComplex.error }}</p>
          <Button size="sm" data-testid="compare-retry" @click="retry">다시 시도</Button>
        </div>
        <template v-else>
          <p v-if="!sec.sameComplex.linked" class="cmp__msg" data-v="empty">실거래 자료에서 이 단지를 찾지 못했어요</p>
          <p v-else-if="!sec.sameComplex.count" class="cmp__msg" data-v="empty">최근 12개월간 비슷한 면적 거래가 없어요</p>
          <template v-else>
            <p class="cmp__stat">중앙값 <strong data-v="median">{{ formatManwon(sec.sameComplex.median) }}</strong>
              · 거래 <span data-v="count">{{ sec.sameComplex.count }}</span>건</p>
            <ul class="cmp__rows">
              <li v-for="(g, i) in sec.sameComplex.groups" :key="i" class="cmp__row" data-row>
                <span class="cmp__label">
                  <span class="cmp__line"><span data-k="area">{{ formatAreas(g.areas) }}</span>
                    <span v-if="g.mine" class="cmp__tag" data-k="mine">내 면적</span></span>
                  <span class="cmp__line cmp__sub">최근 <span data-k="ym">{{ formatYm(g.latest.ym) }}</span> · <span data-k="count">{{ g.count }}건</span>
                    <span v-if="g.latest.direct" class="cmp__tag">직거래</span></span>
                </span>
                <span class="cmp__amt" data-k="amount">{{ formatManwon(g.latest.amount) }}</span>
              </li>
            </ul>
          </template>
        </template>
      </section>

      <!-- 같은 동네 비슷한 면적 단지 시세 -->
      <section class="cmp__sec" data-compare="neighborhood">
        <h3 class="cmp__title">{{ sec.neighborhood.dong }} 비슷한 면적 단지 시세</h3>
        <p class="cmp__cond" data-v="cond"><span v-for="(p, i) in areaCond(sec.neighborhood, '우리 단지 제외')" :key="i" class="nb">{{ i ? ` · ${p}` : p }}</span></p>
        <ProgressLine v-if="pending(sec.neighborhood)" label="비교 자료를 불러오는 중이에요"
          :done="sec.neighborhood.progress?.done ?? 0" :total="sec.neighborhood.progress?.total ?? 0" />
        <div v-else-if="sec.neighborhood.status === 'failed'" class="cmp__fail" role="alert">
          <p class="cmp__msg">실거래 자료를 불러오지 못했어요. {{ sec.neighborhood.error }}</p>
          <Button size="sm" data-testid="compare-retry" @click="retry">다시 시도</Button>
        </div>
        <template v-else>
          <p v-if="!sec.neighborhood.linked" class="cmp__msg" data-v="empty">내 단지를 실거래 자료에서 찾지 못해 동네 시세를 계산하지 않았어요</p>
          <p v-else-if="!sec.neighborhood.count" class="cmp__msg" data-v="empty">최근 12개월간 이 동네에 비슷한 면적 거래가 없어요</p>
          <template v-else>
            <p class="cmp__stat">중앙값 <strong data-v="median">{{ formatManwon(sec.neighborhood.median) }}</strong>
              · 거래 <span data-v="count">{{ sec.neighborhood.count }}</span>건 · 단지 <span data-v="complexes">{{ sec.neighborhood.complexCount }}</span>곳</p>
            <ul class="cmp__rows">
              <li v-for="c in hoodList" :key="c.aptSeq" class="cmp__row" data-row>
                <span class="cmp__label">
                  <span class="cmp__line" data-k="name">{{ c.name }}</span>
                  <span class="cmp__line cmp__sub">최근 <span data-k="ym">{{ formatYm(c.latest.ym) }}</span> · <span data-k="count">{{ c.count }}건</span>
                    <span v-if="c.latest.direct" class="cmp__tag">직거래</span></span>
                </span>
                <span class="cmp__amt" data-k="amount">{{ formatManwon(c.latest.amount) }}</span>
              </li>
            </ul>
            <Button v-if="sec.neighborhood.complexes.length > LIMIT" variant="ghost" size="sm" class="cmp__more" data-testid="compare-more"
              :aria-expanded="showAll" @click="showAll = !showAll">
              {{ showAll ? '접기' : `더 보기 (${sec.neighborhood.complexes.length - LIMIT}곳)` }}</Button>
          </template>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.cmp { display: flex; flex-direction: column; min-width: 0; font-family: var(--font-sans); }
.cmp__sec { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; padding: var(--space-4) 0; }
.cmp__sec + .cmp__sec { border-top: 1px solid var(--border-subtle); }
.cmp__sec:last-child { padding-bottom: 0; }
.cmp__title { margin: 0; font-size: var(--fs-body); font-weight: var(--fw-semibold); line-height: var(--lh-body); color: var(--text-primary); }
.cmp__cond { margin: -6px 0 0; font-size: var(--fs-caption); line-height: var(--lh-caption); color: var(--text-secondary); }
.nb { white-space: nowrap; }
.cmp__msg { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.cmp__fail { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); }
.cmp__stat { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.cmp__stat strong { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-primary); }
.cmp__rows { list-style: none; display: flex; flex-direction: column; margin: 0; padding: 0; }
.cmp__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
  min-height: 40px;
  padding: var(--space-2) 0;
  box-sizing: border-box;
  font-size: var(--fs-small);
  font-variant-numeric: tabular-nums;
}
.cmp__row + .cmp__row { border-top: 1px solid var(--border-subtle); }
.cmp__left { min-width: 0; color: var(--text-primary); }
.cmp__label { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cmp__line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.cmp__sub { font-size: var(--fs-caption); color: var(--text-secondary); }
.cmp__amt { flex: none; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-primary); white-space: nowrap; }
.cmp__tag {
  display: inline-block;
  margin-left: var(--space-1);
  padding: 0 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-subtle);
  font-size: var(--fs-caption);
  line-height: 18px;
  color: var(--text-secondary);
  vertical-align: 1px;
}
.cmp__more { align-self: center; }
</style>
