# ZImageStudio — Multi-Agent Development Spec

> **Project**: ZImageStudio  
> **Agent Spec Version**: 1.0  
> **Based on**: PRD v0.2  
> **Purpose**: 멀티에이전트 협업 개발 가이드라인 및 역할 분담 정의

---

## 에이전트 아키텍처 개요

```
┌─────────────────────────────────────────────────────┐
│                  ORCHESTRATOR                        │
│          (태스크 분배 · 진행 상황 추적)               │
└────────────┬────────────┬────────────┬──────────────┘
             │            │            │
     ┌───────▼──┐  ┌──────▼───┐  ┌───▼────────┐
     │ BACKEND  │  │FRONTEND  │  │  QA/TEST   │
     │  AGENT   │  │  AGENT   │  │   AGENT    │
     └───────┬──┘  └──────┬───┘  └───┬────────┘
             │            │          │
     ┌───────▼──┐  ┌──────▼───┐  ┌──▼─────────┐
     │  DATA    │  │   UI/UX  │  │  SECURITY  │
     │  AGENT   │  │  AGENT   │  │   AGENT    │
     └──────────┘  └──────────┘  └────────────┘
```

---

## 에이전트 역할 정의

### 🎯 ORCHESTRATOR (오케스트레이터)

**역할**: 전체 개발 흐름 조율, 태스크 분배, 마일스톤 추적

**담당 파일**:
- `agents.md` (이 파일) — 에이전트 상태 업데이트
- `CLAUDE.md` — 프로젝트 컨텍스트 유지
- `docs/` — PRD 및 설계 문서

**책임**:
- PRD의 마일스톤(v0.1~v1.0)을 세부 태스크로 분해
- 에이전트 간 의존성 파악 및 순서 결정
- 각 에이전트의 완료 기준(Exit Criteria) 검증
- 충돌 발생 시 중재

**커뮤니케이션 프로토콜**:
```
[ORCHESTRATOR → AGENT]: 태스크 할당 시 다음 형식으로
  - TASK_ID: <milestone>-<feature>-<sequence>
  - PRIORITY: HIGH | MEDIUM | LOW
  - DEPENDS_ON: [TASK_ID, ...]
  - EXIT_CRITERIA: 명시적 완료 조건
```

---

### ⚙️ BACKEND AGENT (백엔드 에이전트)

**역할**: Electron 메인 프로세스, 서비스 레이어, 추론 파이프라인

**담당 파일**:
```
electron/
  ├── main.ts                    # Electron 진입점
  ├── ipc/                       # IPC 핸들러 전체
  └── services/
      ├── inference.ts           # sd.cpp child_process 관리
      ├── processHandler.ts      # 좀비 방지 3단계 종료 (§4.1)
      ├── gpuProbe.ts            # nvidia-smi GPU 프리체크 (§4.2)
      ├── downloader.ts          # 이어받기+SHA-256 다운로더 (§4.3)
      ├── ollama.ts              # Prompt Enhancer 연동 (§3.8)
      ├── models.ts              # 모델 파일 스캔·관리
      └── db.ts                  # SQLite better-sqlite3 래퍼
```

**핵심 태스크 (마일스톤 순)**:

| 태스크 ID | 내용 | 마일스톤 | 우선순위 |
|-----------|------|----------|----------|
| BE-01 | sd.cpp (Modern DiT) spawn + GGUF split 모델 지원 | v0.2 | [x] |
| BE-02 | processHandler.ts — 3단계 종료 전략 | v0.2 | [x] |
| BE-03 | gpuProbe.ts — nvidia-smi 파싱 + VRAM 예측 | v0.2 | [x] |
| BE-04 | 파싱 실패 시 indeterminate 모드 fallback | v0.2 | [x] |
| BE-05 | db.ts — SQLite 스키마 v0.2 마이그레이션 | v0.3 | [x] |
| BE-06 | PNG tEXt 메타데이터 임베드/파싱 | v0.3 | MEDIUM |
| BE-07 | downloader.ts — Range 헤더 이어받기 + SHA-256 | v0.5 | HIGH |
| BE-08 | models.ts — LoRA 폴더 스캔 | v0.5 | MEDIUM |
| BE-09 | ollama.ts — 가용성 폴링 + 프롬프트 강화 | v0.6 | MEDIUM |
| BE-10 | 에러 리포팅 (GPU정보+로그 조합) | v1.0 | LOW |

**코딩 규칙**:
- 모든 서비스는 `class` 기반으로 분리, 싱글톤 패턴
- `child_process.spawn`은 반드시 `processHandler`를 통해서만 호출
- IPC 핸들러는 `ipc/` 폴더에 기능별로 분리 (`inference.ipc.ts`, `gallery.ipc.ts` 등)
- 모든 비동기 작업은 `async/await` + `try/catch` 필수
- 로그는 `electron-log` 사용, 레벨: `error | warn | info | debug`

