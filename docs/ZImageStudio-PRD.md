# ZImageStudio — Local Image Generation Desktop App

> **프로젝트 코드네임**: ZImageStudio
> **개발자**: 스마트솔루션즈 (kobic)
> **작성일**: 2026-04-24
> **버전**: PRD v0.2 (Gemini 리뷰 반영)
> **상태**: 기획 단계
>
> **변경 이력**
> - v0.1 (2026-04-24): 초안
> - v0.2 (2026-04-24): Gemini AI 리뷰 반영 — 프로세스 핸들링·GPU 프리체크·이어받기 다운로드·Ollama 연동·계보 추적·DB 스키마 보강

---

## 1. 프로젝트 개요

### 1.1 한 줄 요약
**API·ComfyUI 의존 없이**, 순수 C++ 추론 엔진(stable-diffusion.cpp) + Electron UI로 구성된 **완전 로컬** Z-Image Turbo 이미지 생성 데스크탑 앱.

### 1.2 배경
Z-Image Turbo(Tongyi Lab, Apache-2.0)는 6B 파라미터 DiT 기반 경량 모델로, 8 NFE만으로 고품질 이미지를 생성한다. 공식 지원 경로는 크게 세 갈래다.

| 경로 | 장점 | 단점 |
|---|---|---|
| HuggingFace `diffusers` (Python) | 공식·기능 완전 | 설치 무겁고 배포 복잡 |
| ComfyUI | 워크플로우 유연 | UI/노드 진입장벽, 배포 어려움 |
| **stable-diffusion.cpp** | **C/C++ 단일 바이너리, 경량, GGUF 네이티브, 4GB VRAM 가능** | ControlNet은 SD1.5 한정, LoRA는 일부 지원 |

오라버님이 이미 여러 프로젝트(LocalMind, VividMate, Another Life, UptimeGuard.live)에서 "로컬 우선·경량·배포 용이" 원칙을 일관되게 유지해온 것과 동일한 설계 철학을 따른다.

### 1.3 목표
- **완전 로컬 실행**: 인터넷 연결 없이 전체 파이프라인 동작 (모델 최초 다운로드 제외)
- **경량 설치**: 설치 용량 <200MB (모델 제외), VRAM 4~8GB 구간 타겟
- **단일 실행 파일 배포**: Windows/Linux `.exe`/`.AppImage` 형태
- **RTX 3060 12GB에서 1024×1024 이미지 sub-5초 생성**
- **오프라인 갤러리·히스토리·시드 재현**이 기본 기능
- **프로덕션 견고성**: 좀비 프로세스·손상 모델·파싱 실패에 무너지지 않을 것

### 1.4 Non-Goals
- 모델 학습/LoRA 트레이닝 (추론 전용)
- 멀티 사용자·서버 배포 (싱글 유저 데스크탑 앱)
- 비디오 생성
- 클라우드 동기화

### 1.5 설계 철학 (Gemini 리뷰 통합)
Gemini AI 리뷰(2026-04-24)에서 지적된 세 가지 구조적 취약점 — **하위 프로세스 제어, 출력 파싱 의존성, 모델 무결성** — 을 v0.2 설계의 최우선 견고성 요건으로 승격한다. 각 항목은 §8의 마일스톤 Exit criteria에 포함된다.

---

## 2. 기술 스택

### 2.1 추론 백엔드: stable-diffusion.cpp
- **저장소**: `leejet/stable-diffusion.cpp` (ggml 기반, MIT)
- **지원 모델**: Z-Image (공식 지원 목록에 포함됨)
- **백엔드**: CUDA, Vulkan, Metal, OpenCL, CPU — 오라버님 환경에서는 **CUDA** 기본
- **가중치 포맷**: `.safetensors`, `.gguf`, `.ckpt`
- **LoRA**: stable-diffusion-webui 호환 포맷 지원
- **ControlNet**: **현재 SD 1.5만 공식 지원 → Z-Image ControlNet은 로드맵 이슈로 관리** (아래 §7 참조)

