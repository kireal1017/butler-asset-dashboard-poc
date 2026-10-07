PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY
);
INSERT OR IGNORE INTO users (id) VALUES (1);

CREATE TABLE IF NOT EXISTS complexes (
  kapt_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bjd_code TEXT NOT NULL,
  sigungu_code TEXT NOT NULL,
  sido TEXT,
  gu TEXT,
  umd_name TEXT,
  addr TEXT,
  doro_juso TEXT,
  bonbun INTEGER,
  bubun INTEGER,
  households INTEGER,
  dong_count INTEGER,
  use_date TEXT,
  parking_ground INTEGER,
  parking_under INTEGER,
  detail_fetched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_complexes_name ON complexes (name);

-- PRD 7.1 2단계(다필지)로 연결한 aptSeq. 지번 연결과 합집합으로 쓴다.
CREATE TABLE IF NOT EXISTS complex_trade_link_override (
  kapt_code TEXT NOT NULL REFERENCES complexes (kapt_code),
  apt_seq TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (kapt_code, apt_seq)
);

-- v3 (2026-10-08): 건물 → 호실 → 계약 구조. 기존 assets 테이블은 db/index.js의 마이그레이션이 지운다.
-- 금액은 모두 원 단위 정수(실거래 캐시 trades.deal_amount만 만원). 면적은 1/10000㎡ 정수.
CREATE TABLE IF NOT EXISTS buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kapt_code TEXT NOT NULL UNIQUE REFERENCES complexes (kapt_code),  -- 같은 단지는 한 번만 등록
  name TEXT NOT NULL,
  owned_unit_count INTEGER NOT NULL DEFAULT 1 CHECK (owned_unit_count >= 1),
  description TEXT,
  building_spec TEXT,                 -- 건축물대장 표제부 요약 JSON
  building_spec_fetched_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings (id),
  dong TEXT NOT NULL,
  ho TEXT NOT NULL,
  area_u INTEGER NOT NULL,
  floor INTEGER NOT NULL,
  area_source TEXT NOT NULL CHECK (area_source IN ('auto', 'manual')),
  created_at TEXT NOT NULL,
  UNIQUE (building_id, dong, ho)
);

CREATE TABLE IF NOT EXISTS unit_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL UNIQUE REFERENCES units (id) ON DELETE CASCADE,
  acquisition_ym TEXT NOT NULL,       -- YYYYMM
  purchase_price INTEGER NOT NULL,    -- 원
  ownership_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (ownership_status IN ('UNVERIFIED', 'VERIFIED')),
  registered_at TEXT NOT NULL,
  value_checked_at TEXT
);

-- 참고가 기록: 근거 거래 집합(basis_hash)이 직전 줄과 다를 때만 한 줄 추가한다.
CREATE TABLE IF NOT EXISTS unit_value_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  value INTEGER,                      -- 원, 12개월 안 거래가 없으면 NULL
  source TEXT NOT NULL,               -- 'RTMS'
  basis TEXT NOT NULL,
  basis_hash TEXT NOT NULL,
  trade_count INTEGER NOT NULL,
  reference_date TEXT,                -- YYYYMMDD (참고가로 쓴 거래의 계약일)
  transaction_ids TEXT NOT NULL,      -- 근거 거래 자연 키 JSON
  as_of TEXT NOT NULL,                -- 계산 기준 월
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unit_value_refs ON unit_value_references (unit_id, id);

CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  lease_type TEXT NOT NULL CHECK (lease_type IN ('MONTHLY', 'JEONSE')),
  deposit INTEGER NOT NULL,           -- 원
  monthly_rent INTEGER NOT NULL,      -- 원 (전세는 0)
  start_date TEXT NOT NULL,           -- YYYY-MM-DD
  end_date TEXT NOT NULL,
  tenant_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases (unit_id, start_date);

