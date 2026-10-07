# DESIGN-mobile — 버틀러 v3 모바일 적용본

`docs/DESIGN.md`(Attio 계열, 데스크탑 기준)를 v3의 **모바일 폭 전용** 화면에 맞게 줄인 적용본이에요. v3 화면의 시각 기준은 이 문서이고, 여기 없는 것은 DESIGN.md를 따르되 데스크탑 전용 패턴은 가져오지 않아요.

- 토큰: `client/src/styles/tokens-v3.css` · 공통 컴포넌트: `client/src/ui/` · 견본: `/__swatch`
- 전환 기간에는 기존 `tokens.css`·`base.css`와 함께 불러와요. 새 컴포넌트는 scoped 스타일만 쓰고 `base.css` 전역 클래스(`.btn`·`.card`·`.stack` 등)에 기대지 않아요. 컴포넌트에 hex를 직접 쓰지 않아요.

## 1. 범위와 결정 (C1~C12)

| # | 결정 |
|---|---|
| C1 | v3 0장 2항은 "시각 디자인은 `docs/DESIGN-mobile.md`를 따른다"로 읽어요 |
| C2 | 모바일 폭만(최대 480px, 좌우 16px). 사이드바·탑바·테이블·⌘K·드로어·2/3+1/3 레이아웃은 쓰지 않아요. 테이블이 필요하면 카드 목록으로 |
| C3 | 하단 내비 없음. 이동은 전체 메뉴에서 |
| C4 | 등락은 (c): 배경 없이 글자 + `▲`/`▼` + 부호. 색은 중립(text-primary), 변동 없음만 text-secondary. 색만으로 방향을 전하지 않아요 |
| C5 | 주 버튼·선택 상태 = accent `#635BFF`. 레몬 `#DDF44A`는 강조 한두 곳(예: 참고가 표식)에만, 어두운 글자 아래 **채움 색으로만** |
| C6 | 글자 최소 12px(DESIGN micro 11px 안 씀), 터치 높이 최소 44px — 의도된 예외 |
| C7 | 필터 칩은 모서리 8px 테두리 칩(알약형 아님), 선택 시 accent-soft 바탕 + accent 테두리. 밑줄 탭은 쓰지 않아요 |
| C8 | 글꼴 순서 Pretendard → Inter. 캡처 기준선은 새로 잡아요 |
| C9 | 바텀시트 신설(아래 4장) |
| C10 | 아이콘은 Lucide(`lucide-vue-next`) |
| C11 | 빈 상태는 카드 테두리 안에 20px 선 아이콘 하나 + 굵은 한 줄 + 설명 1~2줄 + 버튼 하나. 일러스트 없음 |
| C12 | 카드는 정보 묶음 단위로만. 카드 안 카드 금지, 1px 테두리, 일반 카드 그림자 없음 |

## 2. 토큰

