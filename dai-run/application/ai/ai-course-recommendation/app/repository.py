import json
from datetime import datetime, time, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.config import settings
from app.database import get_pool
from app.schemas import AiGeneratedCourseRequest, AiGeneratedCourseResult
from app.scoring import compute_scores

KST = ZoneInfo("Asia/Seoul")
DAILY_CUTOFF_HOUR = 3  # 매일 새벽 3시를 기준으로 그날의 추천 여부를 판단한다 (24시간 롤링 아님).


def _todays_recommendation_cutoff(now: datetime | None = None) -> datetime:
    """지금이 오늘 KST 03:00 이후면 오늘 03:00을, 그 전이면 어제 03:00을 반환한다 —
    "매일 오전 3시 이후 로그인 시 새로 추천" 기준선."""
    now_kst = (now or datetime.now(timezone.utc)).astimezone(KST)
    cutoff_kst = datetime.combine(now_kst.date(), time(DAILY_CUTOFF_HOUR, 0), tzinfo=KST)
    if now_kst < cutoff_kst:
        cutoff_kst -= timedelta(days=1)
    return cutoff_kst.astimezone(timezone.utc)


async def get_recent_recommendation(user_id: UUID) -> dict[str, Any] | None:
    """스로틀링용: 오늘(KST 03:00 기준) 이미 만들어둔 추천이 있으면 그 결과를 그대로 재사용한다."""
    pool = get_pool()

    async with pool.acquire() as conn:
        run = await conn.fetchrow(
            """
            SELECT recommendation_id
            FROM course_recommendation.recommendation_runs
            WHERE user_id = $1
              AND status = 'COMPLETED'
              AND created_at >= $2
            ORDER BY created_at DESC
            LIMIT 1
            """,
            user_id,
            _todays_recommendation_cutoff(),
        )
        if run is None:
            return None

        items = await conn.fetch(
            """
            SELECT course_id, rank_no, score, distance_score, difficulty_score,
                   environment_score, preference_score, reason
            FROM course_recommendation.recommendation_items
            WHERE recommendation_id = $1
            ORDER BY rank_no
            """,
            run["recommendation_id"],
        )

    return {
        "recommendation_id": run["recommendation_id"],
        "items": [dict(item) for item in items],
    }


