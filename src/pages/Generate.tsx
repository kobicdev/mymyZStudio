/**
 * Generate Page — txt2img / img2img / inpaint (FE-01, FE-02, FE-03)
 *
 * 실제 동작:
 * - Zustand 없이 로컬 state로 단순하게 구현 (v0.2)
 * - electronAPI를 통해 IPC 호출
 * - 진행률 바 (determinate / indeterminate)
 * - 생성 결과 이미지 표시
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { GenerationParams, GenerationProgress, GenerationMode } from '../shared/types'
import MaskCanvas from '../components/MaskCanvas'
import type { MaskCanvasHandle } from '../components/MaskCanvas'

const DEFAULT_PARAMS: Omit<GenerationParams, 'prompt' | 'mode'> = {
  negativePrompt: 'blurry, low quality, deformed, ugly, bad anatomy',
  seed: -1,
  steps: 8,
  cfgScale: 1.0,
  width: 512,
  height: 512,
  sampler: 'euler',
  modelName: '',
  vramMode: 'auto',
}

const SAMPLERS = ['euler', 'euler_a', 'dpm++2m', 'dpm++2m_karras', 'lcm', 'heun']
const RESOLUTIONS = [
  { label: '512×512', w: 512, h: 512 },
  { label: '768×768', w: 768, h: 768 },
  { label: '512×768', w: 512, h: 768 },
  { label: '768×512', w: 768, h: 512 },
  { label: '1024×1024', w: 1024, h: 1024 },
]

const STORAGE_KEY = 'zstudio_last_params'

export default function GeneratePage() {
  // 로컬 스토리지에서 이전 값 불러오기
  const savedParams = (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })()

  const [mode, setMode] = useState<GenerationMode>(savedParams?.mode || 'txt2img')
  const [prompt, setPrompt] = useState(savedParams?.prompt || 'A beautiful landscape, cinematic lighting, 8k')
  const [negativePrompt, setNegativePrompt] = useState(savedParams?.negativePrompt ?? DEFAULT_PARAMS.negativePrompt ?? '')
  const [steps, setSteps] = useState(savedParams?.steps ?? DEFAULT_PARAMS.steps)
  const [cfgScale, setCfgScale] = useState(savedParams?.cfgScale ?? DEFAULT_PARAMS.cfgScale)
  const [seed, setSeed] = useState(savedParams?.seed ?? DEFAULT_PARAMS.seed)
  const [sampler, setSampler] = useState(savedParams?.sampler ?? DEFAULT_PARAMS.sampler)
  const [width, setWidth] = useState(savedParams?.width ?? DEFAULT_PARAMS.width)
  const [height, setHeight] = useState(savedParams?.height ?? DEFAULT_PARAMS.height)
  const [vramMode, setVramMode] = useState<GenerationParams['vramMode']>(savedParams?.vramMode || 'auto')

  // img2img / inpaint 전용
  const [sourceImage, setSourceImage] = useState<string | null>(savedParams?.sourceImage || null)
  const [denoise, setDenoise] = useState(savedParams?.denoise ?? 0.6)
  const maskCanvasRef = useRef<MaskCanvasHandle>(null)
  
  // 파라미터 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    const paramsToSave = {
      mode, prompt, negativePrompt, steps, cfgScale, seed, sampler, width, height, vramMode,
      sourceImage, denoise
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paramsToSave))
  }, [mode, prompt, negativePrompt, steps, cfgScale, seed, sampler, width, height, vramMode, sourceImage, denoise])
  
  // LoRA 관련
  const [availableLoras, setAvailableLoras] = useState<string[]>([])
  const [selectedLoras, setSelectedLoras] = useState<{ name: string; weight: number }[]>([])

  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSimMode, setIsSimMode] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  // 로그 추가 시 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [logLines])
  
  // 도움말 토글 상태
  const [showHelp, setShowHelp] = useState<Record<string, boolean>>({})
  const toggleHelp = (id: string) => setShowHelp(p => ({ ...p, [id]: !p[id] }))

  const cleanupRef = useRef<(() => void)[]>([])

  // IPC 이벤트 구독
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: typeof window.electronAPI }).electronAPI
    if (!api) return

    const unsubProgress = api.onProgress((progress) => {
      setProgress(progress)
    })

    const unsubComplete = api.onComplete((result) => {
      setIsGenerating(false)
      setProgress(null)
      if (result.simulated) {
        setIsSimMode(true)
        setResultImage(null)
      } else if (result.imageData) {
        setResultImage(result.imageData)
      }
    })

    const unsubError = api.onError((err) => {
      setIsGenerating(false)
      setProgress(null)
      if (err.code !== 'CANCELLED') {
        setErrorMsg(err.message)
      }
    })

    const unsubLog = api.onLog?.((data) => {
      setLogLines((prev) => {
        const next = [...prev, data.line]
        return next.length > 500 ? next.slice(-500) : next
      })
    })

    cleanupRef.current = [unsubProgress, unsubComplete, unsubError, ...(unsubLog ? [unsubLog] : [])]

    return () => {
      cleanupRef.current.forEach((fn) => fn())
    }
  }, [])

  // LoRA 목록 가져오기
  useEffect(() => {
    const api = (window as unknown as { electronAPI?: typeof window.electronAPI }).electronAPI
    if (api?.listLoras) {
      api.listLoras().then(setAvailableLoras)
    }
  }, [])

  const toggleLora = (name: string) => {
    setSelectedLoras(prev => {
      const exists = prev.find(l => l.name === name)
      if (exists) {
        return prev.filter(l => l.name !== name)
      } else {
        return [...prev, { name, weight: 1.0 }]
      }
    })
  }

  const updateLoraWeight = (name: string, weight: number) => {
    setSelectedLoras(prev => prev.map(l => l.name === name ? { ...l, weight } : l))
  }

  const handleGenerate = useCallback(async () => {
    const api = (window as unknown as { electronAPI?: typeof window.electronAPI }).electronAPI
    if (!api || isGenerating) return

    setIsGenerating(true)
    setErrorMsg(null)
    setProgress(null)
    setIsSimMode(false)
    setLogLines([])

    // inpaint 모드: 마스크 먼저 저장
    let savedMaskPath: string | undefined
    if (mode === 'inpaint' && maskCanvasRef.current) {
      try {
        const dataUrl = maskCanvasRef.current.getMaskDataUrl()
        const result = await (api as any).saveMask(dataUrl)
        if (result?.maskPath) savedMaskPath = result.maskPath
      } catch (err) {
        console.warn('[Inpaint] mask save failed:', err)
      }
    }

    const params: GenerationParams = {
      prompt: prompt.trim() || 'a beautiful landscape',
      negativePrompt: negativePrompt.trim() || undefined,
      seed,
      steps,
      cfgScale,
      width,
      height,
      sampler,
      modelName: '',
      mode,
      vramMode,
      loras: selectedLoras.length > 0 ? selectedLoras : undefined,
      sourceImage: (mode === 'img2img' || mode === 'inpaint') ? sourceImage || undefined : undefined,
      maskImage: mode === 'inpaint' ? savedMaskPath : undefined,
      denoise: (mode === 'img2img' || mode === 'inpaint') ? denoise : undefined,
    }

    try {
      await api.generate(params)
    } catch (err) {
      setIsGenerating(false)
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [isGenerating, prompt, negativePrompt, seed, steps, cfgScale, width, height, sampler, mode, vramMode, selectedLoras, sourceImage, denoise])

  const handleCancel = useCallback(async () => {
    const api = (window as unknown as { electronAPI?: typeof window.electronAPI }).electronAPI
    if (!api) return
    await api.cancelGeneration()
    setIsGenerating(false)
    setProgress(null)
  }, [])

  // 진행률 계산
  const progressPercent =
    progress?.mode === 'determinate' && progress.step && progress.total
      ? Math.round((progress.step / progress.total) * 100)
      : null

  const progressLabel = progress?.mode === 'indeterminate'
    ? 'Processing…'
    : progress
    ? `${progress.step} / ${progress.total} steps${progress.eta ? `  ~${progress.eta}s` : ''}`
    : isGenerating
    ? 'Starting…'
    : ''

  return (
    <div className="flex h-full">
      {/* ── 왼쪽: 파라미터 패널 ── */}
      <aside className="w-80 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 overflow-y-auto p-4 space-y-4">
        <h1 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Generate</h1>

        {/* 모드 탭 */}
        <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
          {(['txt2img', 'img2img', 'inpaint'] as GenerationMode[]).map((m) => (
            <button
              key={m}
              id={`mode-tab-${m}`}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === m
                  ? 'bg-brand-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* 프롬프트 */}
        <div className="space-y-2">
          <label className="text-xs text-zinc-400 font-medium">Prompt</label>
          <textarea
            id="prompt-input"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A beautiful landscape, cinematic lighting, 8k..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                       text-sm text-zinc-100 placeholder-zinc-500 resize-none
                       focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-transparent
                       transition-colors"
          />
          <div className="flex justify-end">
            <button
              onClick={() => setPrompt('')}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <span>Clear Prompt</span>
              <span>🗑️</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-zinc-400 font-medium">Negative Prompt</label>
          <textarea
            id="negative-prompt-input"
            rows={2}
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="blurry, low quality, deformed..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2
                       text-sm text-zinc-100 placeholder-zinc-500 resize-none
                       focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-transparent
                       transition-colors"
          />
        </div>

        {/* img2img / inpaint 소스 이미지 */}
        {(mode === 'img2img' || mode === 'inpaint') && (
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 font-medium">Source Image</label>
            <div 
              className="relative group aspect-video bg-zinc-800 border-2 border-dashed border-zinc-700 rounded-xl overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-brand-500 transition-colors"
              onClick={async () => {
                const api = (window as any).electronAPI
                if (api?.chooseImage) {
                  const path = await api.chooseImage()
                  if (path) setSourceImage(path)
                }
              }}
            >
              {sourceImage ? (
                <>
                  <img src={`zimg://${sourceImage.replace(/\\/g, '/')}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-xs text-white">이미지 변경</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-2xl mb-1">🖼️</span>
                  <span className="text-[10px] text-zinc-500">이미지를 선택하세요</span>
                </>
              )}
            </div>
            {sourceImage && (
              <button 
                onClick={() => setSourceImage(null)}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors w-full text-right"
              >
                삭제
              </button>
            )}
          </div>
        )}

        {/* inpaint 마스크 캔버스 에디터 */}
        {mode === 'inpaint' && sourceImage && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-400 font-medium">마스크 에디터</label>
            <MaskCanvas
              ref={maskCanvasRef}
              sourceImagePath={`zimg://${sourceImage.replace(/\\/g, '/')}`}
              width={width}
              height={height}
            />
          </div>
        )}

        {/* inpaint 모드에서 소스 이미지 없으면 안내 */}
        {mode === 'inpaint' && !sourceImage && (
          <div className="p-3 rounded-xl bg-zinc-800/50 border border-dashed border-zinc-700 text-center">
            <p className="text-[10px] text-zinc-500">↑ 소스 이미지를 먼저 선택하면<br/>마스크 에디터가 표시됩니다</p>
          </div>
        )}

        <div className="h-px bg-zinc-800" />

        {/* Generation Controls */}
        <div className="space-y-4">
          {/* Steps */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1">
                <label className="text-xs text-zinc-400 font-medium">Steps</label>
                <button
                  onClick={() => toggleHelp('steps')}
                  className="text-[10px] text-zinc-500 hover:text-brand-400 transition-colors"
                  title="도움말"
                >
                  ❔
                </button>
              </div>
              <span className="text-xs text-zinc-300 font-mono">{steps}</span>
            </div>
            <input
              id="steps-slider"
              type="range"
              min={1}
              max={50}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
            {showHelp.steps && (
              <p className="text-[10px] text-zinc-400 bg-zinc-800/50 p-2 rounded border border-zinc-700/50">
                높을수록 정교해지지만 시간이 오래 걸립니다. (Turbo: 4~10 권장)
              </p>
            )}
          </div>

          {/* CFG Scale */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1">
                <label className="text-xs text-zinc-400 font-medium">CFG Scale</label>
                <button
                  onClick={() => toggleHelp('cfg')}
                  className="text-[10px] text-zinc-500 hover:text-brand-400 transition-colors"
                  title="도움말"
                >
                  ❔
                </button>
              </div>
              <span className="text-xs text-zinc-300 font-mono">{cfgScale.toFixed(1)}</span>
            </div>
            <input
              id="cfg-slider"
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={cfgScale}
              onChange={(e) => setCfgScale(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
            {showHelp.cfg && (
              <p className="text-[10px] text-zinc-400 bg-zinc-800/50 p-2 rounded border border-zinc-700/50">
                높을수록 프롬프트에 충실해집니다. (Turbo: 1.0~2.0 권장)
              </p>
            )}
          </div>

          {/* Denoise Strength (img2img/inpaint 전용) */}
          {(mode === 'img2img' || mode === 'inpaint') && (
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <label className="text-xs text-zinc-400 font-medium">Denoise Strength</label>
                  <button
                    onClick={() => toggleHelp('denoise')}
                    className="text-[10px] text-zinc-500 hover:text-brand-400 transition-colors"
                    title="도움말"
                  >
                    ❔
                  </button>
                </div>
                <span className="text-xs text-zinc-300 font-mono">{denoise.toFixed(2)}</span>
              </div>
              <input
                id="denoise-slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={denoise}
                onChange={(e) => setDenoise(Number(e.target.value))}
                className="w-full accent-brand-500 cursor-pointer"
              />
              {showHelp.denoise && (
                <p className="text-[10px] text-zinc-400 bg-zinc-800/50 p-2 rounded border border-zinc-700/50">
                  값이 클수록 원본에서 더 많이 변합니다. (0.4~0.7 권장)
                </p>
              )}
            </div>
          )}

          {/* Seed */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-400 font-medium">Seed</label>
              <button
                onClick={() => toggleHelp('seed')}
                className="text-[10px] text-zinc-500 hover:text-brand-400 transition-colors"
                title="도움말"
              >
                ❔
              </button>
            </div>
            <div className="flex gap-2">
              <input
                id="seed-input"
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5
                           text-sm text-zinc-100 font-mono focus:outline-none focus:ring-1
                           focus:ring-brand-500 focus:border-transparent transition-colors"
              />
              <button
                id="random-seed-btn"
                title="Random seed"
                onClick={() => setSeed(-1)}
                className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700
                           rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors text-xs"
              >
                🎲
              </button>
            </div>
            {showHelp.seed && (
              <p className="text-[10px] text-zinc-400 bg-zinc-800/50 p-2 rounded border border-zinc-700/50">
                이미지 고유 번호입니다. -1은 랜덤 생성을 의미합니다.
              </p>
            )}
          </div>

          {/* Sampler */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1">
              <label className="text-xs text-zinc-400 font-medium">Sampler</label>
              <button
                onClick={() => toggleHelp('sampler')}
                className="text-[10px] text-zinc-500 hover:text-brand-400 transition-colors"
                title="도움말"
              >
                ❔
              </button>
            </div>
            <select
              id="sampler-select"
              value={sampler}
              onChange={(e) => setSampler(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5
                         text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-brand-500
                         focus:border-transparent transition-colors cursor-pointer"
            >
              {SAMPLERS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {showHelp.sampler && (
              <p className="text-[10px] text-zinc-400 bg-zinc-800/50 p-2 rounded border border-zinc-700/50">
                이미지를 계산하는 알고리즘입니다. euler_a나 dpm++를 추천합니다.
              </p>
            )}
          </div>

          {/* Resolution */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Resolution</label>
            <div className="grid grid-cols-3 gap-1">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => { setWidth(r.w); setHeight(r.h) }}
                  className={`py-1 rounded-md text-xs font-medium transition-colors border ${
                    width === r.w && height === r.h
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* VRAM Mode */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">VRAM Mode</label>
            <div className="grid grid-cols-2 gap-1">
              {(['auto', 'normal', 'low', 'tiny'] as const).map((v) => (
                <button
                  key={v}
                  id={`vram-${v}`}
                  onClick={() => setVramMode(v)}
                  className={`py-1 rounded-md text-xs font-medium transition-colors border ${
                    vramMode === v
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          
          {/* LoRAs Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs text-zinc-400 font-medium">LoRAs</label>
              <span className="text-[10px] text-zinc-500 uppercase">{availableLoras.length} Available</span>
            </div>
            
            {/* 가용 LoRA 목록 */}
            <div className="flex flex-wrap gap-1">
              {availableLoras.length === 0 ? (
                <p className="text-[10px] text-zinc-600 italic">No LoRAs found in resources/models/loras</p>
              ) : (
                availableLoras.map(name => {
                  const isSelected = selectedLoras.some(l => l.name === name)
                  return (
                    <button
                      key={name}
                      onClick={() => toggleLora(name)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-all border ${
                        isSelected 
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' 
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500'
                      }`}
                    >
                      {name.replace('.gguf', '').replace('.safetensors', '')}
                    </button>
                  )
                })
              )}
            </div>

            {/* 선택된 LoRA 가중치 조절 */}
            <div className="space-y-3 mt-2">
              {selectedLoras.map(lora => (
                <div key={lora.name} className="space-y-1 bg-zinc-800/30 p-2 rounded-lg border border-zinc-800">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-zinc-300 truncate max-w-[120px]">{lora.name}</span>
                    <span className="text-[10px] text-indigo-400 font-mono">{lora.weight.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={lora.weight}
                    onChange={(e) => updateLoraWeight(lora.name, Number(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── 오른쪽: 결과 캔버스 ── */}
      <div className="flex-1 flex flex-col">
        {/* 결과 이미지 영역 */}
        <div className="flex-1 flex items-center justify-center bg-zinc-950 relative overflow-hidden">
          {resultImage ? (
            <img
              id="result-image"
              src={resultImage}
              alt="Generated result"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          ) : isSimMode ? (
            <div className="text-center space-y-3">
              <div className="w-24 h-24 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-zinc-400 text-sm font-medium">시뮬레이션 완료</p>
              <p className="text-zinc-600 text-xs max-w-xs">
                sd.cpp 바이너리를 resources/sd/ 폴더에 배치하면<br />실제 이미지가 생성됩니다
              </p>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="w-24 h-24 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M21 21H3a1.5 1.5 0 01-1.5-1.5V6a1.5 1.5 0 011.5-1.5h18A1.5 1.5 0 0122.5 6v13.5A1.5 1.5 0 0121 21zM16.5 8.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </div>
              <p className="text-zinc-500 text-sm">결과 이미지가 여기에 표시됩니다</p>
            </div>
          )}

          {/* 생성 중 콘솔 패널 */}
          {isGenerating && (
            <div className="absolute inset-0 flex flex-col bg-zinc-950/95">
              {/* 콘솔 헤더 */}
              <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-[11px] font-mono font-semibold text-zinc-400 uppercase tracking-widest">sd.cpp console</span>
                <span className="ml-auto text-[10px] font-mono text-zinc-600">
                  {progress?.mode === 'determinate' && progress.step && progress.total
                    ? `${progress.step} / ${progress.total} steps`
                    : 'Processing...'}
                </span>
              </div>
              {/* 로그 스크롤 영역 */}
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-0.5 custom-scrollbar">
                {logLines.length === 0 ? (
                  <p className="text-zinc-600 italic">Waiting for output...</p>
                ) : (
                  logLines.map((line, i) => {
                    const isProgress = /\|[=>\s]+\|/.test(line)
                    const isInfo = line.includes('[INFO]')
                    const isWarn = line.includes('[WARN]') || line.includes('[WARN')
                    const isError = line.includes('[ERROR]') || line.includes('error')
                    const isSave = line.includes('saved') || line.includes('success')
                    return (
                      <div
                        key={i}
                        className={`leading-relaxed whitespace-pre-wrap break-all ${
                          isProgress ? 'text-brand-400' :
                          isSave     ? 'text-green-400' :
                          isError    ? 'text-red-400' :
                          isWarn     ? 'text-yellow-400' :
                          isInfo     ? 'text-zinc-400' :
                                       'text-zinc-300'
                        }`}
                      >
                        {line}
                      </div>
                    )
                  })
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* 에러 메시지 */}
        {errorMsg && (
          <div className="px-6 py-2 bg-red-950 border-t border-red-900 flex items-center gap-2">
            <span className="text-red-400 text-xs">⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="ml-auto text-red-600 hover:text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* 하단: 생성 버튼 + 진행률 */}
        <div className="h-20 bg-zinc-900 border-t border-zinc-800 px-6 flex items-center gap-4">
          {isGenerating ? (
            <button
              id="cancel-btn"
              onClick={handleCancel}
              className="px-6 py-2.5 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold
                         rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              ✕ Cancel
            </button>
          ) : (
            <button
              id="generate-btn"
              onClick={handleGenerate}
              className="px-8 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold
                         rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✨ Generate
            </button>
          )}

          {/* 진행률 바 (FE-02) */}
          <div className="flex-1 space-y-1">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              {progress?.mode === 'indeterminate' ? (
                // indeterminate: 좌우로 움직이는 애니메이션
                <div className="h-full w-1/3 bg-brand-500 rounded-full animate-indeterminate" />
              ) : (
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-300"
                  style={{ width: progressPercent !== null ? `${progressPercent}%` : '0%' }}
                />
              )}
            </div>
            {progressLabel && (
              <p className="text-xs text-zinc-500">{progressLabel}</p>
            )}
          </div>

          <span className="text-xs text-zinc-500 font-mono min-w-[80px] text-right">
            {progressPercent !== null ? `${progressPercent}%` : `0 / ${steps} steps`}
          </span>
        </div>
      </div>
    </div>
  )
}
