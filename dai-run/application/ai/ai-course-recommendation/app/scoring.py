"""추천 항목의 세부 점수(distance/difficulty/environment/preference_score)를 계산한다.

CLAUDE.md 10.3 원칙대로, 이 수치들은 LLM에게 맡기지 않고 서버 코드(규칙 엔진)에서 결정한다.
Bedrock은 candidate_routes 중 하나를 선택하고 자연어 근거(reason)만 생성하고, 그 선택된 후보와
사용자 선호를 비교해서 이 모듈이 0~100 점수를 매긴다. 각 점수는 판단에 필요한 입력이 없으면
(예: 선호 거리 미입력) None을 반환한다 — 억지로 임의 수치를 만들지 않는다.
"""

from app.schemas import CandidateRoute, CoursePreference

_MAX_DIFFICULTY_GAP = 2  # difficulty는 1~3이라 최대 격차가 2


def _distance_score(candidate: CandidateRoute, preference: CoursePreference) -> float | None:
    if preference.preferred_distance_km is None or candidate.distance_m is None:
        return None
    preferred_m = preference.preferred_distance_km * 1000
    if preferred_m <= 0:
        return None
    gap_ratio = abs(candidate.distance_m - preferred_m) / preferred_m
    return round(max(0.0, 100.0 - gap_ratio * 100.0), 3)


def _difficulty_score(candidate: CandidateRoute, preference: CoursePreference) -> float | None:
    if preference.difficulty is None or candidate.difficulty is None:
        return None
    gap = abs(candidate.difficulty - preference.difficulty)
    return round(max(0.0, 100.0 - (gap / _MAX_DIFFICULTY_GAP) * 100.0), 3)


def _environment_score(candidate: CandidateRoute, preference: CoursePreference) -> float | None:
    if not preference.preferred_environment or not candidate.description:
        return None
    # 임베딩/의미 매칭이 아니라 단순 부분 문자열 포함 여부로 판단하는 러프한 규칙이다.
    # candidate.region까지 같이 봐서 살짝 보강한다.
    haystack = f"{candidate.description} {candidate.region or ''}"
    return 100.0 if preference.preferred_environment in haystack else 40.0


def _preference_score(candidate: CandidateRoute, candidates: list[CandidateRoute]) -> float | None:
    """조회수·찜·리뷰수·평점 등 인기 신호를, 이번 요청에 같이 들어온 후보군 내에서 상대적으로
    정규화해 점수화한다 (review_count=0인 코스는 '평점이 낮다'가 아니라 '아직 데이터가 없다'로
    취급 — bedrock_service.py의 시스템 프롬프트와 동일한 해석)."""
    if not candidates:
        return None

    def popularity(route: CandidateRoute) -> float:
        rating_component = route.review_average if route.review_count > 0 else 0.0
        return route.view_count + route.like_count * 2 + route.review_count * 2 + rating_component * 4

    max_popularity = max((popularity(route) for route in candidates), default=0.0)
    if max_popularity <= 0:
        return None

    return round(min(100.0, (popularity(candidate) / max_popularity) * 100.0), 3)


def compute_scores(
    selected: CandidateRoute,
    preference: CoursePreference,
    all_candidates: list[CandidateRoute],
) -> dict[str, float | None]:
    distance_score = _distance_score(selected, preference)
    difficulty_score = _difficulty_score(selected, preference)
    environment_score = _environment_score(selected, preference)
    preference_score = _preference_score(selected, all_candidates)

    sub_scores = [
        value
        for value in (distance_score, difficulty_score, environment_score, preference_score)
        if value is not None
    ]
    overall_score = round(sum(sub_scores) / len(sub_scores), 3) if sub_scores else None

    return {
        "score": overall_score,
        "distance_score": distance_score,
        "difficulty_score": difficulty_score,
        "environment_score": environment_score,
        "preference_score": preference_score,
    }
