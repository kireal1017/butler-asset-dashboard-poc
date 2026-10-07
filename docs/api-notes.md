# API 확인 노트 (M0)

확인일 2026-10-05. 재현: `node scripts/m0-probe.mjs` (응답은 `~/.butler-poc/m0-cache`에 캐시, `--refresh`로 재호출).
인증키는 이 문서와 `server/test/fixtures/`에 들어 있지 않다(원본·URL 인코딩 형태 모두 grep 0건).

## 1. 엔드포인트와 요청 변수 (실측)

| API | 주소 | 요청 변수 | 형식 |
|---|---|---|---|
| 아파트 매매 실거래가 상세 | `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev` | `serviceKey`, `LAWD_CD`(5), `DEAL_YMD`(6), `pageNo`, `numOfRows`(1000 사용) | XML |
| 건축HUB 전유공용면적 | `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo` | `serviceKey`, `sigunguCd`, `bjdongCd`, `platGbCd`, `bun`(4), `ji`(4), `dongNm`, `hoNm`, `pageNo`, `numOfRows`, `_type=json` | JSON |
| 공동주택 단지 목록 | `https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4` | `serviceKey`, `sidoCode`(서울 11), `pageNo`, `numOfRows`(4000이면 서울 전체 1회) | JSON |
| 공동주택 기본 정보 | `https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5` | `ServiceKey`(대문자 S), `kaptCode` | JSON |
| 공동주택 상세 정보 | `https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5` | `ServiceKey`, `kaptCode` | JSON |

- 키는 Decoding 키를 `URLSearchParams`로 한 번만 인코딩해 보낸다. 정상 동작을 확인했다.
- 승인 전 상세 실거래 API는 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(reason 30)를 반환했다. 다른 API가 정상이면 활용신청·반영 문제다.

## 2. 응답 필드 (실측)

**실거래 상세 `<item>`**
- 필드: `aptDong aptNm aptSeq bonbun bubun buildYear buyerGbn cdealDay cdealType dealAmount dealDay dealMonth dealYear dealingGbn estateAgentSggNm excluUseAr floor jibun landCd landLeaseholdGbn rgstDate roadNm roadNmBonbun roadNmBubun roadNmCd roadNmSeq roadNmSggCd roadNmbCd sggCd slerGbn umdCd umdNm`
- `dealAmount`: `"43,000"`처럼 쉼표가 들어간 만원 단위 문자열이다.
- `bonbun`·`bubun`: `"0271"`처럼 4자리 0 채움 문자열이다. `jibun`은 `"271-3"`이다.
- 빈 값은 태그 안이 공백 `" "`이다. trim해서 쓴다.
- `excluUseAr`의 소수 자릿수는 **최대 4자리**다. 그래서 면적은 1/10000㎡ 정수로 저장한다(계획 M1.3).

**단지 목록**
- 필드: `kaptCode kaptName bjdCode as1 as2 as3 as4`
- **지번이 없다.** 서울 `totalCount` = 3,405이고, 한 번 호출로 3,405건을 받았다.

**기본 정보**
- `kaptAddr`의 예: `"서울특별시 노원구 하계동 271-3 하계극동건영벽산"` → 지번을 여기서 파싱한다(P1).
- 그 밖의 필드: `kaptdaCnt`(세대수), `kaptDongCnt`, `kaptUsedate`(YYYYMMDD), `doroJuso`, `bjdCode`

**상세 정보**
- 주차 대수는 `kaptdPcnt`(지상), `kaptdPcntu`(지하)다(P9 확인). 기본 정보에는 없다.

**건축물대장**
- 필드: `dongNm hoNm flrNo flrNoNm exposPubuseGbCdNm(전유/공용) area bldNm mgmBldrgstPk etcPurps`
- 면적의 소수 자릿수는 최대 2자리다.

## 3. 연결 실측 (하계동, 법정동 코드 `1135010400`)

| K-APT | 지번 | 실거래 aptSeq | 대장 조회 예 | 같은 면적 거래 수* |
|---|---|---|---|---|
| A13987303 하계현대우성 | 270 | 11350-85 현대, 11350-75 우성 | 104동 501 → 84.95㎡ 5층 | 56 |
| A13987306 하계극동건영벽산 | 271-3 | 11350-67 건영, -68 극동, -70 벽산 | 4동 612 → 55.72㎡ 6층 | 32 |
| A13987304 하계 6단지 장미아파트 | 273 | 11350-72 장미(시영6) | 602동 702 → 49.5㎡ 7층 | 34 |
| A13993501 하계삼익선경 | 255-1 | 11350-71 삼익선경 | **1동 + 402호** → 107.95㎡ 4층 | 17 |
| A13923103 하계청구 | 284 | 11350-76 청구 (이름 규칙) | (아래 주의) | — |
| A13993503 하계한신 | 284 | 11350-81 한신1 (이름 규칙) | 1동 1304 → 27㎡ 13층 | 55 |

