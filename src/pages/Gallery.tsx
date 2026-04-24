import { useState, useEffect, useCallback } from 'react'
import type { GenerationRecord } from '../shared/types'

/**
 * Gallery Page — 생성 히스토리 + FTS5 검색 + 계보 트리
 * 마일스톤 v0.3
 */
export default function GalleryPage() {
  const [generations, setGenerations] = useState<GenerationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedImage, setSelectedImage] = useState<GenerationRecord | null>(null)
  
  // 선택 모드 상태
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // 데이터 로드 함수
  const loadGenerations = useCallback(async (queryStr?: string) => {
    setLoading(true)
    try {
      let results: GenerationRecord[]
      if (queryStr && queryStr.trim()) {
        results = await window.electronAPI.searchGenerations(queryStr)
      } else {
        results = await window.electronAPI.listGenerations({ limit: 100 })
      }
      setGenerations(results)
    } catch (err) {
      console.error('Failed to load gallery:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 초기 로드
  useEffect(() => {
    loadGenerations()
  }, [loadGenerations])

  // 선택 해제 (모드 종료 시)
  useEffect(() => {
    if (!selectionMode) setSelectedIds(new Set())
  }, [selectionMode])

  // 검색어 변경 핸들러 (디바운싱 없이 우선 단순 구현)
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearchTerm(val)
    if (val.trim() === '') {
      loadGenerations()
    }
  }

  const handleSearchSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      loadGenerations(searchTerm)
    }
  }

  // 삭제 처리
  const handleDelete = async (id: number) => {
    if (!confirm('이 기록과 이미지 파일을 모두 삭제할까요?')) return
    try {
      await window.electronAPI.deleteGeneration(id)
      setGenerations(prev => prev.filter(g => g.id !== id))
      if (selectedImage?.id === id) setSelectedImage(null)
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  // 선택 삭제 처리
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`${ids.length}개의 항목과 이미지 파일을 모두 삭제하시겠습니까?`)) return
    
    try {
      await window.electronAPI.deleteGenerations(ids)
      setGenerations(prev => prev.filter(g => !selectedIds.has(g.id)))
      setSelectedIds(new Set())
      setSelectionMode(false)
    } catch (err) {
      alert('선택 삭제 중 오류가 발생했습니다.')
    }
  }

  // 개별 선택 토글
  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // 즐겨찾기 토글
  const handleToggleFavorite = async (id: number) => {
    try {
      const result = await window.electronAPI.toggleFavorite(id)
      setGenerations(prev => prev.map(g => g.id === id ? { ...g, favorite: result.favorite } : g))
      if (selectedImage?.id === id) {
        setSelectedImage(prev => prev ? { ...prev, favorite: result.favorite } : null)
      }
    } catch (err) {
      console.error('Favorite toggle failed:', err)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 bg-[#0f0f14]">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 tracking-tight">GALLERY</h1>
            <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest font-medium">History & Lineage</p>
          </div>
          
          {/* 선택 모드 컨트롤 */}
          <div className="flex items-center gap-2 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setSelectionMode(!selectionMode)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectionMode 
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' 
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {selectionMode ? 'Selection Active' : 'Select Mode'}
            </button>
            {selectionMode && selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/30"
              >
                Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* FTS5 검색 UI (FE-05) */}
        <div className="relative w-80 group">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-brand-400 transition-colors"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearch}
            onKeyDown={handleSearchSubmit}
            placeholder="프롬프트 키워드 검색 (Enter)"
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl
                       text-sm text-zinc-200 placeholder-zinc-600
                       focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500/50 
                       transition-all duration-200"
          />
        </div>
      </header>

      {/* 갤러리 그리드 (FE-04) */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-zinc-900 animate-pulse border border-zinc-800" />
            ))}
          </div>
        ) : generations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium">생성된 이미지가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-12">
            {generations.map((gen) => (
              <div 
                key={gen.id} 
                onClick={() => selectionMode ? toggleSelect(gen.id) : setSelectedImage(gen)}
                className={`group relative aspect-square rounded-2xl bg-zinc-900 overflow-hidden border transition-all duration-300 cursor-pointer shadow-lg ${
                  selectedIds.has(gen.id) 
                  ? 'border-brand-500 ring-4 ring-brand-500/20' 
                  : 'border-zinc-800/50 hover:border-brand-500/30 shadow-lg hover:shadow-brand-500/5'
                }`}
              >
                {/* 선택 모드 체크박스 커버 */}
                {selectionMode && (
                  <div className={`absolute inset-0 z-20 transition-colors ${selectedIds.has(gen.id) ? 'bg-brand-500/10' : 'bg-transparent hover:bg-white/5'}`} />
                )}

                {/* 실제 이미지 표시 */}
                {gen.imagePath ? (
                  <img 
                    src={`zimg:${gen.imagePath.replace(/\\/g, '/')}`} 
                    alt={gen.prompt}
                    className={`w-full h-full object-cover transition-transform duration-500 ${selectionMode ? '' : 'group-hover:scale-110'}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/512x512?text=No+Preview';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-700 text-xs text-center p-4">
                    {gen.status === 'success' ? '이미지를 찾을 수 없음' : `생성 ${gen.status}`}
                  </div>
                )}
                
                {/* 선택 모드 인디케이터 */}
                {selectionMode && (
                  <div className="absolute top-3 left-3 z-30">
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                      selectedIds.has(gen.id) 
                      ? 'bg-brand-500 border-brand-500 shadow-lg shadow-brand-500/40' 
                      : 'bg-black/20 border-white/30'
                    }`}>
                      {selectedIds.has(gen.id) && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}

                {/* 즐겨찾기 표시 (선택 모드 아닐 때만) */}
                {!selectionMode && gen.favorite && (
                  <div className="absolute top-3 right-3 z-10">
                    <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* 오버레이 정보 (선택 모드 아닐 때만) */}
                {!selectionMode && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
                    <div className="flex justify-between items-end">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[10px] font-mono mb-1 text-brand-400">ID: {gen.id}</p>
                        <p className="text-white text-xs font-medium line-clamp-2 leading-tight">{gen.prompt}</p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(gen.id);
                        }}
                        className="ml-2 w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all duration-200 border border-red-500/30"
                        title="삭제"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 상세 보기 모달 (v0.3) */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl flex flex-col md:flex-row h-full max-h-[85vh]">
            {/* 이미지 영역 */}
            <div className="flex-1 bg-zinc-900 relative group overflow-hidden flex items-center justify-center">
              <img 
                src={`zimg:${(selectedImage.imagePath ?? '').replace(/\\/g, '/')}`}
                alt="Selected"
                className="max-w-full max-h-full object-contain"
              />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 정보 영역 */}
            <div className="w-full md:w-80 lg:w-96 p-6 border-l border-zinc-800 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="mb-6">
                <h3 className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-2">Prompt</h3>
                <p className="text-zinc-100 text-sm leading-relaxed bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">{selectedImage.prompt}</p>
              </div>

              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Steps</p>
                    <p className="text-zinc-200 font-semibold">{selectedImage.steps}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">CFG Scale</p>
                    <p className="text-zinc-200 font-semibold">{selectedImage.cfgScale}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Seed</p>
                    <p className="text-zinc-200 font-mono text-xs truncate">{selectedImage.seed}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Resolution</p>
                    <p className="text-zinc-200 font-semibold">{selectedImage.width}x{selectedImage.height}</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Model</p>
                  <p className="text-zinc-200 text-sm truncate">{selectedImage.modelName}</p>
                </div>

                {selectedImage.gpuInfo && (
                  <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Generated with</p>
                    <p className="text-brand-400 text-[11px] font-medium leading-snug">{selectedImage.gpuInfo}</p>
                    <p className="text-zinc-600 text-[10px] mt-1">{selectedImage.computeBackend} / {selectedImage.durationMs ? (selectedImage.durationMs/1000).toFixed(1) + 's' : ''}</p>
                  </div>
                )}
              </div>

              {/* 액션 버튼 */}
              <div className="mt-8 pt-6 border-t border-zinc-800 flex gap-3">
                <button 
                  onClick={() => handleToggleFavorite(selectedImage.id)}
                  className={`flex-1 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 ${
                    selectedImage.favorite 
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20' 
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill={selectedImage.favorite ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {selectedImage.favorite ? 'Saved' : 'Save'}
                </button>
                <button 
                  onClick={() => handleDelete(selectedImage.id)}
                  className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/30 flex items-center justify-center transition-all duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
