# ZImageStudio — AI 어시스턴트 컨텍스트

## 프로젝트
- **이름**: ZImageStudio
- **타입**: Electron 데스크탑 앱 (Windows/Linux)
- **목적**: stable-diffusion.cpp 기반 완전 로컬 이미지 생성 앱
- **PRD**: `docs/ZImageStudio-PRD.md` (v0.2)
- **에이전트 스펙**: `agents.md`

## 기술 스택
- **메인 프로세스**: Electron (Node.js) + TypeScript
- **렌더러**: React 18 + TypeScript + Vite
- **스타일링**: Tailwind CSS + shadcn/ui (Radix UI)
- **상태 관리**: Zustand
- **DB**: SQLite (`better-sqlite3`)
- **빌드**: `electron-builder`
- **테스트**: Vitest (단위) + Playwright (E2E)
- **애니메이션**: Framer Motion

## 핵심 설계 원칙
1. **완전 로컬**: 인터넷 연결 불필요 (모델 최초 다운로드 제외)
2. **프로세스 격리**: sd.cpp는 항상 child_process.spawn으로 격리 실행
3. **좀비 방지**: processHandler.ts를 통한 3단계 종료 전략 필수
4. **파싱 실패 허용**: sd.cpp 출력 형식 변경 시 indeterminate 모드로 자동 전환
5. **견고한 다운로드**: Range 헤더 이어받기 + SHA-256 체크섬 검증
6. **변경 이력 관리**: 모든 수정사항은 `agents.md` 및 관련 문서의 히스토리 섹션에 명시적으로 기록 필수

## 디렉토리 구조
```
ZImageStudio/
├── electron/           # 메인 프로세스 (Node.js/Electron)
│   ├── main.ts
│   ├── preload.ts
│   ├── ipc/            # IPC 핸들러 (기능별 분리)
│   └── services/       # 핵심 서비스 모듈
├── src/                # 렌더러 (React/Vite)
│   ├── components/
│   ├── pages/
│   ├── store/          # Zustand 스토어
│   ├── shared/         # 타입 공유 (main+renderer)
│   └── i18n/
├── resources/
│   ├── bin/            # sd.exe / sd 바이너리
│   ├── schema/         # SQL 마이그레이션 파일
│   └── model-manifest.json
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── fixtures/
├── agents.md           # 멀티에이전트 협업 스펙
└── docs/
    └── ZImageStudio-PRD.md
```

## 현재 마일스톤
**v0.1 (PoC)**: sd.cpp Windows 바이너리로 CLI에서 1024×1024 생성 검증

## 중요 제약사항
- ControlNet은 v1.0에서 UI만 만들고 **비활성화** 상태로 출시 (sd.cpp 미지원)
- macOS는 초기 배포 제외
- 텔레메트리/추적 코드 절대 금지
- Ollama 연동은 **완전 옵셔널** — 미실행 시 기능 숨김, 앱은 정상 동작

## IPC 원칙
- `contextIsolation: true`, `nodeIntegration: false` 필수
- 모든 IPC는 `preload.ts`의 `contextBridge`를 통해서만 노출
- IPC 채널 명세는 `agents.md` 참조

## 커밋 컨벤션
```
feat(BE|FE|DA|UX|QA): 설명 [TASK_ID]
fix(컴포넌트): 버그 수정 내용
test(QA): 테스트 추가
```