---

### 🎨 FRONTEND AGENT (프론트엔드 에이전트)

**역할**: React UI 컴포넌트, 상태 관리, 라우팅

**담당 파일**:
```
src/
  ├── components/
  │   ├── PromptInput/           # 프롬프트 입력 + Enhance 버튼
  │   ├── GenerationControls/    # Steps, CFG, Sampler, Seed 슬라이더
  │   ├── ProgressBar/           # 생성 진행률 (determinate/indeterminate)
  │   ├── ImageCanvas/           # img2img 원본 + inpaint 마스크 에디터
  │   ├── LoraCard/              # LoRA 카드 + 가중치 슬라이더
  │   ├── GalleryGrid/           # 가상 스크롤 썸네일 그리드
  │   ├── LineageTree/           # 계보 트리 뷰 (§3.4)
  │   ├── ModelDownloader/       # 다운로드 마법사 UI
  │   └── LogPanel/              # sd.cpp stdout 실시간 패널
  ├── pages/
  │   ├── Generate.tsx           # txt2img / img2img / inpaint 탭
  │   ├── Gallery.tsx            # 갤러리 + FTS5 검색
  │   └── Settings.tsx           # 설정 페이지
  └── store/
      ├── generationStore.ts     # Zustand — 생성 파라미터 상태
      ├── galleryStore.ts        # Zustand — 갤러리 상태
      └── appStore.ts            # Zustand — 앱 전역 상태
```

**핵심 태스크**:

| 태스크 ID | 내용 | 마일스톤 | 의존 |
|-----------|------|----------|------|
| FE-01 | 기본 Generate 페이지 레이아웃 | v0.2 | [x] |
| FE-02 | 진행률 바 (determinate/indeterminate) | v0.2 | [x] |
| FE-03 | 생성 결과 이미지 표시 | v0.2 | [x] |
| FE-04 | Gallery 페이지 + 가상 스크롤 그리드 | v0.3 | [/] |
| FE-05 | FTS5 검색 UI | v0.3 | [ ] |
| FE-06 | LineageTree 컴포넌트 | v0.3 | [ ] |
| FE-07 | ImageCanvas + 마스크 에디터 (canvas API) | v0.4 | [ ] |
| FE-08 | LoraCard UI + 다중 스택 | v0.5 | [ ] |
| FE-09 | ModelDownloader 마법사 | v0.5 | [ ] |
| FE-10 | Enhance 버튼 + 시스템 프롬프트 커스터마이징 | v0.6 | [ ] |
| FE-11 | Settings 페이지 (VRAM 모드, 테마, i18n) | v1.0 | — |
| FE-12 | ControlNet UI (비활성 상태) | v1.0 | — |

**UI/UX 원칙** (Tailwind CSS 기반):
- **다크 모드** 기본, 시스템 테마 자동 따라가기
- 컴포넌트 라이브러리: `shadcn/ui` (Radix 기반)
- 색상 팔레트: zinc/slate 계열 다크 + 보라/인디고 포인트
- 애니메이션: Framer Motion (페이지 전환, 이미지 로드)
- 생성 중에도 갤러리 탐색 가능 → 탭 분리 유지

---

### 🗄️ DATA AGENT (데이터 에이전트)

**역할**: SQLite 스키마, 마이그레이션, 데이터 쿼리 최적화

**담당 파일**:
```
electron/services/db.ts
resources/
  ├── schema/
  │   ├── 001_initial.sql
  │   ├── 002_v02_fields.sql      # parent_id, status, gpu_info 등
  │   └── migrations.ts
  └── model-manifest.json         # 공식 모델 SHA-256 하드코딩
```

**핵심 태스크**:

| 태스크 ID | 내용 | 마일스톤 | 우선순위 |
|-----------|------|----------|----------|
| DA-01 | SQLite 스키마 v0.2 구현 + 마이그레이션 시스템 | v0.3 | HIGH |
| DA-02 | FTS5 가상 테이블 트리거 + 인덱스 관리 | v0.3 | HIGH |
| DA-03 | `parent_id` 계보 쿼리 헬퍼 (조상/자손 재귀) | v0.3 | MEDIUM |
| DA-04 | model-manifest.json 초기 데이터 (SHA-256) | v0.5 | HIGH |
| DA-05 | 썸네일 자동 정리 정책 + 용량 모니터링 | v1.x | LOW |

**스키마 관리 규칙**:
- 마이그레이션은 번호 순서 파일로 관리 (`001_`, `002_` ...)
- 다운그레이드는 지원하지 않음 (단방향 마이그레이션)
- 컬럼 추가 시 반드시 `DEFAULT` 값 명시 (기존 레코드 호환)
- `better-sqlite3`의 동기 API만 사용 (비동기 불필요)