-- 동·호 → 면적·층 조회 결과(호실 저장 때 재사용, 서버 재확인 유지)
CREATE TABLE IF NOT EXISTS unit_lookups (
  kapt_code TEXT NOT NULL,
  dong TEXT NOT NULL,
  ho TEXT NOT NULL,
  result TEXT NOT NULL,               -- JSON
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (kapt_code, dong, ho)
);

-- 전월세 실거래 캐시: 매매와 같이 "구 × 월" 단위로 통째로 교체한다.
CREATE TABLE IF NOT EXISTS rent_transactions (
  sgg_cd TEXT NOT NULL,
  deal_ym TEXT NOT NULL,
  src_seq INTEGER NOT NULL,
  apt_seq TEXT,
  apt_nm TEXT NOT NULL,
  umd_nm TEXT,
  jibun TEXT,
  area_u INTEGER NOT NULL,
  floor INTEGER,
  deal_day INTEGER NOT NULL,
  deposit INTEGER NOT NULL,           -- 원
  monthly_rent INTEGER NOT NULL,      -- 원
  contract_type TEXT,
  contract_term TEXT,
  PRIMARY KEY (sgg_cd, deal_ym, src_seq)
);
CREATE INDEX IF NOT EXISTS idx_rent_seq ON rent_transactions (apt_seq, area_u);

CREATE TABLE IF NOT EXISTS rent_raw_responses (
  sgg_cd TEXT NOT NULL,
  deal_ym TEXT NOT NULL,
  page INTEGER NOT NULL,
  body TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (sgg_cd, deal_ym, page)
);

CREATE TABLE IF NOT EXISTS rent_fetch_log (
  sgg_cd TEXT NOT NULL,
  deal_ym TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  PRIMARY KEY (sgg_cd, deal_ym)
);

CREATE TABLE IF NOT EXISTS conversion_rates (
  region TEXT NOT NULL,               -- '서울'
  ym TEXT NOT NULL,                   -- 통계 기준 월 YYYYMM
  rate REAL NOT NULL,                 -- %
  source TEXT NOT NULL CHECK (source IN ('RONE', 'MANUAL')),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (region, ym, source)
);

-- 거래는 "구 × 월" 단위로 통째로 교체한다. 같은 조건의 정상 거래가 겹칠 수 있어 자연키를 쓰지 않는다.
CREATE TABLE IF NOT EXISTS trades (
  sgg_cd TEXT NOT NULL,
  deal_ym TEXT NOT NULL,
  src_seq INTEGER NOT NULL,           -- 그 달 응답 안의 순번(페이지 순서대로)
  apt_seq TEXT NOT NULL,
  apt_nm TEXT NOT NULL,
  umd_cd TEXT,
  umd_nm TEXT,
  jibun TEXT,
  bonbun INTEGER,
  bubun INTEGER,
  area_u INTEGER NOT NULL,
  area_raw TEXT NOT NULL,
  floor INTEGER,
  apt_dong TEXT,
  deal_day INTEGER NOT NULL,
  deal_amount INTEGER NOT NULL,       -- 만원
  cdeal_type TEXT,
  cdeal_day TEXT,
  rgst_date TEXT,
  dealing_gbn TEXT,
  build_year INTEGER,
  PRIMARY KEY (sgg_cd, deal_ym, src_seq)
);
CREATE INDEX IF NOT EXISTS idx_trades_seq ON trades (apt_seq, area_u);
CREATE INDEX IF NOT EXISTS idx_trades_lot ON trades (umd_cd, bonbun, bubun);

CREATE TABLE IF NOT EXISTS raw_responses (
  sgg_cd TEXT NOT NULL,
  deal_ym TEXT NOT NULL,
  page INTEGER NOT NULL,
  body TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (sgg_cd, deal_ym, page)
);

CREATE TABLE IF NOT EXISTS fetch_log (
  sgg_cd TEXT NOT NULL,
  deal_ym TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  PRIMARY KEY (sgg_cd, deal_ym)
);

CREATE TABLE IF NOT EXISTS api_usage (
  api TEXT NOT NULL,
  date_kst TEXT NOT NULL,             -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api, date_kst)
);
