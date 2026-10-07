<script setup>
// 4.1 전체 메뉴 (첫 화면). 메뉴는 구현된 화면만 둔다.
import { onMounted } from 'vue';
import { Building2, ChartColumn, FileText } from 'lucide-vue-next';
import { AppHeader, Card, MenuRow, Page } from '../ui/index.js';
import { api } from '../utils/api.js';

// 앱을 열 때 한 번: 등록한 호실의 최근 12개월 실거래 중 오래된 달을 서버가 다시 받는다.
onMounted(() => {
  api('/buildings?refresh=1').catch(() => {});
});
</script>

<template>
  <Page testid="menu">
    <AppHeader title="전체 메뉴" sub="모든 기능을 여기에서 찾을 수 있어요" />
    <Card flush title="건물 · 호실" data-testid="menu-group-building">
      <MenuRow :icon="Building2" title="건물 관리" desc="건물·호실 등록과 현황" to="/buildings" data-testid="menu-buildings" />
      <MenuRow :icon="ChartColumn" title="자산 분석" desc="주변 시세와 내 건물 위치" to="/analysis" data-testid="menu-analysis" />
    </Card>
    <Card flush title="계약" data-testid="menu-group-lease">
      <MenuRow :icon="FileText" title="계약 관리" desc="계약 목록과 등록" to="/leases" data-testid="menu-leases" />
    </Card>
  </Page>
</template>
