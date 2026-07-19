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
    owner_user_id: UUID | None = None
    location: UserLocation
    preference: CoursePreference = Field(default_factory=CoursePreference)
    candidate_routes: list[CandidateRoute] = Field(default_factory=list)


class AiGeneratedCourseResult(BaseModel):
    course_name: str
    description: str
    selection_reason: str
    selected_candidate_id: str | None = None
    distance_m: int | None = None
    difficulty: int | None = Field(default=None, ge=1, le=3)
    region: str | None = None


class AiGeneratedCourseResponse(BaseModel):
    ai_course_id: str
    status: str
    result: AiGeneratedCourseResult
    request_context: dict[str, Any]