### 2.2 프로세스 브리지
- **방식 A (권장·채택)**: stable-diffusion.cpp를 **CLI 바이너리**로 호출 → Electron 메인 프로세스에서 `child_process.spawn`
- **방식 B (대안)**: `stable-diffusion-cpp-python` 또는 native Node.js 바인딩(N-API) 사용

방식 A가 배포 단순성 측면에서 압도적으로 유리. 바이너리 하나만 동봉하면 되며, 프로세스 격리로 충돌 방지.

### 2.3 프론트엔드: Electron
- **Electron** 최신 안정 버전 + **Vite** 빌드
- **UI 프레임워크**: React 18 + TypeScript
- **스타일링**: Tailwind CSS
- **상태 관리**: Zustand (가벼움)
- **로컬 DB**: SQLite (better-sqlite3) — 히스토리/갤러리/프리셋
- **이미지 저장**: 로컬 파일시스템 (사용자 지정 경로, 기본 `~/ZImageStudio/outputs`)

### 2.4 선택적 외부 연동 (로컬 한정)
- **Ollama (Prompt Enhancer, v0.6)**: 사용자가 Ollama를 실행 중이면 자동 감지하여 "프롬프트 강화" 버튼 노출. 짧은 키워드를 풍부한 프롬프트로 확장. 완전히 선택적·로컬 통신(`http://localhost:11434`) 한정. (§3.8 참조)

### 2.5 디렉토리 구조 (예상)
```
ZImageStudio/
├── electron/                     # 메인 프로세스
│   ├── main.ts
│   ├── ipc/                      # IPC 핸들러
│   └── services/
│       ├── inference.ts          # sd.cpp 프로세스 관리
│       ├── processHandler.ts     # 좀비 방지·강제 종료 (§4.1)
│       ├── gpuProbe.ts           # VRAM 프리체크 (§4.2)
│       ├── downloader.ts         # 이어받기·체크섬 (§4.3)
│       ├── ollama.ts             # Prompt Enhancer (선택)
│       ├── models.ts             # 모델 관리
│       └── db.ts                 # SQLite
├── src/                          # 렌더러 (React)
│   ├── components/
│   ├── pages/
│   │   ├── Generate.tsx
│   │   ├── Gallery.tsx
│   │   └── Settings.tsx
│   └── store/
├── resources/
│   └── bin/
│       ├── sd.exe                # stable-diffusion.cpp 바이너리 (Windows)
│       └── sd                    # Linux
├── models/                       # 사용자 데이터 경로
│   ├── checkpoints/
│   ├── loras/
│   └── controlnet/
└── package.json
```

---

## 3. 핵심 기능

### 3.1 txt2img (기본)
- 프롬프트 + 네거티브 프롬프트 입력
- 해상도: 512~1536 (64 단위), 프리셋 제공 (1024×1024, 1024×1536, 1536×1024)
- Seed: 랜덤/고정
- Steps: 기본 8 (Turbo 권장), 6~12 슬라이더
- CFG scale: 기본 0 (Turbo 권장, 고정 옵션)
- Sampler: sd.cpp 지원 목록에서 선택 (기본 euler)
- 배치: 1~4
- **생성 중 진행률 표시** (step 단위, 파싱 실패 시 graceful degradation — §4.4)
- **안전한 중단**: SIGTERM → 타임아웃 시 SIGKILL/taskkill로 에스컬레이션 (§4.1)

### 3.2 img2img / inpaint
- **img2img**: 원본 이미지 + 프롬프트 + denoise strength(0.0~1.0)
- **inpaint**: 마스크 편집기 내장 (브러시 크기, 지우개, 마스크 invert)
  - 캔버스 기반 간단한 마스크 그리기 UI
  - 마스크는 PNG로 임시 저장 후 sd.cpp에 전달

