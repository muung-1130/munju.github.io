import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.bedrock_service import BedrockCourseRecommendationService
from app.config import settings
from app.database import close_db, connect_db
from app.repository import (
    dismiss_ignored_previous_ai_pick,
    get_recent_recommendation,
    save_recommendation_run,
)
from app.schemas import (
    AiGeneratedCourseRequest,
    AiGeneratedCourseResponse,
    RecommendationItemOut,
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
        # 하루 1회 스로틀링: force_refresh가 아니면 최근 추천을 그대로 재사용하고 Bedrock을
        # 다시 호출하지 않는다 (비용 절감이 목적, DB 저장은 참조뿐이라 저렴함).
        if not request.force_refresh:
            cached = await get_recent_recommendation(request.owner_user_id)
            if cached is not None:
                return AiGeneratedCourseResponse(
                    recommendation_id=cached["recommendation_id"],
                    status="COMPLETED",
                    cached=True,
                    items=[
                        RecommendationItemOut(**item) for item in cached["items"]
                    ],
                )

        # 새 추천을 만들기 전에, 직전 AI 픽이 아무 반응도 못 받았으면 자동 DISMISS 처리한다.
        await dismiss_ignored_previous_ai_pick(request.owner_user_id)

        started_at = time.monotonic()
        result = await bedrock_service.generate_course(request)
        processing_time_ms = int((time.monotonic() - started_at) * 1000)

        recommendation_id, item_scores = await save_recommendation_run(
            request=request,
            result=result,
            processing_time_ms=processing_time_ms,
        )

        items = (
            [
                RecommendationItemOut(
                    course_id=result.selected_candidate_id,
                    rank_no=1,
                    reason=result.selection_reason,
                    **item_scores,
                )
            ]
            if result.selected_candidate_id
            else []
        )

        return AiGeneratedCourseResponse(
            recommendation_id=recommendation_id,
            status="COMPLETED",
            cached=False,
            items=items,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc
