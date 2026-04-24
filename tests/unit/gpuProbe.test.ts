import { describe, it, expect } from 'vitest'

/**
 * GpuProbe 단위 테스트 [QA-02]
 *
 * nvidia-smi 출력 파싱 다양한 케이스 검증
 * fixtures/nvidia-smi-samples.txt 참조
 */
describe('GpuProbe', () => {
  it.todo('정상 nvidia-smi 출력 파싱 — RTX 3060')
  it.todo('다중 GPU 출력 — 첫 번째 GPU만 사용')
  it.todo('nvidia-smi 없는 환경 — skipped: true 반환')
  it.todo('nvidia-smi 타임아웃 3초 — 에러 처리')
  it.todo('VRAM 예측: 1024x1024 Q4 — 충분한 경우')
  it.todo('VRAM 예측: 1024x1024 Q4 — 부족한 경우 → recommendation: low')
})