### 3.3 프롬프트 히스토리 / 갤러리
- **히스토리**: 모든 생성 요청 메타데이터를 SQLite에 저장 (스키마 §6)
- **갤러리 뷰**:
  - 썸네일 그리드 (가상 스크롤)
  - **FTS5 기반 프롬프트 검색** — 수만 장 규모 대응
  - 즐겨찾기·삭제·재생성(동일 파라미터로 다시 생성)
  - 이미지 클릭 → 상세 + EXIF/메타 표시 + "프롬프트 복원" 버튼
- **PNG에 메타 임베드** (PNG tEXt 청크) — 다른 도구에서도 파라미터 복원 가능

### 3.4 비파괴 편집 계보 (Lineage) 🆕
Gemini 제안 반영. 생성 이미지 간 **부모-자식 관계**를 DB에 기록하여 시드·파라미터의 진화 과정을 시각화.

- 모든 재생성·파라미터 변경·img2img 작업은 `parent_id` 필드로 원본을 참조
- 갤러리에서 이미지 상세 열람 시 **계보 트리 뷰** 제공 (조상·자손 이미지 썸네일)
- "이 이미지 가지치기" 기능: 특정 이미지를 기준으로 시드 variation·prompt variation 배치 생성
- 사용 시나리오: "seed 42에서 프롬프트를 조금씩 바꿔가며 3단계 개선했던 경로를 되짚어보기"

### 3.5 LoRA 확장
- `models/loras/` 폴더 자동 스캔
- 프롬프트에 `<lora:name:weight>` 구문으로 적용 (sd.cpp 호환)
- LoRA 카드 UI: 이름, 트리거 워드, 썸네일(있으면), 가중치 슬라이더
- 다중 LoRA 스택 지원

### 3.6 ControlNet 확장 (⚠️ 제한사항)
- **현황**: 2026-04 시점 stable-diffusion.cpp의 ControlNet은 **SD 1.5 모델에만 적용 가능**. Z-Image 전용 ControlNet(Z-Image-Turbo-Fun Controlnet Union 등)은 아직 sd.cpp에 포팅되지 않음.
- **MVP 결정**: v1.0에서 ControlNet UI·설정 레이어는 **만들되 비활성화 상태**로 출시.
- **v1.x 로드맵**:
  - (a) sd.cpp upstream이 Z-Image ControlNet을 지원하면 즉시 활성화
  - (b) 또는 선택적으로 **Python 보조 백엔드**(diffusers) 옵션을 열어 ControlNet 경로만 diffusers로 위임
- UI는 preprocessor 선택(Canny/Depth/Pose/Lineart) + 참조 이미지 업로드 + strength 슬라이더 구조로 미리 설계.

### 3.7 모델 관리
- **최초 실행 시 모델 다운로드 마법사** (§4.3의 견고한 다운로더 사용):
  - Z-Image-Turbo GGUF (Q4_K_M 권장, ~4GB)를 HuggingFace에서 다운로드
  - **Range 헤더 기반 이어받기 지원**
  - **SHA-256 체크섬 검증 필수**
  - 실패 시 재시도·파일 삭제·사용자 안내
- 여러 모델 공존 가능 (SD1.5, SDXL, Qwen Image 등 sd.cpp 지원 모델 추가 가능 — v1.x)
- 모델 전환 UI (드롭다운)

### 3.8 Prompt Enhancer (Ollama 연동, 선택적) 🆕
Gemini 제안 반영. 오라버님이 이미 활용 중인 Ollama를 완전히 선택적인 프롬프트 도우미로 통합.

- 앱 시작 시 `http://localhost:11434/api/tags`를 1회 폴링해 Ollama 가용성·모델 목록 확인
- 가용 시 프롬프트 입력창 우측에 **✨ Enhance** 버튼 노출
- 클릭 시 선택된 Ollama 모델(기본값: `llama3.1:8b` 또는 `qwen2.5:7b`)로 짧은 키워드를 이미지 생성용 고품질 프롬프트로 확장
- **완전히 오프라인·옵셔널**: Ollama 미실행 시 이 기능만 숨겨지고 앱의 나머지는 그대로 동작
- 시스템 프롬프트 커스터마이징 가능 (스타일·길이·언어 조절)

