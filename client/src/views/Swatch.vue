<script setup>
// 데이터 없는 디자인 견본 (계획 M1.7). 실제 자산·거래 값을 표시하지 않는다.
const colors = [
  'canvas', 'surface-soft', 'surface-card', 'surface-strong', 'hairline',
  'ink', 'body', 'muted', 'brand-coral', 'brand-lavender', 'brand-mint', 'brand-teal', 'brand-peach', 'brand-ochre', 'brand-pink',
];
const chipSets = [
  { id: 'A', label: '안 A (기본): 상승 coral · 하락 lavender', up: 'var(--c-brand-coral)', down: 'var(--c-brand-lavender)' },
  { id: 'B', label: '안 B: 상승 coral · 하락 mint', up: 'var(--c-brand-coral)', down: 'var(--c-brand-mint)' },
  { id: 'C', label: '안 C: 상승 pink · 하락 lavender', up: 'var(--c-brand-pink)', down: 'var(--c-brand-lavender)' },
];
</script>

<template>
  <main class="page" data-testid="swatch">
    <header class="stack">
      <p class="caption-upper">DESIGN SWATCH · 데이터 없음</p>
      <h1 class="title-lg">Clay 토큰 견본</h1>
      <p class="body-sm muted">아래 숫자는 표기 형식 견본이며 실제 거래 값이 아닙니다.</p>
    </header>

    <section class="stack">
      <h2 class="title-sm">색</h2>
      <div class="grid">
        <div v-for="c in colors" :key="c" class="chip-color">
          <span class="sw" :style="{ background: `var(--c-${c})` }" />
          <span class="caption">{{ c }}</span>
        </div>
      </div>
    </section>

    <section class="stack">
      <h2 class="title-sm">글자</h2>
      <p class="caption muted">최근 실거래가 · YYYY.MM 거래</p>
      <p class="amount-xl">12억 4,000만</p>
      <p class="title-lg">화면 제목 title-lg</p>
      <p class="title-md">카드 제목 title-md</p>
      <p>본문 body-md — 국토교통부 실거래가 기준</p>
      <p class="body-sm">본문 body-sm</p>
    </section>

    <section class="stack">
      <h2 class="title-sm">증감 칩 후보 (하나를 골라 주세요)</h2>
      <div v-for="s in chipSets" :key="s.id" class="card-cream stack" :data-testid="`chipset-${s.id}`">
        <p class="caption">{{ s.label }}</p>
        <div class="row">
          <span class="badge" :style="{ background: s.up }">매입가 대비 +1억 2,000만 (+10.7%)</span>
        </div>
        <div class="row">
          <span class="badge" :style="{ background: s.down }">직전 거래 대비 −1,500만 (−2.1%)</span>
        </div>
      </div>
    </section>

    <section class="stack">
      <h2 class="title-sm">그래프 색</h2>
      <svg viewBox="0 0 320 120" class="graph" role="img" aria-label="그래프 색 견본">
        <line x1="0" y1="80" x2="320" y2="80" stroke="var(--c-muted)" stroke-dasharray="4 4" />
        <polyline points="0,90 60,90 60,70 140,70 140,50 220,50 220,40 320,40" fill="none" stroke="var(--c-ink)" stroke-width="2" />
        <circle v-for="p in [[60,70],[140,50],[220,40]]" :key="p[0]" :cx="p[0]" :cy="p[1]" r="5" fill="var(--c-brand-coral)" stroke="var(--c-ink)" />
        <rect x="24" y="84" width="10" height="10" transform="rotate(45 29 89)" fill="var(--c-brand-teal)" />
      </svg>
      <p class="caption muted">선 ink · 거래 점 coral(테두리 ink) · 매입가 기준선 muted 점선 · 매입 시점 teal</p>
    </section>

    <section class="stack">
      <h2 class="title-sm">컴포넌트</h2>
      <button class="btn btn-primary btn-block">등록하고 불러오기</button>
      <button class="btn btn-secondary btn-block">건너뛰기</button>
      <input class="input" placeholder="단지명 검색" />
      <div class="tabs" role="tablist">
        <button v-for="(t, i) in ['1년', '3년', '5년', '10년', '보유']" :key="t" class="tab" role="tab" :aria-selected="i === 0">{{ t }}</button>
      </div>
      <div class="card stack">
        <p class="title-md">자산 카드 (product-mockup-card)</p>
        <p class="body-sm muted">canvas · hairline · 16px</p>
      </div>
      <span class="badge">직거래</span>
    </section>

    <footer class="footer" data-testid="disclaimer">
      국토교통부 실거래가 기준의 참고용 정보이며 감정평가가 아닙니다. 세금, 대출, 중개비는 반영하지 않습니다.
    </footer>
  </main>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-xs); }
.chip-color { display: flex; align-items: center; gap: var(--s-xs); min-width: 0; }
.chip-color .caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sw { width: 24px; height: 24px; flex: none; border-radius: var(--r-xs); border: 1px solid var(--c-hairline); }
.graph { width: 100%; height: auto; background: var(--c-canvas); border: 1px solid var(--c-hairline); border-radius: var(--r-lg); }
</style>
