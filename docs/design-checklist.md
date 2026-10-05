# DESIGN-clay.md 대조 체크리스트 (AC-V4)

기준: `docs/DESIGN-clay.md`, 엄격 적용 (사용자 결정 2026-10-05). 토큰은 `client/src/styles/tokens.css` 한 곳에서만 정의한다.

| 항목 | Clay 규칙 | 적용 | 판정 |
|---|---|---|---|
| 캔버스 | `canvas #fffaf0`, 쿨그레이 금지 | `body` 배경 `--c-canvas` | 통과 |
| 본문 글자 | `ink #0a0a0a`, `body`, `muted` | 제목 ink, 보조 muted. `muted-soft`(대비 2.70)는 글자에 쓰지 않음 | 통과 |
| 기본 버튼 | `button-primary` 검정, 흰 글자, 12px 둥글기, 높이 44px | "자산 추가", "등록하고 불러오기", "맞아요", "저장" | 통과 |
| 보조 버튼 | `button-secondary` 캔버스 + hairline | "다시 시도", "건너뛰기", "수정/삭제" | 통과 |
| 입력 | `text-input` 44px, 12px 둥글기, 포커스 시 ink 테두리 | 단지 검색, 동·호, 매입가, 연월 선택 | 통과 |
| 카드 | `product-mockup-card` 캔버스 + hairline + 16px | 자산 카드, 상세 섹션 | 통과 |
| 강조 카드 | `feature-card-cream` surface-card + 24px | 빈 상태, 자동 조회 결과, 후보 카드 | 통과 |
| 탭 | `category-tab` pill, 활성 = surface-card + ink | 기간 탭, 그래프 형태 선택 | 통과 |
| 배지 | `badge-pill` caption 13px, pill | 자산 수, 직거래, 자동 매칭/직접 입력, 증감 칩 | 통과 |
| 푸터 | 크림 푸터(`surface-soft`), 어두운 푸터 금지 | 고지 문구 | 통과 |
| 그림자 | 무거운 그림자 금지 | 그림자 없음. 그래프 형태 선택만 1px hairline 링 | 통과 |
| 간격 | 4px 단위 토큰 | `--s-*`만 사용 | 통과 |
| 서체 | Plain Black은 공개 웹폰트가 없음 → Inter 500, −0.05em 대체 (Clay Known Gaps) | Inter(Google Fonts) 로드, 큰 금액 Inter 500 −0.05em. 한글은 Pretendard로 대체 | 통과 (대체 서체) |
| 디스플레이 크기 | 데스크톱 72/56/40/32px | **파생 규칙**: Clay 반응형 표의 hero 72→36px 비율을 적용해 큰 금액 36px, 카드 금액 28px, 화면 제목 24px | 통과 (파생 규칙 명시) |
| 굵기 | 디스플레이 500을 넘지 않음 | 금액 500, 제목 600(title 토큰 규칙) | 통과 |
| 3D 클레이 일러스트 | 브랜드 핵심 자산 | **N/A**: 커미션 자산이라 토큰이 아님(Clay Known Gaps). 데이터 화면에는 넣지 않음 | 해당 없음 (사유 기록) |
| 7번째 브랜드 색 금지 | 6색 팔레트 | 브랜드 색은 coral·lavender·teal·ochre만 사용(모두 팔레트 안) | 통과 |
| 호버 스타일 추가 금지 | 정의된 것 외 호버 없음 | 호버 스타일 없음(누름 상태만) | 통과 |
| 터치 대상 | 44×44 이상 | 버튼, 입력, 기간 탭, 그래프 형태 선택 모두 높이 44px | 통과 |

## 증감 색 (사용자 확인: A안)
- 상승: `brand-coral` 칩 + ink 글자 + "+", 하락: `brand-lavender` 칩 + ink 글자 + "−"
- 글자 대비: ink/coral 7.07:1, ink/lavender 9.02:1 (WCAG AA 통과)
- 칩 채움과 캔버스의 대비는 2.69 / 2.11로 비텍스트 기준(3:1)에 못 미친다. 그래서 의미는 항상 부호와 문구("매입가 대비", "직전 거래 대비")가 전달한다.

## 그래프 색
- 선 ink, 거래 점과 막대는 coral 채움 + ink 1px 테두리, 매입가 기준선 muted 점선(캔버스 대비 5.20), 매입 시점 teal 마름모
- 결함 주입 배너: ochre (개발 전용)

## 남은 차이
- 없음. 처음에 36/32px였던 탭류 터치 높이는 대조 과정에서 44px로 고쳤다.