### 3.9 설정
- 출력 디렉토리 선택
- VRAM 모드: **Auto(권장)** / Normal / Low VRAM / Tiny VRAM
  - Auto 모드는 §4.2의 GPU 프리체크 결과에 따라 자동 선택
- 테마: Light / Dark / System
- 기본 파라미터 프리셋 저장
- 언어: 한국어 / English (i18n)
- Ollama Prompt Enhancer 활성화·엔드포인트·기본 모델 설정

---

## 4. 견고성 요건 (Robustness) 🆕

Gemini 리뷰에서 제기된 구조적 리스크를 해소하기 위한 전용 섹션. v0.2에서 단순한 "안 보이는 안정성"이 아니라 **명시적 요건**으로 승격한다.

### 4.1 강력한 프로세스 핸들러 (Zombie 방지)
**문제**: `child_process.spawn`으로 실행된 sd.cpp가 강제 종료 시 CUDA 컨텍스트를 해제하지 못해 VRAM을 점유한 채 좀비로 남는 사례가 보고됨.

**해결**: `services/processHandler.ts`에서 3단계 종료 전략
1. **1단계 (Graceful)**: `SIGTERM` 송신 → 최대 3초 대기
2. **2단계 (Force)**: 미종료 시 `SIGKILL` + OS별 보조 명령
   - Windows: `taskkill /F /T /PID <pid>` (자식 트리 포함)
   - Linux/macOS: `kill -9 -<pgid>` (프로세스 그룹 단위)
3. **3단계 (Verification)**: `ps`/`tasklist`로 PID 존재 여부 재확인, 남아있으면 경고 로그

앱 종료 시(`before-quit`)에도 동일 로직 적용. 프로세스 그룹으로 spawn(`detached: true`, `setpgid`)하여 자식 전체를 한 번에 처리.

### 4.2 GPU 사전 검사 (Pre-flight Check)
**문제**: VRAM 부족 시 sd.cpp가 생성 도중 OOM으로 죽으면 UX가 최악.

**해결**: `services/gpuProbe.ts`에서 생성 시작 전 3초 내 완료되는 프리체크
1. `nvidia-smi --query-gpu=name,driver_version,memory.free,memory.total --format=csv,noheader,nounits` 실행
2. 결과 파싱 → 가용 VRAM과 요청 해상도 기반 추정 사용량 비교
3. 부족 예측 시:
   - 사용자에게 모달 경고 ("예상 VRAM 부족. Low VRAM 모드로 진행하시겠습니까?")
   - 또는 VRAM 모드가 `Auto`면 `--vae-on-cpu` / `--clip-on-cpu` / 타일링 플래그를 자동 부착
4. nvidia-smi 없음(AMD·Intel 등) → Vulkan 백엔드로 fallback, 프리체크 스킵

### 4.3 견고한 모델 다운로더
**문제**: 4GB 모델 다운로드 중 네트워크 중단 시 파일 손상 → 앱 무한 실패 루프.

**해결**: `services/downloader.ts`
- **Range 헤더 기반 이어받기**: 부분 파일 존재 시 `Range: bytes=<이미받은크기>-` 로 재시작
- **SHA-256 체크섬 검증**: 다운로드 완료 후 필수 검증, 불일치 시 자동 삭제·재시도 제안
- **체크섬 관리**: `resources/model-manifest.json`에 공식 모델의 SHA-256 하드코딩 (앱 업데이트로 갱신)
- **동시 다운로드 금지**: 락 파일로 중복 실행 방지
- **취소·재개**: UI에서 다운로드 일시정지·재개 버튼, 앱 재시작 후에도 재개 가능
- **네트워크 끊김 자동 재시도**: exponential backoff, 최대 5회

### 4.4 출력 파싱 견고성 (Graceful Degradation)
**문제**: sd.cpp가 상류에서 stdout 포맷을 변경하면 진행률 UI가 깨짐.

