<script setup>
// v3 공통 컴포넌트 견본 (0단계 0-5, G0 확인용). 여기 숫자·이름은 모두 "견본"이며 실제 데이터가 아니에요.
import { ref } from 'vue';
import { Building2, FileText, TrendingUp, Inbox } from 'lucide-vue-next';
import {
  AddCard, AppHeader, BottomSheet, Button, Card, ChangeText, EmptyState, FilterChips, FormButtons,
  FormCard, FormField, InfoRow, MenuRow, ModeToggle, Money, NoticeBox, StatTiles, StatusBadge,
  StepIndicator, SummaryCard, TextInput,
} from '../ui/index.js';

const colorGroups = [
  { title: '바탕', names: ['bg-app', 'bg-surface', 'bg-subtle', 'bg-hover', 'bg-selected'] },
  { title: '글자', names: ['text-primary', 'text-secondary', 'text-tertiary', 'text-disabled'] },
  { title: '테두리', names: ['border-default', 'border-subtle', 'border-strong'] },
  { title: '강조', names: ['accent', 'accent-hover', 'accent-soft', 'butler-lemon', 'butler-lemon-soft'] },
  { title: '상태', names: ['success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft', 'info', 'info-soft'] },
];
const typeScale = [
  { token: 'display', text: '6억 2,000만원', note: '32 / 650' },
  { token: 'display-sm', text: '6억 2,000만원', note: '28 / 650' },
  { token: 'h1', text: '화면 제목', note: '24 / 650' },
  { token: 'h2', text: '헤더 제목', note: '20 / 650' },
  { token: 'h3', text: '카드·입력 카드 소제목', note: '16 / 600' },
  { token: 'body', text: '본문은 14px을 중심으로 써요.', note: '14 / 400' },
  { token: 'small', text: '보조 줄, 설명, 칩 글자', note: '13 / 400' },
  { token: 'caption', text: '도움말과 뱃지 — 최소 크기예요', note: '12 / 400' },
];

const chip = ref('all');
const chipOptions = [
  { value: 'all', label: '전체', count: 12 },
  { value: 'run', label: '운영 중', count: 8 },
  { value: 'draft', label: '등록 중', count: 3 },
  { value: 'check', label: '확인 필요', count: 1 },
];

const mode = ref('step');
const step = ref(1);
const name = ref('');
const deposit = ref('5000');
const memo = ref('');

const sheetOpen = ref(false);
const sheetQuery = ref('');

const loading = ref(false);
function fakeLoad() {
  loading.value = true;
  setTimeout(() => { loading.value = false; }, 1500);
}
const confirmDelete = ref(false);
const lastAction = ref('');
</script>

<template>
  <div class="sw" data-testid="swatch">
    <AppHeader title="디자인 견본" sub="v3 공통 컴포넌트 · 모든 값은 견본이에요" back="/">
      <template #action>
        <Button variant="primary" size="sm">+ 견본 추가</Button>
      </template>
    </AppHeader>

    <NoticeBox kind="info" title="견본 화면이에요" text="여기 나오는 숫자와 이름은 표기 형식을 보여주는 견본이며 실제 자산·거래 값이 아니에요." />

    <!-- 토큰 -->
    <section class="sec">
      <h2 class="sec__title">색 토큰</h2>
      <div v-for="g in colorGroups" :key="g.title" class="colors">
        <p class="colors__title">{{ g.title }}</p>
        <div class="colors__grid">
          <div v-for="c in g.names" :key="c" class="color">
            <span class="color__chip" :style="{ background: `var(--${c})` }" />
            <span class="color__name">{{ c }}</span>
          </div>
        </div>
      </div>
      <p class="note">레몬은 어두운 글자 아래 채움 색으로만 써요 → <span class="lemon-mark">참고가</span> (견본)</p>
    </section>

    <section class="sec">
      <h2 class="sec__title">글자 크기</h2>
      <Card>
        <div v-for="t in typeScale" :key="t.token" class="type-row">
          <span :class="['type', `type--${t.token}`]">{{ t.text }}</span>
          <span class="type-row__note">{{ t.token }} · {{ t.note }}</span>
        </div>
      </Card>
    </section>

    <!-- 요약·타일 -->
    <section class="sec">
      <h2 class="sec__title">요약 카드 · 통계 타일 (견본)</h2>
      <SummaryCard
        label="전체 건물 (견본)"
        value="12개"
        :breakdown="[{ label: '운영 중', value: '8' }, { label: '등록 중', value: '3' }, { label: '확인 필요', value: '1' }]"
      />
      <StatTiles :tiles="[{ value: '24', label: '보유 호실' }, { value: '92%', label: '입주율' }, { value: '2', label: '만료 임박' }]" />
    </section>

    <!-- 필터 칩 -->
    <section class="sec">
      <h2 class="sec__title">필터 칩 (모서리 8px)</h2>
      <FilterChips v-model="chip" :options="chipOptions" aria-label="건물 상태 필터 (견본)" />
      <p class="note">선택: {{ chipOptions.find((o) => o.value === chip)?.label }}</p>
    </section>

    <!-- 뱃지 -->
    <section class="sec">
      <h2 class="sec__title">상태 뱃지 (3톤, 알약형)</h2>
      <div class="row-wrap">
        <StatusBadge tone="ok" text="임대 중" />
        <StatusBadge tone="warn" text="만료 임박 D-45" />
        <StatusBadge tone="neutral" text="공실" />
        <StatusBadge tone="neutral" text="입주 예정" />
        <StatusBadge tone="neutral" text="종료" />
      </div>
    </section>

    <!-- 안내 박스 -->
    <section class="sec">
      <h2 class="sec__title">안내 박스</h2>
      <NoticeBox kind="info" :icon="Building2" title="건물 정보를 등록해요" text="기본 정보를 저장한 뒤 호실과 계약을 추가하면 관리를 시작할 수 있어요." />
      <NoticeBox kind="success" title="등록했어요" text="견본 건물을 저장했어요." />
      <NoticeBox kind="warning" title="확인이 필요해요" text="참고가를 다시 불러오지 못했어요.">
        <template #action><Button variant="secondary" size="sm">다시 불러오기</Button></template>
      </NoticeBox>
      <NoticeBox kind="error" text="건물명과 주소는 필수예요." />
    </section>

    <!-- 등록 방식 -->
    <section class="sec">
      <h2 class="sec__title">등록 방식 전환 · 단계 표시</h2>
      <ModeToggle v-model="mode" />
      <StepIndicator v-if="mode === 'step'" :current="step" :total="2" :label="step === 1 ? '기본 정보' : '매입 정보'" />

      <FormCard v-if="mode === 'all' || step === 1" subtitle="기본 정보">
        <FormField label="건물명" required help="간판이나 단지 이름을 적어요." :error="name ? '' : '건물명을 입력해 주세요.'">
          <TextInput v-model="name" placeholder="예: 견본 빌딩" />
        </FormField>
        <FormField label="메모" optional help="나만 볼 수 있어요.">
          <TextInput v-model="memo" />
        </FormField>
      </FormCard>
      <FormCard v-if="mode === 'all' || step === 2" subtitle="매입 정보">
        <FormField label="보증금" required help="만원 단위로 적어요.">
          <TextInput v-model="deposit" inputmode="numeric" suffix="만원" />
        </FormField>
      </FormCard>

      <FormButtons
        v-if="mode === 'step' && step === 1"
        submit-label="다음"
        :submit-disabled="!name"
        @cancel="lastAction = '취소'"
        @submit="step = 2"
      />
      <FormButtons
        v-else-if="mode === 'step'"
        cancel-label="이전"
        submit-label="등록하기"
        @cancel="step = 1"
        @submit="lastAction = '등록'"
      />
      <FormButtons v-else submit-label="등록하기" :submit-disabled="!name" @cancel="lastAction = '취소'" @submit="lastAction = '등록'" />
      <p v-if="lastAction" class="note">마지막 동작: {{ lastAction }} (견본)</p>
    </section>

    <!-- 바텀시트 -->
    <section class="sec">
      <h2 class="sec__title">바텀시트</h2>
      <Button variant="secondary" block @click="sheetOpen = true">주소 검색 바텀시트 열기</Button>
      <BottomSheet v-model="sheetOpen" title="주소 검색">
        <FormField label="주소" help="도로명이나 단지명으로 찾아요.">
          <TextInput v-model="sheetQuery" placeholder="예: 견본로 12" />
        </FormField>
        <Card flush class="sheet-list">
          <MenuRow v-for="n in 6" :key="n" :title="`견본 주소 ${n}`" desc="견본시 견본구 견본로" @click="sheetOpen = false" />
        </Card>
      </BottomSheet>
    </section>

    <!-- 메뉴 행 -->
    <section class="sec">
      <h2 class="sec__title">메뉴 행</h2>
      <Card flush title="건물 · 호실">
        <MenuRow :icon="Building2" title="건물 관리" desc="건물·호실 등록과 현황" to="/__swatch" />
        <MenuRow :icon="TrendingUp" title="자산 분석" desc="주변 시세와 내 건물 위치" to="/__swatch" />
      </Card>
      <Card flush title="계약">
        <MenuRow :icon="FileText" title="계약 관리" desc="계약 목록과 등록" @click="lastAction = '계약 관리'" />
      </Card>
    </section>

    <!-- 추가 카드 · 빈 상태 -->
    <section class="sec">
      <h2 class="sec__title">추가 카드 · 빈 상태</h2>
      <AddCard title="새 건물 추가하기" desc="건물 정보를 등록하고 관리를 시작해요" @add="lastAction = '건물 추가'" />
      <EmptyState :icon="Inbox" title="아직 등록한 건물이 없어요" text="건물을 등록하면 호실과 계약을 관리할 수 있어요.">
        <template #action><Button variant="primary">첫 건물 등록하기</Button></template>
      </EmptyState>
    </section>

    <!-- 정보 행 · 금액 · 등락 -->
    <section class="sec">
      <h2 class="sec__title">정보 행 · 금액 · 등락 (견본)</h2>
      <Card>
        <dl class="dl">
          <InfoRow label="최근 실거래 참고가" emphasize><Money :value="620000000" /></InfoRow>
          <InfoRow label="매입가 대비"><ChangeText :diff="210000000" :rate="51.2" /></InfoRow>
          <InfoRow label="보증금 (원 단위)"><Money :value="50000000" raw /></InfoRow>
          <InfoRow label="월세"><Money :value="800000" /></InfoRow>
          <InfoRow label="기준일" value="2026.08.12" />
        </dl>
      </Card>
      <Card>
        <ul class="samples">
          <li><span class="samples__k">1억 이상</span><Money :value="620000000" /></li>
          <li><span class="samples__k">딱 1억</span><Money :value="100000000" /></li>
          <li><span class="samples__k">1억 미만</span><Money :value="800000" /></li>
          <li><span class="samples__k">값 없음</span><Money :value="null" /></li>
          <li><span class="samples__k">상승</span><ChangeText :diff="210000000" :rate="51.2" basis="매입가 대비" /></li>
          <li><span class="samples__k">하락</span><ChangeText :diff="-15000000" :rate="-2.1" basis="직전 거래 대비" /></li>
          <li><span class="samples__k">변동 없음</span><ChangeText :diff="0" :rate="0" /></li>
        </ul>
      </Card>
    </section>

    <!-- 버튼 -->
    <section class="sec">
      <h2 class="sec__title">버튼 (44px)</h2>
      <div class="btn-grid">
        <Button variant="primary">주 버튼</Button>
        <Button variant="secondary">보조 버튼</Button>
        <Button variant="ghost">고스트 버튼</Button>
        <Button variant="primary" disabled>비활성</Button>
        <Button variant="primary" :loading="loading" @click="fakeLoad">{{ loading ? '불러오는 중' : '눌러서 로딩' }}</Button>
        <Button :variant="confirmDelete ? 'danger-confirm' : 'secondary'" @click="confirmDelete = !confirmDelete">
          {{ confirmDelete ? '정말 삭제할까요?' : '삭제 (누르면 확인)' }}
        </Button>
      </div>
      <Button variant="primary" block>꽉 찬 주 버튼</Button>
    </section>

    <p class="foot">국토교통부 실거래가 기준의 참고용 정보이며 감정평가가 아니에요.</p>
  </div>
</template>

<style scoped>
.sw {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  min-width: 0;
  min-height: 100vh;
  padding: 0 var(--page-gutter) var(--space-12);
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}
.sec { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.sec__title {
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-caption);
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}
.note { margin: 0; font-size: var(--fs-caption); color: var(--text-secondary); }

.colors { display: flex; flex-direction: column; gap: var(--space-2); }
.colors__title { margin: 0; font-size: var(--fs-small); font-weight: var(--fw-medium); }
.colors__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.color { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.color__chip { flex: none; width: 28px; height: 28px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); }
.color__name { min-width: 0; font-size: var(--fs-caption); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lemon-mark {
  display: inline-block;
  padding: 0 var(--space-1);
  border-radius: var(--radius-xs);
  background: var(--butler-lemon);
  color: var(--text-primary);
  font-weight: var(--fw-semibold);
}

.type-row { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) 0; min-width: 0; }
.type-row + .type-row { border-top: 1px solid var(--border-subtle); }
.type-row__note { font-size: var(--fs-caption); color: var(--text-tertiary); }
.type { color: var(--text-primary); overflow-wrap: anywhere; }
.type--display { font-size: var(--fs-display); font-weight: var(--fw-bold); line-height: var(--lh-tight); font-variant-numeric: tabular-nums; }
.type--display-sm { font-size: var(--fs-display-sm); font-weight: var(--fw-bold); line-height: var(--lh-tight); font-variant-numeric: tabular-nums; }
.type--h1 { font-size: var(--fs-h1); font-weight: var(--fw-bold); line-height: 1.3; }
.type--h2 { font-size: var(--fs-h2); font-weight: var(--fw-bold); line-height: var(--lh-heading); }
.type--h3 { font-size: var(--fs-h3); font-weight: var(--fw-semibold); line-height: 1.4; }
.type--body { font-size: var(--fs-body); }
.type--small { font-size: var(--fs-small); }
.type--caption { font-size: var(--fs-caption); }

.row-wrap { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.dl { margin: 0; }
.samples { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.samples li { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); min-width: 0; flex-wrap: wrap; }
.samples__k { font-size: var(--fs-small); color: var(--text-secondary); }
.btn-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.sheet-list { margin-top: var(--space-4); }
.foot { margin: 0; font-size: var(--fs-caption); color: var(--text-secondary); }
</style>
