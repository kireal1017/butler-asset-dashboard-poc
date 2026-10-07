# 버틀러 자산 현황 대시보드 PoC

임대인이 단지와 동·호를 입력하면, 국토교통부 실거래가 자료로 **내가 산 가격 대비 지금 가격**을 보여주는 모바일 웹 PoC입니다. 화면의 모든 숫자는 실제 공공데이터에서 나옵니다.

- 요구사항: [docs/PRD.md](docs/PRD.md)
- API 실측 노트: [docs/api-notes.md](docs/api-notes.md)
- 검증 기록: [docs/verification.md](docs/verification.md)
- 디자인 대조: [docs/design-checklist.md](docs/design-checklist.md)
- 데이터 품질 평가와 개선 제안: [docs/data-quality.md](docs/data-quality.md)

## 준비

1. **Node.js 22 LTS** (`.nvmrc`). better-sqlite3의 미리 빌드된 바이너리를 쓰므로 버전을 맞춰 주세요.
2. 공공데이터포털(data.go.kr)에서 같은 계정으로 다음 4개 API의 활용신청을 해 주세요.
   - 국토교통부_아파트 매매 실거래가 **상세** 자료
   - 국토교통부_건축HUB_건축물대장정보 서비스
   - 국토교통부_공동주택 단지 목록제공 서비스
   - 국토교통부_공동주택 기본 정보제공 서비스
3. `.env` 파일을 프로젝트 최상위에 만듭니다(`.env.example` 참고).

   ```
   DATA_GO_KR_SERVICE_KEY=<일반 인증키(Decoding)>
   ```

   - 선택: `DB_PATH`(기본 `~/.butler-poc/app.db`. OneDrive 같은 동기화 폴더와, 실행한 앱에 따라 다른 실제 폴더로 보일 수 있는 `%LOCALAPPDATA%` 밖에 둡니다), `AS_OF`(기준 월 YYYYMM 고정, 검증용), `API_PORT`(기본 3001)
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

## 테스트와 검증

```bash
npm test
```

```bash
npm run verify
```

```bash
npm run scan-secrets
```

- `npm test`: 서버 85개, 화면 16개 단위·통합 테스트. 실제 응답 표본은 `server/test/fixtures`에 있습니다.
- `npm run verify`: 서버가 떠 있는 상태에서 실행합니다. 저장된 원본 응답을 앱 코드와 독립적으로 다시 계산해 API 값과 비교합니다. 화면 값과도 비교하려면 `node verify/recompute.mjs --dom verify/out/dom.json`을 씁니다(추출 방법은 `verify/dom-extract.js` 머리말).
- `npm run scan-secrets`: 인증키가 파일, git 이력, 저장된 응답, 로그에 없는지 검사합니다.
- `npm run m0`: 하계동 단지 연결 체인을 실제 API로 재현합니다(응답 캐시 사용).

### 화면 상태 점검용 결함 주입 (개발 전용)

```bash
node server/src/index.js --dev-fault=fetch
```

- `--dev-fault=fetch`는 수집 실패, `--dev-fault=quota`는 한도 초과를 흉내 냅니다. DB에는 아무것도 기록하지 않고 화면 위에 배너가 뜹니다. `AS_OF`와 함께 쓸 수 없습니다.

## 구조

```
server/   Express API, SQLite, 수집(구 × 월 단위 교체 저장), 단지 연결·가격·시계열·매칭 로직
client/   Vue 3 + Vite 화면 (홈, 자산 추가, 매입 거래 확인, 상세), Clay 디자인 토큰
verify/   독립 재계산, 화면 값 추출, 비밀 스캔, 골든 사례
scripts/  M0 API 프로브
docs/     PRD, API 노트, 검증 기록, 디자인 체크리스트
```

## 알려진 한계

- 서울 25개 구, K-APT 가입 단지만 검색됩니다.
- 실거래 신고는 계약 후 30일 안에 하므로 최근 1~2개월은 적게 보일 수 있습니다.
- 참고용 정보이며 감정평가가 아닙니다. 세금, 대출, 중개비는 반영하지 않습니다.
