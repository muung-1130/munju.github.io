from dataclasses import dataclass


RUNNING_KEYWORDS = (
    "러닝",
    "달리기",
    "런닝",
    "조깅",
    "마라톤",
    "5km",
    "10km",
    "하프",
    "풀코스",
    "페이스",
    "케이던스",
    "심박",
    "훈련",
    "운동",
    "초보자",
    "입문자",
    "시작",
    "처음",
    "주",
    "일주일",
    "주간",
    "빈도",
    "횟수",
    "몇 번",
    "강도",
    "거리",
    "시간",
    "인터벌",
    "lsd",
    "템포런",
    "회복주",
    "러닝화",
    "부상",
    "무릎",
    "발목",
    "종아리",
    "스트레칭",
    "코스",
)

PROMPT_INJECTION_PATTERNS = (
    "시스템 프롬프트",
    "system prompt",
    "프롬프트를 무시",
    "이전 지시",
    "ignore previous",
    "developer message",
    "숨겨진 지시",
    "내부 규칙",
    "출처 없이",
    "자료 무시",
)

SENSITIVE_DATA_PATTERNS = (
    "access key",
    "secret access key",
    "aws_secret",
    "비밀번호",
    "주민등록번호",
    "카드번호",
    "refresh token",
    "api key",
)

DIAGNOSIS_PATTERNS = (
    "진단해",
    "무슨 병",
    "치료법",
    "약 추천",
    "처방",
    "병원 안 가도",
)


@dataclass(frozen=True)
class GuardrailResult:
    allowed: bool
    reason: str | None = None
    answer: str | None = None
    question: str | None = None


def apply_input_guardrails(question: str) -> GuardrailResult:
    normalized = question.strip()
    lowered = normalized.lower()

    if not normalized:
        return GuardrailResult(
            allowed=False,
            reason="EMPTY_QUESTION",
            answer="질문을 입력해 주세요.",
        )

    if any(pattern in lowered for pattern in PROMPT_INJECTION_PATTERNS):
        return GuardrailResult(
            allowed=False,
            reason="PROMPT_INJECTION",
            answer="내부 지시나 시스템 설정을 변경하는 요청에는 답할 수 없습니다. 러닝 훈련, 코칭, 코스와 관련된 질문을 해 주세요.",
        )

    if any(pattern in lowered for pattern in SENSITIVE_DATA_PATTERNS):
        return GuardrailResult(
            allowed=False,
            reason="SENSITIVE_DATA",
            answer="비밀번호, API 키, 토큰 같은 민감 정보는 입력하지 마세요. 해당 정보 없이 러닝 관련 질문만 도와드릴 수 있습니다.",
        )

    if any(pattern in lowered for pattern in DIAGNOSIS_PATTERNS):
        return GuardrailResult(
            allowed=False,
            reason="MEDICAL_DIAGNOSIS",
            answer="의학적 진단이나 처방은 제공할 수 없습니다. 통증이 있거나 증상이 지속되면 운동을 중단하고 의료 전문가와 상담해 주세요.",
        )

    if not any(keyword in lowered for keyword in RUNNING_KEYWORDS):
        return GuardrailResult(
            allowed=False,
            reason="OUT_OF_SCOPE",
            answer="저는 D.A.I. RUN 러닝비서라서 러닝 훈련, 코칭, 코스, 러닝화, 마라톤 관련 질문에 집중해서 답변할 수 있습니다.",
        )

    guarded_question = (
        "당신은 D.A.I. RUN 러닝비서입니다. "
        "검색된 지식 기반 자료를 우선 근거로 사용하세요. "
        "자료에 없는 내용은 추측하지 말고 부족하다고 말하세요. "
        "건강 관련 내용은 진단이나 처방이 아닌 일반적인 운동 참고 정보로만 표현하세요.\n\n"
        f"사용자 질문: {normalized}"
    )

    return GuardrailResult(
        allowed=True,
        question=guarded_question,
    )
