<script setup>
import ChangeChip from './ChangeChip.vue';
import ProgressBar from './ProgressBar.vue';
import { formatManwon, formatYm } from '../utils/money.js';
import { formatArea } from '../utils/format.js';

defineProps({ asset: { type: Object, required: true } });
defineEmits(['retry']);
</script>

<template>
  <article class="card asset-card stack" :data-asset-id="asset.id" data-testid="asset-card">
    <RouterLink :to="`/assets/${asset.id}`" class="cover" :aria-label="`${asset.complexName} ${asset.dong}동 ${asset.ho}호 상세 보기`" />
    <header class="stack head">
      <h2 class="title-md">{{ asset.complexName }}</h2>
      <p class="body-sm muted">{{ asset.dong }}동 {{ asset.ho }}호 · 전용 {{ formatArea(asset.areaU) }}</p>
    </header>

    <ProgressBar v-if="asset.status === 'collecting'" :done="asset.progress?.done ?? 0" :total="asset.progress?.total ?? 0" />

    <div v-else-if="asset.status === 'failed'" class="stack" role="alert">
      <p class="body-sm">실거래 자료를 불러오지 못했습니다. {{ asset.error }}</p>
      <button class="btn btn-secondary on-top" type="button" @click="$emit('retry', asset.id)">다시 시도</button>
    </div>

    <p v-else-if="asset.status === 'no_trades'" class="body-sm muted" data-testid="no-trades">
      저장된 기간에 같은 면적의 거래 내역이 없습니다.
    </p>

    <div v-else-if="asset.current" class="stack price">
      <p class="caption muted">최근 실거래가 · <span data-testid="deal-ym">{{ formatYm(asset.current.ym) }} 거래</span>
        <span v-if="asset.current.direct" class="badge direct">직거래</span>
      </p>
      <p class="amount-lg" data-testid="current-price">{{ formatManwon(asset.current.amount) }}</p>
      <div v-if="asset.change"><ChangeChip :change="asset.change" /></div>
    </div>

    <p v-if="asset.ownerKnown === false" class="caption muted">동 소속을 확인할 수 없어 단지 전체 거래 기준입니다.</p>
  </article>
</template>

<style scoped>
.asset-card { position: relative; gap: var(--s-md); }
.cover { position: absolute; inset: 0; border-radius: inherit; }
.on-top { position: relative; z-index: 1; align-self: flex-start; }
.head { gap: var(--s-xxs); }
.price { gap: var(--s-xs); }
.amount-lg { font: 500 28px/1.15 var(--font-display); letter-spacing: var(--ls-display); font-variant-numeric: tabular-nums; }
.direct { margin-left: var(--s-xxs); padding: 2px 8px; }
</style>
