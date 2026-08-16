from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
import boto3
from sqlalchemy.orm import Session

from app.config import Settings
from app.schemas import RagChatResponse, RunnerProfile, TodayCoachingResponse
from app.text_format import wrap_text_for_chat
from app.tools import (
    get_user_profile, get_recent_runs, get_current_weather,
    get_air_quality, search_nearby_courses, get_active_challenges,
    format_tool_results
)


class BedrockKnowledgeBaseClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = boto3.client(
            "bedrock-agent-runtime",
            region_name=settings.aws_region,
        )

    def chat(
        self,
        question: str,
        session_id: str | None = None,
        profile: RunnerProfile | None = None,
        db: Session | None = None,
        user_id: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> RagChatResponse:
        # Tool 데이터 조회
        tool_context = ""
        if db and user_id:
            try:
                user_profile = get_user_profile(db, user_id)
                recent_runs = get_recent_runs(db, user_id)
                lowered_question = question.lower()
                include_weather = any(
                    keyword in lowered_question
                    for keyword in ("날씨", "기온", "습도", "강수", "비", "바람")
                )
                include_air_quality = any(
                    keyword in lowered_question
                    for keyword in ("대기질", "미세먼지", "pm10", "pm2.5")
                )
                include_courses = any(
                    keyword in lowered_question for keyword in ("코스", "경로", "주변")
                )
                include_challenges = "챌린지" in lowered_question
                weather = get_current_weather(db, user_profile.get("district")) if include_weather else {}
                air_quality = get_air_quality(db) if include_air_quality else {}
                nearby_courses = search_nearby_courses(
                    db, latitude, longitude
                ) if include_courses and latitude is not None and longitude is not None else {}
                challenges = get_active_challenges(db, user_id) if include_challenges else {}

                tool_context = format_tool_results(
                    user_profile, recent_runs, weather, air_quality,
                    nearby_courses, challenges
                )
            except Exception as e:
                tool_context = f"[DB 조회 실패: {str(e)}]"

        prompt = self._build_chat_prompt(question, profile, tool_context)
        if not self.settings.knowledge_base_id or not self.settings.model_arn:
            raise RuntimeError(
                "BEDROCK_KNOWLEDGE_BASE_ID와 BEDROCK_MODEL_ARN을 설정하세요."
            )

        request: dict = {
            "input": {
                "text": prompt,
            },
            "retrieveAndGenerateConfiguration": {
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": self.settings.knowledge_base_id,
                    "modelArn": self.settings.model_arn,
                },
            },
        }

        if session_id:
            request["sessionId"] = session_id

        response = self._retrieve_and_generate(request)

        answer = response.get("output", {}).get("text") or "답변을 생성하지 못했습니다."
        if not session_id and self._is_refusal(answer):
            retry_request = dict(request)
            retry_request["input"] = {
                "text": self._build_chat_prompt(
                    question,
                    profile,
                    tool_context=tool_context,
                    concise=True,
                )
            }
            retry_request.pop("sessionId", None)
            retry_response = self._retrieve_and_generate(retry_request)
            retry_answer = (
                retry_response.get("output", {}).get("text")
                or "답변을 생성하지 못했습니다."
            )
            if not self._is_refusal(retry_answer):
                answer = retry_answer
                response = retry_response

        sources = self._extract_sources(response)
        return RagChatResponse(
            answer=wrap_text_for_chat(answer),
            sessionId=response.get("sessionId"),
            sources=sources,
        )

    def today_coaching(
        self,
        profile: RunnerProfile,
        db: Session | None = None,
        user_id: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> TodayCoachingResponse:
        # Tool 데이터 조회
        tool_context = ""
        level_guidance = self._coaching_level_guidance(profile)
        if db and user_id:
            try:
                user_profile = get_user_profile(db, user_id)
                recent_runs = get_recent_runs(db, user_id, days=7)
                weather = get_current_weather(db, user_profile.get("district"))
                air_quality = get_air_quality(db)

                tool_context = format_tool_results(
                    user_profile, recent_runs, weather, air_quality, {}, {}
                )
            except Exception as e:
                tool_context = f"[DB 조회 실패: {str(e)}]"

        prompt = (
            "당신은 D.A.I. RUN 러닝비서입니다. 사용자의 간단 프로필과 현재 상황을 바탕으로 오늘의 러닝 코칭을 제안하세요. "
            "검색된 지식 기반 자료를 우선 근거로 사용하고, 자료에 없는 내용은 추측하지 마세요. "
            "건강 관련 내용은 진단이나 처방이 아닌 운동 참고 정보로 표현하세요.\n\n"
            f"{tool_context}\n\n"
            f"러너 프로필:\n{self._format_profile(profile)}\n\n"
            f"오늘의 수준별 코칭 기준:\n{level_guidance}\n\n"
            "실제 코치와 채팅하듯 친근한 존댓말로 답하세요. **처럼 별표로 굵게 강조하는 마크다운 "
            "기호는 쓰지 마세요 — 화면에 별표가 그대로 보입니다. 줄바꿈과 하이픈(-) 목록은 "
            "자유롭게 써도 됩니다. 짧은 도입 1~2문장 뒤, 거리 또는 시간·강도·진행 방법을 하이픈 "
            "목록 3개 이내로 짧게 나열하고, 다음 행동을 묻는 짧은 질문 하나로 마무리하세요. "
            "답변은 400자 이내로 작성하고 장황한 서론이나 반복은 사용하지 마세요. "
            "필요한 경우에만 안전 주의사항을 한 문장으로 덧붙이세요. "
            "DB에서 확인된 수치는 관련 있을 때만 한 번 인용하세요. "
            "날씨·대기질 '권장 강도/대응' 판단이 제공되면 그 판단을 그대로 전달하고 원시 수치만 "
            "보고 직접 판단하지 마세요. '데이터 없음'이면 지어내지 말고 그렇게 안내하세요.\n"
        )

        if not self.settings.knowledge_base_id or not self.settings.model_arn:
            raise RuntimeError(
                "BEDROCK_KNOWLEDGE_BASE_ID와 BEDROCK_MODEL_ARN을 설정하세요."
            )

        request = {
            "input": {"text": prompt},
            "retrieveAndGenerateConfiguration": {
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": self.settings.knowledge_base_id,
                    "modelArn": self.settings.model_arn,
                },
            },
        }
        response = self._retrieve_and_generate(request)
        answer = response.get("output", {}).get("text") or ""

        if self._is_refusal(answer):
            retry_prompt = (
                "D.A.I. RUN 러닝 코치로서 오늘 실행할 운동 하나를 한국어로 추천하세요.\n\n"
                f"러너 프로필:\n{self._format_profile(profile)}\n\n"
                f"반드시 따를 수준별 코칭 기준:\n{level_guidance}\n\n"
                f"참고 정보:\n{tool_context or '제공된 추가 정보 없음'}\n\n"
                "별표(**) 강조 없이, 짧은 안내 후 거리 또는 시간·강도·진행 방법을 하이픈 "
                "목록으로 짧게 나열하고 후속 질문 하나로 마무리하세요. 의료 진단이나 "
                "처방은 하지 마세요."
            )
            retry_request = dict(request)
            retry_request["input"] = {"text": retry_prompt}
            response = self._retrieve_and_generate(retry_request)
            answer = response.get("output", {}).get("text") or ""

        if not answer or self._is_refusal(answer):
            raise RuntimeError(
                "Bedrock이 오늘의 코칭 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )

        return TodayCoachingResponse(
            title="오늘의 러닝 코칭",
            recommendation=wrap_text_for_chat(answer),
            caution="통증이 있거나 컨디션이 좋지 않으면 강도를 낮추고 필요하면 전문가와 상담하세요.",
            sources=self._extract_sources(response),
        )

    @staticmethod
    def _coaching_level_guidance(profile: RunnerProfile) -> str:
        if profile.recent_pain:
            return (
                "최근 통증이 있으므로 달리기 강도를 높이지 마세요. "
                "휴식, 가벼운 걷기 또는 통증 없는 범위의 회복 운동만 제안하세요."
            )

        guidance = {
            "BEGINNER": (
                "초급자 기준으로 20~30분, 대화가 가능한 RPE 3~4 강도를 사용하세요. "
                "걷기와 가벼운 달리기를 섞고 고강도 인터벌은 제외하세요."
            ),
            "INTERMEDIATE": (
                "중급자 기준으로 35~50분, RPE 4~6 강도를 사용하세요. "
                "이지런을 기본으로 짧은 템포 구간이나 스트라이드를 한 가지 포함할 수 있습니다."
            ),
            "ADVANCED": (
                "고급자 기준으로 45~70분을 사용하세요. 회복 상태가 좋다면 RPE 6~8의 "
                "템포런 또는 인터벌을 한 가지 포함하고 워밍업과 쿨다운을 명시하세요."
            ),
        }
        return guidance.get(profile.level, guidance["BEGINNER"])

    def _extract_sources(self, response: dict) -> list[str]:
        sources: list[str] = []
        for citation in response.get("citations", []):
            for reference in citation.get("retrievedReferences", []):
                uri = (
                    reference.get("location", {})
                    .get("s3Location", {})
                    .get("uri")
                )
                if uri and uri not in sources:
                    sources.append(uri)
        return sources

    @staticmethod
    def _is_refusal(answer: str) -> bool:
        lowered = answer.lower()
        return any(
            phrase in lowered
            for phrase in (
                "unable to assist",
                "can't assist",
                "cannot assist",
                "도와드릴 수 없습니다",
            )
        )

    def _retrieve_and_generate(self, request: dict) -> dict:
        try:
            return self.client.retrieve_and_generate(**request)
        except NoCredentialsError as exc:
            raise RuntimeError(
                "AWS 자격 증명을 찾지 못했습니다. AWS CLI 프로필 또는 환경변수를 설정하세요."
            ) from exc
        except ClientError as exc:
            message = exc.response.get("Error", {}).get("Message", str(exc))
            raise RuntimeError(
                f"Bedrock Knowledge Base 호출에 실패했습니다: {message}"
            ) from exc
        except BotoCoreError as exc:
            raise RuntimeError(f"AWS SDK 요청 준비에 실패했습니다: {exc}") from exc

    def _build_chat_prompt(
        self,
        question: str,
        profile: RunnerProfile | None,
        tool_context: str = "",
        concise: bool = False,
    ) -> str:
        profile_text = self._format_profile(profile) if profile else "제공된 프로필 없음"

        prompt_parts = [
            "당신은 D.A.I. RUN 러닝비서입니다. "
            "검색된 지식 기반 자료를 우선 근거로 사용하세요. "
            "Knowledge Base는 일반적인 러닝 원칙의 근거로 사용하세요. "
            "러너 프로필과 비식별 러닝 참고 지표는 애플리케이션이 제공한 신뢰 가능한 사실이므로 "
            "Knowledge Base에 같은 수치가 없어도 개인화에 사용하세요. "
            "제공되지 않은 개인 정보나 기록만 추측하지 마세요. "
            "건강 관련 내용은 진단이나 처방이 아닌 일반적인 운동 참고 정보로만 표현하세요.\n"
        ]

        if tool_context:
            prompt_parts.append(f"비식별 러닝 참고 지표:\n{tool_context}\n")

        prompt_parts.append(f"러너 프로필:\n{profile_text}\n")
        prompt_parts.append(f"사용자 질문: {question}\n")

        if concise:
            prompt_parts.append(
                "사용자의 러닝 질문에 직접 답하세요. 친근한 한국어로 짧게 설명하세요. "
                "별표(**) 강조는 쓰지 말고, 필요하면 하이픈 목록을 써서 답한 뒤 "
                "후속 질문 하나로 마무리하세요. 날씨·대기질 '권장 강도/대응' 판단이 제공되면 "
                "그 판단을 그대로 전달하고 직접 판단하지 마세요. '데이터 없음'이면 지어내지 "
                "말고 그렇게 안내하세요."
            )
        else:
            prompt_parts.append(
                "답변 방식: 친근하고 자연스러운 존댓말을 쓰세요. **처럼 별표로 굵게 강조하는 "
                "마크다운 기호는 쓰지 마세요 — 화면에 별표가 그대로 보입니다. 줄바꿈과 "
                "하이픈(-) 목록은 자유롭게 써도 됩니다. 질문이 넓고 핵심 조건이 부족하면 "
                "가장 중요한 확인 질문 하나와 선택지 2~4개만 짧게 제시하세요. 구체적인 "
                "질문에는 도입 1~2문장, 하이픈 목록 최대 5개, 후속 질문 하나 순서로 답하세요. "
                "후속 대화에는 앞 내용을 반복하지 말고 2~4문장으로 바로 답하세요. 여러 주의 "
                "계획은 목적이 같은 2~4개 구간으로 묶으세요. 날씨·대기질에 대한 '권장 강도/대응' "
                "판단이 제공되면 그 판단을 그대로 전달하고 직접 새로 판단하지 마세요 — 원시 수치만 "
                "보고 스스로 안전/강도 기준을 계산하지 마세요. '데이터 없음'이라고 명시되어 있으면 "
                "수치나 판단을 지어내지 말고 데이터를 가져오지 못했다고 안내하세요. 500자 이내로 "
                "작성하고 진단이나 처방은 하지 마세요."
            )

        return "\n".join(prompt_parts)

    def _format_profile(self, profile: RunnerProfile | None) -> str:
        if profile is None:
            return "제공된 프로필 없음"

        level_label = {
            "BEGINNER": "초보자",
            "INTERMEDIATE": "중급자",
            "ADVANCED": "상급자",
        }.get(profile.level, profile.level)
        goal_label = {
            "HEALTH": "건강",
            "DIET": "다이어트",
            "ENDURANCE": "지구력",
            "MARATHON": "마라톤",
            "FIVE_K": "5km 기록 향상",
        }.get(profile.goal, profile.goal)
        pain_label = "최근 통증 있음" if profile.recent_pain else "최근 통증 없음"

        return (
            f"- 수준: {level_label}\n"
            f"- 목표: {goal_label}\n"
            f"- 주간 러닝 횟수: {profile.weekly_runs}회\n"
            f"- 통증 여부: {pain_label}"
        )