**해결**:
- 진행률 파싱 정규식을 **복수**로 유지 (알려진 패턴 몇 가지)
- 모든 파싱 실패 시 **indeterminate(무한 스피너) 모드로 자동 전환** — 생성 자체는 계속
- 에러가 아닌 **경고 로그**로 기록, 업데이트 감지 시 사용자에게 앱 업데이트 권유
- 최종 이미지 파일 생성 여부는 **파일시스템 이벤트**(fs.watch)로 독립 확인 — 파서에 의존 안 함

### 4.5 에러 리포팅
- 모든 생성 실패는 DB에 기록 (`status`, `error_message` 필드)
- "버그 리포트 복사" 버튼 → GPU 정보 + sd.cpp 로그 + 파라미터 + 드라이버 버전 조합
- 자동 전송 없음 (프라이버시)

---

## 5. 비기능 요구사항

### 5.1 성능
- 1024×1024, 8 steps, BF16 기준 **RTX 3060 12GB에서 < 5초**
- Q4 GGUF 사용 시 VRAM < 6GB 목표
- UI 반응성: 생성 중에도 갤러리 탐색·설정 변경 가능 (메인 스레드 블로킹 금지)
- GPU 프리체크(§4.2) 3초 이내

### 5.2 배포
- Windows: `electron-builder`로 NSIS installer + portable ZIP
- Linux: AppImage + deb
- macOS: 초기에는 제외 (Metal 백엔드 지원은 있으나 우선순위 낮음)
- 자동 업데이트: 초기 버전에서는 제외, 수동 업데이트

### 5.3 로그/디버깅
- sd.cpp stdout/stderr를 별도 로그 패널에 실시간 표시 (개발자 모드)
- 로그 순환(rotation): 10MB × 5개 파일 유지
- 에러 발생 시 "버그 리포트 복사" 버튼 (시스템 정보 + 최근 로그)

### 5.4 보안·프라이버시
- **100% 오프라인 동작** (모델 다운로드 제외)
- 텔레메트리·추적 없음
- 생성 이미지·프롬프트는 로컬에만 저장
- Ollama 연동도 `localhost`로만 통신

---

## 6. 데이터 모델 (SQLite 스키마 v0.2)

Gemini 제안 반영 — `parent_id`(계보), `status`·`error_message`(에러 추적), `gpu_info`·`driver_version`·`compute_backend`(디버깅용 시스템 정보) 필드 추가.

```sql
CREATE TABLE generations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL,                   -- ISO 8601
  prompt          TEXT NOT NULL,
  negative_prompt TEXT,
  seed            INTEGER NOT NULL,
  steps           INTEGER NOT NULL,
  cfg_scale       REAL NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  sampler         TEXT NOT NULL,
  model_name      TEXT NOT NULL,
  loras_json      TEXT,                            -- [{name, weight}, ...]
  mode            TEXT NOT NULL,                   -- 'txt2img' | 'img2img' | 'inpaint'
  source_image    TEXT,                            -- img2img/inpaint용
  mask_image      TEXT,                            -- inpaint용
  denoise         REAL,
  image_path      TEXT,                            -- 성공 시에만
  thumbnail_path  TEXT,
  favorite        INTEGER DEFAULT 0,
  duration_ms     INTEGER,

  -- Gemini 리뷰 반영 (v0.2 추가)
  parent_id       INTEGER REFERENCES generations(id) ON DELETE SET NULL,  -- 계보
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|running|success|failed|cancelled
  error_message   TEXT,                             -- 실패 사유
  gpu_info        TEXT,                             -- 예: "NVIDIA GeForce RTX 3060 12GB"
  driver_version  TEXT,                             -- NVIDIA 드라이버 버전
  compute_backend TEXT                              -- CUDA|Vulkan|Metal|CPU
);

CREATE INDEX idx_generations_parent ON generations(parent_id);
CREATE INDEX idx_generations_created ON generations(created_at DESC);
CREATE INDEX idx_generations_status ON generations(status);

CREATE VIRTUAL TABLE generations_fts USING fts5(
  prompt, negative_prompt, content='generations', content_rowid='id'
);

CREATE TABLE presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE NOT NULL,
  params_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE model_manifest (
  name             TEXT PRIMARY KEY,
  version          TEXT NOT NULL,
  url              TEXT NOT NULL,
  sha256           TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL,
  downloaded_at    TEXT,
  verified         INTEGER DEFAULT 0
);
```

---

## 7. 리스크·미지수

| # | 리스크 | 영향 | 완화책 | 상태 |
|---|---|---|---|---|
| R1 | sd.cpp Z-Image 지원의 성숙도 (버그·성능) | 高 | v0에서 벤치마크 수행, 문제 시 diffusers 백엔드 병행 옵션 | 검증 필요 |
| R2 | Z-Image용 ControlNet이 sd.cpp에 미지원 | 中 | §3.6 — UI만 선행 설계, 백엔드 전환 가능 구조 | 로드맵 |
| R3 | 3060 12GB에서 BF16 full 모델 VRAM 부족 가능성 | 中 | GGUF Q4/Q5 기본, §4.2 GPU 프리체크로 자동 low-VRAM | v0.2 반영 |
| R4 | Electron 번들 크기 | 低 | Vite + code splitting, native deps 최소화 | 낮음 |
| R5 | LoRA 포맷 호환성 (Z-Image 전용 LoRA는 sd.cpp에서 로드 가능?) | 中 | v0에서 실제 LoRA로 검증, 결과에 따라 로드맵 조정 | 검증 필요 |
| R6 | **좀비 프로세스·VRAM 누수** | 高 | §4.1 3단계 종료 전략 | **v0.2 반영** |
| R7 | **sd.cpp 출력 포맷 변경 시 UI 깨짐** | 中 | §4.4 graceful degradation + 파일시스템 이벤트 fallback | **v0.2 반영** |
| R8 | **4GB 모델 다운로드 중 손상** | 高 | §4.3 이어받기 + SHA-256 검증 | **v0.2 반영** |
| R9 | nvidia-smi 미설치 환경 (AMD·Intel GPU) | 低 | Vulkan fallback, 프리체크 스킵 | §4.2 반영 |
| R10 | Ollama 미실행 시 Prompt Enhancer 오작동 | 低 | 1회 폴링 후 기능 자체를 숨김 | §3.8 반영 |

---

## 8. 마일스톤

### v0.1 — 기술 검증 (PoC)
- sd.cpp Windows 빌드 획득 (leejet 공식 릴리스)
- Z-Image-Turbo GGUF 모델로 CLI에서 1024×1024 생성 성공
- RTX 3060 12GB에서 생성 시간·VRAM 사용량 측정
- **Exit criteria**: 8 step, 1024×1024, < 10초

### v0.2 — Electron Shell + 견고성 기반 🆕
- Electron + React + TS 스켈레톤
- sd.cpp 프로세스 spawn, stdout 파싱
- 기본 txt2img UI (프롬프트, seed, steps, CFG, 해상도)
- 생성 결과 표시
- **§4.1 프로세스 핸들러 (SIGTERM → SIGKILL/taskkill 3단계)** 구현·테스트
- **§4.2 GPU 프리체크 (nvidia-smi 파싱)** 구현
- **§4.4 파싱 실패 시 indeterminate 모드 fallback** 구현
- **Exit criteria**: 생성 중 강제 종료 후 `nvidia-smi`에서 VRAM 정상 해제 확인

### v0.3 — 히스토리·갤러리 + 계보 추적
- SQLite 스키마 v0.2 적용 (`parent_id`, `status`, `gpu_info` 등 포함)
- 히스토리 사이드바, 갤러리 페이지
- PNG 메타데이터 임베드·복원
- **계보 트리 뷰** (§3.4)
- FTS5 검색

### v0.4 — img2img / inpaint
- img2img UI
- 마스크 편집기 (canvas 기반)
- inpaint 파이프라인
- 계보 체인에 자동 편입

### v0.5 — LoRA + 모델 다운로더
- LoRA 폴더 스캔·카드 UI
- 프롬프트에 `<lora:...>` 자동 삽입
- 다중 LoRA 테스트
- **§4.3 견고한 다운로더 (이어받기 + SHA-256)** 구현
- 모델 다운로드 마법사 UI

### v0.6 — Ollama Prompt Enhancer (선택 기능)
- Ollama 자동 감지
- 프롬프트 강화 UI
- 시스템 프롬프트 커스터마이징

### v1.0 — RC
- 설정 페이지 완성
- i18n (ko/en)
- electron-builder 배포 빌드 (Windows NSIS, Linux AppImage)
- ControlNet UI (비활성, 로드맵 표시)
- 버그 리포트 복사 기능

### v1.x — 포스트 런치
- Z-Image ControlNet (sd.cpp 지원 시점)
- SDXL·Qwen Image 등 다른 모델 지원
- 프롬프트 템플릿 라이브러리
- 배치 생성 큐

---

## 9. 오픈 이슈 (다음 세션 논의)

1. **LoRA 로딩 방식**: sd.cpp CLI가 LoRA 다중 스택을 어떻게 받는지 정확한 플래그 확인 필요
2. **Electron vs Tauri**: 번들 크기를 극단적으로 줄이려면 Tauri(Rust) 검토 가능. 초기 생산성은 Electron이 높음 — 일단 Electron
3. **프롬프트 히스토리의 데이터 증가**: 수만 개 누적 시 FTS5 인덱스 전략, 썸네일 디스크 용량 정책 (자동 정리?)
4. **모델 체크섬 배포**: 공식 HF 리포지토리의 SHA256을 어떻게 수집·갱신할지 (model-manifest.json)
5. **아이콘·브랜딩**: 앱 이름 최종 결정 (ZImageStudio / 다른 후보?)
6. **GPU 프리체크 정확도**: VRAM 예측 공식의 보정 계수 — 해상도·모델별로 실측 데이터 필요
7. **Ollama 기본 모델 추천**: 프롬프트 강화에 적합한 7-8B급 모델 벤치마크 필요

---

## 10. 참고 자료

- Z-Image 공식: https://github.com/Tongyi-MAI/Z-Image
- Z-Image-Turbo HF: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo
- stable-diffusion.cpp: https://github.com/leejet/stable-diffusion.cpp
- GGUF 양자화: `jayn7/Z-Image-Turbo-GGUF`, `unsloth/Z-Image-Turbo-GGUF`
- diffusers ZImagePipeline: https://huggingface.co/docs/diffusers/api/pipelines/z_image
- Ollama API: https://github.com/ollama/ollama/blob/main/docs/api.md

---

## 부록 A — Gemini 리뷰 트레이서빌리티

본 v0.2 개정은 Gemini AI 리뷰(2026-04-24) 항목을 PRD 각 섹션에 매핑·반영했다.

| Gemini 제안 | 반영 위치 | 승격 수준 |
|---|---|---|
| 하위 프로세스 제어(Zombification) 리스크 | §4.1, R6, v0.2 Exit criteria | 필수 요건 |
| 출력 파싱 불안정성 | §4.4, R7 | 필수 요건 |
| 모델 무결성 | §4.3, R8, 스키마 `model_manifest` | 필수 요건 |
| ControlNet 제약 | §3.6, R2 (기존 PRD에 이미 반영, 재강조) | 기존 유지 |
| SIGKILL + taskkill 병행 | §4.1 2단계 | 명시 |
| nvidia-smi GPU 사전 검사 | §4.2 | 명시 |
| 이어받기 + SHA-256 | §4.3 | 명시 |
| Ollama Prompt Enhancer | §2.4, §3.8, v0.6 | 신규 기능 |
| FTS5 스마트 갤러리 | §3.3 (기존 유지·강조) | 기존 확인 |
| 비파괴 편집 계보 | §3.4, `parent_id` 필드 | 신규 기능 |
| DB 스키마 보강 (`gpu_info` 등) | §6 | 반영 |

---

*본 PRD는 v0.2이며, PoC(v0.1 마일스톤) 결과에 따라 v0.3에서 개정된다. Gemini AI와의 크로스리뷰 협업 결과물이다.*
