import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import type BetterSqlite3 from 'better-sqlite3'
import type {
  GenerationRecord,
  GenerationParams,
  GenerationStatus,
  GalleryQuery,
  LineageNode,
} from '../../src/shared/types'

/**
 * DbService — SQLite better-sqlite3 래퍼 (DA-01)
 *
 * better-sqlite3는 native module이므로 electron-rebuild 없이는
 * 정적 import 시 Electron에서 로드 실패.
 * → initialize() 시점에 require()로 lazy load.
 */
export class DbService {
  private static instance: DbService
  private db!: BetterSqlite3.Database
  private initialized = false

  private constructor() {}

  static getInstance(): DbService {
    if (!DbService.instance) {
      DbService.instance = new DbService()
    }
    return DbService.instance
  }

  /**
   * DB 초기화 — app.whenReady() 이후 호출
   */
  initialize(): void {
    if (this.initialized) return

    const dbDir = path.join(app.getPath('userData'), 'ZImageStudio')
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const dbPath = path.join(dbDir, 'generations.db')
    log.info(`[DB] Opening database: ${dbPath}`)

    // lazy require — electron-rebuild 없이도 동작 가능
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as typeof BetterSqlite3
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.migrate()
    this.initialized = true
    log.info('[DB] Database initialized')
  }

  private isReady(): boolean {
    return this.initialized && !!this.db
  }

  // ─── Schema & Migration ─────────────────────────────

  private migrate(): void {
    // v001: 초기 스키마
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT    NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS generations (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        status           TEXT    NOT NULL DEFAULT 'pending',

        -- 프롬프트
        prompt           TEXT    NOT NULL DEFAULT '',
        negative_prompt  TEXT    DEFAULT '',

        -- 파라미터
        seed             INTEGER NOT NULL DEFAULT -1,
        steps            INTEGER NOT NULL DEFAULT 8,
        cfg_scale        REAL    NOT NULL DEFAULT 1.0,
        width            INTEGER NOT NULL DEFAULT 512,
        height           INTEGER NOT NULL DEFAULT 512,
        sampler          TEXT    NOT NULL DEFAULT 'euler',
        model_name       TEXT    NOT NULL DEFAULT '',
        mode             TEXT    NOT NULL DEFAULT 'txt2img',
        vram_mode        TEXT    NOT NULL DEFAULT 'auto',
        denoise          REAL    DEFAULT 1.0,
        loras            TEXT    DEFAULT '[]',

        -- 결과
        image_path       TEXT    DEFAULT NULL,
        thumbnail_path   TEXT    DEFAULT NULL,
        duration_ms      INTEGER DEFAULT NULL,
        error_message    TEXT    DEFAULT NULL,

        -- 메타
        favorite         INTEGER NOT NULL DEFAULT 0,
        parent_id        INTEGER DEFAULT NULL REFERENCES generations(id) ON DELETE SET NULL,
        gpu_info         TEXT    DEFAULT NULL,
        driver_version   TEXT    DEFAULT NULL,
        compute_backend  TEXT    DEFAULT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_gen_created_at ON generations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_gen_status     ON generations(status);
      CREATE INDEX IF NOT EXISTS idx_gen_favorite   ON generations(favorite);
      CREATE INDEX IF NOT EXISTS idx_gen_parent_id  ON generations(parent_id);

      -- FTS5 전문 검색 (DA-02)
      CREATE VIRTUAL TABLE IF NOT EXISTS generations_fts USING fts5(
        prompt,
        negative_prompt,
        content='generations',
        content_rowid='id'
      );

      -- FTS5 동기 트리거
      CREATE TRIGGER IF NOT EXISTS gen_fts_insert AFTER INSERT ON generations BEGIN
        INSERT INTO generations_fts(rowid, prompt, negative_prompt)
        VALUES (new.id, new.prompt, new.negative_prompt);
      END;

      CREATE TRIGGER IF NOT EXISTS gen_fts_update AFTER UPDATE ON generations BEGIN
        UPDATE generations_fts
        SET prompt = new.prompt, negative_prompt = new.negative_prompt
        WHERE rowid = new.id;
      END;

      CREATE TRIGGER IF NOT EXISTS gen_fts_delete AFTER DELETE ON generations BEGIN
        DELETE FROM generations_fts WHERE rowid = old.id;
      END;
    `)

    this.db.prepare(`INSERT OR IGNORE INTO migrations(version) VALUES(?)`).run('001_initial')
    log.info('[DB] Migration 001_initial applied')
  }

  // ─── Generation CRUD ────────────────────────────────

  createGeneration(params: GenerationParams): number {
    if (!this.isReady()) { log.warn('[DB] createGeneration: DB not ready'); return -1 }
    const stmt = this.db.prepare(`
      INSERT INTO generations (
        prompt, negative_prompt, seed, steps, cfg_scale,
        width, height, sampler, model_name, mode, vram_mode,
        denoise, loras, parent_id, status
      ) VALUES (
        @prompt, @negativePrompt, @seed, @steps, @cfgScale,
        @width, @height, @sampler, @modelName, @mode, @vramMode,
        @denoise, @loras, @parentId, 'running'
      )
    `)

    const result = stmt.run({
      prompt: params.prompt,
      negativePrompt: params.negativePrompt ?? '',
      seed: params.seed,
      steps: params.steps,
      cfgScale: params.cfgScale,
      width: params.width,
      height: params.height,
      sampler: params.sampler,
      modelName: params.modelName,
      mode: params.mode,
      vramMode: params.vramMode ?? 'auto',
      denoise: params.denoise ?? 1.0,
      loras: JSON.stringify(params.loras ?? []),
      parentId: params.parentId ?? null,
    })

    return result.lastInsertRowid as number
  }

  updateGenerationSuccess(
    id: number,
    imagePath: string,
    durationMs: number,
    gpuInfo?: string,
    driverVersion?: string,
    computeBackend?: string,
  ): void {
    if (!this.isReady()) return
    this.db.prepare(`
      UPDATE generations
      SET status = 'success',
          image_path = @imagePath,
          duration_ms = @durationMs,
          gpu_info = @gpuInfo,
          driver_version = @driverVersion,
          compute_backend = @computeBackend
      WHERE id = @id
    `).run({ id, imagePath, durationMs, gpuInfo: gpuInfo ?? null, driverVersion: driverVersion ?? null, computeBackend: computeBackend ?? null })
  }

  updateGenerationFailed(id: number, status: 'failed' | 'cancelled', errorMessage?: string): void {
    if (!this.isReady()) return
    this.db.prepare(`
      UPDATE generations SET status = @status, error_message = @errorMessage WHERE id = @id
    `).run({ id, status, errorMessage: errorMessage ?? null })
  }

  getGeneration(id: number): GenerationRecord | undefined {
    if (!this.isReady()) return undefined
    const row = this.db.prepare(`SELECT * FROM generations WHERE id = ?`).get(id) as RawRow | undefined
    return row ? this.rowToRecord(row) : undefined
  }

  listGenerations(query: GalleryQuery): GenerationRecord[] {
    if (!this.isReady()) return []
    const conditions: string[] = []
    const bindings: Record<string, unknown> = {}

    if (query.mode) {
      conditions.push('mode = @mode')
      bindings.mode = query.mode
    }
    if (query.favorite !== undefined) {
      conditions.push('favorite = @favorite')
      bindings.favorite = query.favorite ? 1 : 0
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderBy = query.orderBy === 'favorite' ? 'favorite DESC, created_at DESC' : 'created_at DESC'
    const limit = query.limit ?? 50
    const offset = query.offset ?? 0

    const rows = this.db.prepare(`
      SELECT * FROM generations ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset
    `).all({ ...bindings, limit, offset }) as RawRow[]

    return rows.map(this.rowToRecord)
  }

  searchGenerations(searchQuery: string): GenerationRecord[] {
    if (!this.isReady()) return []
    const rows = this.db.prepare(`
      SELECT g.* FROM generations g
      JOIN generations_fts fts ON g.id = fts.rowid
      WHERE generations_fts MATCH @query
      ORDER BY rank
      LIMIT 100
    `).all({ query: searchQuery }) as RawRow[]

    return rows.map(this.rowToRecord)
  }

  deleteGeneration(id: number): void {
    if (!this.isReady()) return
    this.db.prepare(`DELETE FROM generations WHERE id = ?`).run(id)
  }

  deleteGenerations(ids: number[]): void {
    if (!this.isReady() || ids.length === 0) return
    const placeholders = ids.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM generations WHERE id IN (${placeholders})`).run(...ids)
  }

  toggleFavorite(id: number): boolean {
    if (!this.isReady()) return false
    this.db.prepare(`
      UPDATE generations SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?
    `).run(id)
    const row = this.db.prepare(`SELECT favorite FROM generations WHERE id = ?`).get(id) as { favorite: number } | undefined
    return row ? row.favorite === 1 : false
  }

  // ─── Lineage (DA-03) ────────────────────────────────

  getLineageTree(id: number): LineageNode {
    if (!this.isReady()) return { id, thumbnailPath: undefined, prompt: '', createdAt: '', status: 'failed', children: [] }
    // 루트 찾기 (재귀 CTE)
    const rootRow = this.db.prepare(`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM generations WHERE id = ?
        UNION ALL
        SELECT g.id, g.parent_id FROM generations g
        JOIN ancestors a ON g.id = a.parent_id
      )
      SELECT id FROM ancestors WHERE parent_id IS NULL LIMIT 1
    `).get(id) as { id: number } | undefined

    const rootId = rootRow?.id ?? id
    return this.buildTreeNode(rootId)
  }

  private buildTreeNode(id: number): LineageNode {
    const row = this.db.prepare(
      `SELECT id, thumbnail_path, prompt, created_at, status FROM generations WHERE id = ?`
    ).get(id) as { id: number; thumbnail_path: string; prompt: string; created_at: string; status: string } | undefined

    if (!row) {
      return { id, thumbnailPath: undefined, prompt: '', createdAt: '', status: 'failed', children: [] }
    }

    const childRows = this.db.prepare(
      `SELECT id FROM generations WHERE parent_id = ? ORDER BY created_at ASC`
    ).all(id) as { id: number }[]

    return {
      id: row.id,
      thumbnailPath: row.thumbnail_path ?? undefined,
      prompt: row.prompt,
      createdAt: row.created_at,
      status: row.status as GenerationStatus,
      children: childRows.map((c) => this.buildTreeNode(c.id)),
    }
  }

  // ─── Row Mapping ────────────────────────────────────

  private rowToRecord(row: RawRow): GenerationRecord {
    return {
      id: row.id,
      createdAt: row.created_at,
      status: row.status as GenerationStatus,
      prompt: row.prompt,
      negativePrompt: row.negative_prompt ?? undefined,
      seed: row.seed,
      steps: row.steps,
      cfgScale: row.cfg_scale,
      width: row.width,
      height: row.height,
      sampler: row.sampler,
      modelName: row.model_name,
      mode: row.mode as GenerationParams['mode'],
      vramMode: (row.vram_mode ?? 'auto') as GenerationParams['vramMode'],
      denoise: row.denoise ?? undefined,
      loras: row.loras ? JSON.parse(row.loras) : [],
      imagePath: row.image_path ?? undefined,
      thumbnailPath: row.thumbnail_path ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      errorMessage: row.error_message ?? undefined,
      favorite: row.favorite === 1,
      parentId: row.parent_id ?? undefined,
      gpuInfo: row.gpu_info ?? undefined,
      driverVersion: row.driver_version ?? undefined,
      computeBackend: row.compute_backend as GenerationRecord['computeBackend'] ?? undefined,
    }
  }

  close(): void {
    this.db?.close()
    log.info('[DB] Database closed')
  }
}

// Raw SQLite row 타입 (snake_case)
interface RawRow {
  id: number
  created_at: string
  status: string
  prompt: string
  negative_prompt: string | null
  seed: number
  steps: number
  cfg_scale: number
  width: number
  height: number
  sampler: string
  model_name: string
  mode: string
  vram_mode: string
  denoise: number | null
  loras: string | null
  image_path: string | null
  thumbnail_path: string | null
  duration_ms: number | null
  error_message: string | null
  favorite: number
  parent_id: number | null
  gpu_info: string | null
  driver_version: string | null
  compute_backend: string | null
}
