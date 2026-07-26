# D.A.I. RUN AI RAG Service

D.A.I. RUN의 AI 러닝 비서 기능을 담당하는 **독립 FastAPI 마이크로서비스**입니다.
Amazon Bedrock Knowledge Base에서 러닝 지식을 검색하고, 사용자 프로필과 비식별
러닝 참고 정보를 결합해 대화형 답변과 오늘의 코칭을 생성합니다.

이 폴더는 Next.js 웹 애플리케이션이나 일반 백엔드 기능을 구현하는 곳이 아닙니다.
웹·백엔드 담당자는 이 서비스를 내부 HTTP API로 호출하며, 인증과 사용자 권한 검증은
호출하는 백엔드에서 처리해야 합니다.

## 이 서비스가 담당하는 기능

- `POST /api/v1/ai/chat`: Bedrock Knowledge Base 기반 러닝 질의응답
- `POST /api/v1/ai/coaching/today`: 수준과 목표에 따른 오늘의 러닝 코칭
- Bedrock `sessionId`를 이용한 후속 대화 유지
- 프롬프트 인젝션, 민감정보 요청, 의료 진단 요청 등 입력 가드레일
- 전달받은 `userId`를 이용한 사용자 러닝 참고 데이터 조회
- Bedrock 답변의 참고 자료 URI 반환
- 로컬 데모 UI와 Windows 실행·검증 스크립트 제공

## 담당 경계

AI 서비스 담당:

- RAG 검색, 프롬프트, 코칭 규칙, 가드레일, AI 응답 형식
- AI 서비스 내부의 AWS·DB 연결

웹·백엔드 담당:

- 로그인, 세션, 권한 검증
- 인증 세션에서 얻은 `userId` 전달
- 브라우저와 AI 서비스 사이의 서버 측 프록시
- 서비스 주소, 비밀정보, timeout, rate limit, 배포와 운영 로그

브라우저가 전달한 `userId`를 그대로 신뢰하면 안 됩니다. 자세한 요청·응답 계약과
책임 구분은 [`BACKEND_HANDOFF.md`](./BACKEND_HANDOFF.md)를 참고하세요.

## 폴더 구조

| 경로 | 역할 |
|---|---|
| `app/main.py` | FastAPI 앱과 API 엔드포인트, 질문 라우팅 |
| `app/bedrock_kb.py` | Bedrock Knowledge Base 호출, 프롬프트와 코칭 생성 |
| `app/guardrails.py` | 허용·차단 질문 판별 |
| `app/database.py` | PostgreSQL 연결과 세션 관리 |
| `app/tools.py` | 사용자 기록, 날씨, 코스, 챌린지 등 참고 데이터 조회 |
| `app/schemas.py` | API 요청·응답 스키마 |
| `demo-chat.html` | AI 서비스 단독 확인용 데모 페이지 |
| `scripts/setup_windows.ps1` | Windows 가상환경과 의존성 준비 |
| `scripts/run_windows.ps1` | Windows 로컬 서버 실행 |
| `scripts/test_ai_server.ps1` | health, 가드레일, Bedrock 연동 검증 |
| `.env.example` | 필요한 환경변수 예시 |
| `BACKEND_HANDOFF.md` | 백엔드 인계용 API 계약과 운영 경계 |

## 요청 흐름

```text
브라우저 → 인증된 웹/백엔드 프록시 → AI RAG Service → PostgreSQL / Amazon Bedrock
```

AI 서비스는 기본적으로 `8000`번 포트에서 실행됩니다. API 명세는 서버 실행 후
`http://localhost:8000/docs`에서 확인할 수 있습니다.

## Environment

Copy `.env.example` to `.env` if you want local overrides.

```powershell
Copy-Item .env.example .env
```

AWS credentials are loaded through the default boto3 credential chain.
For local development, use AWS CLI credentials or environment variables.

Default CORS origins:

```text
http://localhost:3000,http://localhost:3001,http://192.168.0.201:3000
```

## Run

### Windows quick start

From PowerShell in `ai-rag-service`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup_windows.ps1
.\scripts\run_windows.ps1
```

The setup script creates `.venv`, installs dependencies, and creates `.env`
from `.env.example` when it is missing. It calls the virtual-environment Python
directly, so activating the environment is optional.

In another PowerShell window, run the tests that do not require AWS or DB:

```powershell
.\scripts\test_ai_server.ps1
```

After configuring Bedrock in `.env`, include the live RAG call:

```powershell
.\scripts\test_ai_server.ps1 -IncludeBedrock
```

### Manual run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

To expose the service to the Next.js server on the same network:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Docker

```powershell
docker build -t dairun-ai-rag-service .
docker run --rm -p 8000:8000 `
  -e AWS_REGION=ap-northeast-2 `
  -e BEDROCK_KNOWLEDGE_BASE_ID=your-knowledge-base-id `
  -e BEDROCK_MODEL_ARN=your-bedrock-model-arn `
  -e ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.0.201:3000 `
  -v "$env:USERPROFILE\.aws:/root/.aws:ro" `
  dairun-ai-rag-service
```

Or adapt `docker-compose.example.yml` into the project-level Docker Compose file.

## Test

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/ai/chat" -ContentType "application/json; charset=utf-8" -Body '{"question":"LSD 훈련의 목적과 진행 방법을 알려줘"}'
```

## Backend Integration

브라우저에서 AI 서비스로 직접 요청하지 말고 인증된 백엔드 프록시를 통해 호출하세요.
백엔드는 로그인 세션의 사용자 ID를 `userId`로 설정하고 첫 응답의 `sessionId`를 후속
요청에 전달합니다.

Response fields:

```json
{
  "answer": "...",
  "sessionId": "...",
  "sources": ["s3://dairun-bucket/rag/training_long.csv"],
  "blocked": false,
  "guardrailReason": null
}
```

연동 예제는 `NEXTJS_INTEGRATION.md`, 인증·프록시 책임과 전체 API 계약은
`BACKEND_HANDOFF.md`를 참고하세요.

The demo also supports a profile selector and `POST /api/v1/ai/coaching/today`.

## Demo UI

Open the demo page after starting the FastAPI server:

```text
http://localhost:8000/demo
```

Opening `demo-chat.html` directly as a `file://` URL can be blocked by browser CORS behavior.

## Handoff

Send the whole `ai-rag-service` folder except `.venv`, `.env`, `__pycache__`, and log files.
