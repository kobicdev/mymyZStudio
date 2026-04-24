import { spawn, ChildProcess } from 'child_process'
import { execSync } from 'child_process'
import log from 'electron-log'

/**
 * ProcessHandler — 좀비 프로세스 방지 3단계 종료 전략 (§4.1)
 *
 * Stage 1 (Graceful): SIGTERM → 최대 3초 대기
 * Stage 2 (Force):    SIGKILL + OS별 보조 명령
 *   - Windows: taskkill /F /T /PID <pid>
 *   - Linux/macOS: kill -9 -<pgid>
 * Stage 3 (Verify):   PID 존재 여부 재확인, 남아있으면 경고 로그
 */
export class ProcessHandler {
  private static instance: ProcessHandler
  private activeProcess: ChildProcess | null = null
  private processName: string = 'unknown'

  private constructor() {}

  static getInstance(): ProcessHandler {
    if (!ProcessHandler.instance) {
      ProcessHandler.instance = new ProcessHandler()
    }
    return ProcessHandler.instance
  }

  /**
   * 안전한 프로세스 spawn.
   * detached: true + processGroup 설정으로 자식 트리 전체 제어 가능.
   */
  spawn(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv }
  ): ChildProcess {
    if (this.activeProcess) {
      log.warn('[ProcessHandler] Previous process still running, killing first')
      this.killSync()
    }

    this.processName = command.split('/').pop() ?? command

    const proc = spawn(command, args, {
      ...options,
      // detached + 프로세스 그룹 설정 → 자식 전체를 한 번에 처리
      detached: process.platform !== 'win32',
      // Windows에서 detached: true는 새 콘솔 창을 띄우므로 비활성
    })

    this.activeProcess = proc

    proc.on('error', (err) => {
      log.error(`[ProcessHandler] Spawn error: ${err.message}`)
    })

    proc.on('exit', (code, signal) => {
      log.info(`[ProcessHandler] Process exited: code=${code} signal=${signal}`)
      if (this.activeProcess === proc) {
        this.activeProcess = null
      }
    })

    log.info(`[ProcessHandler] Spawned ${this.processName} (PID: ${proc.pid})`)
    return proc
  }

  /**
   * 비동기 3단계 종료. UI에서 취소 버튼 클릭 시 사용.
   */
  async kill(): Promise<void> {
    const proc = this.activeProcess
    if (!proc || proc.killed || proc.exitCode !== null) {
      this.activeProcess = null
      return
    }

    const pid = proc.pid
    if (!pid) return

    log.info(`[ProcessHandler] Killing PID ${pid} (${this.processName})`)

    // Stage 1: Graceful SIGTERM
    try {
      proc.kill('SIGTERM')
    } catch (e) {
      log.warn(`[ProcessHandler] SIGTERM failed: ${e}`)
    }

    const gracefulTimeout = 3000
    const exited = await this.waitForExit(proc, gracefulTimeout)

    if (exited) {
      log.info(`[ProcessHandler] Process exited gracefully (PID: ${pid})`)
      this.activeProcess = null
      return
    }

    // Stage 2: Force kill
    log.warn(`[ProcessHandler] Grace period exceeded, force killing PID ${pid}`)
    this.forceKill(pid)

    // Stage 3: Verify
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (this.isPidAlive(pid)) {
      log.error(`[ProcessHandler] WARNING: PID ${pid} still alive after force kill! VRAM may be leaked.`)
    } else {
      log.info(`[ProcessHandler] PID ${pid} confirmed dead`)
      this.activeProcess = null
    }
  }

  /**
   * 동기 강제 종료. app before-quit 이벤트에서 사용.
   */
  killSync(): void {
    const proc = this.activeProcess
    if (!proc || !proc.pid) return

    const pid = proc.pid
    log.info(`[ProcessHandler] Sync kill PID ${pid}`)

    try {
      proc.kill('SIGTERM')
    } catch (_) {}

    setTimeout(() => {
      this.forceKill(pid)
    }, 1000)

    this.activeProcess = null
  }

  /**
   * 실행 중인 프로세스가 있는지 확인
   */
  isRunning(): boolean {
    return this.activeProcess !== null && !this.activeProcess.killed
  }

  // ─── Private Helpers ───────────────────────────

  private forceKill(pid: number): void {
    try {
      if (process.platform === 'win32') {
        // Windows: 자식 트리 포함 강제 종료
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
        log.info(`[ProcessHandler] taskkill /F /T /PID ${pid} executed`)
      } else {
        // Linux/macOS: 프로세스 그룹 단위 kill
        process.kill(-pid, 'SIGKILL')
        log.info(`[ProcessHandler] kill -9 -${pid} executed`)
      }
    } catch (e) {
      // 이미 죽었을 수 있음 — 에러는 경고로만
      log.warn(`[ProcessHandler] Force kill error (may already be dead): ${e}`)
    }
  }

  private waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)

      proc.once('exit', () => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }

  private isPidAlive(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8' })
        return result.includes(String(pid))
      } else {
        process.kill(pid, 0)  // 에러 없으면 살아있음
        return true
      }
    } catch {
      return false
    }
  }
}