\* 2016-07~10과 2025-10~2026-09의 하계동 거래 가운데, 같은 단지(aptSeq 집합)에 면적 차이 0.1㎡ 이내이고 해제되지 않은 건

### 확인된 사실과 PRD와의 차이

1. **K-APT 단지 1개 ↔ 실거래 단지 여러 개**: 270은 2개, 271-3은 3개다.
2. **같은 지번에 K-APT 단지 2개(284)**: 정규화한 이름(`하계청구`→`청구`, `하계한신`/`한신1`→`한신`)이 양방향 모두 유일하게 맞아 연결된다.
3. **동·호 표기는 단지마다 다르다.** 대부분 `104동`+`501`이지만 하계삼익선경은 `1동`+`402호`다. 4가지 조합을 차례로 시도해야 한다.
4. **같은 지번 대장에 여러 단지의 호실이 섞여 있다(284).** `1동 1304`는 `bldNm=한신아파트`다. 하계청구로 등록할 때 이 호실을 받아들이면 안 된다. 대장 행의 `bldNm`과 단지 이름을 대조해야 한다(구현 규칙).
5. **⚠ "같은 단지·같은 면적"이 실제로는 다른 건물의 거래를 섞는다(PRD 7.3).**
   - 하계현대우성에는 현대 84.95/84.96㎡와 우성 84.91㎡가 있다. 둘 다 0.1㎡ 이내라 PRD 규칙대로면 같은 면적이 된다.
   - 최근 거래의 `aptDong`으로 보면 현대는 101~106동, 우성은 107~112동이다. 동 이름으로 소속 aptSeq를 정할 수 있다.
   - **사용자 결정 필요**(5장).
6. **2016년 거래는 `aptDong`이 100% 비어 있다**(4,719/4,719). 최근 12개월은 21%가 비어 있다(1,579/7,631).
7. 해제 거래(`cdealType=O`)는 노원구 16개월 중 179건이다. 직거래(`dealingGbn=직거래`)는 2016년 0건, 최근 12개월 267건(3.5%)이다.
8. 한 달 1,000건을 넘는 달이 있다(2016-07 1,216건, 2016-10 1,249건, 2026-04 1,042건). 페이지 처리가 필수다.
9. 최근 달은 신고 지연으로 적게 잡힌다(2026-09 177건, 2026-08 535건). PRD 7.8의 재수집 규칙이 필요한 이유다.
10. 같은 조건(동·층·면적·금액·날짜)의 거래가 겹치는 그룹이 45개 있다. 자연키를 쓰면 행을 잃는다(계획 D1의 근거).
11. 2016-10 1페이지를 두 번 호출했을 때 **응답 순서가 같았다**(1회 확인).
12. 경계 케이스의 **실제 표본이 있다**: 같은 aptSeq 안에서 면적 차이가 0.09~0.11㎡인 쌍 20개, 해제 거래, 동일 조건 중복. 합성 벡터는 필요 없다.

### 연결 실패 사례
- 프로브 대상 6곳은 모두 연결됐다.
- 다필지 단지: 프로브 대상 6곳에서는 발견되지 않았다. 범위를 하계동 전체로 넓히자 학여울청구A·B(K-APT 355·356 ↔ 실거래 354)가 확인됐다(`data-quality.md` 1.3).
- 계획 M2.1-3b 규칙은 테스트로만 확인한다.

## 4. 골든 사례 A (`verify/golden-case-a.json`)
- 하계현대우성 **112동 1001호**: 우성(11350-75) 소속 동, 84.91㎡, 10층, 취득 연월 2016-10
- 기대 매입 거래: 2016-07-21, 10층, 84.91㎡, 43,000만원, 동 정보 없음
- 첫 실행은 현대 소속 104동 1001호(84.95㎡)를 골랐다. 이 문제(5항) 때문에 다른 건물의 우성 거래를 매칭했다. 그래서 동 소속을 반영하도록 수정했다.

## 5. 사용자 결정 (2026-10-05 확정)

