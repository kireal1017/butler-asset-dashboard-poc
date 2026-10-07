# BUTLER × Attio-Inspired DESIGN.md

> **Purpose**  
> 이 문서는 오드레몬오리진의 부동산 자산관리 서비스 **버틀러(Butler)**에 적용하기 위한  
> **Attio-inspired UI/UX 디자인 가이드**입니다.  
> Attio의 공개적으로 확인 가능한 시각적·제품적 패턴을 참고해 재구성한 독립적인 디자인 명세이며,  
> Attio의 공식 디자인 시스템이나 내부 토큰을 복제한 문서가 아닙니다.

---

## 0. Core Direction

### Product personality

버틀러는 다음 네 가지 인상을 동시에 가져야 한다.

1. **Calm** — 부동산·계약·수리·소유권처럼 복잡한 정보를 차분하게 보여준다.
2. **Precise** — 숫자, 상태, 날짜, 문서, 업무 진행 상황을 오해 없이 전달한다.
3. **Efficient** — 자주 쓰는 업무는 최소 클릭으로 끝난다.
4. **Trustworthy** — 금융/부동산 서비스답게 장식보다 정보 신뢰성을 우선한다.

### Visual formula

```text
Attio-like structure
+ neutral SaaS surfaces
+ compact CRM density
+ strong typography hierarchy
+ subtle borders
+ Butler brand accent
= Butler UI
```

### Design objective

화면을 "예쁘게 채우는 것"이 목적이 아니다.

사용자는 첫 화면에서 다음 세 가지를 5초 안에 이해할 수 있어야 한다.

```text
1. 내 자산의 현재 상태
2. 지금 처리해야 할 일
3. 문제가 있는 항목
```

---

# 1. Design Principles

## 1.1 Information first

장식보다 데이터와 상태를 우선한다.

- 불필요한 대형 일러스트 사용 금지
- 카드 안에 카드 반복 금지
- 정보가 없는 큰 여백 금지
- KPI는 핵심 숫자만 크게 표시
- 설명은 작은 보조 텍스트로 분리
- 상태는 텍스트 + 색상으로 동시에 전달

---

## 1.2 Quiet interface

기본 UI는 최대한 중립적인 색을 사용한다.

색상은 다음 상황에서만 적극 사용한다.

- Primary action
- Selected state
- Status
- Warning / Error
- Butler brand accent
- 데이터 시각화

대부분의 화면은 아래 비율을 권장한다.

```text
Neutral surface  85%
Text / border     10%
Accent / status    5%
```

---

## 1.3 Dense but breathable

Attio 계열의 업무용 SaaS처럼 정보 밀도는 높게 유지하되 답답하지 않게 한다.

- 테이블 row: 40~48px
- 일반 input: 40px
- 버튼: 36~40px
- 카드 padding: 16~20px
- 섹션 간격: 24~32px
- 페이지 최대 폭을 과도하게 제한하지 않는다.

관리자 화면은 모바일 앱보다 높은 정보 밀도를 허용한다.

---

## 1.4 One hierarchy per screen

한 화면에 시각적 주인공은 하나만 둔다.

예:

```text
자산 상세
└─ 자산명
   ├─ 현재 상태
   ├─ 계약
   ├─ 관리 이슈
   └─ House Log
```

모든 카드가 같은 중요도로 튀어나오지 않게 한다.

---

# 2. Color System

> 아래 색은 버틀러에 맞춰 재구성한 권장값이다.  
> Attio의 공식 색상 토큰이 아니다.  
> 버틀러는 아래 단일 밝은 색상 체계만 사용하며 별도의 테마 전환 기능은 구현하지 않는다.

## 2.1 Base theme

