from dataclasses import dataclass

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import Settings


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
    "프로필",
    "닉네임",
    "거주",
    "가입",
    "마지막",
    "챌린지",
    "날씨",
    "기온",
    "미세먼지",
    "습도",
    "강수",
    "더워",
    "추워",
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


def apply_input_guardrails(question: str, allow_followup: bool = False) -> GuardrailResult:
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

    if not allow_followup and not any(keyword in lowered for keyword in RUNNING_KEYWORDS):
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


_bedrock_runtime_client = None


def _get_bedrock_runtime_client(settings: Settings):
    global _bedrock_runtime_client
    if _bedrock_runtime_client is None:
        _bedrock_runtime_client = boto3.client("bedrock-runtime", region_name=settings.aws_region)
    return _bedrock_runtime_client


def apply_aws_pii_guardrail(question: str, settings: Settings) -> GuardrailResult | None:
    """AWS Bedrock Guardrails로 민감정보(PII)만 사전 검사한다.

    주제 제한/프롬프트 인젝션/의료진단 거부는 실측 결과 AWS Guardrails의 topic policy와
    한국어 PROMPT_ATTACK 필터가 신뢰할 수 없어(정책 예제와 동일한 문장도 통과) 이관하지
    않았다 — 이 Guardrail은 PII 전용으로만 구성되어 있다. 그 세 가지는 계속
    apply_input_guardrails()가 담당한다.

    AWS 호출이 실패하거나 guardrail이 설정되지 않은 경우, 또는 AWS가 PII를 발견하지
    못한 경우 모두 None을 반환한다 — 호출자는 이어서 apply_input_guardrails()를
    그대로 실행해야 한다(그 함수가 SENSITIVE_DATA_PATTERNS로 PII도 다시 한번 검사하므로
    이중 방어가 된다).
    """
    if not settings.guardrail_id:
        return None

    try:
        response = _get_bedrock_runtime_client(settings).apply_guardrail(
            guardrailIdentifier=settings.guardrail_id,
            guardrailVersion=settings.guardrail_version,
            source="INPUT",
            content=[{"text": {"text": question}}],
        )
    except (ClientError, BotoCoreError):
        return None

    if response.get("action") != "GUARDRAIL_INTERVENED":
        return None

    return GuardrailResult(
        allowed=False,
        reason="SENSITIVE_DATA",
        answer="비밀번호, API 키, 토큰 같은 민감 정보는 입력하지 마세요. 해당 정보 없이 러닝 관련 질문만 도와드릴 수 있습니다.",
    )
