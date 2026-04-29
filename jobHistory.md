# ZImageStudio — Job History

> 이 파일은 모든 개발 작업 이력을 날짜 역순으로 기록합니다.  
> 기록 주체: AI Agent (BACKEND / FRONTEND / DATA / ORCHESTRATOR / QA / SECURITY)  
> 관련 문서: [`agents.md`](./agents.md) — 에이전트 역할 및 태스크 정의

---

## 기록 형식

```
| 날짜 | 에이전트 | 태스크ID | 내용 |
```

- **날짜**: `YYYY-MM-DD`
- **에이전트**: `BACKEND` | `FRONTEND` | `DATA` | `ORCHESTRATOR` | `QA` | `SECURITY`
- **태스크ID**: agents.md의 태스크 ID (없으면 `—`)
- **내용**: 변경 사항 요약 (무엇을, 왜)

---

## 변경 이력

| 날짜 | 에이전트 | 태스크 | 내용 |
|------|----------|--------|------|
| 2026-04-27 | ORCHESTRATOR | — | 빌드 설정 개선: win.target에 zip 추가 (무설치 실행용 압축 폴더 생성) |
| 2026-04-25 | FRONTEND | FE-07 | Inpaint 구현: MaskCanvas 컴포넌트 (브러시/지우개/반전/초기화), Generate 페이지 통합, maskImage → params 전달 |
| 2026-04-25 | BACKEND | FE-07 | Inpaint 구현: inpaint:save-mask IPC 핸들러 (base64→PNG 임시저장), preload saveMask API 노출 |
| 2026-04-25 | FRONTEND | FE-04 | Gallery 페이지: 프롬프트 클립보드 복사 기능 추가 (카드 호버 오버레이 + 상세 모달 Prompt 섹션, 2초 Copied! 피드백) |
| 2026-04-25 | FRONTEND | FE-02 | Generate 페이지: 생성 중 spinner 오버레이 → sd.cpp 실시간 콘솔 로그 패널로 교체 |
| 2026-04-25 | BACKEND | BE-04 | inference:log IPC 채널 추가 및 sd.cpp stdout/stderr 라인 렌더러 스트리밍 |
| 2026-04-25 | FRONTEND | FE-01 | BrowserRouter → MemoryRouter 교체 (file:// 환경에서 라우팅 불가 문제 수정) |
| 2026-04-25 | BACKEND | — | CSP connect-src를 localhost:* 로 변경 (LM Studio 등 로컬 서비스 차단 문제 수정) |
| 2026-04-25 | BACKEND | — | start.bat 재작성 — better-sqlite3 빌드 체크, NODE_ENV=production 명시, dev.bat과 동기화 |
| 2026-04-25 | BACKEND | — | start.bat 실행 시 production 모드에서 index.html 경로 오류 수정 (../dist → ../../dist) |
| 2026-04-25 | BACKEND | — | Windows 드라이브 문자(D:)가 포함된 zimg 프로토콜 경로 파싱 오류 수정 |
| 2026-04-24 | FRONTEND | FE-07 | img2img 기능 구현 (소스 이미지 선택 UI + Denoise 슬라이더) |
| 2026-04-24 | BACKEND | BE-01 | img2img IPC 핸들러 및 CLI 인자 구성 (--strength 지원) |
| 2026-04-24 | BACKEND | BE-09 | Ollama 서비스를 범용 LLM 서비스(LM Studio 호환)로 전환 |
| 2026-04-24 | FRONTEND | FE-11 | 설정 UI에서 LM Studio 연동 기능 및 토글 구현 |
| 2026-04-24 | FRONTEND | FE-01 | 프롬프트 입력창 리셋 버튼 추가 및 파라미터 요약 가이드 추가 |
| 2026-04-24 | ORCHESTRATOR | — | GitHub 저장소 연동 및 히스토리 기록 규칙 명시 |

---

*새 항목은 테이블 상단(최신 순)에 추가하세요.*