| 분류 | 토큰 | 값 |
|---|---|---|
| 바탕 | `--bg-app` / `--bg-surface` / `--bg-subtle` / `--bg-hover` / `--bg-selected` | #F7F7F8 / #FFFFFF / #F3F4F5 / #F0F1F2 / #EEF2FF |
| 글자 | `--text-primary` / `-secondary` / `-tertiary` / `-disabled` / `-inverse` | #202124 / #60646C / #8A8F98 / #B5B8BE / #FFFFFF |
| 테두리 | `--border-default` / `-subtle` / `-strong` | #E3E5E8 / #ECEDEF / #C9CDD2 |
| 강조 | `--accent` / `-hover` / `-soft` | #635BFF / #554DE8 / #F0EEFF |
| 브랜드 | `--butler-lemon` / `-soft` / `--butler-forest` | #DDF44A / #F7FBCF / #214032 |
| 상태 | `--success` `--warning` `--danger` `--info` (+ `-soft`) | #238B5E #B7791F #D14343 #3974D8 (soft: #EAF7F1 #FFF7DF #FDECEC #ECF3FF) |
| 글꼴 | `--font-sans` | 'Pretendard Variable', Pretendard, 'Inter', 시스템 |
| 글자 크기 | `--fs-display` 32 · `--fs-display-sm` 28 · `--fs-h1` 24 · `--fs-h2` 20 · `--fs-h3` 16 · `--fs-body` 14 · `--fs-small` 13 · `--fs-caption` 12 | 굵기 `--fw-*` 400/500/550/600/650 |
| 간격 | `--space-1`~`--space-16` | 4 8 12 16 20 24 32 40 48 64 |
| 모서리 | `--radius-xs` 4 · `-sm` 6 · `-md` 8 · `-lg` 10 · `-xl` 12 · `-pill` 999 | 버튼·입력·칩 8, 카드 10, 시트 12, 뱃지만 pill |
| 그림자 | `--shadow-sm` · `-md` · `-floating` | 바텀시트·떠 있는 요소만 |
| 기타 | `--touch-min` 44 · `--icon-sm/md/lg` 16/18/20 · `--ease-standard` cubic-bezier(.2,.8,.2,1) · `--dur-sheet` 220ms | |

숫자는 `font-variant-numeric: tabular-nums`, 큰 금액은 28~32px.

## 3. 컴포넌트 규칙

- **버튼**: 높이 44px, 모서리 8px. primary(accent) · secondary(흰 바탕 + 테두리) · ghost · danger-confirm(확인 단계에서만 빨강). 비활성은 bg-subtle + text-disabled, 로딩은 회전 아이콘 + `aria-busy`.
- **헤더**: 페이지 제목 20px/650(모바일 앱 바 기준, DESIGN H1 24px는 견본 글자표에만), 보조 줄 13px, 뒤로가기 44px, 오른쪽 주 버튼 하나.
- **상태 뱃지**: 알약형, 높이 24px, 12px. **3톤만** — 정상(임대 중)=success, 주의(만료 임박)=warning, 중립(공실·입주 예정·시작 전·종료)=neutral. 점(상태색) + soft 바탕 + 글자. 12px에서 대비(AA)를 지키려고 글자색은 text-primary(중립은 text-secondary)로 써요.
- **안내 박스**: info·success·warning·error. soft 바탕, 18px 아이콘만 상태색(상태를 전하는 아이콘 예외), 글자는 중립색. error는 `role="alert"`.
- **입력**: 높이 44px, 라벨은 위, 필수 `*`(스크린리더용 "필수"), 선택 "(선택)", 오류는 입력 바로 아래 빨강, 도움말은 그 아래. 포커스는 accent 테두리 + 3px 링. 입력 글자 16px(iOS 확대 방지).
- **필터 칩·등록 방식 전환**: 단일 선택 radiogroup, 방향키 이동. 칩은 보이는 높이 34px·누름 영역 44px.
- **아이콘**: Lucide, 16(글자 옆)/18(행·안내)/20(주요 동작·빈 상태)px, 색 text-secondary, **아이콘 배경 없음**. 아이콘만 있는 버튼은 `aria-label`.
- **금액**: 1억 이상 `6억 2,000만원`, 미만 `80만원`, 계약 보증금은 원 단위 `50,000,000원`. 등락은 `▲ 2억 1,000만 (+51.2%)` / `▼ 1,500만 (−2.1%)`, 음수 부호는 U+2212.
- **문구**: 해요체.

## 4. 바텀시트

- 뒤 화면 dim(`--bg-dim`), 패널은 아래에서 220ms `cubic-bezier(.2,.8,.2,1)`로 올라와요(180~240ms 범위).
- 위 두 모서리만 12px, 최대 높이 88vh, 본문만 스크롤, 아래 safe-area 여백.
- 위쪽에 제목 + 닫기(X, 44px). 열리면 첫 입력에 초점(없으면 닫기 버튼), Esc·배경 누름·X로 닫힘, 닫히면 연 버튼으로 초점 복귀, 열린 동안 body 스크롤 잠금, Tab은 시트 안에서만 돌아요.

