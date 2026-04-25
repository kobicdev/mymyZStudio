/// <reference types="vite/client" />

/**
 * Window type augmentation — electronAPI (preload.ts에서 contextBridge로 노출)
 */
declare global {
  interface Window {
    electronAPI: {
      // Inference
      generate: (params: import('./shared/types').GenerationParams) => Promise<void>
      cancelGeneration: () => Promise<void>
      onProgress: (cb: (progress: import('./shared/types').GenerationProgress) => void) => () => void
      onComplete: (cb: (result: { imagePath: string; generationId?: number; simulated?: boolean; imageData?: string }) => void) => () => void
      onError: (cb: (err: { message: string; code: string }) => void) => () => void

      // GPU
      probeGpu: () => Promise<import('./shared/types').GpuProbeResult | null>
      onVramWarning: (cb: (warning: { available: number; required: number }) => void) => () => void

      // Gallery
      listGenerations: (query: import('./shared/types').GalleryQuery) => Promise<import('./shared/types').GenerationRecord[]>
      getGeneration: (id: number) => Promise<import('./shared/types').GenerationRecord>
      searchGenerations: (query: string) => Promise<import('./shared/types').GenerationRecord[]>
      deleteGeneration: (id: number) => Promise<{ success: boolean }>
      deleteGenerations: (ids: number[]) => Promise<{ success: boolean }>
      toggleFavorite: (id: number) => Promise<{ id: number; favorite: boolean }>
      getLineage: (id: number) => Promise<import('./shared/types').LineageNode>

      // Models
      listModels: () => Promise<import('./shared/types').ModelInfo[]>
      listLoras: () => Promise<string[]>
      downloadModel: (modelId: string) => Promise<void>
      cancelDownload: (modelId: string) => Promise<void>
      onDownloadProgress: (cb: (progress: import('./shared/types').DownloadProgress) => void) => () => void
      verifyModel: (modelId: string) => Promise<{ valid: boolean }>

      // LLM
      checkLlm: () => Promise<import('./shared/types').LlmStatus>
      enhancePrompt: (request: import('./shared/types').EnhanceRequest) => Promise<import('./shared/types').EnhanceResult>

      // Settings
      getSettings: () => Promise<import('./shared/types').AppSettings>
      setSettings: (settings: Partial<import('./shared/types').AppSettings>) => Promise<import('./shared/types').AppSettings>
      chooseOutputDir: () => Promise<string | null>
      openOutputDir: () => Promise<void>

      // App
      chooseImage: () => Promise<string | null>
      copyBugReport: () => Promise<string>
    }
  }
}

export {}
