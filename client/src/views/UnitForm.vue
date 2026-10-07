<script setup>
// 4.5 호실 등록 / 호실 수정. 두 등록 방식은 같은 폼 모델(form)을 공유하고 같은 요청 본문을 보낸다.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DoorOpen } from 'lucide-vue-next';
import {
  AppHeader, Button, ConfirmButton, FormButtons, FormCard, FormField, InfoRow, ModeToggle, NoticeBox, Page,
  ProgressLine, SelectInput, StepIndicator, TextInput, WonInput, YearMonthSelect,
  formatAreaU, formatFloorKo, formatWon, formatYmKo, formatYmSpanKo, unitName,
} from '../ui/index.js';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';
import { fromOr, pushWithNotice } from '../utils/nav.js';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => route.name === 'unit-edit');
const unitId = computed(() => (isEdit.value ? Number(route.params.id) : null));

const building = ref(null);
const unit = ref(null); // 수정 화면의 호실
const asOf = ref('');
const loadError = ref('');
const error = ref('');
const busy = ref(false);
const deleting = ref(false);
const mode = ref('step');
const step = ref(1);
watch(mode, (m) => { if (m === 'step') step.value = 1; });

// 한 폼 모델 (원 단위 매입가는 숫자 문자열)
const form = reactive({ dong: '', ho: '', manualArea: '', manualFloor: '', acquisitionYm: '', purchasePrice: '' });

const back = computed(() => {
  if (isEdit.value) return fromOr(route, `/units/${unitId.value}`);
  return fromOr(route, `/buildings/${route.params.id}`);
});

onMounted(async () => {
  try {
    const [health, main] = await Promise.all([
      api('/health'),
      isEdit.value ? api(`/units/${unitId.value}`) : api(`/buildings/${route.params.id}`),
    ]);
    asOf.value = health.asOf;
    building.value = main.building;
    if (isEdit.value) {
      unit.value = main.unit;
      form.acquisitionYm = main.unit.acquisitionYm ?? '';
      form.purchasePrice = main.unit.purchasePrice ? String(main.unit.purchasePrice) : '';
    }
  } catch (e) {
    loadError.value = e.message;
  }
});

const remaining = computed(() => (building.value ? building.value.ownedUnitCount - building.value.unitCount : 0));
const full = computed(() => !isEdit.value && building.value && remaining.value <= 0);

// ---- 동·호 → 면적·층 자동 조회 (기존 PoC 조회 그대로) ----
const lookup = ref(null); // { status: 'auto'|'manual', ... }
const lookupState = ref('idle'); // idle | loading | done | error
const lookupProgress = ref(null);
let lookupSeq = 0;
let lookupTimer = null;

const lookupPoll = usePoll(async () => {
  if (!building.value) return;
  try {
    lookupProgress.value = (await api(`/collect/progress?job=${encodeURIComponent(`lookup:${building.value.kaptCode}`)}`)).progress;
  } catch { /* 진행률은 보조 정보 */ }
}, 800);

async function runLookup() {
  const seq = ++lookupSeq;
  lookupState.value = 'loading';
  lookupProgress.value = null;
  lookupPoll.start();
  try {
    const params = new URLSearchParams({ kaptCode: building.value.kaptCode, dong: form.dong.trim(), ho: form.ho.trim() });
    const r = await api(`/units/lookup?${params}`);
    if (seq !== lookupSeq) return;
    lookup.value = r;
    if (r.status === 'manual') {
      form.manualArea = '';
      form.manualFloor = r.floorDefault === null || r.floorDefault === undefined ? '' : String(r.floorDefault);
    }
    lookupState.value = 'done';
  } catch {
    if (seq !== lookupSeq) return;
    lookupState.value = 'error';
  } finally {
    if (seq === lookupSeq) lookupPoll.stop();
  }
}

