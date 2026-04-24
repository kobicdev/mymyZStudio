import path from 'path'
import { app } from 'electron'
import log from 'electron-log'
import type { AppSettings } from '../../src/shared/types'

/**
 * SettingsService — electron-store 기반 앱 설정 관리
 *
 * electron-store는 ESM 전용 패키지(v9+)이므로,
 * 동적 import를 사용하거나 JSON 파일로 직접 관리.
 * 여기서는 Node.js fs + JSON으로 구현 (의존성 최소화).
 */
export class SettingsService {
  private static instance: SettingsService
  private settings!: AppSettings
  private settingsPath!: string

  private constructor() {}

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService()
    }
    return SettingsService.instance
  }

  initialize(): void {
    const userDataDir = path.join(app.getPath('userData'), 'ZImageStudio')
    this.settingsPath = path.join(userDataDir, 'settings.json')

    const fs = require('fs') as typeof import('fs')
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true })
    }

    if (fs.existsSync(this.settingsPath)) {
      try {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8')
        const loaded = JSON.parse(raw) as Partial<AppSettings>
        this.settings = { ...this.defaults(), ...loaded }
        log.info('[Settings] Loaded from disk')
      } catch (err) {
        log.warn(`[Settings] Failed to load settings, using defaults: ${err}`)
        this.settings = this.defaults()
      }
    } else {
      this.settings = this.defaults()
      this.save()
      log.info('[Settings] Created default settings')
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  set(partial: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...partial }
    this.save()
    log.info('[Settings] Settings updated')
    return this.get()
  }

  getOutputDir(): string {
    return this.settings.outputDirectory
  }

  private save(): void {
    try {
      const fs = require('fs') as typeof import('fs')
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      log.error(`[Settings] Failed to save settings: ${err}`)
    }
  }

  private defaults(): AppSettings {
    return {
      outputDirectory: 'D:/Output',
      vramMode: 'auto',
      theme: 'dark',
      language: 'ko',
      llm: {
        enabled: false,
        endpoint: 'http://localhost:1234',
        defaultModel: 'local-model',
        systemPrompt: 'You are a Stable Diffusion prompt expert. Enhance the user prompt to be more descriptive and artistic. Return only the enhanced prompt, no explanation.',
      },
      defaultParams: {
        steps: 8,
        cfgScale: 1.0,
        width: 512,
        height: 512,
        sampler: 'euler',
        seed: -1,
        vramMode: 'auto',
      },
      logLevel: 'info',
    }
  }
}