---

### 🎭 UI/UX AGENT (UI/UX 에이전트)

**역할**: 디자인 시스템, 와이어프레임, 사용자 흐름 설계

**담당 파일**:
```
src/
  ├── styles/
  │   ├── globals.css
  │   └── themes/
  │       ├── dark.ts
  │       └── light.ts
  └── i18n/
      ├── ko.json
      └── en.json
docs/
  └── design/
      ├── wireframes/
      └── design-system.md
```

**핵심 태스크**:

| 태스크 ID | 내용 | 마일스톤 | 우선순위 |
|-----------|------|----------|----------|
| UX-01 | 디자인 시스템 정의 (색상·타이포·간격) | v0.2 | HIGH |
| UX-02 | Generate 페이지 와이어프레임 | v0.2 | HIGH |
| UX-03 | Gallery 페이지 와이어프레임 | v0.3 | MEDIUM |
| UX-04 | LineageTree 상호작용 설계 | v0.3 | MEDIUM |
| UX-05 | Inpaint 마스크 에디터 UX (브러시·지우개·인버트) | v0.4 | MEDIUM |
| UX-06 | i18n 문자열 정의 (ko/en) | v1.0 | MEDIUM |
| UX-07 | ControlNet UI 프리뷰 (비활성 상태 안내) | v1.0 | LOW |

---

### 🧪 QA/TEST AGENT (QA 에이전트)

**역할**: 테스트 작성, 품질 검증, 마일스톤 Exit Criteria 확인

**담당 파일**:
```
tests/
  ├── unit/
  │   ├── processHandler.test.ts   # 3단계 종료 시뮬레이션
  │   ├── gpuProbe.test.ts         # nvidia-smi 출력 파싱
  │   ├── downloader.test.ts       # 이어받기·SHA-256 검증
  │   ├── outputParser.test.ts     # sd.cpp 출력 파싱 + fallback
  │   └── db.test.ts               # 스키마·마이그레이션·FTS5
  ├── e2e/
  │   ├── generation.spec.ts       # 전체 생성 플로우
  │   ├── gallery.spec.ts          # 갤러리 탐색·검색
  │   └── zombie.spec.ts           # 강제 종료 후 VRAM 해제 확인
  └── fixtures/
      ├── nvidia-smi-samples.txt
      └── sd-cpp-output-samples.txt
```

**핵심 태스크**:

| 태스크 ID | 내용 | 마일스톤 |
|-----------|------|----------|
| QA-01 | processHandler 단위 테스트 (SIGTERM→SIGKILL 시뮬) | v0.2 |
| QA-02 | gpuProbe 단위 테스트 (다양한 nvidia-smi 출력 케이스) | v0.2 |
| QA-03 | outputParser 단위 테스트 + fallback 확인 | v0.2 |
| QA-04 | v0.2 Exit Criteria: 좀비 프로세스 없음 검증 | v0.2 |
| QA-05 | DB 스키마 마이그레이션 테스트 | v0.3 |
| QA-06 | 계보 쿼리 정확성 (재귀 CTE 검증) | v0.3 |
| QA-07 | downloader SHA-256 불일치 처리 테스트 | v0.5 |
| QA-08 | Ollama 미실행 시 기능 숨김 확인 | v0.6 |
| QA-09 | Windows NSIS 빌드 스모크 테스트 | v1.0 |

**테스트 프레임워크**:
- 단위 테스트: Vitest
- E2E: Playwright (Electron 지원)
- 커버리지: `@vitest/coverage-v8`

---

### 🔐 SECURITY AGENT (보안 에이전트)

**역할**: Electron 보안 설정, 프로세스 격리, 코드 서명

**담당 파일**:
```
electron/
  ├── main.ts                  # BrowserWindow 보안 옵션
  ├── preload.ts               # contextBridge 정의
  └── ipc/                     # IPC sanitization
```

**핵심 체크리스트**:

| 항목 | 기준 |
|------|------|
| `contextIsolation` | `true` 필수 |
| `nodeIntegration` | `false` 필수 |
| `webSecurity` | `true` (로컬 파일은 `file://` 또는 `protocol.registerFileProtocol`) |
| IPC 입력 검증 | 모든 IPC 핸들러에서 입력값 타입 체크 |
| 외부 URL | `shell.openExternal()` 사용 전 화이트리스트 확인 |
| 자식 프로세스 | `spawn`에 사용자 입력 직접 전달 금지 (SQL injection 유사 위협) |
| CSP 헤더 | `session.defaultSession.webRequest` 로 적용 |

---

## 에이전트 간 인터페이스 계약

### IPC 채널 명세 (Backend ↔ Frontend)