## 5. DESIGN.md와 다르게 정한 것

| 항목 | DESIGN.md | 적용본 | 이유 |
|---|---|---|---|
| 최소 글자 | micro 11px | 12px | 모바일 한국어 가독성 |
| 터치·컨트롤 높이 | 버튼 36~40, 입력 40, 터치 40 | 44px | 모바일 터치 |
| 카드 사용 | "every section in a card" 금지 | 정보 묶음 단위 카드 허용(카드 안 카드 금지) | v3 화면 구조 |
| 하단 내비 | 모바일 Bottom navigation | 없음 | v3 |
| 뱃지 톤 | 5톤(info·danger 포함) | 3톤 | v3 |
| 등락 | 작은 badge | 배경 없는 글자 (c) | 사용자 결정 |

## 6. 기존 Clay 토큰 → 새 토큰

| 기존 | 새 |
|---|---|
| `--c-primary`, `--c-primary-active` | `--accent`, `--accent-hover` |
| `--c-primary-disabled` | `--bg-subtle`(바탕) + `--text-disabled`(글자) |
| `--c-ink`, `--c-body-strong` | `--text-primary` |
| `--c-body`, `--c-muted` | `--text-secondary` |
| `--c-muted-soft` | `--text-tertiary` |
| `--c-hairline` / `--c-hairline-soft` | `--border-default` / `--border-subtle` |
| `--c-canvas` | `--bg-surface`(카드) · `--bg-app`(화면 바탕) |
| `--c-surface-soft`, `--c-surface-card`, `--c-surface-strong` | `--bg-subtle` (`--bg-hover`) |
| `--c-on-primary`, `--c-on-dark` | `--text-inverse` |
| `--c-surface-dark*`, `--c-on-dark-soft` | 없음(어두운 면 안 씀) |
| `--c-brand-*` (pink·teal·lavender·peach·ochre·mint·coral) | 없음. 브랜드 포인트는 `--butler-lemon`(채움만) |
| `--c-up-*`, `--c-down-*` | 없음 → `ChangeText`(글자 + ▲▼, 중립색) |
| `--c-success` / `--c-warning` / `--c-error` | `--success` / `--warning` / `--danger` (+ `-soft`) |
| `--font-display`, `--font-body` | `--font-sans` |
| `--t-display-amount` | `--fs-display`(32) / `--fs-display-sm`(28) + `--fw-bold` |
| `--t-title-lg` / `--t-title-md` / `--t-title-sm` | `--fs-h1` / `--fs-h2` / `--fs-h3` |
| `--t-body-md` / `--t-body-sm` | `--fs-body`(14) / `--fs-small`(13) |
| `--t-caption`, `--t-caption-upper` | `--fs-caption`(12) (대문자·자간 강조 안 씀) |
| `--t-button`, `--t-nav-link` | `--fs-body` + `--fw-semibold` |
| `--r-xs` 6 / `--r-sm` 8 / `--r-md` 12 / `--r-lg` 16 / `--r-xl` 24 / `--r-pill` | `--radius-sm` 6 / `--radius-md` 8 / `--radius-xl` 12 / `--radius-lg` 10 / (없음) / `--radius-pill` |
| `--s-xxs` 4 · `--s-xs` 8 · `--s-sm` 12 · `--s-md` 16 · `--s-lg` 24 · `--s-xl` 32 · `--s-xxl` 48 | `--space-1` · `-2` · `-3` · `-4` · `-6` · `-8` · `-12` |
| `--page-max` | `--page-max-v3` (480px), 좌우 `--page-gutter` 16px |

기존 토큰과 `base.css` 전역 규칙은 v3 마지막 정리 단계에서 지워요.
