import { ipcMain, dialog, shell } from 'electron'
import log from 'electron-log'
import { IPC_CHANNELS } from '../../src/shared/types'
import { GpuProbe } from '../services/gpuProbe'
import { SettingsService } from '../services/settings'
import { InferenceService } from '../services/inference'
import type { AppSettings } from '../../src/shared/types'

/**
 * Settings IPC 핸들러 + GPU 프로브 핸들러
 *
 * 채널:
 * - settings:get
 * - settings:set
 * - settings:choose-output-dir
 * - settings:open-output-dir
 * - gpu:probe
 * - app:bug-report
 */
export function registerSettingsHandlers(): void {
  const settingsSvc = SettingsService.getInstance()
  const gpuProbe = GpuProbe.getInstance()

  // InferenceService는 선택적 — 없어도 settings 핸들러는 동작
  let inference: InferenceService | null = null
  try {
    inference = InferenceService.getInstance()
  } catch (err) {
    log.warn(`[Settings IPC] InferenceService not available: ${err}`)
  }

  // ── settings:get ────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    log.debug('[IPC] settings:get')
    return settingsSvc.get()
  })

  // ── settings:set ────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, partial: Partial<AppSettings>) => {
    log.info(`[IPC] settings:set keys=${Object.keys(partial).join(',')}`)
    const updated = settingsSvc.set(partial)

    // 출력 경로 변경 시 InferenceService에도 반영
    if (partial.outputDirectory && inference) {
      inference.setOutputDir(partial.outputDirectory)
    }

    return updated
  })

  // ── settings:choose-output-dir ───────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_CHOOSE_OUTPUT_DIR, async () => {
    log.debug('[IPC] settings:choose-output-dir')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '출력 폴더 선택',
      defaultPath: settingsSvc.getOutputDir(),
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const dir = result.filePaths[0]
    settingsSvc.set({ outputDirectory: dir })
    if (inference) inference.setOutputDir(dir)
    log.info(`[IPC] Output dir changed to: ${dir}`)
    return dir
  })

  // ── settings:open-output-dir ─────────────────────────
  ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN_OUTPUT_DIR, async () => {
    const dir = settingsSvc.getOutputDir()
    log.debug(`[IPC] settings:open-output-dir: ${dir}`)
    await shell.openPath(dir)
    return { success: true }
  })

  // ── gpu:probe ─────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.GPU_PROBE, async () => {
    log.debug('[IPC] gpu:probe')
    const result = await gpuProbe.probe()
    return result
  })

  // ── app:bug-report ────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.APP_BUG_REPORT, () => {
    log.debug('[IPC] app:bug-report')
    return {
      version: process.env.npm_package_version ?? '0.1.0',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    }
  })
}
