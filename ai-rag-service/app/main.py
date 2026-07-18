from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.bedrock_kb import BedrockKnowledgeBaseClient
from app.config import Settings, get_settings
from app.guardrails import apply_input_guardrails
from app.schemas import RagChatRequest, RagChatResponse, TodayCoachingRequest, TodayCoachingResponse


app = FastAPI(
    title="D.A.I. RUN AI RAG Service",
    version="0.1.0",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEMO_CHAT_HTML = PROJECT_ROOT / "demo-chat.html"


def get_bedrock_client(
    settings: Settings = Depends(get_settings),
) -> BedrockKnowledgeBaseClient:
    return BedrockKnowledgeBaseClient(settings)


settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> FileResponse:
    return FileResponse(DEMO_CHAT_HTML)


@app.get("/demo")
def demo() -> FileResponse:
    return FileResponse(DEMO_CHAT_HTML)


@app.post("/api/v1/ai/chat", response_model=RagChatResponse, response_model_by_alias=True)
def chat(
    request: RagChatRequest,
    bedrock_client: BedrockKnowledgeBaseClient = Depends(get_bedrock_client),
) -> RagChatResponse:
    guardrail = apply_input_guardrails(request.question)
    if not guardrail.allowed:
        return RagChatResponse(
            answer=guardrail.answer or "요청을 처리할 수 없습니다.",
            sessionId=request.session_id,
            sources=[],
            blocked=True,
            guardrailReason=guardrail.reason,
        )

    try:
        return bedrock_client.chat(
            question=guardrail.question or request.question,
            session_id=request.session_id,
            profile=request.profile,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/v1/ai/coaching/today", response_model=TodayCoachingResponse)
def today_coaching(
    request: TodayCoachingRequest,
    bedrock_client: BedrockKnowledgeBaseClient = Depends(get_bedrock_client),
) -> TodayCoachingResponse:
    try:
        return bedrock_client.today_coaching(request.profile)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
