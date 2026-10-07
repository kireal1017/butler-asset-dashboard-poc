<script setup>
// 4.7 자산 분석 — 목록
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { ChevronRight, ChartColumn } from 'lucide-vue-next';
import { AppHeader, Button, EmptyState, NoticeBox, Page } from '../ui/index.js';
import { api } from '../utils/api.js';

const items = ref(null);
const error = ref('');
onMounted(async () => {
  try {
    items.value = (await api('/buildings')).items;
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <Page testid="analysis-list">
    <AppHeader title="자산 분석" back="/" />
    <!-- 두 번째 문장(주변 전월세 시세·건축물대장)은 해당 카드가 생기는 3단계에서 붙인다 -->
    <NoticeBox kind="info">
      국토교통부 실거래가로 <strong class="em">내 건물이 주변과 비교해 어느 수준인지</strong> 보여드려요.
    </NoticeBox>
    <NoticeBox v-if="error" kind="error" :text="error" />

    <template v-if="items">
      <EmptyState v-if="!items.length" :icon="ChartColumn" title="아직 등록한 건물이 없어요" text="건물과 호실을 등록하면 시세를 분석해 드려요." data-testid="analysis-empty">
        <template #action><Button variant="primary" to="/buildings/new">첫 건물 등록하기</Button></template>
      </EmptyState>
      <div v-else class="list" data-testid="analysis-buildings">
        <RouterLink v-for="b in items" :key="b.id" :to="`/analysis/${b.id}`" class="acard" data-testid="analysis-building" :data-id="b.id">
          <span class="acard__text">
            <span class="acard__name" data-v="name">{{ b.name }}</span>
            <span class="acard__addr" data-v="address">{{ b.address }}</span>
            <span class="acard__count" data-v="units">호실 {{ b.unitCount }}개</span>
          </span>
          <ChevronRight class="acard__chev" :size="18" aria-hidden="true" />
        </RouterLink>
      </div>
    </template>
  </Page>
</template>

<style scoped>
.em { font-weight: var(--fw-semibold); color: var(--text-primary); }
.list { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.acard {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  text-decoration: none;
  transition: border-color var(--dur-hover) var(--ease-standard);
}
.acard:hover { border-color: var(--border-strong); }
.acard:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
.acard__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.acard__name { font-size: var(--fs-h3); font-weight: var(--fw-semibold); line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acard__addr { font-size: var(--fs-small); line-height: 1.45; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acard__count { font-size: var(--fs-small); line-height: 1.45; color: var(--text-primary); }
.acard__chev { flex: none; color: var(--text-tertiary); }
</style>
