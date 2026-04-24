/**
 * Settings Page — VRAM 모드, 출력 경로, 테마, LLM (FE-11)
 * IPC 실제 연결 버전
 */
import { useState, useEffect } from 'react'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  outputDirectory: '',
  vramMode: 'auto',
  theme: 'dark',
  language: 'ko',
  llm: {
    enabled: false,
    endpoint: 'http://localhost:1234',
    defaultModel: 'local-model',
    systemPrompt: '',
  },
  defaultParams: {},
  logLevel: 'info',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  const api = (window as unknown as { electronAPI?: typeof window.electronAPI }).electronAPI

  useEffect(() => {
    if (!api) { setLoading(false); return }
    
    // 설정 및 모델 목록 로드
    Promise.all([
      api.getSettings(),
      api.listModels()
    ]).then(([s, models]) => {
      setSettings(s)
      setAvailableModels(models || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSave = async (partial: Partial<AppSettings>) => {
    if (!api) return
    const updated = await api.setSettings(partial)
    setSettings(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleChooseDir = async () => {
    if (!api) return
    const result = await api.chooseOutputDir()
    if (result) {
      setSettings((prev) => ({ ...prev, outputDirectory: result }))
    }
  }

  const handleOpenDir = async () => {
    if (!api) return
    await api.openOutputDir()
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
        {saved && (
          <span className="text-xs text-green-400 bg-green-950 px-3 py-1 rounded-full border border-green-800">
            ✓ 저장됨
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* 출력 경로 */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Output</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-sm text-zinc-300 block mb-1">Output Directory</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={settings.outputDirectory || '~/ZImageStudio/outputs'}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 truncate"
                />
                <button
                  id="browse-output-dir"
                  onClick={handleChooseDir}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors whitespace-nowrap"
                >
                  Browse
                </button>
                <button
                  id="open-output-dir"
                  onClick={handleOpenDir}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
                  title="폴더 열기"
                >
                  📂
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 기본 모델 설정 */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Inference Model</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-sm text-zinc-300 block mb-2">Default Generation Model</label>
              <div className="flex gap-2">
                <select
                  value={settings.modelName || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setSettings(p => ({ ...p, modelName: val }))
                    handleSave({ modelName: val })
                  }}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
                >
                  <option value="">Auto Detect (Recommened)</option>
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={() => api?.listModels().then(setAvailableModels)}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-300"
                  title="새로고침"
                >
                  🔄
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">
                resources/models 폴더의 .gguf 파일을 스캔합니다. ({availableModels.length}개 발견)
              </p>
            </div>
          </div>
        </section>

        {/* VRAM 모드 */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">GPU / Performance</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-sm text-zinc-300 block mb-2">VRAM Mode</label>
              <div className="grid grid-cols-4 gap-2">
                {(['auto', 'normal', 'low', 'tiny'] as const).map((v) => (
                  <button
                    key={v}
                    id={`settings-vram-${v}`}
                    onClick={() => {
                      setSettings((p) => ({ ...p, vramMode: v }))
                      handleSave({ vramMode: v })
                    }}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors border capitalize ${
                      settings.vramMode === v
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {v === 'auto' ? 'Auto' : v === 'low' ? 'Low VRAM' : v === 'tiny' ? 'Tiny VRAM' : 'Normal'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-2">Auto: GPU 프리체크 결과에 따라 자동 선택 (권장)</p>
            </div>
          </div>
        </section>

        {/* 테마 */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Appearance</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <label className="text-sm text-zinc-300 block mb-2">Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  id={`theme-${t}`}
                  onClick={() => {
                    setSettings((p) => ({ ...p, theme: t }))
                    handleSave({ theme: t })
                  }}
                  className={`px-4 py-1.5 rounded-lg text-sm transition-colors border capitalize ${
                    settings.theme === t
                      ? 'bg-brand-600 border-brand-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* LM Studio */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            LM Studio Prompt Enhancer
            <span className="ml-2 text-zinc-600 normal-case">(선택적)</span>
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-300">Enable Prompt Enhancer</p>
                <p className="text-xs text-zinc-500">LM Studio 미실행 시 자동으로 숨겨집니다</p>
              </div>
              {/* Toggle */}
              <button
                id="llm-toggle"
                onClick={() => {
                  const next = !settings.llm.enabled
                  setSettings((p) => ({ ...p, llm: { ...p.llm, enabled: next } }))
                  handleSave({ llm: { ...settings.llm, enabled: next } })
                }}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
                  settings.llm.enabled ? 'bg-brand-600 justify-end' : 'bg-zinc-700 justify-start'
                }`}
              >
                <div className="w-4 h-4 bg-white rounded-full shadow-sm transition-all" />
              </button>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Server Endpoint</label>
              <input
                id="llm-endpoint"
                value={settings.llm.endpoint}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, llm: { ...p.llm, endpoint: e.target.value } }))
                }
                onBlur={() => handleSave({ llm: settings.llm })}
                placeholder="http://localhost:1234"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="text-[10px] text-zinc-600 mt-1">LM Studio &gt; Local Server &gt; Start Server (Port: 1234)</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
