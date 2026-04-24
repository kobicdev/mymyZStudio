import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import log from 'electron-log'

export interface ModelFile {
  name: string
  path: string
  type: 'diffusion' | 'vae' | 'llm' | 'lora'
}

export class ModelsService {
  private static instance: ModelsService

  private constructor() {}

  static getInstance(): ModelsService {
    if (!ModelsService.instance) {
      ModelsService.instance = new ModelsService()
    }
    return ModelsService.instance
  }

  private getModelsDirs(): string[] {
    return [
      path.resolve(app.getAppPath(), 'resources', 'models'),
      path.resolve(app.getAppPath(), 'models'), // 프로젝트 루트의 models 폴더 (사용자 스크린샷 기준)
    ].filter(dir => fs.existsSync(dir))
  }

  async listLoras(): Promise<string[]> {
    const dirs = this.getModelsDirs()
    const allLoras = new Set<string>()

    for (const baseDir of dirs) {
      const loraDir = path.resolve(baseDir, 'loras')
      if (!fs.existsSync(loraDir)) continue

      try {
        const files = fs.readdirSync(loraDir)
        files.filter(f => f.endsWith('.gguf') || f.endsWith('.safetensors'))
             .forEach(f => allLoras.add(f))
      } catch (err) {
        log.error(`[Models] Failed to list loras in ${loraDir}: ${err}`)
      }
    }

    return Array.from(allLoras)
  }

  async listModels(): Promise<string[]> {
    const dirs = this.getModelsDirs()
    const allModels = new Set<string>()

    for (const baseDir of dirs) {
      try {
        const files = fs.readdirSync(baseDir)
        files.filter(f => f.endsWith('.gguf'))
             .forEach(f => allModels.add(f))
      } catch (err) {
        log.debug(`[Models] Skip listing models in ${baseDir}: ${err}`)
      }
    }

    return Array.from(allModels)
  }
}
