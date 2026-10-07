<script setup>
// 4.3 새 건물 등록 / 건물 수정. 두 등록 방식은 같은 폼 모델(form)을 공유하고 같은 요청 본문을 보낸다.
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Building2 } from 'lucide-vue-next';
import {
  AppHeader, BottomSheet, Button, Card, ConfirmButton, FormButtons, FormCard, FormField, ModeToggle, NoticeBox,
  Page, PickerField, StepIndicator, TextArea, TextInput,
} from '../ui/index.js';
import { api } from '../utils/api.js';
import { fromOr, pushWithNotice } from '../utils/nav.js';

const route = useRoute();
const router = useRouter();
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const isEdit = computed(() => editId.value !== null);
const back = computed(() => fromOr(route, isEdit.value ? `/buildings/${editId.value}` : '/buildings'));

// 한 폼 모델
const form = reactive({ kaptCode: '', address: '', name: '', ownedUnitCount: '1', description: '' });
const unitCount = ref(0);
const loaded = ref(!route.params.id);
const mode = ref('step');
const step = ref(1);
const error = ref('');
const busy = ref(false);
const deleting = ref(false);

watch(mode, (m) => { if (m === 'step') step.value = 1; });

onMounted(async () => {
  if (!isEdit.value) return;
  try {
    const { building } = await api(`/buildings/${editId.value}`);
    Object.assign(form, {
      kaptCode: building.kaptCode,
      address: building.address,
      name: building.name,
      ownedUnitCount: String(building.ownedUnitCount),
      description: building.description ?? '',
    });
    unitCount.value = building.unitCount;
  } catch (e) {
    error.value = e.message;
  } finally {
    loaded.value = true;
  }
});

// ---- 주소 검색 바텀시트 (기존 단지 검색) ----
const sheetOpen = ref(false);
const q = ref('');
const results = ref(null); // null = 검색 전
const searching = ref(false);
async function search() {
  const term = q.value.trim();
  if (!term) return;
  searching.value = true;
  try {
    results.value = (await api(`/complexes?query=${encodeURIComponent(term)}`)).items;
  } catch (e) {
    results.value = [];
    error.value = e.message;
  } finally {
    searching.value = false;
  }
}
const addressOf = (c) => [c.gu, c.umdName].filter(Boolean).join(' ');
function pick(c) {
  form.kaptCode = c.kaptCode;
  form.address = `${addressOf(c)} ${c.name}`;
  if (!form.name.trim()) form.name = c.name;
  sheetOpen.value = false;
  error.value = '';
}

// ---- 단계 ----
const showAddress = computed(() => isEdit.value || mode.value === 'all' || step.value === 1);
const showInfo = computed(() => isEdit.value || mode.value === 'all' || step.value === 2);
const canNext = computed(() => Boolean(form.kaptCode));

function body() {
  return {
    kaptCode: form.kaptCode,
    name: form.name.trim(),
    ownedUnitCount: form.ownedUnitCount === '' ? '' : Number(form.ownedUnitCount),
    description: form.description.trim(),
  };
}

