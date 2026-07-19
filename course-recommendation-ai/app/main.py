from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException

from app.bedrock_service import BedrockCourseRecommendationService
from app.config import settings
from app.database import close_db, connect_db
from app.repository import save_ai_generated_course
from app.schemas import (
    AiGeneratedCourseRequest,
    AiGeneratedCourseResponse,
)


bedrock_service = BedrockCourseRecommendationService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": settings.app_name,
        "env": settings.app_env,
    }


@app.post(
    "/api/v1/ai-generated-courses",
    response_model=AiGeneratedCourseResponse,
)
async def create_ai_generated_course(
    request: AiGeneratedCourseRequest,
):
    try:
        ai_course_id = f"AI_{uuid4().hex[:20]}"

        result = await bedrock_service.generate_course(request)

        await save_ai_generated_course(
            ai_course_id=ai_course_id,
            request=request,
            result=result,
        )

        request_context = {
            "location": request.location.model_dump(),
            "preference": request.preference.model_dump(),
        }

        return AiGeneratedCourseResponse(
            ai_course_id=ai_course_id,
            status="DRAFT",
            result=result,
            request_context=request_context,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc
