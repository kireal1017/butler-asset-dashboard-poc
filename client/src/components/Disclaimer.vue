<template>
  <footer class="footer" data-testid="disclaimer">
    국토교통부 실거래가 기준의 참고용 정보이며 감정평가가 아닙니다. 세금, 대출, 중개비는 반영하지 않습니다.
  </footer>
</template>

<style scoped>
/* 모든 화면 맨 아래 고지 (tokens-v3) */
.footer {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--page-max-v3);
  margin: auto auto 0;
  padding: var(--space-4) var(--page-gutter) calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border-subtle);
  font-family: var(--font-sans);
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  color: var(--text-secondary);
}
</style>
