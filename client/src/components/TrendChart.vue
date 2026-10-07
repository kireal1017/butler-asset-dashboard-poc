<script setup>
// PRD 7.7 그래프: 계단형 선, 거래 점, 매입가 점선 기준선, 매입 시점 표시, 터치 시 값 표시.
// kind: 'step'(기본, PRD) | 'line'(실제 거래 점끼리 직선 연결) | 'bar'(거래가 있는 달의 마지막 거래 금액, 0부터)
// SVG 렌더러를 써서 DOM에서 요소를 확인할 수 있게 하고, 시계열을 data-series에 그대로 둔다 (검증용).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent, MarkPointComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { formatManwon, formatYm } from '../utils/money.js';
import { formatFloor } from '../utils/format.js';

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent, MarkPointComponent, SVGRenderer]);

const props = defineProps({
  points: { type: Array, required: true }, // [{ ym, value, trade }]
  purchase: { type: Object, default: null }, // { price, ym }
  kind: { type: String, default: 'step' },
});

const el = ref(null);
let chart = null;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const axisLabel = (ym) => `${ym.slice(2, 4)}.${ym.slice(4)}`;
// 금액 단위는 만원: 10000 → 1억, 5000 → 5천만
const eokLabel = (v) => (v === 0 ? '0' : v >= 10000 ? `${(v / 10000).toFixed(v % 10000 ? 1 : 0)}억` : `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}천만`);

const empty = computed(() => (props.kind === 'bar' ? props.points.every((p) => p.trade === null) : props.points.every((p) => p.value === null)));
const dataSeries = computed(() => JSON.stringify(props.points.map((p) => ({ ym: p.ym, value: p.value, trade: p.trade ? p.trade.amount : null }))));

function option() {
  const yms = props.points.map((p) => p.ym);
  const ink = css('--c-ink');
  const muted = css('--c-muted');
  const purchaseInRange = props.purchase && yms.includes(props.purchase.ym);
  const isBar = props.kind === 'bar';
  const trades = props.points.map((p) => (p.trade ? p.trade.amount : null));
  const dataMax = Math.max(0, ...props.points.map((p) => p.value ?? 0), ...trades.map((t) => t ?? 0));
  const marks = {
    markLine: props.purchase ? {
      symbol: 'none', silent: true,
      lineStyle: { color: muted, type: 'dashed', width: 1.5 },
      label: { formatter: '매입가', color: muted, fontSize: 11, position: 'insideEndTop', backgroundColor: css('--c-canvas'), padding: [1, 4] },
      data: [{ yAxis: props.purchase.price }],
    } : undefined,
    markPoint: purchaseInRange ? {
      symbol: 'diamond', symbolSize: 14, silent: true,
      itemStyle: { color: css('--c-brand-teal') },
      label: { show: false },
      data: [{ coord: [props.purchase.ym, props.purchase.price], name: '매입' }],
    } : undefined,
  };
  const series = isBar
    ? [{ type: 'bar', name: '거래', data: trades, barMaxWidth: 10, itemStyle: { color: css('--c-brand-coral'), borderRadius: [2, 2, 0, 0] }, ...marks }]
    : [
      {
        // 계단: 월별 기준 금액(직전 거래 유지). 선: 실제 거래 점끼리 직선으로 연결.
        type: 'line', name: '추이', step: props.kind === 'step' ? 'end' : false, showSymbol: false,
        connectNulls: props.kind === 'line',
        data: props.kind === 'line' ? trades : props.points.map((p) => p.value), lineStyle: { color: ink, width: 2 }, ...marks,
      },
      { type: 'scatter', name: '거래', symbolSize: 8, data: trades, itemStyle: { color: css('--c-brand-coral'), borderColor: ink, borderWidth: 1 } },
    ];
  return {
    animation: false,
    grid: { left: 44, right: 12, top: 16, bottom: 28 },
    xAxis: {
      type: 'category', data: yms, boundaryGap: isBar,
      axisLabel: { formatter: axisLabel, color: muted, fontSize: 11, hideOverlap: true },
      axisLine: { lineStyle: { color: css('--c-hairline') } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value', scale: !isBar,
      // 막대는 높이 비교가 맞도록 0부터. 매입가가 거래가보다 낮으면 기준선이 보이도록 아래쪽만 넓힌다(5천만 단위).
      // 위쪽은 라이브러리 자동 눈금에 맡겨 끝 눈금끼리 겹치지 않게 한다.
      min: isBar ? 0 : props.purchase ? (v) => Math.floor(Math.min(v.min, props.purchase.price) / 5000) * 5000 : undefined,
      max: props.purchase && props.purchase.price > dataMax ? Math.ceil(props.purchase.price / 5000) * 5000 : undefined,
      axisLabel: { formatter: eokLabel, color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: css('--c-hairline-soft') } },
    },
    tooltip: {
      trigger: 'axis', triggerOn: 'mousemove|click', confine: true,
      backgroundColor: css('--c-canvas'), borderColor: css('--c-hairline'), textStyle: { color: ink, fontSize: 13 },
      formatter: (items) => {
        const p = props.points[items[0].dataIndex];
        const lines = [`<b>${formatYm(p.ym)}</b>`];
        lines.push(p.value === null ? '이 시점까지 거래 없음' : `기준 금액 ${formatManwon(p.value)}`);
        if (p.trade) lines.push(`거래 ${formatYm(p.trade.ym)}.${String(p.trade.day).padStart(2, '0')} · ${formatFloor(p.trade.floor)} · ${formatManwon(p.trade.amount)}`);
        return `<div data-testid="chart-tooltip">${lines.join('<br/>')}</div>`;
      },
    },
    series,
  };
}

function render() {
  if (!chart) return;
  chart.setOption(option(), true);
}

let ro;
onMounted(() => {
  chart = echarts.init(el.value, null, { renderer: 'svg' });
  render();
  ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el.value);
});
watch(() => [props.points, props.purchase, props.kind], render, { deep: true });
onBeforeUnmount(() => {
  ro?.disconnect();
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div class="chart-wrap" data-testid="trend-chart" :data-series="dataSeries" :data-has-purchase="Boolean(purchase)" :data-chart-type="kind">
    <div ref="el" class="chart" role="img" aria-label="월별 실거래가 추이 그래프" />
    <p v-if="empty" class="empty body-sm muted" data-testid="chart-empty">{{ kind === 'bar' ? '이 기간에 같은 면적 거래가 없어 막대를 그릴 수 없습니다.' : '이 기간에 같은 면적 거래가 없어 그래프를 그릴 수 없습니다.' }}</p>
  </div>
</template>

<style scoped>
.chart-wrap { width: 100%; position: relative; }
.empty { position: absolute; inset: 0 0 28px 44px; display: flex; align-items: center; justify-content: center; text-align: center; padding: var(--s-md); }
.chart { width: 100%; height: 220px; }
</style>