watch(() => [form.dong, form.ho], () => {
  if (isEdit.value) return;
  lookupSeq += 1; // 진행 중인 조회 결과는 버린다
  lookupPoll.stop();
  lookup.value = null;
  clearTimeout(lookupTimer);
  if (!form.dong.trim() || !form.ho.trim() || !building.value) { lookupState.value = 'idle'; return; }
  lookupState.value = 'loading';
  lookupTimer = setTimeout(runLookup, 700);
});
onBeforeUnmount(() => clearTimeout(lookupTimer));

const manual = computed(() => lookup.value?.status === 'manual');
const areaU = computed(() => {
  if (isEdit.value) return unit.value?.areaU ?? null;
  if (!lookup.value) return null;
  return manual.value ? (form.manualArea === '' ? null : Number(form.manualArea)) : lookup.value.areaU;
});
const floor = computed(() => {
  if (isEdit.value) return unit.value?.floor ?? null;
  if (!lookup.value) return null;
  if (!manual.value) return lookup.value.floor;
  return /^-?\d+$/.test(form.manualFloor.trim()) ? Number(form.manualFloor.trim()) : null;
});
const areaOptions = computed(() => (lookup.value?.areaOptions ?? []).map((o) => ({ value: o.areaU, label: `${formatAreaU(o.areaU)} · 거래 ${o.trades}건` })));
const unitReady = computed(() => lookupState.value === 'done' && areaU.value !== null && floor.value !== null);
const unitSummaryLine = computed(() => {
  const name = isEdit.value ? unitName(unit.value) : unitName({ dong: form.dong.trim(), ho: form.ho.trim() });
  return [name, areaU.value !== null ? `전용 ${formatAreaU(areaU.value)}` : '', floor.value !== null ? formatFloorKo(floor.value) : ''].filter(Boolean).join(' · ');
});

// ---- 매입가 제안 (7.7) ----
const suggestion = ref(null);
const suggestState = ref('idle'); // idle | loading | done | error
let suggestSeq = 0;
const ymComplete = computed(() => /^\d{6}$/.test(form.acquisitionYm));
const dongForSuggest = computed(() => (isEdit.value ? unit.value?.dong : form.dong.trim()));

watch(() => [areaU.value, form.acquisitionYm, building.value?.kaptCode], async () => {
  const seq = ++suggestSeq;
  suggestion.value = null;
  if (areaU.value === null || !ymComplete.value || !building.value || !dongForSuggest.value) { suggestState.value = 'idle'; return; }
  suggestState.value = 'loading';
  try {
    const r = await api('/purchase-suggestion', {
      method: 'POST',
      body: { kaptCode: building.value.kaptCode, dong: dongForSuggest.value, areaU: areaU.value, acquisitionYm: form.acquisitionYm },
    });
    if (seq !== suggestSeq) return;
    suggestion.value = r.suggestion;
    suggestState.value = 'done';
  } catch {
    if (seq === suggestSeq) suggestState.value = 'error';
  }
});

const suggestText = computed(() => {
  const s = suggestion.value;
  if (!s) return '';
  const amount = `${formatWon(s.average)} (${s.count}건)`;
  if (s.months === 1) return `${formatYmKo(s.to)} 같은 단지·같은 면적 실거래 평균 ${amount}`;
  return `${formatYmSpanKo(s.from, s.to)} 같은 단지·같은 면적 실거래 평균 ${amount}`;
});
function applySuggestion() {
  if (suggestion.value) form.purchasePrice = String(suggestion.value.average);
}

const priceHelp = computed(() => (form.purchasePrice ? formatWon(Number(form.purchasePrice)) : '원 단위로 적어요'));

// ---- 단계·저장 ----
const showBasic = computed(() => mode.value === 'all' || step.value === 1);
const showPurchase = computed(() => mode.value === 'all' || step.value === 2);

/** 두 방식이 같은 본문을 보낸다 */
function body() {
  const b = { dong: form.dong.trim(), ho: form.ho.trim(), acquisitionYm: form.acquisitionYm, purchasePrice: Number(form.purchasePrice) };
  if (manual.value) Object.assign(b, { areaSource: 'manual', areaU: areaU.value, floor: floor.value });
  return b;
}