async function submit() {
  error.value = '';
  if (!form.kaptCode || !form.name.trim()) {
    error.value = '건물명과 주소는 필수예요.';
    return;
  }
  busy.value = true;
  try {
    if (isEdit.value) {
      const { kaptCode, ...rest } = body();
      await api(`/buildings/${editId.value}`, { method: 'PUT', body: rest });
      router.push(back.value);
    } else {
      const { building } = await api('/buildings', { method: 'POST', body: body() });
      pushWithNotice(router, `/buildings/${building.id}`, '건물이 등록됐어요. 이제 호실을 추가해 보세요.');
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
    await api(`/buildings/${editId.value}`, { method: 'DELETE' });
    router.push('/buildings');
  } catch (e) {
    error.value = e.message;
  } finally {
    deleting.value = false;
  }
}

const onlyDigits = (v) => String(v).replace(/[^\d]/g, '').slice(0, 4);
</script>

<template>
  <Page :testid="isEdit ? 'building-edit' : 'building-new'">
    <AppHeader :title="isEdit ? '건물 정보 수정' : '새 건물 등록'" :back="back" />

    <NoticeBox v-if="!isEdit" kind="info" :icon="Building2" title="건물 정보를 등록해요" text="기본 정보를 저장한 뒤 호실과 계약을 추가하면 관리를 시작할 수 있어요." />
    <NoticeBox v-if="error" kind="error" :text="error" data-testid="form-error" />

    <template v-if="loaded">
      <template v-if="!isEdit">
        <ModeToggle v-model="mode" data-testid="mode-toggle" />
        <StepIndicator v-if="mode === 'step'" :current="step" :total="2" :label="step === 1 ? '주소 찾기' : '건물 정보'" data-testid="step" />
      </template>

      <FormCard subtitle="기본 정보">
        <FormField v-if="showAddress" label="주소" required>
          <PickerField :value="form.address" placeholder="눌러서 주소를 검색해요" :readonly="isEdit" data-testid="address-field" @open="sheetOpen = true" />
        </FormField>
        <template v-if="showInfo">
          <p v-if="!isEdit && mode === 'step'" class="picked" data-testid="picked-address">{{ form.address }}</p>
          <FormField label="건물명" required>
            <TextInput v-model="form.name" autocomplete="off" data-testid="building-name" />
          </FormField>
          <FormField label="보유 호실 수" :help="isEdit && unitCount ? `이 건물에서 내가 가진 호실 수예요. 이미 등록한 호실 ${unitCount}개보다 작게 할 수 없어요` : '이 건물에서 내가 가진 호실 수예요. 각 호실 정보는 다음에 추가해요'">
            <TextInput :model-value="form.ownedUnitCount" inputmode="numeric" suffix="개" data-testid="owned-count" @update:model-value="form.ownedUnitCount = onlyDigits($event)" />
          </FormField>
          <FormField label="설명" optional>
            <TextArea v-model="form.description" placeholder="건물에 대한 메모를 적어요" data-testid="building-desc" />
          </FormField>
        </template>
      </FormCard>

      <Card v-if="!isEdit" title="다음 단계" data-testid="next-steps">
        <ol class="steps">
          <li>건물 기본 정보를 저장해요</li>
          <li>호실을 등록해요</li>
          <li>임대 계약을 추가해요</li>
        </ol>
      </Card>

      <FormButtons
        v-if="isEdit"
        submit-label="저장"
        :loading="busy"
        @cancel="router.push(back)"
        @submit="submit"
      />
      <FormButtons
        v-else-if="mode === 'step' && step === 1"
        submit-label="다음"
        :submit-disabled="!canNext"
        @cancel="router.push(back)"
        @submit="step = 2"
      />
      <FormButtons
        v-else-if="mode === 'step'"
        cancel-label="이전"
        submit-label="건물 등록"
        :loading="busy"
        @cancel="step = 1"
        @submit="submit"
      />
      <FormButtons v-else submit-label="건물 등록" :loading="busy" @cancel="router.push(back)" @submit="submit" />

      <ConfirmButton v-if="isEdit" label="건물 삭제" :loading="deleting" @confirm="remove" />
    </template>

    <BottomSheet v-model="sheetOpen" title="주소 검색">
      <form class="search" role="search" @submit.prevent="search">
        <TextInput v-model="q" type="search" placeholder="단지명 또는 주소로 검색" aria-label="단지명 또는 주소로 검색" enterkeyhint="search" data-testid="address-query" />
        <Button type="submit" variant="primary" :loading="searching" data-testid="address-search">검색</Button>
      </form>
      <p v-if="results === null" class="hint">단지 이름이나 동 이름으로 찾을 수 있어요.</p>
      <p v-else-if="!results.length" class="hint" data-testid="address-none">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>
      <ul v-else class="results" data-testid="address-results">
        <li v-for="c in results" :key="c.kaptCode">
          <button type="button" class="result" :data-kapt="c.kaptCode" @click="pick(c)">
            <span class="result__name">{{ c.name }}</span>
            <span class="result__addr">{{ addressOf(c) }}</span>
          </button>
        </li>
      </ul>
    </BottomSheet>
  </Page>
</template>

<style scoped>
.picked {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  font-size: var(--fs-small);
  line-height: 1.45;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding-left: 1.4em;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-primary);
}
.steps li::marker { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }
.hint { margin: var(--space-8) 0; text-align: center; font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); }
.results { list-style: none; margin: var(--space-3) 0 0; padding: 0; }
.results li + li { border-top: 1px solid var(--border-subtle); }
.result {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 56px;
  margin: 0;
  padding: var(--space-2) var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
}
.result:hover { background: var(--bg-hover); }
.result:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.result__name { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-primary); }
.result__addr { font-size: var(--fs-small); color: var(--text-secondary); }
</style>
