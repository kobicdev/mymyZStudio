# ZImageStudio SQL 마이그레이션

## 마이그레이션 001 - 초기 스키마 v0.2

```sql
-- generations 테이블 (PRD §6)
CREATE TABLE IF NOT EXISTS generations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL,                   -- ISO 8601
  prompt          TEXT NOT NULL,
  negative_prompt TEXT,
  seed            INTEGER NOT NULL,
  steps           INTEGER NOT NULL,
  cfg_scale       REAL NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  sampler         TEXT NOT NULL,
  model_name      TEXT NOT NULL,
  loras_json      TEXT,                            -- [{name, weight}, ...]
  mode            TEXT NOT NULL,                   -- 'txt2img' | 'img2img' | 'inpaint'
  source_image    TEXT,                            -- img2img/inpaint용
  mask_image      TEXT,                            -- inpaint용
  denoise         REAL,
  image_path      TEXT,                            -- 성공 시에만
  thumbnail_path  TEXT,
  favorite        INTEGER DEFAULT 0,
  duration_ms     INTEGER,

  -- v0.2 추가 필드 (Gemini 리뷰 반영)
  parent_id       INTEGER REFERENCES generations(id) ON DELETE SET NULL,  -- 계보
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|running|success|failed|cancelled
  error_message   TEXT,                             -- 실패 사유
  gpu_info        TEXT,                             -- 예: "NVIDIA GeForce RTX 3060 12GB"
  driver_version  TEXT,                             -- NVIDIA 드라이버 버전
  compute_backend TEXT                              -- CUDA|Vulkan|Metal|CPU
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_generations_parent  ON generations(parent_id);
CREATE INDEX IF NOT EXISTS idx_generations_created ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_status  ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_favorite ON generations(favorite);

-- FTS5 전문 검색 (프롬프트 검색용)
CREATE VIRTUAL TABLE IF NOT EXISTS generations_fts USING fts5(
  prompt,
  negative_prompt,
  content='generations',
  content_rowid='id'
);

-- FTS5 동기화 트리거
CREATE TRIGGER IF NOT EXISTS generations_fts_insert
  AFTER INSERT ON generations
BEGIN
  INSERT INTO generations_fts(rowid, prompt, negative_prompt)
  VALUES (new.id, new.prompt, new.negative_prompt);
END;

CREATE TRIGGER IF NOT EXISTS generations_fts_update
  AFTER UPDATE ON generations
BEGIN
  INSERT INTO generations_fts(generations_fts, rowid, prompt, negative_prompt)
  VALUES ('delete', old.id, old.prompt, old.negative_prompt);
  INSERT INTO generations_fts(rowid, prompt, negative_prompt)
  VALUES (new.id, new.prompt, new.negative_prompt);
END;

CREATE TRIGGER IF NOT EXISTS generations_fts_delete
  AFTER DELETE ON generations
BEGIN
  INSERT INTO generations_fts(generations_fts, rowid, prompt, negative_prompt)
  VALUES ('delete', old.id, old.prompt, old.negative_prompt);
END;

-- 프리셋 테이블
CREATE TABLE IF NOT EXISTS presets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  params_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- 모델 매니페스트 테이블
CREATE TABLE IF NOT EXISTS model_manifest (
  name          TEXT PRIMARY KEY,
  version       TEXT NOT NULL,
  url           TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  downloaded_at TEXT,
  verified      INTEGER DEFAULT 0
);

-- 마이그레이션 버전 추적
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL,
  description TEXT
);

INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial schema v0.2 — generations, FTS5, presets, model_manifest');
```