```css
--bg-app:             #F7F7F8;
--bg-surface:         #FFFFFF;
--bg-subtle:          #F3F4F5;
--bg-hover:           #F0F1F2;
--bg-selected:        #EEF2FF;

--text-primary:       #202124;
--text-secondary:     #60646C;
--text-tertiary:      #8A8F98;
--text-disabled:      #B5B8BE;
--text-inverse:       #FFFFFF;

--border-default:     #E3E5E8;
--border-subtle:      #ECEDEF;
--border-strong:      #C9CDD2;

--accent:             #635BFF;
--accent-hover:       #554DE8;
--accent-soft:        #F0EEFF;

--butler-lemon:       #DDF44A;
--butler-lemon-soft:  #F7FBCF;
--butler-forest:      #214032;

--success:            #238B5E;
--success-soft:       #EAF7F1;
--warning:            #B7791F;
--warning-soft:       #FFF7DF;
--danger:             #D14343;
--danger-soft:        #FDECEC;
--info:               #3974D8;
--info-soft:          #ECF3FF;
```

### Accent usage

기본 인터랙션 Accent는 보라/인디고 계열을 사용한다.

Butler Lemon은 브랜드 포인트로 제한한다.

권장:

```text
Primary CTA           → accent
선택된 navigation     → accent-soft
House Log highlight   → butler-lemon-soft
인증 완료             → success
관리주의               → warning
긴급 이슈              → danger
```

`butler-lemon`을 큰 배경 면적으로 남용하지 않는다.

---

# 3. Typography

## 3.1 Font stack

한국어 서비스이므로 다음 조합을 권장한다.

```css
font-family:
  "Pretendard",
  "Inter",
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

숫자가 많은 화면에서는 tabular numbers를 사용한다.

```css
font-variant-numeric: tabular-nums;
```

---

## 3.2 Type scale

| Token | Size | Weight | Line-height | Usage |
|---|---:|---:|---:|---|
| Display | 32px | 650 | 1.25 | 핵심 자산 가치 |
| H1 | 24px | 650 | 1.3 | 페이지 제목 |
| H2 | 20px | 600 | 1.35 | 주요 섹션 |
| H3 | 16px | 600 | 1.4 | 카드/패널 제목 |
| Body | 14px | 400 | 1.5 | 일반 내용 |
| Body Strong | 14px | 550 | 1.5 | 강조 정보 |
| Small | 13px | 400 | 1.45 | 테이블/메타 |
| Caption | 12px | 400 | 1.4 | 보조 설명 |
| Micro | 11px | 500 | 1.35 | badge / label |

### Rules

- 굵기 700 이상 남용 금지
- 본문은 14px 중심
- 관리자 테이블은 13~14px
- 대형 숫자는 28~32px
- Uppercase 남용 금지
- 설명 텍스트를 너무 연하게 만들지 않는다

---

# 4. Spacing

4px 기반 spacing scale을 사용한다.

```text
4   8   12   16   20   24   32   40   48   64
```

### Recommended

```text
Icon ↔ label                 8px
Input internal              10~12px
Card padding                16~20px
Section title ↔ content     12~16px
Component group             16px
Section ↔ section           24~32px
Page horizontal padding     24~32px desktop
                            16px mobile
```

---

# 5. Radius

Attio 계열 느낌을 유지하려면 지나치게 둥근 카드보다 중간 정도의 radius를 사용한다.

```css
--radius-xs:    4px;
--radius-sm:    6px;
--radius-md:    8px;
--radius-lg:    10px;
--radius-xl:    12px;
--radius-pill:  999px;
```

### Component radius

```text
Button        6~8px
Input         6~8px
Card          8~10px
Modal         12px
Badge         999px
Tooltip       6px
```

20~30px 수준의 과도한 "AI SaaS 카드 radius"는 사용하지 않는다.

---

# 6. Borders & Shadows

Attio-like UI의 핵심은 그림자보다 **border hierarchy**다.

## Border

```css
border: 1px solid var(--border-default);
```

### Rules

- 대부분의 카드: 1px border
- divider: border-subtle
- focused input: accent border + focus ring
- selected row: background + subtle border

---

## Shadow

그림자는 필요한 경우에만 사용한다.

```css
--shadow-sm:
  0 1px 2px rgba(0,0,0,.05);

--shadow-md:
  0 6px 18px rgba(0,0,0,.08);

--shadow-floating:
  0 10px 30px rgba(0,0,0,.12);