**(c) 같은 단지 범위 (PRD 7.3 변경)**
- "같은 단지"를 **자산의 동이 속한 실거래 단지(aptSeq)**로 좁힌다.
- 동의 소속은 저장된 거래의 `aptDong` 중 같은 K-APT 단지에 연결된 aptSeq에서 정한다.
- 동 하나가 여러 aptSeq에 나오면 거래 수가 가장 많은 aptSeq로 정하고, 동률이면 미확정으로 둔다.
- 동 근거가 없을 때의 보조 규칙(구현 중 추가): 대장 전용면적과 **정확히 같은 면적**의 거래가 있는 aptSeq가 하나뿐이면 그 단지로 정한다. 예를 들어 우성 112동은 최근 12개월에 동 정보가 있는 거래가 없었지만, 84.91㎡ 거래는 우성에만 있다. 대장과 실거래 면적은 같은 원천이라 실측에서 일치했다(3장).
- 소속을 정할 수 없으면 K-APT 단지에 연결된 aptSeq 전체를 쓰고, 화면에 "동 소속을 확인할 수 없어 단지 전체 거래 기준" 안내를 띄운다.
- 매칭(PRD 7.6)과 현재가·시계열 모두 이 범위를 쓴다.
- 2016년 거래는 동 정보가 없어도 aptSeq로 거르므로 이 규칙이 그대로 적용된다.

**(a) 같은 날 여러 건 (PRD 12장 유지)**
- 고정 규칙: 정렬 `deal_day → apt_seq → apt_dong → floor → deal_amount → 면적`의 마지막 행을 "마지막 거래"로 본다.
- 재수집해도 결과가 바뀌지 않는다.

**(b) 직거래 (P7)**
- 계산은 바꾸지 않는다.
- `dealingGbn=직거래`인 거래는 현재가와 최근 거래 목록에 "직거래" 배지를 표시한다.

**추가 구현 규칙 (3장 4항)**
- 같은 지번에 단지가 여럿이면, 대장 조회 결과의 `bldNm`을 단지 이름과 정규화 비교한다. 다른 단지 호실이면 거부한다.

## 6. 알려진 한계
- **P8:** 해제 신고는 계약 후 몇 달 뒤에도 들어온다. 재수집은 최근 3개월만 했으므로(PRD 7.8) 오래된 달에 늦게 들어온 해제가 반영되지 않았다 → 개선 v2에서 12개월로 넓힘(7장).
- 단지 목록은 K-APT 가입 단지만 포함한다(PRD 5.3).

## 7. 개선 v2 추가 사항 (2026-10-07)

### 엔드포인트
| 경로 | 동작 |
|---|---|
| `GET /api/assets/:id/comparisons` | 비교 근거 3섹션(`sameFloor`, `sameComplex`, `neighborhood`). **DB만 읽고 외부 호출을 하지 않는다.** 섹션마다 `status`: `ready` / `missing`(필요한 달이 없음) / `collecting`(수집 중, `progress`) / `failed`(수집 실패, `error`에 기존 안내 문장) |
| `POST /api/assets/:id/comparisons/collect` | 빠진 달만 수집 시작(202). 같은 층 36개월은 3년 탭과 같은 수집 작업(`series:{id}:3y`)을, 단지·동네 12개월은 등록 수집 작업(`asset:{id}`)을 쓴다. 이미 실행 중이면 다시 시작하지 않는다 |

- 단지 식별 값은 `aptSeq`, 법정동은 K-APT `bjd_code` 5~10자리 = 실거래 `umdCd`, 동네 목록의 단지명은 그 단지 최근 거래의 `aptNm`. 세 값 모두 전 기간 결측 0%(E0).
- 실거래 단지 연결이 없는 자산은 `linked: false` — 같은 단지는 빈 결과, 동네 시세는 내 단지를 제외할 수 없어 계산하지 않는다.

### 재수집 범위 변경 (명세 4.3)
- 앱을 열 때 자산이 있는 시군구마다 **최근 12개월**(기존 3개월) 중 마지막 수집 후 30일이 지난 달을 다시 받는다(`REFRESH_MONTHS`, `server/src/services/valuation.js`).
- 늘어나는 호출: 시군구 1곳당 30일마다 최대 12회(기존 3회). 이 PoC(노원구·종로구)는 최대 24회/30일로, 실거래 API 일일 한도 10,000회 대비 무시할 수준이다. 노원구처럼 한 달 거래가 1,000건을 넘으면 페이지 수만큼 더 든다.
- 재수집으로 확정된 매입 거래가 해제로 바뀌는 경우: 매입가는 자산에 복사해 둔 값이라 그대로 남고(카드의 매입가 대비 증감도 유지), 그 거래는 같은 층 목록·최근 거래·현재가 계산에서만 빠진다(기존 동작 유지).