async function submit() {
  error.value = '';
  const price = Number(form.purchasePrice);
  if (isEdit.value) {
    if (!ymComplete.value || !Number.isInteger(price) || price <= 0) { error.value = '취득 연월과 매입가는 필수예요.'; return; }
  } else if (!form.dong.trim() || !form.ho.trim() || !ymComplete.value || !Number.isInteger(price) || price <= 0) {
    error.value = '동·호, 취득 연월, 매입가는 필수예요.';
    return;
  }
  busy.value = true;
  try {
    if (isEdit.value) {
      await api(`/units/${unitId.value}`, { method: 'PUT', body: { acquisitionYm: form.acquisitionYm, purchasePrice: price } });
      router.push(back.value);
    } else {
      await api(`/buildings/${building.value.id}/units`, { method: 'POST', body: body() });
      pushWithNotice(router, `/buildings/${building.value.id}`, '호실이 등록됐어요. 이제 임대 계약을 추가해 보세요.');
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function remove() {
  error.value = '';
  deleting.value = true;
  try {
    await api(`/units/${unitId.value}`, { method: 'DELETE' });
    router.push(`/buildings/${unit.value.buildingId}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <Page :testid="isEdit ? 'unit-edit' : 'unit-new'">
    <AppHeader :title="isEdit ? '호실 정보 수정' : '호실 등록'" :back="back" />
    <NoticeBox v-if="loadError" kind="error" :text="loadError" />

    <template v-if="building && asOf">
      <template v-if="!isEdit">
        <NoticeBox kind="info" :icon="DoorOpen" :title="`${building.name} · 새 호실 등록`" text="동과 호를 입력하면 면적과 층을 불러와요. 보증금과 월세는 계약 등록에서 입력해요." />

        <!-- 등록 현황 -->
        <NoticeBox v-if="full" kind="warning" text="보유 호실을 모두 등록했어요." data-testid="units-full">
          <template #action>
            <Button size="sm" :to="{ path: `/buildings/${building.id}/edit`, query: { from: route.fullPath } }" data-testid="owned-increase">보유 호실 수 늘리기</Button>
          </template>
        </NoticeBox>
        <NoticeBox v-else kind="info" data-testid="units-remaining">
          등록 가능 <strong class="em" data-v="remaining">{{ remaining }}개</strong> 남음 · 전체 <span data-v="owned">{{ building.ownedUnitCount }}</span>개 중 <span data-v="registered">{{ building.unitCount }}</span>개 등록됨
        </NoticeBox>
      </template>

      <template v-if="!full">
        <NoticeBox v-if="error" kind="error" :text="error" data-testid="form-error" />

        <template v-if="!isEdit">
          <ModeToggle v-model="mode" data-testid="mode-toggle" />
          <StepIndicator v-if="mode === 'step'" :current="step" :total="2" :label="step === 1 ? '호실 찾기' : '매입 정보'" data-testid="step" />
        </template>

        <!-- 기본 정보 -->
        <FormCard v-if="isEdit" subtitle="기본 정보">
          <dl class="rows">
            <InfoRow label="동·호" :value="unitName(unit)" />
            <InfoRow label="전용면적" :value="formatAreaU(unit.areaU)" />
            <InfoRow label="층" :value="formatFloorKo(unit.floor)" />
          </dl>
        </FormCard>
        <FormCard v-else-if="showBasic" subtitle="기본 정보">
          <div class="pair">
            <FormField label="동" required>
              <TextInput v-model="form.dong" inputmode="numeric" suffix="동" autocomplete="off" data-testid="dong" />
            </FormField>
            <FormField label="호" required>
              <TextInput v-model="form.ho" inputmode="numeric" suffix="호" autocomplete="off" data-testid="ho" />
            </FormField>
          </div>

          <ProgressLine
            v-if="lookupState === 'loading'"
            label="면적과 층을 불러오는 중이에요"
            :done="lookupProgress?.done ?? 0"
            :total="lookupProgress?.total ?? 0"
          />
          <NoticeBox v-else-if="lookupState === 'error'" kind="error" text="면적과 층을 불러오지 못했어요. 동·호를 다시 확인해 주세요." data-testid="lookup-error" />
          <dl v-else-if="lookup && !manual" class="rows" data-testid="lookup-result">
            <InfoRow label="전용면적"><span data-v="area">{{ formatAreaU(lookup.areaU) }}</span></InfoRow>
            <InfoRow label="층"><span data-v="floor">{{ formatFloorKo(lookup.floor) }}</span></InfoRow>
          </dl>
          <template v-else-if="lookup && manual">
            <p class="msg" data-testid="lookup-manual">{{ lookup.message }}</p>
            <FormField label="전용면적" required help="이 단지 실거래에 나온 면적이에요">
              <SelectInput v-model="form.manualArea" :options="areaOptions" placeholder="면적 선택" data-testid="manual-area" />
            </FormField>
            <FormField label="층" required help="호수에서 계산했어요. 다르면 고쳐 주세요">
              <TextInput v-model="form.manualFloor" inputmode="numeric" suffix="층" data-testid="manual-floor" />
            </FormField>
          </template>
        </FormCard>

        <!-- 매입 정보 -->
        <FormCard v-if="isEdit || showPurchase" subtitle="매입 정보">
          <p v-if="!isEdit && mode === 'step'" class="summary" data-testid="unit-summary">{{ unitSummaryLine }}</p>
          <FormField label="취득 연월" required id="acq-ym">
            <YearMonthSelect id="acq-ym" v-model="form.acquisitionYm" :max-ym="asOf" />
          </FormField>
          <FormField label="매입가" required :help="priceHelp">
            <WonInput v-model="form.purchasePrice" data-testid="purchase-price" />
          </FormField>

          <div v-if="suggestState !== 'idle'" class="suggest" data-testid="suggestion" :data-state="suggestState">
            <p v-if="suggestState === 'loading'" class="suggest__text">취득 시점 실거래를 찾는 중이에요…</p>
            <p v-else-if="suggestState === 'error'" class="suggest__text">매입가 제안을 불러오지 못했어요. 직접 입력해 주세요.</p>
            <template v-else-if="suggestion">
              <p class="suggest__text" data-v="suggestion">{{ suggestText }}</p>
              <Button size="sm" data-testid="suggestion-apply" @click="applySuggestion">이 금액 넣기</Button>
            </template>
            <p v-else class="suggest__text" data-v="suggestion-none">취득 시점 6개월 안에 같은 면적 거래가 없어요. 직접 입력해 주세요.</p>
          </div>
        </FormCard>

        <FormButtons v-if="isEdit" submit-label="저장" :loading="busy" @cancel="router.push(back)" @submit="submit" />
        <FormButtons
          v-else-if="mode === 'step' && step === 1"
          submit-label="다음"
          :submit-disabled="!unitReady"
          @cancel="router.push(back)"
          @submit="step = 2"
        />
        <FormButtons v-else-if="mode === 'step'" cancel-label="이전" submit-label="호실 등록" :loading="busy" @cancel="step = 1" @submit="submit" />
        <FormButtons v-else submit-label="호실 등록" :loading="busy" @cancel="router.push(back)" @submit="submit" />

        <ConfirmButton v-if="isEdit" label="호실 삭제" confirm-label="계약과 참고가 기록도 함께 지워요. 한 번 더 누르면 삭제돼요" :loading="deleting" @confirm="remove" />
      </template>
    </template>
  </Page>
</template>

<style scoped>
.em { font-weight: var(--fw-semibold); color: var(--text-primary); }
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); }
.rows { margin: 0; }
.msg { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.summary {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  font-size: var(--fs-small);
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}
.suggest {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: calc(-1 * var(--space-2));
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}
.suggest__text { margin: 0; font-size: var(--fs-small); line-height: 1.45; color: var(--text-primary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
</style>
