<script setup>
import { computed } from 'vue';
import { formatWon, formatWonCompact } from './format.js';

// 가격 위치 막대 (spec 7.4). 위치는 서버가 계산한 0~1 비율(bar)을 그대로 쓴다.
// 음영 = 최근 12개월 최저~최고, 표식 = 매입가(위), 참고가(아래, 레몬 채움). 1건이면 음영 대신 표식 하나, 0건이면 숨김.
const props = defineProps({
  bar: { type: Object, required: true },
  range: { type: Object, required: true },
  purchase: { type: Number, default: null },
  reference: { type: Number, default: null },
});

const pct = (v) => `${(Math.min(1, Math.max(0, v)) * 100).toFixed(2)}%`;
/** 라벨이 막대 밖으로 나가지 않게 가장자리에서는 한쪽으로 붙인다 */
const align = (v) => (v < 0.18 ? 'start' : v > 0.82 ? 'end' : 'center');
const has = (v) => Number.isFinite(v);

const caption = computed(() => {
  const r = props.range;
  if (!r.count) return '';
  if (r.count === 1) return `최근 12개월 거래 1건 · ${formatWonCompact(r.min)}`;
  return `최근 12개월 거래 ${r.count}건 · 최저 ${formatWonCompact(r.min)} ~ 최고 ${formatWonCompact(r.max)}`;
});
const summary = computed(() => [
  caption.value,
  has(props.purchase) ? `매입가 ${formatWon(props.purchase)}` : '',
  has(props.reference) ? `참고가 ${formatWon(props.reference)}` : '',
].filter(Boolean).join(', '));
</script>

<template>
  <div class="pbar" data-testid="price-bar">
    <template v-if="!bar.hidden">
      <div class="pbar__plot" role="img" :aria-label="summary">
        <span v-if="has(bar.purchase)" class="pbar__label pbar__label--top" :class="`is-${align(bar.purchase)}`" :style="{ left: pct(bar.purchase) }" data-v="bar-purchase" :data-pos="bar.purchase">매입가</span>
        <div class="pbar__track">
          <span v-if="bar.band" class="pbar__band" :style="{ left: pct(bar.band.from), width: pct(bar.band.to - bar.band.from) }" data-v="bar-band" />
          <span v-if="has(bar.single)" class="pbar__dot" :style="{ left: pct(bar.single) }" data-v="bar-single" />
          <span v-if="has(bar.purchase)" class="pbar__mark pbar__mark--purchase" :style="{ left: pct(bar.purchase) }" />
          <span v-if="has(bar.reference)" class="pbar__mark pbar__mark--ref" :style="{ left: pct(bar.reference) }" />
        </div>
        <span v-if="has(bar.reference)" class="pbar__label pbar__label--bottom pbar__label--ref" :class="`is-${align(bar.reference)}`" :style="{ left: pct(bar.reference) }" data-v="bar-reference" :data-pos="bar.reference">참고가</span>
      </div>
      <p class="pbar__caption" data-v="bar-caption">{{ caption }}</p>
    </template>
    <p v-else class="pbar__caption" data-v="bar-hidden">최근 12개월 안에 같은 면적 거래가 없어요.</p>
  </div>
</template>

<style scoped>
.pbar { min-width: 0; font-family: var(--font-sans); }
.pbar__plot { position: relative; height: 72px; margin: 0 2px; }
.pbar__track {
  position: absolute;
  left: 0;
  right: 0;
  top: 30px;
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  box-sizing: border-box;
}
.pbar__band {
  position: absolute;
  top: -1px;
  bottom: -1px;
  min-width: 4px;
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  box-sizing: border-box;
}
.pbar__dot {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
  background: var(--accent);
  transform: translate(-50%, -50%);
}
.pbar__mark { position: absolute; width: 2px; transform: translateX(-50%); border-radius: 1px; }
.pbar__mark--purchase { top: -8px; height: 16px; background: var(--text-secondary); }
.pbar__mark--ref { top: -2px; height: 22px; width: 3px; background: var(--text-primary); }
.pbar__label {
  position: absolute;
  padding: 0 var(--space-1);
  border-radius: var(--radius-xs);
  font-size: var(--fs-caption);
  line-height: 18px;
  white-space: nowrap;
  color: var(--text-secondary);
}
.pbar__label--top { top: 0; }
.pbar__label--bottom { top: 50px; }
.pbar__label--ref { background: var(--butler-lemon); color: var(--text-primary); font-weight: var(--fw-semibold); }
.pbar__label.is-center { transform: translateX(-50%); }
.pbar__label.is-start { transform: translateX(-4px); }
.pbar__label.is-end { transform: translateX(calc(-100% + 4px)); }
.pbar__caption {
  margin: var(--space-2) 0 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
