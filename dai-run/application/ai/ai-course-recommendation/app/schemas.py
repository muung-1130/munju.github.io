from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class UserLocation(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: str | None = None


class CoursePreference(BaseModel):
    search_radius_km: float = Field(default=5.0, gt=0, le=10)
    preferred_distance_km: float | None = Field(default=None, gt=0, le=50)
    difficulty: int | None = Field(default=None, ge=1, le=3)
    preferred_environment: str | None = None
    recommendation_type: str | None = Field(
        default="location_based",
        description="location_based, distance_based, difficulty_based, popular_based",
    )


class CandidateRoute(BaseModel):
    candidate_id: str
    name: str
    distance_m: int | None = None
    difficulty: int | None = Field(default=None, ge=1, le=3)
    region: str | None = None
    description: str | None = None

    view_count: int = Field(default=0, ge=0)
    like_count: int = Field(default=0, ge=0)
    review_count: int = Field(default=0, ge=0)
    review_average: float = Field(default=0.0, ge=0, le=5)

    route_coordinates: list[list[float]] = Field(
        default_factory=list,
        description="[[longitude, latitude], ...]",
    )


class AiGeneratedCourseRequest(BaseModel):
    # 추천 결과를 사용자별로 저장/재사용(하루 1회 제한)하려면 반드시 필요하다 —
    # 사용자 없는 추천은 캐시/스로틀링 기준을 세울 수 없어 이제 필수값으로 바꿨다.
    owner_user_id: UUID
    location: UserLocation
    preference: CoursePreference = Field(default_factory=CoursePreference)
    candidate_routes: list[CandidateRoute] = Field(default_factory=list)
    force_refresh: bool = Field(
        default=False,
        description="true면 하루 1회 제한을 무시하고 Bedrock을 다시 호출한다 (프론트의 '추천 새로고침' 버튼용)",
    )


class AiGeneratedCourseResult(BaseModel):
    course_name: str
    description: str
    selection_reason: str
    selected_candidate_id: str | None = None
    distance_m: int | None = None
    difficulty: int | None = Field(default=None, ge=1, le=3)
    region: str | None = None


class AiGeneratedCourseResultList(BaseModel):
    # Bedrock에게 서로 다른 후보 최대 3개를 한 번에 고르게 해서 응답 배열로 받는다(요청당 1회
    # Bedrock 호출 유지 — 3회 나눠 부르지 않는다). 후보가 3개 미만이면 있는 만큼만 채워진다.
    recommendations: list[AiGeneratedCourseResult] = Field(default_factory=list)


class RecommendationItemOut(BaseModel):
    course_id: str
    rank_no: int
    score: float | None = None
    distance_score: float | None = None
    difficulty_score: float | None = None
    environment_score: float | None = None
    preference_score: float | None = None
    reason: str | None = None


class AiGeneratedCourseResponse(BaseModel):
    recommendation_id: UUID
    status: str
    # true면 오늘 이미 계산해둔 결과를 재사용한 것 (Bedrock 재호출 없음)
    cached: bool
    items: list[RecommendationItemOut]