```

사용 대상:

- dropdown
- floating menu
- modal
- command palette

일반 카드에는 강한 shadow를 쓰지 않는다.

---

# 7. Application Layout

## 7.1 Desktop shell

```text
┌──────────────┬─────────────────────────────────────────┐
│ Sidebar      │ Topbar                                  │
│              ├─────────────────────────────────────────┤
│ Workspace    │                                         │
│              │ Page                                    │
│ Assets       │                                         │
│ Contracts    │                                         │
│ Issues       │                                         │
│ House Log    │                                         │
│ Vendors      │                                         │
│ Reports      │                                         │
│              │                                         │
│ Settings     │                                         │
└──────────────┴─────────────────────────────────────────┘
```

### Sidebar

```text
width: 240px
collapsed: 64px
background: surface
border-right: 1px solid border-subtle
```

Navigation item:

```text
height: 36px
radius: 6px
padding: 0 10px
icon: 16px
gap: 8px
```

Selected state:

```text
background: bg-selected
text: text-primary
icon: accent
```

---

## 7.2 Topbar

```text
height: 52~56px
border-bottom: 1px solid border-subtle
```

구성:

```text
Breadcrumb / Page context
                  Search
                  Create
                  Notification
                  Account
```

---

# 8. Page Header

기본 구조:

```text
Breadcrumb

Page title                    Primary action
Short description             Secondary action
──────────────────────────────────────────────
Tabs / Filters
```

예:

```text
자산 / 서울

래미안 퍼스티지                 [수리 요청] [⋯]
101동 1203호

임대중 · 소유자 인증 완료

개요   계약   수리/점검   House Log   문서
```

페이지 제목 옆에 불필요한 큰 아이콘은 넣지 않는다.

---

# 9. Cards

카드는 "정보 그룹"일 때만 사용한다.

## Default card

```css
background: var(--bg-surface);
border: 1px solid var(--border-default);
border-radius: 10px;
padding: 16px;
```

### Card hierarchy

```text
Title
Supporting text

Primary value
Secondary metadata

Optional action
```

---

## KPI Card

```text
총 자산 가치
₩1,284,000,000
+2.4% 최근 실거래 기준
```

### Rules

- KPI 한 카드에 숫자 하나
- 아이콘 장식은 선택 사항
- 변화율은 작은 badge
- 그래프는 실제 의미가 있을 때만 표시

---

# 10. Tables

버틀러 관리자 Console의 핵심 컴포넌트다.

## Table anatomy

```text
Toolbar
├─ Search
├─ Filter
├─ Sort
├─ View
└─ Create

Header
Rows
Pagination / Load more
```

### Dimensions

```text
header height: 40px
row height: 44px
cell padding-x: 12px
font-size: 13~14px
```

### Style

```text
Header:
  background: bg-subtle
  text: text-secondary
  font-weight: 500

Row:
  border-bottom: 1px solid border-subtle

Hover:
  background: bg-hover

Selected:
  background: bg-selected
```

### Required behavior

- Sticky table header
- Column sorting
- Search
- Filter
- Column visibility
- Horizontal scroll
- Checkbox bulk selection
- Row click opens detail
- 우측 action menu

---

# 11. Buttons

## Primary

```text
background: accent
text: white
height: 36~40px
radius: 7px
```

사용:

- 저장
- 생성
- 승인
- 인증 시작
- 핵심 업무 완료

---

## Secondary

```text
background: surface
border: border-default
text: text-primary
```

---

## Ghost

```text
background: transparent
hover: bg-hover
```

---

## Danger

Danger action은 평상시 강조하지 않는다.

```text
default: neutral
confirm state: danger
```

예:

```text
자산 삭제
계약 취소
문서 폐기
```

---

# 12. Inputs & Forms

## Input

```text
height: 40px
border: border-default
radius: 7px
background: surface
```

Focus:

```text
border-color: accent
box-shadow: 0 0 0 3px rgba(99,91,255,.12)
```

### Form rules

- label은 input 위에 배치
- placeholder를 label 대신 사용하지 않는다
- 에러 메시지는 input 바로 아래
- 필수 여부는 명확하게 표시
- 긴 폼은 Section으로 나눈다
- 저장 상태를 명확히 표시

---

# 13. Dropdown / Command Menu

업무용 SaaS 느낌을 강화하는 핵심 요소다.

```text
Search...
────────────────
최근 사용
서울 래미안
고양 힐스테이트

전체 자산
...
```

### Style

```text
width: 240~360px
radius: 10px
shadow: floating
padding: 6px
item height: 36px
```

Keyboard navigation을 지원한다.

```text
↑ ↓ navigate
Enter select
Esc close
```

---

# 14. Status Badges

색상만으로 상태를 전달하지 않는다.

## Examples

```text
● 임대중
● 공실
● 계약 만료 예정
● 수리 진행중
● 점검 필요
● 인증 완료
● 인증 필요
```

### Suggested mapping

| Status | Tone |
|---|---|
| 정상 / 완료 | Success |
| 진행중 | Info |
| 확인 필요 | Warning |
| 문제 / 지연 | Danger |
| 비활성 | Neutral |

Badge:

```text
height: 22~24px
padding: 0 8px
font-size: 11~12px
radius: pill
```

---

# 15. Tabs

페이지 안에서 같은 객체의 여러 관점을 전환할 때 사용한다.

```text
개요   계약   수리/점검   House Log   문서
────
```

### Style

과도한 pill 탭보다 간결한 underline/selected text를 선호한다.

---

# 16. Asset Detail

버틀러의 대표 화면.

```text
래미안 퍼스티지
101동 1203호

[임대중] [소유자 인증 완료]

────────────────────────────

자산 가치
₩1,284,000,000
최근 실거래 +2.4%

계약
2026.03.01 ~ 2028.02.28
월세 1,300,000원

관리 상태
관리 지수 86
수리 요청 1건
정기 점검 D-21
```

### Layout

Desktop:

```text
Main 2/3
Sidebar 1/3
```

Main:

- 자산 기본 정보
- 계약
- 수리/점검
- House Log

Sidebar:

- 상태
- 담당자
- 예정 일정
- 빠른 작업

---

# 17. Butler Dashboard

홈 대시보드에서는 데이터가 아니라 판단을 보여준다.

```text
안녕하세요, 사용자님

총 자산 가치
₩1,284,000,000

보유 자산    3
임대중       2
공실         1
수리 요청    2

지금 확인할 일
────────────────────────
래미안 1203호   누수 수리 견적 승인 필요
힐스테이트 804호 계약 만료 D-30
```

### Priority

```text
1. Attention required
2. Portfolio overview
3. Upcoming schedule
4. Recent activity
```

---

# 18. House Log

House Log는 버틀러만의 핵심 차별 요소로 취급한다.

## Timeline

```text
2026.10.02
수전 교체 완료
관리자 김OO
₩85,000
[작업 사진 3]

2026.09.14
정기 점검 완료
특이사항 없음

2026.08.21
임차인 수리 요청
욕실 수전 누수
```

### Rules

- 시간순
- 작업자
- 비용
- 사진
- 증빙
- 상태
- 관련 계약/업체 연결

모든 항목이 하나의 audit trail처럼 이어져야 한다.

---

# 19. Drawer vs Modal

## Drawer

다음에 사용:

- 상세 정보 미리보기
- 자산 quick view
- 계약 quick view
- 수리 요청 상세
- 필터 설정

```text
width: 420~560px desktop
```

## Modal

다음에 사용:

- 삭제 확인
- 승인 확인
- 간단한 생성
- 짧은 form
- 중요한 destructive action

복잡한 작업을 modal 안에 넣지 않는다.

---

# 20. Empty State

과장된 illustration은 피한다.

```text
등록된 자산이 없습니다.

첫 번째 자산을 등록하면
계약, 수리, 점검 기록을 한곳에서 관리할 수 있습니다.