```typescript
// inference 관련
'inference:generate'      → request GenerationParams, response void
'inference:cancel'        → request void, response void
'inference:progress'      → push { step: number, total: number, eta?: number }
'inference:complete'      → push { imagePath: string, generationId: number }
'inference:error'         → push { message: string, code: string }

// GPU 관련
'gpu:probe'               → request void, response GpuInfo | null
'gpu:vram-warning'        → push { available: number, required: number }

// 갤러리 관련
'gallery:list'            → request GalleryQuery, response GenerationRecord[]
'gallery:get'             → request { id: number }, response GenerationRecord
'gallery:search'          → request { query: string }, response GenerationRecord[]
'gallery:delete'          → request { id: number }, response void
'gallery:lineage'         → request { id: number }, response LineageTree

// 모델 관련
'model:list'              → request void, response ModelInfo[]
'model:download'          → request { modelId: string }, response void
'model:download-progress' → push { received: number, total: number, percent: number }
'model:verify'            → request { modelId: string }, response { valid: boolean }

// Ollama 관련
'ollama:check'            → request void, response { available: boolean, models: string[] }
'ollama:enhance'          → request { prompt: string, model: string }, response { enhanced: string }
```

### 데이터 타입 공유 인터페이스

```typescript
// src/shared/types.ts (renderer + main 공통)
export interface GenerationParams {
  prompt: string;
  negativePrompt?: string;
  seed: number;
  steps: number;
  cfgScale: number;
  width: number;
  height: number;
  sampler: string;
  modelName: string;
  loras?: { name: string; weight: number }[];
  mode: 'txt2img' | 'img2img' | 'inpaint';
  sourceImage?: string;
  maskImage?: string;
  denoise?: number;
  parentId?: number;
  vramMode?: 'auto' | 'normal' | 'low' | 'tiny';
}

export interface GenerationRecord extends GenerationParams {
  id: number;
  createdAt: string;
  imagePath?: string;
  thumbnailPath?: string;
  favorite: boolean;
  durationMs?: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  errorMessage?: string;
  gpuInfo?: string;
  driverVersion?: string;
  computeBackend?: 'CUDA' | 'Vulkan' | 'Metal' | 'CPU';
}

export interface GpuInfo {
  name: string;
  driverVersion: string;
  memoryFree: number;  // MB
  memoryTotal: number; // MB
}

export interface ModelInfo {
  name: string;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  downloadedAt?: string;
  verified: boolean;
}
```

---

## 마일스톤별 에이전트 담당표

| 마일스톤 | 주담당 에이전트 | 보조 에이전트 | 핵심 Exit Criteria |
|----------|---------------|--------------|-------------------|
| **v0.1** (PoC) | BACKEND | QA | sd.cpp CLI로 1024×1024 생성 < 10초 |
| **v0.2** (Shell) | BACKEND, FRONTEND | QA, SECURITY | 강제 종료 후 VRAM 정상 해제 확인 |
| **v0.3** (Gallery) | FRONTEND, DATA | QA | FTS5 검색 동작, 계보 트리 렌더링 |
| **v0.4** (Inpaint) | FRONTEND, BACKEND | QA | inpaint 마스크 → sd.cpp 전달 성공 |
| **v0.5** (LoRA+DL) | BACKEND, DATA | QA | 이어받기+SHA-256 검증 통과 |
| **v0.6** (Ollama) | BACKEND, FRONTEND | QA | Ollama 미실행 시 기능 자동 숨김 |
| **v1.0** (RC) | ALL | QA | Windows NSIS 빌드 성공, i18n 완료 |

---

## 개발 워크플로우

### 브랜치 전략
```
main          — 릴리스 브랜치 (tag: v0.x)
develop       — 통합 브랜치
feature/      — 기능 브랜치 (예: feature/BE-02-process-handler)
fix/          — 버그 수정
```

### 커밋 컨벤션
```
feat(BE): processHandler 3단계 종료 전략 구현 [BE-02]
feat(FE): ProgressBar indeterminate 모드 추가 [FE-02]
fix(DA): FTS5 트리거 누락 수정
test(QA): gpuProbe 파싱 엣지 케이스 테스트 추가 [QA-02]
```

### 태스크 상태 관리
각 에이전트는 태스크 완료 시 이 파일의 해당 태스크 행을 업데이트:
- `[ ]` 미시작
- `[/]` 진행 중  
- `[x]` 완료
- `[!]` 블로커 발생

---

## 현재 상태 (v0.1 시작 전)

```
프로젝트 초기화: ✅ 완료 (package.json, tsconfig, vite.config 생성 예정)
PRD 확정: ✅ v0.2 완료
agents.md: ✅ 생성 완료
개발 환경: 🔧 구성 중
v0.1 PoC: ⏳ 대기 중
```

---

*본 agents.md는 PRD v0.2를 기반으로 작성되었으며, 마일스톤 진행에 따라 갱신된다.*
