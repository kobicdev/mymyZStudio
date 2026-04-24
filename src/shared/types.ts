/**
 * ZImageStudio — 공유 타입 정의
 * Renderer(src/)와 Main Process(electron/) 양쪽에서 임포트 가능한 타입들
 *
 * NOTE: 이 파일은 순수 TypeScript 타입만 포함해야 함.
 *       런타임 의존성(Node.js/Electron API 등) 절대 금지.
 */

// ─────────────────────────────────────────
// 이미지 생성 파라미터
// ─────────────────────────────────────────

export type GenerationMode = 'txt2img' | 'img2img' | 'inpaint'
export type VramMode = 'auto' | 'normal' | 'low' | 'tiny'
export type ComputeBackend = 'CUDA' | 'Vulkan' | 'Metal' | 'CPU'
export type GenerationStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

export interface LoraEntry {
  name: string
  weight: number    // 0.0 ~ 2.0 권장
}

export interface GenerationParams {
  prompt: string
  negativePrompt?: string
  seed: number            // -1 = 랜덤
  steps: number           // Turbo 기본 8
  cfgScale: number        // Turbo 기본 0 (고정)
  width: number           // 64 배수, 512~1536
  height: number
  sampler: string         // 'euler' | 'euler_a' | 'dpm++2m' | ...
  modelName: string
  loras?: LoraEntry[]
  mode: GenerationMode
  sourceImage?: string    // img2img / inpaint용 절대 경로
  maskImage?: string      // inpaint용 절대 경로
  denoise?: number        // 0.0 ~ 1.0
  parentId?: number       // 계보 추적 (§3.4)
  vramMode?: VramMode     // 기본 'auto'
}

// ─────────────────────────────────────────
// DB 레코드 (generations 테이블)
// ─────────────────────────────────────────

export interface GenerationRecord extends GenerationParams {
  id: number
  createdAt: string          // ISO 8601
  imagePath?: string
  thumbnailPath?: string
  favorite: boolean
  durationMs?: number
  status: GenerationStatus
  errorMessage?: string
  gpuInfo?: string           // "NVIDIA GeForce RTX 3060 12GB"
  driverVersion?: string
  computeBackend?: ComputeBackend
}

// ─────────────────────────────────────────
// GPU 정보
// ─────────────────────────────────────────

export interface GpuInfo {
  name: string
  driverVersion: string
  memoryFree: number   // MB
  memoryTotal: number  // MB
}

export interface GpuProbeResult {
  available: boolean
  gpuInfo?: GpuInfo
  backend: ComputeBackend
  skipped: boolean     // nvidia-smi 없으면 true
}

// ─────────────────────────────────────────
// 모델 관리
// ─────────────────────────────────────────

export interface ModelInfo {
  name: string
  version: string
  url: string
  sha256: string
  sizeBytes: number
  downloadedAt?: string
  verified: boolean
  description?: string
}

export interface DownloadProgress {
  modelId: string
  received: number     // bytes
  total: number        // bytes
  percent: number      // 0~100
  speed?: number       // bytes/sec
  eta?: number         // seconds
}

// ─────────────────────────────────────────
// 생성 진행률
// ─────────────────────────────────────────

export type ProgressMode = 'determinate' | 'indeterminate'

export interface GenerationProgress {
  mode: ProgressMode
  step?: number        // 현재 step
  total?: number       // 전체 step
  eta?: number         // 예상 남은 시간 (초)
  previewPath?: string // 미리보기 이미지 경로 (있으면)
}

// ─────────────────────────────────────────
// 갤러리 쿼리
// ─────────────────────────────────────────

export interface GalleryQuery {
  search?: string        // FTS5 검색어
  mode?: GenerationMode
  favorite?: boolean
  limit?: number         // 기본 50
  offset?: number
  orderBy?: 'created_at' | 'favorite'
  orderDir?: 'ASC' | 'DESC'
}

// ─────────────────────────────────────────
// 계보 트리 (§3.4)
// ─────────────────────────────────────────

export interface LineageNode {
  id: number
  thumbnailPath?: string
  prompt: string
  createdAt: string
  status: GenerationStatus
  children: LineageNode[]
}

// ─────────────────────────────────────────
// LLM Prompt Enhancer (LM Studio / Ollama) (§3.8)
// ─────────────────────────────────────────

export interface LlmStatus {
  available: boolean
  models: string[]
  endpoint: string
}

export interface EnhanceRequest {
  prompt: string
  model: string
  systemPrompt?: string  // 커스터마이징 가능
}

export interface EnhanceResult {
  enhanced: string
  model: string
  durationMs: number
}

// ─────────────────────────────────────────
// 앱 설정 (electron-store)
// ─────────────────────────────────────────

export interface AppSettings {
  outputDirectory: string
  vramMode: VramMode
  theme: 'light' | 'dark' | 'system'
  language: 'ko' | 'en'
  modelName?: string
  llm: {
    enabled: boolean
    endpoint: string
    defaultModel: string
    systemPrompt: string
  }
  defaultParams: Partial<GenerationParams>
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

// ─────────────────────────────────────────
// IPC 채널 상수 (타입 안전 채널명)
// ─────────────────────────────────────────

export const IPC_CHANNELS = {
  // Inference
  INFERENCE_GENERATE: 'inference:generate',
  INFERENCE_CANCEL: 'inference:cancel',
  INFERENCE_PROGRESS: 'inference:progress',
  INFERENCE_COMPLETE: 'inference:complete',
  INFERENCE_ERROR: 'inference:error',

  // GPU
  GPU_PROBE: 'gpu:probe',
  GPU_VRAM_WARNING: 'gpu:vram-warning',

  // Gallery
  GALLERY_LIST: 'gallery:list',
  GALLERY_GET: 'gallery:get',
  GALLERY_SEARCH: 'gallery:search',
  GALLERY_DELETE: 'gallery:delete',
  GALLERY_DELETE_BULK: 'gallery:delete-bulk',
  GALLERY_TOGGLE_FAVORITE: 'gallery:toggle-favorite',
  GALLERY_LINEAGE: 'gallery:lineage',

  // Model
  MODEL_LIST: 'model:list',
  MODEL_LIST_LORAS: 'model:list-loras',
  MODEL_DOWNLOAD: 'model:download',
  MODEL_DOWNLOAD_PROGRESS: 'model:download-progress',
  MODEL_CANCEL_DOWNLOAD: 'model:cancel-download',
  MODEL_VERIFY: 'model:verify',

  // LLM
  LLM_CHECK: 'llm:check',
  LLM_ENHANCE: 'llm:enhance',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_OPEN_OUTPUT_DIR: 'settings:open-output-dir',
  SETTINGS_CHOOSE_OUTPUT_DIR: 'settings:choose-output-dir',

  // App
  APP_LOG: 'app:log',
  APP_BUG_REPORT: 'app:bug-report',
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