[자산 등록]
```

---

# 21. Loading

### Skeleton

카드/테이블 구조를 그대로 유지한 skeleton을 사용한다.

### Avoid

```text
화면 전체 spinner
과도한 shimmer
로딩 중 레이아웃 이동
```

---

# 22. Notifications

Toast는 짧은 결과 전달에만 사용한다.

```text
✓ 계약 정보가 저장되었습니다.
✓ 수리 요청을 생성했습니다.
! 소유자 인증 정보를 다시 확인해주세요.
```

중요한 업무 상태는 toast만으로 끝내지 않고 화면에도 반영한다.

---

# 23. Search

Global search를 적극 활용한다.

검색 대상:

```text
자산
주소
임차인
계약
수리 요청
업체
문서
House Log
```

Command-style search:

```text
⌘K / Ctrl+K
```

---

# 24. Responsive

## Desktop

```text
>= 1280px
Sidebar + full table
```

## Tablet

```text
768~1279px
Collapsed sidebar
Reduced columns
Drawer details
```

## Mobile

```text
< 768px
Bottom navigation
Single-column
Table → list/card
Primary action fixed when needed
```

모바일에서 desktop table을 그대로 축소하지 않는다.

---

# 25. Motion

애니메이션은 빠르고 절제한다.

```text
hover:        100~150ms
dropdown:     120~180ms
drawer:       180~240ms
modal:        160~220ms
```

Easing:

```css
cubic-bezier(.2,.8,.2,1)
```

금지:

- bounce
- 과도한 spring
- 긴 fade
- 장식 목적의 parallax

---

# 26. Icons

권장:

- Lucide
- Radix Icons
- Phosphor (regular)

기본 크기:

```text
16px inline
18px navigation
20px primary actions
```

아이콘만 있는 버튼에는 tooltip 필수.

---

# 27. Data Visualization

그래프는 숫자를 예쁘게 만들기 위한 장식이 아니다.

추천:

- line chart → 자산 가치 추이
- bar chart → 월별 수익/비용
- stacked bar → 유지보수 비용 분류
- donut → 제한적으로 사용

금지:

- 3D chart
- gradient 과다
- 의미 없는 gauge
- 지나치게 많은 색상

Chart palette:

```text
Primary    #635BFF
Secondary  #3974D8
Success    #238B5E
Warning    #B7791F
Danger     #D14343
Neutral    #A4A8AE
```

---

# 28. Accessibility

필수:

- WCAG AA 수준 contrast 목표
- Keyboard navigation
- Visible focus state
- aria-label
- form label 연결
- status를 색상만으로 표현하지 않기
- 최소 touch target 40×40px
- text zoom 대응

---

# 29. Butler-specific Navigation

## Owner / Landlord

```text
홈
내 자산
임대차
수리·점검
House Log
리포트
커뮤니티
AI 도움
설정
```

## Manager / Admin

```text
대시보드
자산
사용자
계약
수리 요청
점검
업체
문서
정산
리포트
운영 로그
설정
```

---

# 30. Do / Don't

## DO

- thin border
- white / neutral surface
- compact controls
- clean hierarchy
- searchable table
- keyboard-friendly workflow
- small status badge
- drawer-based detail view
- sticky table header
- contextual action menu
- consistent page header
- dense but ordered information

## DON'T

- glassmorphism
- neon gradient
- giant rounded cards
- excessive shadows
- every section in a card
- random icon backgrounds
- decorative 3D objects
- giant hero inside product UI
- color on every KPI
- 20px+ radius everywhere
- floating blobs
- dashboard full of donut charts
- mobile UI enlarged 그대로 desktop에 사용

---

# 31. CSS Token Example

```css
:root {
  --bg-app: #F7F7F8;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F3F4F5;
  --bg-hover: #F0F1F2;
  --bg-selected: #EEF2FF;

  --text-primary: #202124;
  --text-secondary: #60646C;
  --text-tertiary: #8A8F98;

  --border-default: #E3E5E8;
  --border-subtle: #ECEDEF;
  --border-strong: #C9CDD2;

  --accent: #635BFF;
  --accent-hover: #554DE8;
  --accent-soft: #F0EEFF;

  --butler-lemon: #DDF44A;
  --butler-forest: #214032;

  --success: #238B5E;
  --warning: #B7791F;
  --danger: #D14343;
  --info: #3974D8;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;

  --shadow-sm: 0 1px 2px rgba(0,0,0,.05);
  --shadow-md: 0 6px 18px rgba(0,0,0,.08);

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
}
```

---

# 32. Tailwind Mapping Recommendation

```js
colors: {
  background: "#F7F7F8",
  surface: "#FFFFFF",
  subtle: "#F3F4F5",

  foreground: "#202124",
  muted: "#60646C",

  border: "#E3E5E8",

  primary: "#635BFF",
  "primary-hover": "#554DE8",

  lemon: "#DDF44A",
  forest: "#214032",

  success: "#238B5E",
  warning: "#B7791F",
  danger: "#D14343",
}
```

---

# 33. Recommended Component Stack

React 기준:

```text
React / Next.js
Tailwind CSS
shadcn/ui
Radix UI
Lucide Icons
TanStack Table
React Hook Form
Zod
Recharts
Framer Motion (minimum usage)
```

### Important

shadcn/ui 기본 스타일을 그대로 사용하지 말고  
이 DESIGN.md의 spacing, radius, border, color token에 맞게 재정의한다.

---

# 34. Coding Agent Instructions

AI 코딩 도구는 UI 작업 시 다음 규칙을 항상 우선한다.

```text
1. DESIGN.md를 UI의 단일 시각 기준으로 사용한다.
2. 기존 기능 로직은 디자인 변경 때문에 삭제하거나 단순화하지 않는다.
3. 색상, radius, spacing을 임의로 추가하지 않는다.
4. 가능한 모든 값은 design token으로 관리한다.
5. 새 컴포넌트는 기존 컴포넌트 패턴을 재사용한다.
6. 테이블 중심 화면은 정보 밀도를 유지한다.
7. 카드 남용을 피한다.
8. 중요 상태는 색상 + 텍스트를 함께 사용한다.
9. desktop / tablet / mobile을 각각 검토한다.
10. 접근성과 keyboard navigation을 유지한다.
11. 색상 체계는 이 문서의 단일 Base theme만 사용하며 별도의 테마 전환 UI나 추가 테마 토큰을 만들지 않는다.
```

---

# 35. Agent Prompt

아래 문장을 Claude Code, Codex, Cursor 등의 최초 작업 지시로 사용할 수 있다.

```text
이 프로젝트의 UI를 `BUTLER_ATTIO_DESIGN.md`를 기준으로 전면 정리해줘.

