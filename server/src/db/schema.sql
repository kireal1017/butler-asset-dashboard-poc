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

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users (id),
  kapt_code TEXT NOT NULL REFERENCES complexes (kapt_code),
  dong TEXT NOT NULL,
  ho TEXT NOT NULL,
  floor INTEGER NOT NULL,
  area_u INTEGER NOT NULL,            -- 전용면적, 1/10000㎡ 정수
  area_source TEXT NOT NULL CHECK (area_source IN ('auto', 'manual')),
  acquisition_ym TEXT,                -- YYYYMM
  purchase_price INTEGER,             -- 만원
  purchase_date TEXT,                 -- YYYYMMDD (matched) / NULL (manual)
  purchase_source TEXT CHECK (purchase_source IN ('matched', 'manual')),
  created_at TEXT NOT NULL
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
