import json
from typing import Any

from app.config import settings
from app.database import get_pool
from app.schemas import AiGeneratedCourseRequest, AiGeneratedCourseResult


async def save_ai_generated_course(
    ai_course_id: str,
    request: AiGeneratedCourseRequest,
    result: AiGeneratedCourseResult,
) -> None:
    pool = get_pool()

    request_context: dict[str, Any] = {
        "location": request.location.model_dump(),
        "preference": request.preference.model_dump(),
    }

    candidate_routes = [
        route.model_dump() for route in request.candidate_routes
    ]

    selected_route = None
    if result.selected_candidate_id:
        for route in request.candidate_routes:
            if route.candidate_id == result.selected_candidate_id:
                selected_route = route
                break

    route_coordinates = []
    if selected_route:
        route_coordinates = selected_route.route_coordinates

    route_geojson = {
        "type": "LineString",
        "coordinates": route_coordinates,
    }

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO course.ai_generated_courses (
                ai_course_id,
                owner_user_id,
                course_name,
                description,
                selection_reason,
                distance_m,
                difficulty,
                region,
                visibility,
                status,
                route_geom,
                request_context,
                candidate_routes,
                bedrock_model_id,
                prompt_version
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                'PRIVATE',
                'DRAFT',
                ST_SetSRID(ST_GeomFromGeoJSON($9), 4326),
                $10::jsonb,
                $11::jsonb,
                $12,
                $13
            )
            """,
            ai_course_id,
            request.owner_user_id,
            result.course_name,
            result.description,
            result.selection_reason,
            result.distance_m,
            result.difficulty,
            result.region,
            json.dumps(route_geojson),
            json.dumps(request_context, ensure_ascii=False),
            json.dumps(candidate_routes, ensure_ascii=False),
            settings.bedrock_model_id,
            settings.prompt_version,
        )
