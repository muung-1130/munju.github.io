"""날씨/대기질 수치를 러닝 강도 안내로 변환하는 규칙 엔진.

결정론적 분기(main.py)와 일반 RAG 대화 경로(bedrock_kb.py)가 이 모듈을
공유해서 쓴다 — LLM이 원시 수치를 보고 직접 강도를 판단하지 않고, 여기서
계산된 결과를 그대로 전달하게 하기 위함이다.
"""


def compute_weather_guidance(temperature_c: float) -> str:
    if temperature_c >= 30:
        return "더운 시간대를 피하고 강도를 낮춰 짧게 달리세요."
    if temperature_c >= 25:
        return "수분을 준비하고 평소보다 편안한 강도로 달리세요."
    if temperature_c <= 0:
        return "노면 결빙을 확인하고 충분히 몸을 푼 뒤 달리세요."
    if temperature_c <= 5:
        return "보온 가능한 복장으로 충분히 몸을 푼 뒤 시작하세요."
    return "러닝하기 무난하지만 현재 컨디션에 맞춰 강도를 조절하세요."


_AIR_QUALITY_GUIDANCE = {
    "나쁨": "대기질이 좋지 않으니 실외 고강도 러닝은 피하고 마스크 착용을 고려하세요.",
    "매우나쁨": "대기질이 매우 나쁘니 실외 러닝 대신 실내 운동으로 대체하는 걸 권장해요.",
}


def compute_air_quality_guidance(khai_grade: str | None) -> str | None:
    if not khai_grade:
        return None
    return _AIR_QUALITY_GUIDANCE.get(khai_grade)
