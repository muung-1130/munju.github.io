from pathlib import Path
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.bedrock_kb import BedrockKnowledgeBaseClient
from app.config import Settings, get_settings
from app.database import get_db
from app.tool_calling import ToolRouter
from app.tools import (
    get_active_challenges,
    get_current_weather,
    get_last_run_location,
    get_recent_runs,
    get_user_profile,
    search_nearby_courses,
)
from app.guardrails import apply_aws_pii_guardrail, apply_input_guardrails
from app.schemas import RagChatRequest, RagChatResponse, TodayCoachingRequest, TodayCoachingResponse


app = FastAPI(
    title="D.A.I. RUN AI RAG Service",
    version="0.1.0",
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEMO_CHAT_HTML = PROJECT_ROOT / "demo-chat.html"
PROFILE_KEYWORDS = ("프로필", "프로필 정보", "내 정보")
DISTRICT_KEYWORDS = ("거주지역", "거주 지역", "사는 동", "지역이 뭐")
LAST_RUN_KEYWORDS = ("마지막 러닝", "최근 러닝 날짜", "마지막 달리기")
COURSE_KEYWORDS = ("코스", "경로", "주변")
OWNED_SHOE_KEYWORDS = ("내 러닝화", "내 신발", "등록한 러닝화", "보유 러닝화", "교체 시기")
CHALLENGE_STATUS_KEYWORDS = ("참여 중", "참여중", "진행률", "내 챌린지", "현재 챌린지")
MARATHON_REGIONS = ("서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주")
MARATHON_SCHEDULE_KEYWORDS = ("일정", "날짜", "언제", "접수", "신청", "개최")
MARATHON_SCHEDULE_PHRASES = ("대회 알려", "대회 추천", "대회 찾아")
MARATHON_TRAINING_KEYWORDS = (
    "준비",
    "훈련",
    "계획",
    "플랜",
    "주차별",
    "루틴",
)


def is_marathon_schedule_question(question: str) -> bool:
    """마라톤 훈련 질문을 제외하고 실제 대회 일정 조회 의도만 판별한다."""
    lowered = question.lower()
    if "마라톤" not in lowered:
        return False
    if any(keyword in lowered for keyword in MARATHON_TRAINING_KEYWORDS):
        return False
    return any(keyword in lowered for keyword in MARATHON_SCHEDULE_KEYWORDS) or any(
        phrase in lowered for phrase in MARATHON_SCHEDULE_PHRASES
    )


def build_shoe_answer(db: Session, user_id: str) -> str:
    rows = db.execute(
        text("""
        SELECT us.nickname, sc.brand_name, sc.shoe_name, us.purchase_date,
               us.accumulated_distance_m, us.status,
               life.estimated_remaining_distance_m, life.estimated_remaining_days,
               life.replacement_probability
        FROM shoe.user_shoes us
        LEFT JOIN shoe.shoe_catalog sc ON sc.shoe_id = us.shoe_model_id
        LEFT JOIN LATERAL (
            SELECT estimated_remaining_distance_m, estimated_remaining_days,
                   replacement_probability
            FROM shoe.shoe_life_snapshots
            WHERE user_shoe_id = us.user_shoe_id
            ORDER BY created_at DESC
            LIMIT 1
        ) life ON TRUE
        WHERE us.user_id = :user_id AND us.status <> 'RETIRED'
        ORDER BY us.registered_at DESC
        """),
        {"user_id": user_id},
    ).fetchall()
    if not rows:
        return (
            "현재 등록된 러닝화가 없습니다. 러닝화를 등록하면 모델과 누적거리, "
            "교체 예상 정보를 확인할 수 있어요."
        )

    lines = []
    for nickname, brand, name, purchase_date, distance_m, status, remaining_m, remaining_days, probability in rows:
        model = " ".join(part for part in (brand, name) if part) or "모델 정보 없음"
        label = f"{nickname} ({model})" if nickname else model
        details = [f"누적 {float(distance_m or 0) / 1000:g}km"]
        if purchase_date:
            details.append(f"구매일 {purchase_date:%Y-%m-%d}")
        if remaining_m is not None:
            details.append(f"예상 잔여 {float(remaining_m) / 1000:g}km")
        if remaining_days is not None:
            details.append(f"약 {remaining_days}일 사용 가능")
        if probability is not None:
            details.append(f"교체 확률 {float(probability):g}%")
        lines.append(f"{label} — " + ", ".join(details))
    return (
        "등록된 러닝화를 확인했어요.\n\n"
        "**내 러닝화**\n- " + "\n- ".join(lines) +
        "\n\n러닝화별 교체 시점이나 용도도 확인해드릴까요?"
    )


def build_challenge_answer(db: Session, user_id: str) -> str:
    result = get_active_challenges(db, user_id)
    challenges = result.get("challenges", [])
    if not challenges:
        return "현재 참여 중인 챌린지가 없습니다. 새로운 챌린지를 찾아볼까요?"

    lines = []
    for challenge in challenges:
        end_date = challenge.get("end_date")
        end_label = end_date[:10] if end_date else "미정"
        lines.append(
            "{} — 목표 {:g}, 진행률 {:g}%, 종료 {}".format(
                challenge["title"], float(challenge["target"]),
                float(challenge["progress_pct"]), end_label,
            )
        )
    return (
        "현재 참여 중인 챌린지를 확인했어요.\n\n"
        "**진행 중인 챌린지**\n- " + "\n- ".join(lines) +
        f"\n\n총 {len(challenges)}개가 진행 중입니다. "
        "목표 달성을 위한 러닝 계획도 추천해드릴까요?"
    )


def build_marathon_answer(db: Session, question: str) -> str:
    now = datetime.now(ZoneInfo("Asia/Seoul"))
    month_match = re.search(r"(1[0-2]|[1-9])월", question)
    year_match = re.search(r"(20\d{2})년?", question)
    month = int(month_match.group(1)) if month_match else now.month
    year = int(year_match.group(1)) if year_match else now.year
    region = next((item for item in MARATHON_REGIONS if item in question), "서울")
    rows = db.execute(
        text("""
        SELECT race_name, race_date, race_distance, registration_end_date,
               official_website
        FROM marathon.marathon_race
        WHERE EXTRACT(YEAR FROM race_date) = :year
          AND EXTRACT(MONTH FROM race_date) = :month
          AND region LIKE :region
        ORDER BY race_date, race_name, race_distance
        """),
        {"year": year, "month": month, "region": f"%{region}%"},
    ).fetchall()
    if not rows:
        return f"DB에 등록된 {year}년 {month}월 {region} 마라톤 일정이 없습니다."

    grouped = {}
    for name, race_date, distance, registration_end, website in rows:
        key = (name, race_date, registration_end, website)
        grouped.setdefault(key, []).append(distance)
    lines = []
    for (name, race_date, registration_end, website), distances in grouped.items():
        registration = ", 접수 마감 {:02d}/{:02d}".format(
            registration_end.month, registration_end.day
        ) if registration_end else ""
        link = " — [공식 홈페이지]({})".format(website) if website else ""
        lines.append(
            "{:02d}/{:02d} {} ({}{}){}".format(
                race_date.month, race_date.day, name, ", ".join(distances), registration, link
            )
        )
    count = len(grouped)
    return (
        f"{year}년 {month}월 {region}에서 열리는 마라톤 대회를 찾아봤어요.\n\n"
        "**대회 일정**\n- " + "\n- ".join(lines) +
        f"\n\n총 {count}개의 대회가 있습니다. 거리별로 다시 골라드릴까요?"
    )


def build_course_answer(
    db: Session,
    user_id: str,
    latitude: float | None,
    longitude: float | None,
    question: str,
) -> str:
    location_label = "현재 위치"
    if latitude is None or longitude is None:
        last_location = get_last_run_location(db, user_id)
        latitude = last_location.get("latitude")
        longitude = last_location.get("longitude")
        location_label = "마지막 러닝 시작 위치"

    if latitude is None or longitude is None:
        return (
            "현재 위치와 좌표가 포함된 최근 러닝 기록이 없어 주변 코스를 계산할 수 없습니다. "
            "브라우저 위치 권한을 허용한 뒤 다시 요청해 주세요."
        )

    result = search_nearby_courses(db, latitude, longitude, radius_m=5000)
    courses = result.get("courses", [])
    if not courses:
        return f"{location_label} 기준 5km 이내에 등록된 활성 러닝 코스가 없습니다."

    lowered = question.lower()
    if any(keyword in lowered for keyword in ("긴", "길게", "장거리")):
        courses.sort(key=lambda course: course.get("distance_km") or 0, reverse=True)
        selection_label = "코스 거리가 긴 순서"
        followup = "가까운 코스나 짧은 코스로 다시 골라드릴까요?"
    elif any(keyword in lowered for keyword in ("짧은", "짧게", "단거리")):
        courses.sort(key=lambda course: course.get("distance_km") or 0)
        selection_label = "코스 거리가 짧은 순서"
        followup = "조금 더 긴 코스도 찾아드릴까요?"
    elif any(keyword in lowered for keyword in ("쉬운", "초보", "난이도 낮")):
        courses.sort(
            key=lambda course: (
                course.get("difficulty") is None, course.get("difficulty") or 999,
                course.get("distance_to_user_m") or 0,
            )
        )
        selection_label = "난이도가 쉬운 순서"
        followup = "거리까지 고려해서 다시 좁혀드릴까요?"
    else:
        courses.sort(key=lambda course: course.get("distance_to_user_m") or 0)
        selection_label = "가까운 순서"
        followup = "짧은 코스나 쉬운 코스만 다시 골라드릴까요?"

    selected_courses = courses[:5]
    lines = []
    for course in selected_courses:
        nearby_km = float(course.get("distance_to_user_m") or 0) / 1000
        difficulty = course.get("difficulty")
        difficulty_label = difficulty if difficulty is not None else "미지정"
        lines.append(
            "{} — 코스 {:g}km, 약 {:.1f}km 거리, 난이도 {}".format(
                course["name"], course["distance_km"], nearby_km, difficulty_label
            )
        )
    return (
        f"{location_label}에서 5km 이내의 러닝 코스를 찾아봤어요.\n\n"
        "**추천 코스**\n- " + "\n- ".join(lines) +
        f"\n\n총 {len(selected_courses)}개를 {selection_label}로 보여드렸어요. "
        + followup
    )


def build_user_data_answer(db: Session, user_id: str, question: str) -> str | None:
    """사용자 본인의 단순 DB 사실 질문은 Bedrock을 거치지 않고 답한다."""
    lowered = question.lower().replace("?", "").strip()
    profile = get_user_profile(db, user_id)
    if "error" in profile:
        return "해당 사용자 ID의 활성 프로필을 찾을 수 없습니다."

    if any(keyword in lowered for keyword in DISTRICT_KEYWORDS):
        district = profile.get("district")
        return f"현재 등록된 거주 지역은 **{district}**입니다." if district else "현재 등록된 거주 지역 정보가 없습니다."

    if any(keyword in lowered for keyword in LAST_RUN_KEYWORDS):
        runs = get_recent_runs(db, user_id)
        last_run_date = runs.get("last_run_date")
        if not last_run_date:
            return "최근 30일 동안 완료된 러닝 기록이 없습니다."
        return f"마지막으로 완료한 러닝 날짜는 **{last_run_date[:10]}**입니다."

    if any(keyword in lowered for keyword in PROFILE_KEYWORDS):
        difficulty_labels = {"BEGINNER": "초보자", "INTERMEDIATE": "중급자", "ADVANCED": "상급자"}
        goal_labels = {"HEALTH": "건강", "DIET": "다이어트", "ENDURANCE": "지구력", "MARATHON": "마라톤", "FIVE_K": "5km"}
        facts = []
        if profile.get("nickname"):
            facts.append(f"닉네임: {profile["nickname"]}")
        if profile.get("district"):
            facts.append(f"거주 지역: {profile["district"]}")
        if profile.get("difficulty"):
            facts.append(f"러닝 수준: {difficulty_labels.get(profile["difficulty"], profile["difficulty"])}")
        if profile.get("running_goal"):
            facts.append(f"러닝 목표: {goal_labels.get(profile["running_goal"], profile["running_goal"])}")
        if profile.get("preferred_distance_m") is not None:
            facts.append(f"선호 거리: {profile["preferred_distance_m"]}m")
        if profile.get("target_pace_sec_per_km") is not None:
            seconds = int(profile["target_pace_sec_per_km"])
            facts.append(f"목표 페이스: {seconds // 60}:{seconds % 60:02d}/km")
        if profile.get("weekly_target_distance_m") is not None:
            facts.append(f"주간 목표 거리: {profile["weekly_target_distance_m"] / 1000:g}km")
        if profile.get("created_at"):
            facts.append(f"가입일: {profile["created_at"][:10]}")
        if not facts:
            return "현재 등록된 러닝 프로필 상세 정보가 없습니다."
        return "**내 러닝 프로필**\n- " + "\n- ".join(facts)

    return None


def build_weather_answer(db: Session, user_id: str) -> str | None:
    profile = get_user_profile(db, user_id)
    if "error" in profile:
        return None

    weather = get_current_weather(db, profile.get("district"))
    if "error" in weather or weather.get("temperature_c") is None:
        return None

    temperature = float(weather["temperature_c"])
    facts = [f"기온 {temperature:g}°C"]
    if weather.get("humidity_pct") is not None:
        facts.append(f"습도 {float(weather['humidity_pct']):g}%")
    if weather.get("precipitation_amount"):
        facts.append(f"강수 {weather['precipitation_amount']}")
    if weather.get("wind_speed_ms") is not None:
        facts.append(f"풍속 {float(weather['wind_speed_ms']):g}m/s")

    if temperature >= 30:
        guidance = "더운 시간대를 피하고 강도를 낮춰 짧게 달리세요."
    elif temperature >= 25:
        guidance = "수분을 준비하고 평소보다 편안한 강도로 달리세요."
    elif temperature <= 0:
        guidance = "노면 결빙을 확인하고 충분히 몸을 푼 뒤 달리세요."
    elif temperature <= 5:
        guidance = "보온 가능한 복장으로 충분히 몸을 푼 뒤 시작하세요."
    else:
        guidance = "러닝하기 무난하지만 현재 컨디션에 맞춰 강도를 조절하세요."

    forecast_time = weather.get("forecast_time")
    time_label = (
        f"{forecast_time[:2]}시 기준" if forecast_time and len(forecast_time) >= 2
        else "현재 예보"
    )
    return (
        f"**현재 날씨**\n- {time_label}: {', '.join(facts)}\n\n"
        f"**러닝 안내**\n- {guidance}"
    )


# 현재 프로세스에서 Bedrock이 실제 발급한 세션만 후속 대화로 인정한다.
active_session_ids: set[str] = set()


def get_bedrock_client(
    settings: Settings = Depends(get_settings),
) -> BedrockKnowledgeBaseClient:
    return BedrockKnowledgeBaseClient(settings)


def get_tool_router(
    settings: Settings = Depends(get_settings),
) -> ToolRouter:
    return ToolRouter(settings)


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
    tool_router: ToolRouter = Depends(get_tool_router),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> RagChatResponse:
    is_known_followup = bool(
        request.session_id and request.session_id in active_session_ids
    )
    # AWS Guardrail은 민감정보(PII)만 사전 검사한다 — 발견하지 못했거나 호출에
    # 실패하면 None을 반환하고, 아래 apply_input_guardrails()가 그대로 이어서
    # 주제 제한/프롬프트 인젝션/의료진단/PII를 전부 검사한다.
    guardrail = apply_aws_pii_guardrail(request.question, settings)
    if guardrail is None:
        guardrail = apply_input_guardrails(request.question, allow_followup=is_known_followup)
    if not guardrail.allowed:
        return RagChatResponse(
            answer=guardrail.answer or "요청을 처리할 수 없습니다.",
            sessionId=request.session_id,
            sources=[],
            blocked=True,
            guardrailReason=guardrail.reason,
        )

    lowered_question = request.question.lower()
    if is_marathon_schedule_question(request.question):
        return RagChatResponse(
            answer=build_marathon_answer(db, request.question),
            sessionId=request.session_id,
            sources=[],
        )

    if request.user_id and any(
        keyword in lowered_question for keyword in OWNED_SHOE_KEYWORDS
    ):
        return RagChatResponse(
            answer=build_shoe_answer(db, request.user_id),
            sessionId=request.session_id,
            sources=[],
        )

    if request.user_id and "챌린지" in lowered_question and any(
        keyword in lowered_question for keyword in CHALLENGE_STATUS_KEYWORDS
    ):
        return RagChatResponse(
            answer=build_challenge_answer(db, request.user_id),
            sessionId=request.session_id,
            sources=[],
        )

    is_course_question = any(keyword in lowered_question for keyword in COURSE_KEYWORDS)
    if request.user_id and is_course_question:
        return RagChatResponse(
            answer=build_course_answer(
                db, request.user_id, request.latitude, request.longitude, request.question
            ),
            sessionId=request.session_id,
            sources=[],
        )

    if request.user_id:
        user_data_answer = build_user_data_answer(db, request.user_id, request.question)
        if user_data_answer:
            return RagChatResponse(answer=user_data_answer, sessionId=request.session_id, sources=[])

    if request.user_id and tool_router.wants_weather_tool(request.question):
        weather_answer = build_weather_answer(db, request.user_id)
        if weather_answer:
            return RagChatResponse(
                answer=weather_answer,
                sessionId=request.session_id,
                sources=[],
            )

    try:
        response = bedrock_client.chat(
            question=request.question,
            session_id=request.session_id,
            profile=request.profile,
            db=db if request.user_id else None,
            user_id=request.user_id,
            latitude=request.latitude,
            longitude=request.longitude,
        )
        if response.session_id:
            active_session_ids.add(response.session_id)
        return response
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/v1/ai/coaching/today", response_model=TodayCoachingResponse)
def today_coaching(
    request: TodayCoachingRequest,
    bedrock_client: BedrockKnowledgeBaseClient = Depends(get_bedrock_client),
    db: Session = Depends(get_db),
) -> TodayCoachingResponse:
    try:
        return bedrock_client.today_coaching(
            profile=request.profile,
            db=db if request.user_id else None,
            user_id=request.user_id,
            latitude=request.latitude,
            longitude=request.longitude,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
