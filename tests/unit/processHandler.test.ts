import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ProcessHandler 단위 테스트 [QA-01]
 *
 * 좀비 프로세스 방지 3단계 종료 전략 검증
 * - Stage 1: SIGTERM graceful exit
 * - Stage 2: Force kill (taskkill / SIGKILL)
 * - Stage 3: PID 존재 여부 재확인
 */
describe('ProcessHandler', () => {
  it.todo('Stage 1: SIGTERM 후 graceful exit 확인')
  it.todo('Stage 2: 타임아웃 시 force kill 실행 확인')
  it.todo('Stage 3: force kill 후 PID가 사라졌는지 검증')
  it.todo('이미 죽은 프로세스에 kill 호출 시 에러 없이 처리')
  it.todo('spawn 전 기존 프로세스가 있으면 먼저 종료')
})
