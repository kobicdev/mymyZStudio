import log from 'electron-log'
import type { GpuInfo, GpuProbeResult } from '../../src/shared/types'

const execFileAsync = require('util').promisify(require('child_process').execFile) as
  (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>

/**
 * GpuProbe — GPU 사전 검사 서비스 (§4.2)
 */
export class GpuProbe {
  private static instance: GpuProbe
  private cachedInfo: GpuInfo | null = null
  private lastProbeTime: number = 0
  private readonly CACHE_TTL_MS = 30_000

  private constructor() {}

  static getInstance(): GpuProbe {
    if (!GpuProbe.instance) {
      GpuProbe.instance = new GpuProbe()
    }
    return GpuProbe.instance
  }

  async probe(): Promise<GpuProbeResult> {
    const now = Date.now()

    if (this.cachedInfo && now - this.lastProbeTime < this.CACHE_TTL_MS) {
      return { available: true, gpuInfo: this.cachedInfo, backend: 'CUDA', skipped: false }
    }

    try {
      const gpuInfo = await this.queryNvidiaSmi()
      this.cachedInfo = gpuInfo
      this.lastProbeTime = now
      log.info(`[GpuProbe] GPU: ${gpuInfo.name}, VRAM Free: ${gpuInfo.memoryFree}MB / ${gpuInfo.memoryTotal}MB`)
      return { available: true, gpuInfo, backend: 'CUDA', skipped: false }
    } catch (err) {
      log.debug(`[GpuProbe] nvidia-smi not available: ${err}`)
      return { available: false, backend: 'Vulkan', skipped: true }
    }
  }

  estimateVramRequirement(width: number, height: number, modelType: 'q4' | 'q5' | 'bf16' = 'q4'): {
    estimatedMb: number
    sufficient: boolean
    recommendation: 'normal' | 'low' | 'tiny'
  } {
    const pixelCount = width * height
    const baseVramMb: Record<string, number> = { q4: 6000, q5: 7500, bf16: 14000 }
    const resolutionFactor = pixelCount / (1024 * 1024)
    const estimatedMb = Math.ceil(baseVramMb[modelType] * Math.max(1, resolutionFactor))
    const freeMb = this.cachedInfo?.memoryFree ?? 0
    const sufficient = freeMb > 0 && freeMb >= estimatedMb
    let recommendation: 'normal' | 'low' | 'tiny' = 'normal'
    if (freeMb < estimatedMb) {
      recommendation = freeMb < estimatedMb * 0.6 ? 'tiny' : 'low'
    }
    return { estimatedMb, sufficient, recommendation }
  }

  private async queryNvidiaSmi(): Promise<GpuInfo> {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      ['--query-gpu=name,driver_version,memory.free,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 3000 }
    )

    const line = (stdout as string).trim().split('\n')[0]
    if (!line) throw new Error('nvidia-smi returned empty output')

    const parts = line.split(',').map((s: string) => s.trim())
    if (parts.length < 4) throw new Error(`Unexpected nvidia-smi format: ${line}`)

    return {
      name: parts[0],
      driverVersion: parts[1],
      memoryFree: parseInt(parts[2], 10),
      memoryTotal: parseInt(parts[3], 10),
    }
  }

  clearCache(): void {
    this.cachedInfo = null
    this.lastProbeTime = 0
  }
}
