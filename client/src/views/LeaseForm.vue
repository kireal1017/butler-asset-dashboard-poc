<script setup>
// 4.10 계약 등록 / 계약 수정. 저장하면 들어온 화면(query.from)으로 돌아간다.
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  AppHeader, ConfirmButton, FormButtons, FormCard, FormField, ModeToggle, NoticeBox, Page, SelectInput, TextInput, WonInput,
  formatWon, unitName,
} from '../ui/index.js';
import { api } from '../utils/api.js';
import { fromOr } from '../utils/nav.js';

const route = useRoute();
const router = useRouter();
const leaseId = computed(() => (route.params.id ? Number(route.params.id) : null));
const isEdit = computed(() => leaseId.value !== null);
const fixedUnitId = computed(() => (!isEdit.value && route.query.unitId ? Number(route.query.unitId) : null));
const back = computed(() => fromOr(route, '/leases'));

const form = reactive({
  unitId: '', leaseType: 'MONTHLY', deposit: '', monthlyRent: '', startDate: '', endDate: '', tenantName: '',
});
const fixedLabel = ref(''); // 고정된 호실 "건물명 101동 1203호"
const unitOptions = ref([]);
const loaded = ref(false);
const loadError = ref('');
const error = ref('');
const busy = ref(false);
const deleting = ref(false);

const TYPE_OPTIONS = [
  { value: 'MONTHLY', label: '월세' },
  { value: 'JEONSE', label: '전세' },
];

onMounted(async () => {
  try {
    if (isEdit.value) {
      const { lease } = await api(`/leases/${leaseId.value}`);
      Object.assign(form, {
        unitId: lease.unitId,
        leaseType: lease.leaseType,
        deposit: String(lease.deposit),
        monthlyRent: lease.leaseType === 'JEONSE' ? '' : String(lease.monthlyRent),
        startDate: lease.startDate,
        endDate: lease.endDate,
        tenantName: lease.tenantName ?? '',
      });
      fixedLabel.value = `${lease.buildingName} ${unitName(lease)}`;
    } else if (fixedUnitId.value) {
      const { unit, building } = await api(`/units/${fixedUnitId.value}`);
      form.unitId = unit.id;
      fixedLabel.value = `${building.name} ${unitName(unit)}`;
    } else {
      // 계약 관리에서 들어오면 모든 호실 중에서 고른다
      const { items } = await api('/buildings');
      const details = await Promise.all(items.filter((b) => b.unitCount).map((b) => api(`/buildings/${b.id}`)));
      unitOptions.value = details.flatMap((d) => d.units.map((u) => ({ value: u.id, label: `${d.building.name} ${unitName(u)}` })));
    }
  } catch (e) {
    loadError.value = e.message;
  } finally {
    loaded.value = true;
  }
});

const monthly = computed(() => form.leaseType === 'MONTHLY');
const readBack = (v) => (v === '' ? '원 단위로 적어요' : formatWon(Number(v)));

function body() {
  return {
    unitId: Number(form.unitId),
    leaseType: form.leaseType,
    deposit: form.deposit === '' ? '' : Number(form.deposit),
    monthlyRent: monthly.value ? (form.monthlyRent === '' ? '' : Number(form.monthlyRent)) : 0,
    startDate: form.startDate,
    endDate: form.endDate,
    tenantName: form.tenantName.trim(),
  };
}

async function submit() {
  error.value = '';
  if (!form.unitId || form.deposit === '' || (monthly.value && form.monthlyRent === '') || !form.startDate || !form.endDate) {
    error.value = '호실, 보증금, 계약 기간은 필수예요.';
    return;
  }
  if (form.endDate <= form.startDate) {
    error.value = '종료일은 시작일보다 뒤여야 해요.';
    return;
  }
  busy.value = true;
  try {
    if (isEdit.value) await api(`/leases/${leaseId.value}`, { method: 'PUT', body: body() });
    else await api('/leases', { method: 'POST', body: body() });
    router.push(back.value);
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
    await api(`/leases/${leaseId.value}`, { method: 'DELETE' });
    router.push(back.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <Page :testid="isEdit ? 'lease-edit' : 'lease-new'">
    <AppHeader :title="isEdit ? '계약 수정' : '계약 등록'" :back="back" />
    <NoticeBox v-if="loadError" kind="error" :text="loadError" />
    <NoticeBox v-if="error" kind="error" :text="error" data-testid="form-error" />

    <template v-if="loaded && !loadError">
      <FormCard subtitle="계약 정보">
        <FormField label="호실" required>
          <p v-if="fixedLabel" class="fixed" data-testid="lease-unit-fixed" :data-unit="form.unitId">{{ fixedLabel }}</p>
          <SelectInput v-else v-model="form.unitId" :options="unitOptions" placeholder="호실 선택" data-testid="lease-unit" />
        </FormField>
        <FormField label="계약 유형" required>
          <ModeToggle v-model="form.leaseType" :options="TYPE_OPTIONS" aria-label="계약 유형" data-testid="lease-type" />
        </FormField>
        <FormField label="보증금" required :help="readBack(form.deposit)">
          <WonInput v-model="form.deposit" data-testid="lease-deposit" />
        </FormField>
        <FormField v-if="monthly" label="월세" required :help="readBack(form.monthlyRent)">
          <WonInput v-model="form.monthlyRent" data-testid="lease-rent" />
        </FormField>
        <div class="pair">
          <FormField label="시작일" required>
            <TextInput v-model="form.startDate" type="date" data-testid="lease-start" />
          </FormField>
          <FormField label="종료일" required>
            <TextInput v-model="form.endDate" type="date" data-testid="lease-end" />
          </FormField>
        </div>
        <FormField label="임차인 이름" optional help="계약 카드와 호실 화면에 표시하는 용도로만 써요">
          <TextInput v-model="form.tenantName" autocomplete="off" data-testid="lease-tenant" />
        </FormField>
      </FormCard>

      <FormButtons :submit-label="isEdit ? '저장' : '계약 등록'" :loading="busy" @cancel="router.push(back)" @submit="submit" />
      <ConfirmButton v-if="isEdit" label="계약 삭제" :loading="deleting" @confirm="remove" />
    </template>
  </Page>
</template>

<style scoped>
.fixed {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-height: var(--touch-min);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  font-size: var(--fs-body);
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-3); }
</style>
