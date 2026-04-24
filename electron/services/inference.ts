import path from 'path'
import fs from 'fs'
import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import { ProcessHandler } from './processHandler'
import type { GenerationParams, GenerationProgress } from '../../src/shared/types'
import { IPC_CHANNELS } from '../../src/shared/types'

/**
 * InferenceService — sd.cpp child_process 관리 (BE-01)
 *
 * stable-diffusion.cpp CLI를 spawn해서 이미지를 생성.
 * stdout 파싱으로 진행률(determinate) 또는 indeterminate 모드로 전환.
 * 모든 spawn은 ProcessHandler를 통해서만 수행 (좀비 방지 §4.1).
 */
export class InferenceService {
  private static instance: InferenceService
  private isGenerating = false
  private outputDir: string

  private constructor() {
    this.outputDir = path.join(app.getAppPath(), 'outputs')
    this.ensureOutputDir()
  }

  static getInstance(): InferenceService {
    if (!InferenceService.instance) {
      InferenceService.instance = new InferenceService()
    }
    return InferenceService.instance
  }

  setOutputDir(dir: string): void {
    this.outputDir = dir
    this.ensureOutputDir()
  }

  getOutputDir(): string {
    return this.outputDir
  }

  isRunning(): boolean {
    return this.isGenerating
  }