async def dismiss_ignored_previous_ai_pick(user_id: UUID) -> None:
    """새 추천을 만들기 직전에 호출한다. 사용자의 직전 추천 실행에서 AI가 고른 코스(rank_no=1)가
    그동안 CLICK/LIKE/START_RUN/DISMISS 중 아무 반응도 못 받았다면, 그 코스는 관심이 없었던
    것으로 보고 자동으로 DISMISS 처리한다 — 그래야 다음 candidate 조회에서 다시 안 뽑힌다.
    (이미 명시적으로 DISMISS된 경우엔 여기서 다시 넣을 필요 없이 자연히 스킵된다.)"""
    pool = get_pool()

    async with pool.acquire() as conn:
        previous_pick = await conn.fetchrow(
            """
            SELECT i.recommendation_id, i.course_id
            FROM course_recommendation.recommendation_items i
            JOIN course_recommendation.recommendation_runs r ON r.recommendation_id = i.recommendation_id
            WHERE r.user_id = $1 AND r.status = 'COMPLETED' AND i.rank_no = 1
            ORDER BY r.created_at DESC
            LIMIT 1
            """,
            user_id,
        )
        if previous_pick is None:
            return

        has_feedback = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM course_recommendation.recommendation_feedback
                WHERE recommendation_id = $1 AND course_id = $2 AND user_id = $3
            )
            """,
            previous_pick["recommendation_id"],
            previous_pick["course_id"],
            user_id,
        )
        if has_feedback:
            return

        await conn.execute(
            """
            INSERT INTO course_recommendation.recommendation_feedback
                (recommendation_id, course_id, user_id, feedback_type)
            VALUES ($1, $2, $3, 'DISMISS')
            """,
            previous_pick["recommendation_id"],
            previous_pick["course_id"],
            user_id,
        )


async def save_recommendation_run(
    request: AiGeneratedCourseRequest,
    results: list[AiGeneratedCourseResult],
    processing_time_ms: int,
) -> tuple[UUID, list[dict[str, float | None]]]:
    """course_id만 참조하는 추천 실행 1건 + 결과 항목(Bedrock이 고른 서로 다른 코스 최대 3개,
    rank_no 1~len(results))을 저장한다. 코스 이름/설명/거리 등은 course.courses에 이미 있으므로
    여기서는 복제하지 않는다 — 화면에서 그 코스 상세는 기존 코스 조회 API로 가져오면 된다."""
    pool = get_pool()

    context_snapshot: dict[str, Any] = {
        "address": request.location.address,
        "preference": request.preference.model_dump(),
        "candidate_count": len(request.candidate_routes),
        "candidate_ids": [route.candidate_id for route in request.candidate_routes],
        "bedrock_model_id": settings.bedrock_model_id,
        "prompt_version": settings.prompt_version,
        # "AI 추천 다시 받기" 버튼의 하루 사용 횟수 제한(course-recommendation-service의
        # getManualRefreshCountToday)이 이 값으로 자동 생성과 수동 재검색을 구분한다.
        "force_refresh": request.force_refresh,
    }

    # model_version 컬럼은 varchar(50)이라 전체 inference profile ARN(약 90자 이상)이 안 들어간다 —
    # 전체 ARN은 위 context_snapshot에 이미 남겨뒀으니, 여기엔 ARN의 마지막 세그먼트(모델 식별자)만 저장한다.
    model_version = settings.bedrock_model_id.rsplit("/", 1)[-1][:50]

    radius_m = int(round(request.preference.search_radius_km * 1000))
    requested_distance_m = (
        int(round(request.preference.preferred_distance_km * 1000))
        if request.preference.preferred_distance_km
        else None
    )

    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            """
            INSERT INTO course_recommendation.recommendation_runs (
                user_id,
                latitude,
                longitude,
                request_location,
                radius_m,
                requested_distance_m,
                context_snapshot,
                model_version,
                status,
                processing_time_ms
            )
            VALUES (
                $1, $2, $3,
                ST_SetSRID(ST_MakePoint($9, $10), 4326),
                $4, $5, $6::jsonb, $7, 'COMPLETED', $8
            )
            RETURNING recommendation_id
            """,
            request.owner_user_id,
            request.location.latitude,
            request.location.longitude,
            radius_m,
            requested_distance_m,
            json.dumps(context_snapshot, ensure_ascii=False),
            model_version,
            processing_time_ms,
            request.location.longitude,
            request.location.latitude,
        )
        recommendation_id: UUID = row["recommendation_id"]
        empty_scores: dict[str, float | None] = {
            "score": None,
            "distance_score": None,
            "difficulty_score": None,
            "environment_score": None,
            "preference_score": None,
        }
        item_scores: list[dict[str, float | None]] = []

        for rank_no, result in enumerate(results, start=1):
            if not result.selected_candidate_id:
                continue
            selected_candidate = next(
                (
                    route
                    for route in request.candidate_routes
                    if route.candidate_id == result.selected_candidate_id
                ),
                None,
            )
            scores = (
                compute_scores(selected_candidate, request.preference, request.candidate_routes)
                if selected_candidate is not None
                else empty_scores
            )
            item_scores.append(scores)

            await conn.execute(
                """
                INSERT INTO course_recommendation.recommendation_items (
                    recommendation_id, course_id, rank_no,
                    score, distance_score, difficulty_score, environment_score, preference_score,
                    reason
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (recommendation_id, course_id) DO NOTHING
                """,
                recommendation_id,
                result.selected_candidate_id,
                rank_no,
                scores["score"],
                scores["distance_score"],
                scores["difficulty_score"],
                scores["environment_score"],
                scores["preference_score"],
                result.selection_reason,
            )

    return recommendation_id, item_scores
