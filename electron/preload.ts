import { contextBridge, ipcRenderer } from 'electron'
import type { GenerationParams, GalleryQuery, EnhanceRequest } from '../src/shared/types'

/**
 * ZImageStudio Preload Script
 * 
 * contextBridge를 통해 렌더러에 안전하게 노출되는 API.
 * 
 * NOTE: src/shared/types.ts의 IPC_CHANNELS를 직접 임포트하면 
 * 런타임에 모듈을 찾지 못하는 오류가 발생할 수 있음(샌드박스 환경).
 * 따라서 상수를 이 파일 내부에 직접 유지하거나, 단순 문자열을 사용함.
 */

const CHANNELS = {
  INFERENCE_GENERATE: 'inference:generate',
  INFERENCE_CANCEL: 'inference:cancel',
  INFERENCE_PROGRESS: 'inference:progress',
  INFERENCE_COMPLETE: 'inference:complete',
  INFERENCE_ERROR: 'inference:error',

  GPU_PROBE: 'gpu:probe',
  GPU_VRAM_WARNING: 'gpu:vram-warning',

  GALLERY_LIST: 'gallery:list',
  GALLERY_GET: 'gallery:get',
  GALLERY_SEARCH: 'gallery:search',
  GALLERY_DELETE: 'gallery:delete',
  GALLERY_DELETE_BULK: 'gallery:delete-bulk',
  GALLERY_TOGGLE_FAVORITE: 'gallery:toggle-favorite',
  GALLERY_LINEAGE: 'gallery:lineage',

  MODEL_LIST: 'model:list',
  MODEL_DOWNLOAD: 'model:download',
  MODEL_DOWNLOAD_PROGRESS: 'model:download-progress',
  MODEL_CANCEL_DOWNLOAD: 'model:cancel-download',
  MODEL_VERIFY: 'model:verify',

  LLM_CHECK: 'llm:check',
  LLM_ENHANCE: 'llm:enhance',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_OPEN_OUTPUT_DIR: 'settings:open-output-dir',
  SETTINGS_CHOOSE_OUTPUT_DIR: 'settings:choose-output-dir',

  APP_BUG_REPORT: 'app:bug-report',
  INPAINT_SAVE_MASK: 'inpaint:save-mask',
} as const

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Inference ─────────────────────────────────
  generate: (params: GenerationParams) =>
    ipcRenderer.invoke(CHANNELS.INFERENCE_GENERATE, params),

  cancelGeneration: () =>
    ipcRenderer.invoke(CHANNELS.INFERENCE_CANCEL),

  onProgress: (callback: (progress: unknown) => void) => {
    const channel = CHANNELS.INFERENCE_PROGRESS
    const subscription = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  onComplete: (callback: (result: unknown) => void) => {
    const channel = CHANNELS.INFERENCE_COMPLETE
    const subscription = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  onError: (callback: (err: unknown) => void) => {
    const channel = CHANNELS.INFERENCE_ERROR
    const subscription = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  onLog: (callback: (data: { line: string }) => void) => {
    const subscription = (_event: unknown, data: unknown) => callback(data as { line: string })
    ipcRenderer.on('inference:log', subscription)
    return () => ipcRenderer.removeListener('inference:log', subscription)
  },

  // ─── GPU ───────────────────────────────────────
  probeGpu: () =>
    ipcRenderer.invoke(CHANNELS.GPU_PROBE),

  onVramWarning: (callback: (warning: unknown) => void) => {
    const channel = CHANNELS.GPU_VRAM_WARNING
    const subscription = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  // ─── Gallery ───────────────────────────────────
  listGenerations: (query: GalleryQuery) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_LIST, query),

  getGeneration: (id: number) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_GET, id),

  searchGenerations: (query: string) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_SEARCH, query),

  deleteGeneration: (id: number) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_DELETE, id),

  deleteGenerations: (ids: number[]) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_DELETE_BULK, ids),

  toggleFavorite: (id: number) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_TOGGLE_FAVORITE, id),

  getLineage: (id: number) =>
    ipcRenderer.invoke(CHANNELS.GALLERY_LINEAGE, id),

  // ─── Models ────────────────────────────────────
  listModels: () =>
    ipcRenderer.invoke(CHANNELS.MODEL_LIST),

  listLoras: () =>
    ipcRenderer.invoke('model:list-loras'),

  downloadModel: (modelId: string) =>
    ipcRenderer.invoke(CHANNELS.MODEL_DOWNLOAD, modelId),

  cancelDownload: (modelId: string) =>
    ipcRenderer.invoke(CHANNELS.MODEL_CANCEL_DOWNLOAD, modelId),

  onDownloadProgress: (callback: (progress: unknown) => void) => {
    const channel = CHANNELS.MODEL_DOWNLOAD_PROGRESS
    const subscription = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },

  verifyModel: (modelId: string) =>
    ipcRenderer.invoke(CHANNELS.MODEL_VERIFY, modelId),

  // ─── LLM ────────────────────────────────────
  checkLlm: () =>
    ipcRenderer.invoke(CHANNELS.LLM_CHECK),

  enhancePrompt: (request: EnhanceRequest) =>
    ipcRenderer.invoke(CHANNELS.LLM_ENHANCE, request),

  // ─── Settings ──────────────────────────────────
  getSettings: () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_GET),

  setSettings: (settings: unknown) =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_SET, settings),

  chooseOutputDir: () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_CHOOSE_OUTPUT_DIR),

  openOutputDir: () =>
    ipcRenderer.invoke(CHANNELS.SETTINGS_OPEN_OUTPUT_DIR),

  // ─── App ───────────────────────────────────────
  chooseImage: () =>
    ipcRenderer.invoke('app:choose-image'),

  copyBugReport: () =>
    ipcRenderer.invoke(CHANNELS.APP_BUG_REPORT),

  // ─── Inpaint ──────────────────────────────
  saveMask: (dataUrl: string) =>
    ipcRenderer.invoke(CHANNELS.INPAINT_SAVE_MASK, dataUrl),
})