## 8. v3 추가 API 실측 (2026-10-08, `scripts/v3-api-probe.mjs`)

| API | 주소 | 결과 |
|---|---|---|
| 아파트 전월세 실거래가 | `https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent` (`serviceKey`, `LAWD_CD`, `DEAL_YMD`, `pageNo`, `numOfRows`) | **정상**(기존 `DATA_GO_KR_SERVICE_KEY`). XML, `resultCode 000`. 노원구 2026-09 885건, 하계동 71건 |
| 건축HUB 표제부 | `https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo` (`sigunguCd`, `bjdongCd`, `platGbCd=0`, `bun`(4), `ji`(4), `_type=json`) | **정상**(같은 키, 추가 신청 불필요). JSON, `resultCode "00"`(실거래의 `"000"`과 다름) |
| 건축HUB 총괄표제부 | `.../getBrRecapTitleInfo` (같은 인자) | **정상**. 하계 270번지 1건 |
| R-ONE 통계 | `https://www.reb.or.kr/r-one/openapi/{SttsApiTbl,SttsApiTblItm,SttsApiTblData}.do` (`KEY`, `Type=json`, `pIndex`, `pSize`) | **정상**(`RONE_API_KEY`). 응답 `content-type`은 text/html이지만 본문은 JSON |

### 전월세 실거래 응답
- 필드: `aptNm, aptSeq, buildYear, contractTerm, contractType, dealDay, dealMonth, dealYear, deposit, excluUseAr, floor, jibun, monthlyRent, preDeposit, preMonthlyRent, roadnm…, sggCd, umdNm, useRRRight`
- 금액은 만원 단위 문자열에 쉼표(`deposit "17,850"`), 저장 시 원 단위로 변환한다.
- **`aptSeq`가 있다.** v3 6장의 `rent_transactions`는 단지명·지번으로 맞추게 되어 있지만, 매매와 같은 `aptSeq`로 단지 연결 집합(`resolveLink`)을 그대로 쓸 수 있어 더 정확하다 → `rent_transactions`에 `apt_seq` 컬럼을 둔다.
- 동·호 없음(명세와 같음). `contractType`은 빈 값(`" "`)인 행이 있다(신규/갱신 미기재) — 저장만 하고 거르지 않는다(v3 7.6).

### 건축물대장 표제부 (하계현대우성, 하계동 270)
- 21줄: 아파트 동 외에 중간기계실·노인정·관리사무소·중앙공급실도 **주용도가 '공동주택'**으로 나온다. "공동주택 중 지상 층수 최대 줄" 규칙으로 15층 동(110동)이 대표로 뽑힌다(1층 오류 없음). 상가동은 '제1종근린생활시설'.
- 동별 `hhldCnt`(120·90…), 총괄표제부 `hhldCnt 1320`(K-APT 세대수와 일치) → 세대수는 총괄표제부 우선.
- 주차: 표제부는 동별 `indr/oudr` × `Auto/Mech` 대수, 총괄표제부 `totPkngCnt`가 이 단지에서는 0 → 대장 주차는 신뢰하기 어렵다. 0이면 행을 숨긴다(v3 8.3 "값이 없는 행은 숨긴다"). (참고: K-APT 주차 992대)
- 사용승인일: 동별 `useAprDay` 19881130 / 부속 19880929, 총괄표제부는 공백 → 대표 동의 값 사용.
- 구조 `strctCdNm`(철근콘크리트구조), 연면적 총괄 `totArea` 147,781㎡.

### R-ONE 전월세전환율
- **한 번에 1,000건을 요청하면 서버가 연결을 끊는다**(`terminated`). `pSize`는 100 이하로 나눠 받는다.
- 통계표: `A_2024_00156` "지역별 전월세 전환율_아파트"(월), 지역 분류 `CLS_ID 500006` = 서울, 항목 `ITM_ID 100001` "전월세 전환율", 단위 %. 종합주택(`A_2024_00155`)과 혼동 주의.
- 조회: `SttsApiTblData.do?STATBL_ID=A_2024_00156&DTACYCLE_CD=MM&CLS_ID=500006&START_WRTTIME=YYYYMM&END_WRTTIME=YYYYMM` → 서울 행만 온다.
- 최근 값: **2026-07 4.74%**(2026-06 4.74, 2026-05 4.73). 기준 월 2026-10 대비 약 3개월 늦게 공표된다 → 화면 주석 "서울, 기준 2026.07".
- `.env`에 수동 대체값(`RENT_CONVERSION_RATE`)은 없다. R-ONE 실패 시 v3 7.5 문구로 환산 행을 숨긴다.