목표는 Attio 계열의 정돈된 B2B SaaS/CRM 인터페이스를 기반으로,
부동산 자산관리 서비스 Butler에 맞는 신뢰감 있고 정보 밀도 높은 UI를 만드는 것이다.

디자인 변경 시 기존 기능과 데이터 흐름을 임의로 삭제하지 말고,
먼저 현재 컴포넌트와 페이지 구조를 분석한 뒤 공통 design token과
shared component를 정리하고 단계적으로 리팩터링해라.

특히 다음을 우선 적용한다.

- neutral background + white surface
- subtle 1px border
- compact controls
- 6~10px radius
- clear typography hierarchy
- sidebar navigation
- sticky table headers
- searchable/filterable tables
- contextual drawers
- restrained shadows
- concise status badges
- Butler Lemon은 제한적인 브랜드 accent로만 사용

화면마다 카드로 모두 감싸는 generic AI SaaS 디자인,
glassmorphism, neon gradient, 과도한 rounded card와 shadow는 사용하지 마라.
```

---

# 36. Final Design Definition

버틀러의 최종 디자인을 한 문장으로 정의하면:

> **“복잡한 부동산 관리 정보를 조용하고 정밀하게 정돈하는 현대적인 CRM형 자산관리 인터페이스.”**

시각적으로는 Attio 계열의  
**neutral surface / compact density / subtle border / structured data / contextual workflow**를 가져오고,

버틀러의 정체성은

- 부동산 자산
- 신뢰
- House Log
- 관리 상태
- 소유자 인증
- OddLemon Lemon accent

를 통해 차별화한다.
