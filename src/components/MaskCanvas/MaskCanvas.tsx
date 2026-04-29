import { useRef, useEffect, useImperativeHandle, forwardRef, useState, useCallback } from 'react'

/**
 * MaskCanvas — Inpaint 마스크 에디터 (FE-07)
 *
 * - 소스 이미지를 배경으로 렌더링
 * - 브러시(흰색): 생성할 영역 칠하기
 * - 지우개(검은색): 보존 영역 복원
 * - 반전 버튼, 초기화 버튼, 브러시 크기 슬라이더
 * - getMaskDataUrl(): 흑백 마스크 PNG를 base64로 반환
 */

export interface MaskCanvasHandle {
  getMaskDataUrl: () => string
  clearMask: () => void
}

interface MaskCanvasProps {
  sourceImagePath: string   // zimg:// 경로
  width?: number
  height?: number
}

type Tool = 'brush' | 'eraser'

const MaskCanvas = forwardRef<MaskCanvasHandle, MaskCanvasProps>(
  ({ sourceImagePath, width = 512, height = 512 }, ref) => {
    // 마스크 레이어 (흑백 PNG 생성용)
    const maskCanvasRef = useRef<HTMLCanvasElement>(null)
    // 화면에 보이는 합성 캔버스 (이미지 + 반투명 마스크)
    const displayCanvasRef = useRef<HTMLCanvasElement>(null)
    const [tool, setTool] = useState<Tool>('brush')
    const [brushSize, setBrushSize] = useState(40)
    const [isDrawing, setIsDrawing] = useState(false)
    const imgRef = useRef<HTMLImageElement | null>(null)

    // 마스크 초기화 (전체 검은색 = 전부 보존)
    const clearMask = useCallback(() => {
      const mc = maskCanvasRef.current
      if (!mc) return
      const ctx = mc.getContext('2d')!
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, mc.width, mc.height)
      redrawDisplay()
    }, [])

    // 소스 이미지 로드
    useEffect(() => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = sourceImagePath
      img.onload = () => {
        imgRef.current = img
        // 마스크 캔버스 초기화
        const mc = maskCanvasRef.current
        if (mc) {
          mc.width = img.naturalWidth || width
          mc.height = img.naturalHeight || height
          const ctx = mc.getContext('2d')!
          ctx.fillStyle = 'black'
          ctx.fillRect(0, 0, mc.width, mc.height)
        }
        redrawDisplay()
      }
    }, [sourceImagePath])

    // 디스플레이 캔버스 다시 그리기 (이미지 + 반투명 마스크)
    const redrawDisplay = useCallback(() => {
      const dc = displayCanvasRef.current
      const mc = maskCanvasRef.current
      if (!dc || !mc) return
      const ctx = dc.getContext('2d')!
      ctx.clearRect(0, 0, dc.width, dc.height)

      // 소스 이미지 그리기
      if (imgRef.current) {
        ctx.drawImage(imgRef.current, 0, 0, dc.width, dc.height)
      }

      // 마스크 오버레이 (흰 부분 = 빨간 반투명으로 표시)
      const maskData = mc.getContext('2d')!.getImageData(0, 0, mc.width, mc.height)
      const overlayCanvas = document.createElement('canvas')
      overlayCanvas.width = mc.width
      overlayCanvas.height = mc.height
      const ovCtx = overlayCanvas.getContext('2d')!
      const ovData = ovCtx.createImageData(mc.width, mc.height)
      for (let i = 0; i < maskData.data.length; i += 4) {
        const brightness = maskData.data[i] // R 채널만 보면 됨 (흑백이므로)
        if (brightness > 128) {
          // 흰 부분 → 빨간 반투명
          ovData.data[i]     = 255  // R
          ovData.data[i + 1] = 60   // G
          ovData.data[i + 2] = 60   // B
          ovData.data[i + 3] = 140  // A (반투명)
        }
      }
      ovCtx.putImageData(ovData, 0, 0)
      ctx.drawImage(overlayCanvas, 0, 0, dc.width, dc.height)
    }, [])

    // 마스크 캔버스에 그리기
    const drawOnMask = useCallback(
      (canvasX: number, canvasY: number) => {
        const dc = displayCanvasRef.current
        const mc = maskCanvasRef.current
        if (!dc || !mc) return

        // getBoundingClientRect()로 실제 표시 크기(CSS 픽셀) 기준 스케일 계산
        // dc.width는 캔버스 내부 해상도(512 등)이므로 사용하면 안 됨
        const displayRect = dc.getBoundingClientRect()
        const scaleX = mc.width / displayRect.width
        const scaleY = mc.height / displayRect.height
        const mx = canvasX * scaleX
        const my = canvasY * scaleY
        const mBrushSize = brushSize * ((scaleX + scaleY) / 2)

        const ctx = mc.getContext('2d')!
        ctx.beginPath()
        ctx.arc(mx, my, mBrushSize / 2, 0, Math.PI * 2)
        ctx.fillStyle = tool === 'brush' ? 'white' : 'black'
        ctx.fill()
        redrawDisplay()
      },
      [tool, brushSize, redrawDisplay],
    )

    // 마우스 이벤트 헬퍼
    const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = displayCanvasRef.current!.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDrawing(true)
      const { x, y } = getCanvasPos(e)
      drawOnMask(x, y)
    }

    const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return
      const { x, y } = getCanvasPos(e)
      drawOnMask(x, y)
    }

    const onMouseUp = () => setIsDrawing(false)
    const onMouseLeave = () => setIsDrawing(false)

    // 반전 버튼
    const invertMask = () => {
      const mc = maskCanvasRef.current
      if (!mc) return
      const ctx = mc.getContext('2d')!
      const imgData = ctx.getImageData(0, 0, mc.width, mc.height)
      for (let i = 0; i < imgData.data.length; i += 4) {
        imgData.data[i]     = 255 - imgData.data[i]
        imgData.data[i + 1] = 255 - imgData.data[i + 1]
        imgData.data[i + 2] = 255 - imgData.data[i + 2]
        // alpha는 유지
      }
      ctx.putImageData(imgData, 0, 0)
      redrawDisplay()
    }

    // 외부에서 호출 가능한 메서드 노출
    useImperativeHandle(ref, () => ({
      getMaskDataUrl: () => {
        const mc = maskCanvasRef.current
        if (!mc) return ''
        return mc.toDataURL('image/png')
      },
      clearMask,
    }))

    return (
      <div className="space-y-2">
        {/* 툴바 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 브러시 / 지우개 */}
          <div className="flex gap-1 p-1 bg-zinc-800 rounded-lg">
            {(['brush', 'eraser'] as Tool[]).map((t) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                  tool === t
                    ? 'bg-brand-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={t === 'brush' ? '브러시 (흰색: 생성 영역)' : '지우개 (검은색: 보존)'}
              >
                {t === 'brush' ? '🖌 Brush' : '🩹 Eraser'}
              </button>
            ))}
          </div>

          {/* 반전 */}
          <button
            onClick={invertMask}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700"
            title="마스크 반전 (흑↔백)"
          >
            ↔ Invert
          </button>

          {/* 초기화 */}
          <button
            onClick={clearMask}
            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-zinc-800 text-zinc-400 hover:text-red-400 transition-colors border border-zinc-700"
            title="마스크 초기화"
          >
            ✕ Clear
          </button>
        </div>

        {/* 브러시 크기 슬라이더 */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 w-16 flex-shrink-0">Size: {brushSize}px</span>
          <input
            type="range"
            min={5}
            max={120}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="flex-1 accent-brand-500 cursor-pointer"
          />
        </div>

        {/* 캔버스 영역 */}
        <div className="relative rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900"
             style={{ cursor: tool === 'brush' ? 'crosshair' : 'cell' }}>
          {/* 히든 마스크 캔버스 */}
          <canvas ref={maskCanvasRef} className="hidden" />

          {/* 디스플레이 캔버스 */}
          <canvas
            ref={displayCanvasRef}
            width={width}
            height={height}
            className="w-full h-auto block"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
          />

          {/* 안내 라벨 */}
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-[10px] text-zinc-300 backdrop-blur-sm pointer-events-none">
            🔴 빨간 영역 = 생성 / 나머지 = 보존
          </div>
        </div>
      </div>
    )
  }
)

MaskCanvas.displayName = 'MaskCanvas'
export default MaskCanvas