  /**
   * 이미지 생성 메인 함수.
   * mainWindow로 progress/complete/error 이벤트를 push.
   * @returns 생성된 이미지의 절대 경로 (성공 시)
   */
  async generate(params: GenerationParams, mainWindow: BrowserWindow): Promise<string | undefined> {
    if (this.isGenerating) {
      throw new Error('Already generating. Cancel first.')
    }

    // 1. 한국어 자동 번역 (Ollama 사용)
    let finalPrompt = params.prompt
    if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(params.prompt)) {
      mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_PROGRESS, {
        mode: 'indeterminate',
        message: '번역 중...'
      })
      
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { LlmService } = require('./llm') as typeof import('./llm')
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SettingsService } = require('./settings') as typeof import('./settings')
        
        const llm = LlmService.getInstance()
        const settings = SettingsService.getInstance().get()
        llm.setEndpoint(settings.llm.endpoint)
        
        if (await llm.checkAvailability()) {
          finalPrompt = await llm.translate(params.prompt)
          log.info(`[Inference] Translated prompt: ${finalPrompt}`)
        }
      } catch (err) {
        log.warn(`[Inference] Translation failed: ${err}`)
      }
    }

    const actualParams = { ...params, prompt: finalPrompt }
    const sdBinary = this.findSdBinary()

    // sd.cpp 없으면 시뮬레이션 모드로 자동 전환 (개발/데모용)
    if (sdBinary === '__simulation__') {
      log.warn('[Inference] sd.cpp not found — running in simulation mode')
      return this.simulateGeneration(actualParams, mainWindow)
    }

    this.isGenerating = true
    const handler = ProcessHandler.getInstance()

    try {
      const outputPath = this.buildOutputPath(actualParams)
      const args = this.buildArgs(actualParams)

      // 4. 프로세스 실행
      const binDir = path.dirname(sdBinary)
      const relativeOutputPath = path.relative(binDir, outputPath)
      let totalSteps = params.steps

      log.info(`[Inference] Executing: ${sdBinary} ${args.join(' ')} -o ${relativeOutputPath}`)

      const proc = handler.spawn(sdBinary, [...args, '-o', relativeOutputPath], {
        cwd: binDir,
        env: { ...process.env },
      })

      proc.stdout?.setEncoding('utf-8')
      proc.stderr?.setEncoding('utf-8')

      // sd-cli.exe는 stdout에 진행률 출력 (stderr가 아님)
      const handleChunk = (chunk: string) => {
        const lines = chunk.split('\n')
        for (const line of lines) {
          log.debug(`[sd.cpp] ${line.trim()}`)
          this.parseProgressLine(line, mainWindow, totalSteps, (step, total) => {
            totalSteps = total
            void step
          })
        }
      }
      proc.stdout?.on('data', handleChunk)
      proc.stderr?.on('data', handleChunk)

      await new Promise<void>((resolve, reject) => {
        proc.on('exit', (code, signal) => {
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            reject(new Error('CANCELLED'))
            return
          }

          // 파일이 생성되었는지 확인 (비정상 종료 코드라도 파일이 있으면 성공)
          if (fs.existsSync(outputPath)) {
            log.info(`[Inference] Generation success (file exists) even with exit code ${code}`)
            resolve()
          } else if (code === 0) {
            resolve()
          } else {
            reject(new Error(`sd.cpp exited with code ${code} and no file was created`))
          }
        })

        proc.on('error', (err) => {
          reject(err)
        })
      })

      // 생성 완료
      if (fs.existsSync(outputPath)) {
        log.info(`[Inference] Generation complete: ${outputPath}`)
        const imageData = `data:image/png;base64,${fs.readFileSync(outputPath).toString('base64')}`
        mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_COMPLETE, {
          imagePath: outputPath,
          imageData,
        })
        return outputPath
      } else {
        throw new Error(`Output file not found: ${outputPath}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'CANCELLED') {
        log.info('[Inference] Generation cancelled by user')
        mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_ERROR, {
          message: 'Generation cancelled',
          code: 'CANCELLED',
        })
        throw new Error('CANCELLED')
      } else {
        log.error(`[Inference] Generation error: ${message}`)
        mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_ERROR, {
          message,
          code: 'GENERATION_FAILED',
        })
        throw err
      }
    } finally {
      this.isGenerating = false
    }
  }

  async cancel(): Promise<void> {
    if (!this.isGenerating) return
    log.info('[Inference] Cancelling...')
    await ProcessHandler.getInstance().kill()
  }

  // ─── Private ────────────────────────────────────────

  /**
   * sd.cpp stderr 출력 파싱.
   * 예: "  10%|██████████ | 1/10 [00:02<00:18,  2.22it/s]"
   * 또는: "sampling: 5/20"
   */
  private parseProgressLine(
    line: string,
    mainWindow: BrowserWindow,
    _totalSteps: number,
    onStep: (step: number, total: number) => void,
  ): void {
    // tqdm 형식: "XX%|... | step/total ..."
    const tqdmMatch = line.match(/(\d+)%\|[^|]*\|\s*(\d+)\/(\d+)/)
    if (tqdmMatch) {
      const step = parseInt(tqdmMatch[2], 10)
      const total = parseInt(tqdmMatch[3], 10)
      onStep(step, total)
      const progress: GenerationProgress = {
        mode: 'determinate',
        step,
        total,
        eta: this.parseEta(line),
      }
      mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_PROGRESS, progress)
      return
    }

    // 간단 형식: "sampling: N/M" 또는 "step N of M"
    const simpleMatch = line.match(/(?:sampling|step)[:\s]+(\d+)\s*[/of]+\s*(\d+)/i)
    if (simpleMatch) {
      const step = parseInt(simpleMatch[1], 10)
      const total = parseInt(simpleMatch[2], 10)
      onStep(step, total)
      const progress: GenerationProgress = {
        mode: 'determinate',
        step,
        total,
      }
      mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_PROGRESS, progress)
      return
    }

    // 파싱 실패 → indeterminate 모드 (BE-04)
    if (line.includes('generating') || line.includes('encode') || line.includes('decode')) {
      const progress: GenerationProgress = { mode: 'indeterminate' }
      mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_PROGRESS, progress)
    }
  }

  private parseEta(line: string): number | undefined {
    const match = line.match(/<(\d+):(\d+)/)
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
    }
    return undefined
  }

  /**
   * sd.cpp 바이너리 경로 탐색.
   * resources/sd/ 또는 PATH에서 찾음.
   */
  private findSdBinary(): string {
    const isWin = process.platform === 'win32'
    
    // 최근 빌드는 sd-cli.exe, 예전 빌드는 sd.exe 사용
    const binNames = isWin ? ['sd-cli.exe', 'sd.exe'] : ['sd-cli', 'sd']

    const candidates: string[] = []
    for (const binName of binNames) {
      candidates.push(path.join(process.resourcesPath || '', 'resources', 'sd', binName))
      candidates.push(path.join(app.getAppPath(), 'resources', 'sd', binName))
      candidates.push(path.join(app.getAppPath(), 'sd', binName)) // 프로젝트 루트의 sd 폴더 추가
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        log.info(`[Inference] Found local sd binary: ${candidate}`)
        return candidate
      }
    }

    // 3. 환경변수 PATH 확인 (개발용)
    // Windows에서는 'where', Unix에서는 'which'로 확인 가능하지만 
    // 단순하게 spawn 에러를 피하기 위해 여기서는 시뮬레이션으로 폴백 권장.
    // 만약 PATH에 있는 sd를 꼭 써야 한다면 아래 주석을 해제하세요.
    /*
    try {
      const { execSync } = require('child_process')
      execSync(isWin ? 'where sd' : 'which sd', { stdio: 'ignore' })
      return 'sd'
    } catch (e) {
      // PATH에 없음
    }
    */

    // sd.cpp가 없는 경우 시뮬레이션 모드 (개발/데모용)
    log.warn('[Inference] sd.cpp binary not found in local paths, using simulation mode')
    return '__simulation__'
  }

  private getModelsDir(): string {
    const candidates = [
      path.resolve(app.getAppPath(), 'resources', 'models'),
      path.resolve(app.getAppPath(), 'models'), // 프로젝트 루트의 models 폴더 (사용자 스크린샷 기준)
    ]
    
    // 1. 실제로 .gguf 모델 파일이 들어있는 폴더를 우선 찾음
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        const files = fs.readdirSync(cand)
        if (files.some(f => f.endsWith('.gguf'))) {
          return cand
        }
      }
    }

    // 2. 없으면 그냥 존재하는 폴더 중 첫 번째 반환
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand
    }
    return candidates[0]
  }

  /**
   * GenerationParams → sd.cpp CLI 인수 배열
   */
  private buildArgs(params: GenerationParams): string[] {
    const args: string[] = []
    const modelsDir = this.getModelsDir()

    // 1. 모델 경로 결정 (Z-Image / Flux / DiT 대응)
    // -m 대신 --diffusion-model, --vae, --llm 사용 권장 (leejet/stable-diffusion.cpp 최신)
    
    let diffusionPath = ''
    let vaePath = ''
    let llmPath = ''

    // 간단한 자동 매칭 로직 (v0.2 수준)
    if (fs.existsSync(modelsDir)) {
      const files = fs.readdirSync(modelsDir)
      
      // Diffusion 모델 (.gguf)
      // z-image 키워드 우선, 없으면 turbo 키워드 검색
      const diffFile = files.find(f => (f.toLowerCase().includes('z-image') || f.toLowerCase().includes('z_image')) && f.endsWith('.gguf')) ||
                       files.find(f => f.toLowerCase().includes('turbo') && f.endsWith('.gguf'))
      if (diffFile) diffusionPath = path.resolve(modelsDir, diffFile)

      // VAE (ae.sft / ae.safetensors)
      const vaeFile = files.find(f => 
        (f.toLowerCase().includes('ae') || f.toLowerCase().includes('vae')) && 
        (f.endsWith('.sft') || f.endsWith('.safetensors'))
      )
      if (vaeFile) vaePath = path.resolve(modelsDir, vaeFile)

      // LLM / Text Encoder (Qwen / Clip / T5)
      const llmFile = files.find(f => 
        (f.toLowerCase().includes('qwen') || f.toLowerCase().includes('clip') || f.toLowerCase().includes('t5')) && 
        f.endsWith('.gguf')
      )
      if (llmFile) llmPath = path.resolve(modelsDir, llmFile)
    }

    // 만약 파라미터로 명시적인 모델명이 왔다면 우선순위
    let chosenModel = params.modelName
    
    // 파라미터에 없으면 설정(Settings)에서 가져오기
    if (!chosenModel) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SettingsService } = require('./settings') as typeof import('./settings')
        const settings = SettingsService.getInstance().get()
        if (settings.modelName) {
          chosenModel = settings.modelName
        }
      } catch (err) {
        log.warn(`[Inference] Failed to load settings for model selection: ${err}`)
      }
    }

    if (chosenModel) {
      const explicitPath = path.isAbsolute(chosenModel) 
        ? chosenModel 
        : path.resolve(modelsDir, chosenModel)
      if (fs.existsSync(explicitPath)) {
        diffusionPath = explicitPath
      }
    }

    if (diffusionPath) {
      args.push('--diffusion-model', diffusionPath)
      log.info(`[Inference] Diffusion Model: ${diffusionPath}`)
    } else {
      // 폴백: 기존 -m 방식
      const files = fs.existsSync(modelsDir) ? fs.readdirSync(modelsDir) : []
      const ggufFile = files.find(f => f.endsWith('.gguf'))
      if (ggufFile) {
        const fallbackPath = path.resolve(modelsDir, ggufFile)
        args.push('-m', fallbackPath)
        log.info(`[Inference] Fallback Model (-m): ${fallbackPath}`)
      }
    }

    if (vaePath) {
      args.push('--vae', vaePath)
      log.info(`[Inference] VAE: ${vaePath}`)
    }
    if (llmPath) {
      args.push('--llm', llmPath)
      log.info(`[Inference] LLM: ${llmPath}`)
    }

    // 2. 모드별 특화 인수 (img2img / inpaint)
    if (params.mode === 'img2img' || params.mode === 'inpaint') {
      if (params.sourceImage) {
        args.push('-i', path.resolve(params.sourceImage))
      }
      if (params.denoise !== undefined) {
        args.push('--strength', String(params.denoise))
      }
      if (params.mode === 'inpaint' && params.maskImage) {
        args.push('--mask', path.resolve(params.maskImage))
      }
    }

    // 3. 공통 인수
    args.push('-p', params.prompt)
    if (params.negativePrompt) args.push('-n', params.negativePrompt)
    args.push('-W', String(params.width))
    args.push('-H', String(params.height))
    args.push('--steps', String(params.steps))
    
    // Turbo 모델은 CFG 1.0 고정 권장
    args.push('--cfg-scale', String(params.cfgScale || 1.0))
    
    args.push('-s', String(params.seed === -1 ? Math.floor(Math.random() * 2147483647) : params.seed))
    args.push('--sampling-method', params.sampler || 'euler')

    // VRAM 모드 플래그
    const vramMode = params.vramMode ?? 'auto'
    if (vramMode === 'low') args.push('--vae-tiling')
    if (vramMode === 'tiny') args.push('--vae-tiling', '--low-vram')

    // LoRA 지원 (v0.5 선구현)
    if (params.loras && params.loras.length > 0) {
      const loraDir = path.resolve(modelsDir, 'loras')
      
      if (fs.existsSync(loraDir)) {
        for (const lora of params.loras) {
          const loraPath = path.resolve(loraDir, lora.name.endsWith('.gguf') || lora.name.endsWith('.safetensors') ? lora.name : `${lora.name}.gguf`)
          if (fs.existsSync(loraPath)) {
            args.push('--lora', loraPath)
            args.push('--lora-scaled', String(lora.weight ?? 1.0))
            log.info(`[Inference] Applied LoRA: ${lora.name} (weight: ${lora.weight})`)
          } else {
            log.warn(`[Inference] LoRA not found: ${loraPath}`)
          }
        }
      }
    }

    return args
  }

  private buildOutputPath(params: GenerationParams): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const seed = params.seed === -1 ? 'rnd' : params.seed
    const filename = `${timestamp}_seed${seed}.png`
    return path.resolve(this.outputDir, filename)
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
      log.info(`[Inference] Created output dir: ${this.outputDir}`)
    }
  }

  /**
   * 시뮬레이션 모드 — sd.cpp 없이 개발/데모용 더미 생성
   * 실제 배포 시 제거하거나 #if DEBUG 처리
   */
  async simulateGeneration(params: GenerationParams, mainWindow: BrowserWindow): Promise<string | undefined> {
    this.isGenerating = true
    const total = params.steps

    try {
      for (let step = 1; step <= total; step++) {
        await new Promise((r) => setTimeout(r, 200))
        const progress: GenerationProgress = { mode: 'determinate', step, total }
        mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_PROGRESS, progress)
      }

      // 더미 이미지 경로 반환 (없어도 경로만 전달)
      const outputPath = this.buildOutputPath(params)
      mainWindow.webContents.send(IPC_CHANNELS.INFERENCE_COMPLETE, {
        imagePath: outputPath,
        simulated: true,
      })
      return outputPath
    } finally {
      this.isGenerating = false
    }
  }
}
