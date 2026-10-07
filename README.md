# 버틀러 자산 현황 대시보드 PoC (v3)

임대인이 **건물 → 호실 → 계약**을 등록하면, 국토교통부·한국부동산원 공공데이터로 호실의 **매매 시세(매입가 대비)**, **임대 수준(환산 월세와 주변 전월세)**, **건물 정보(건축물대장)**를 보여 주는 모바일 웹 PoC입니다. 화면의 모든 시세 숫자는 실제 공공데이터에서 나오며, 예시·샘플 데이터는 없습니다.

- 개발 완료 보고서: [docs/development-completion-report.md](docs/development-completion-report.md)
- v3 명세: [docs/butler-poc-improvement-spec.md](docs/butler-poc-improvement-spec.md) · 디자인: [docs/DESIGN.md](docs/DESIGN.md), [docs/DESIGN-mobile.md](docs/DESIGN-mobile.md)
- API 실측 노트: [docs/api-notes.md](docs/api-notes.md) · 검증 기록: [docs/verification.md](docs/verification.md)
- 이전 단계: [PRD](docs/PRD.md) · [PoC 보고서](docs/poc-report.md) · [v2 완료 보고서](docs/development-completion-report-v2.md)

## 준비

1. **Node.js 22 LTS** (`.nvmrc`). better-sqlite3의 미리 빌드된 바이너리를 쓰므로 버전을 맞춰 주세요.
2. 공공데이터포털(data.go.kr)에서 같은 계정으로 다음 API의 활용신청을 해 주세요.
   - 국토교통부_아파트 매매 실거래가 **상세** 자료
   - 국토교통부_아파트 전월세 실거래가 자료 (v3)
   - 국토교통부_건축HUB_건축물대장정보 서비스 (호실 면적·층, 표제부·총괄표제부)
   - 국토교통부_공동주택 단지 목록제공 서비스
   - 국토교통부_공동주택 기본 정보제공 서비스
3. 한국부동산원 R-ONE 부동산통계 Open API 인증키를 받아 주세요(전월세전환율, v3).
4. `.env` 파일을 프로젝트 최상위에 만듭니다(`.env.example` 참고).

   ```
   DATA_GO_KR_SERVICE_KEY=<일반 인증키(Decoding)>
   RONE_API_KEY=<R-ONE 인증키>
   ```

   - 선택: `RENT_CONVERSION_RATE`·`RENT_CONVERSION_RATE_YM`(R-ONE을 못 쓸 때 직접 넣는 전환율, 화면에 "직접 입력한 값"으로 표시), `DB_PATH`(기본 `~/.butler-poc/app.db`. OneDrive 같은 동기화 폴더 밖에 둡니다), `AS_OF`(기준 월 YYYYMM 고정)·`TODAY`(오늘 날짜 고정, 검증용), `API_PORT`(기본 3001)
   - `.env`는 git에 올리지 않습니다. 키는 화면, 로그, 오류 메시지에 나오지 않습니다.

## 설치와 실행

```bash
npm install
```

```bash
npm run dev
```

- 서버(3001)와 화면(5173)이 함께 뜹니다. 브라우저에서 http://localhost:5173 을 엽니다(모바일 폭 기준, 최대 480px).
- 처음 실행할 때 서울 단지 목록(약 3,400개)을 한 번 받아 저장합니다.
- v2 DB(`assets` 표)가 있으면 첫 실행 때 같은 폴더에 백업(`app-v2-backup-…db`)을 만든 뒤 v3 구조로 바꿉니다. 실거래 캐시는 그대로 씁니다.

## 테스트와 검증

```bash
npm test
```

```bash
npm run verify
```

```bash
npm run e2e
```

```bash
npm run scan-secrets
```

- `npm test`: 서버 142개, 화면 53개 단위·통합 테스트. 실제 응답 표본은 `server/test/fixtures`에 있습니다.
- `npm run verify`: 서버가 떠 있는 상태에서 실행합니다. 저장된 원본 응답(매매·전월세)을 앱 코드와 독립적으로 다시 계산해 API 값과 비교합니다.
- `npm run e2e`: 서버와 화면이 떠 있는 상태에서 실행합니다(서버는 `AS_OF`·`TODAY` 고정 권장). 헤드리스 Edge/Chrome으로 **기존 데이터를 화면에서 지운 뒤** 건물·호실·계약을 실제 조회로 등록하고, 모든 화면을 돌며 캡처(`docs/screens/v3/`)와 화면 점검(390px 가로 넘침, 하단 고지, 글자 12px, 터치 44px, 콘솔 오류)을 한 다음, 화면 값을 독립 재계산과 대조합니다. 결과는 `verify/out/e2e-result.json`.
- `npm run scan-secrets`: 인증키가 파일, git 이력, 저장된 응답, 로그에 없는지 검사합니다.
- `node scripts/v3-golden.mjs check`: v2 → v3 구조 변경 전후로 비교 3가지·참고 범위 거래 출력이 같은지 확인합니다.
- `node verify/e0-measure.mjs`: 비교 근거의 기간·면적 범위별 건수를 실측해 `docs/e0-measure.md`를 만듭니다.

### 화면 상태 점검용 결함 주입 (개발 전용)

```bash
node server/src/index.js --dev-fault=fetch
```

- `--dev-fault=fetch`는 수집 실패, `--dev-fault=quota`는 한도 초과를 흉내 냅니다. DB에는 아무것도 기록하지 않고 화면 위에 배너가 뜹니다. `AS_OF`와 함께 쓸 수 없습니다.

## 구조

```
server/   Express API, SQLite(건물·호실·계약, 실거래·전월세 원본 보관), 수집(구 × 월 단위), 단지 연결·시세·임대 계산
client/   Vue 3 + Vite 화면 (전체 메뉴, 건물 관리, 호실, 자산 분석, 계약 관리), v3 디자인 토큰과 공통 컴포넌트(src/ui)
verify/   독립 재계산, 화면 값 추출, 화면 E2E, 비밀 스캔, 앱 코드 import 검사
scripts/  API 프로브, v2→v3 골든 비교
docs/     명세, 디자인, API 노트, 검증 기록, 보고서, 화면 캡처
```

## 알려진 한계

- 서울 25개 구, K-APT 가입 단지만 검색됩니다.
- 실거래 신고는 계약 후 30일 안에 하므로 최근 1~2개월은 적게 보일 수 있습니다.
- 계약(보증금·월세·기간)은 사용자가 입력한 값이며, 소유 여부는 확인하지 않습니다.
- 참고용 정보이며 감정평가가 아닙니다. 세금, 대출, 중개비는 반영하지 않습니다.
