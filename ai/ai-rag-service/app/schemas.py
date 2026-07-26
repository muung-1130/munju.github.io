from typing import Optional

from pydantic import BaseModel, Field


class RunnerProfile(BaseModel):
    level: str = Field(default="BEGINNER", pattern="^(BEGINNER|INTERMEDIATE|ADVANCED)$")
    goal: str = Field(default="HEALTH", pattern="^(HEALTH|DIET|ENDURANCE|MARATHON|FIVE_K)$")
    weekly_runs: int = Field(default=2, ge=0, le=14, alias="weeklyRuns")
    recent_pain: bool = Field(default=False, alias="recentPain")

    model_config = {
        "populate_by_name": True,
    }


class RagChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    session_id: Optional[str] = Field(
        default=None,
        validation_alias="sessionId",
        serialization_alias="sessionId",
    )
    profile: RunnerProfile | None = None
    user_id: Optional[str] = Field(
        default=None,
        validation_alias="userId",
        serialization_alias="userId",
    )
    latitude: float | None = None
    longitude: float | None = None


class RagChatResponse(BaseModel):
    answer: str
    session_id: Optional[str] = Field(
        default=None,
        validation_alias="sessionId",
        serialization_alias="sessionId",
    )
    sources: list[str]
    blocked: bool = False
    guardrail_reason: str | None = Field(default=None, alias="guardrailReason")

    model_config = {
        "populate_by_name": True,
    }


class TodayCoachingRequest(BaseModel):
    profile: RunnerProfile = Field(default_factory=RunnerProfile)
    user_id: Optional[str] = Field(
        default=None,
        validation_alias="userId",
        serialization_alias="userId",
    )
    latitude: float | None = None
    longitude: float | None = None


class TodayCoachingResponse(BaseModel):
    title: str
    recommendation: str
    caution: str
    sources: list[str]
