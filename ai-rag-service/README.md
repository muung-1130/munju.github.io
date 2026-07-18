# D.A.I. RUN AI RAG Service

FastAPI service for Amazon Bedrock Knowledge Base RAG calls.

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
  -e BEDROCK_KNOWLEDGE_BASE_ID=CPDWCKU24Y `
  -e BEDROCK_MODEL_ARN=arn:aws:bedrock:ap-northeast-2:311233338510:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0 `
  -e ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.0.201:3000 `
  -v "$env:USERPROFILE\.aws:/root/.aws:ro" `
  dairun-ai-rag-service
```

Or adapt `docker-compose.example.yml` into the project-level Docker Compose file.

## Test

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/ai/chat" -ContentType "application/json; charset=utf-8" -Body '{"question":"LSD 훈련의 목적과 진행 방법을 알려줘"}'
```

## Next.js Call

```ts
const response = await fetch("http://192.168.0.201:8000/api/v1/ai/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question: userMessage,
    sessionId,
  }),
});

const data = await response.json();
```

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

See `NEXTJS_INTEGRATION.md` for the Next.js fetch example and demo questions.

The demo also supports a profile selector and `POST /api/v1/ai/coaching/today`.

## Demo UI

Open the demo page after starting the FastAPI server:

```text
http://localhost:8000/demo
```

Opening `demo-chat.html` directly as a `file://` URL can be blocked by browser CORS behavior.

## Handoff

Send the whole `ai-rag-service` folder except `.venv`, `.env`, `__pycache__`, and log files.
