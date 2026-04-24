import { ipcMain, BrowserWindow } from 'electron'
import log from 'electron-log'
import { IPC_CHANNELS, type GenerationParams } from '../../src/shared/types'
import { InferenceService } from '../services/inference'
import { DbService } from '../services/db'
import { GpuProbe } from '../services/gpuProbe'
import { SettingsService } from '../services/settings'

/**
 * Inference IPC 핸들러 (BE-01)
 *
 * mainWindow를 파라미터로 받지 않고, 런타임에 BrowserWindow.getAllWindows()로 가져옴.
 * 이렇게 하면 창이 닫히거나 재생성되어도 항상 올바른 창을 참조.
 */
export function registerInferenceHandlers(): void {
  function getMainWindow(): BrowserWindow | null {
    const wins = BrowserWindow.getAllWindows()
    return wins.length > 0 ? wins[0] : null
  }

  // ── inference:generate ──────────────────────────────
  ipcMain.handle(IPC_CHANNELS.INFERENCE_GENERATE, async (_event, params: GenerationParams) => {
    log.info(`[IPC] inference:generate mode=${params.mode} steps=${params.steps}`)

    const win = getMainWindow()
    if (!win) {
      log.error('[IPC] inference:generate — no window found')
      return { error: 'No window', code: 'NO_WINDOW' }
    }

    let inference: InferenceService
    let db: DbService
    try {
      inference = InferenceService.getInstance()
      db = DbService.getInstance()
    } catch (err) {
      log.error(`[IPC] inference:generate — service init error: ${err}`)
      return { error: String(err), code: 'SERVICE_ERROR' }
    }

    if (inference.isRunning()) {
      return { error: 'Already generating', code: 'BUSY' }
    }

    // 출력 경로를 settings에서 동기화
    try {
      const settings = SettingsService.getInstance()
      inference.setOutputDir(settings.getOutputDir())
    } catch (_) {
      // settings 실패해도 진행
    }

    // DB에 레코드 생성
    let genId: number
    try {
      genId = db.createGeneration(params)
    } catch (err) {
      log.warn(`[IPC] DB createGeneration failed (continuing without DB): ${err}`)
      genId = -1
    }

    const startTime = Date.now()

    // GPU 정보 수집 (비차단, 실패해도 진행)
    const gpuResult = await GpuProbe.getInstance().probe().catch(() => null)

    try {
      const finalImagePath = await inference.generate(params, win)

      // 완료 시 DB 업데이트
      if (genId >= 0 && finalImagePath) {
        try {
          db.updateGenerationSuccess(
            genId,
            finalImagePath,
            Date.now() - startTime,
            gpuResult?.gpuInfo?.name,
            gpuResult?.gpuInfo?.driverVersion,
            gpuResult?.backend,
          )
        } catch (dbErr) {
          log.warn(`[IPC] DB update failed: ${dbErr}`)
        }
      }

      return { success: true, genId }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (genId >= 0) {
        try {
          if (message === 'CANCELLED') {
            db.updateGenerationFailed(genId, 'cancelled', 'User cancelled')
          } else {
            db.updateGenerationFailed(genId, 'failed', message)
          }
        } catch (_) {}
      }
      return { error: message }
    }
  })

  // ── inference:cancel ────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.INFERENCE_CANCEL, async () => {
    log.info('[IPC] inference:cancel')
    try {
      await InferenceService.getInstance().cancel()
    } catch (err) {
      log.warn(`[IPC] cancel error: ${err}`)
    }
    return { success: true }
  })

  log.info('[IPC] Inference handlers registered')
}
