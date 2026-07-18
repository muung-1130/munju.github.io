from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
import boto3

from app.config import Settings
from app.schemas import RagChatResponse, RunnerProfile, TodayCoachingResponse


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
    ) -> RagChatResponse:
        prompt = self._build_chat_prompt(question, profile)
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

        try:
            response = self.client.retrieve_and_generate(**request)
        except NoCredentialsError as exc:
            raise RuntimeError("AWS 자격 증명을 찾지 못했습니다. AWS CLI 프로필 또는 환경변수를 설정하세요.") from exc
        except ClientError as exc:
            message = exc.response.get("Error", {}).get("Message", str(exc))
            raise RuntimeError(f"Bedrock Knowledge Base 호출에 실패했습니다: {message}") from exc
        except BotoCoreError as exc:
            raise RuntimeError(f"AWS SDK 요청 준비에 실패했습니다: {exc}") from exc

        answer = response.get("output", {}).get("text") or "답변을 생성하지 못했습니다."
        sources = self._extract_sources(response)

        return RagChatResponse(
            answer=answer,
            sessionId=response.get("sessionId"),
            sources=sources,
        )

    def today_coaching(self, profile: RunnerProfile) -> TodayCoachingResponse:
        prompt = (
            "당신은 D.A.I. RUN 러닝비서입니다. 사용자의 간단 프로필을 바탕으로 오늘의 러닝 코칭을 제안하세요. "
            "검색된 지식 기반 자료를 우선 근거로 사용하고, 자료에 없는 내용은 추측하지 마세요. "
            "건강 관련 내용은 진단이나 처방이 아닌 운동 참고 정보로 표현하세요.\n\n"
            f"러너 프로필:\n{self._format_profile(profile)}\n\n"
            "응답 형식:\n"
            "제목: 한 줄\n"
            "추천: 거리 또는 시간, 강도, 진행 방법을 3문장 이내로 설명\n"
            "주의: 통증, 과훈련, 초보자 안전 관련 주의사항 1~2문장\n"
        )

        response = self.chat(prompt, profile=profile)
        return TodayCoachingResponse(
            title="오늘의 러닝 코칭",
            recommendation=response.answer,
            caution="통증이 있거나 컨디션이 좋지 않으면 강도를 낮추고 필요하면 전문가와 상담하세요.",
            sources=response.sources,
        )

    def _extract_sources(self, response: dict) -> list[str]:
        sources: list[str] = []

        for citation in response.get("citations", []):
            for reference in citation.get("retrievedReferences", []):
                uri = (
                    reference
                    .get("location", {})
                    .get("s3Location", {})
                    .get("uri")
                )
                if uri and uri not in sources:
                    sources.append(uri)

        return sources

    def _build_chat_prompt(
        self,
        question: str,
        profile: RunnerProfile | None,
    ) -> str:
        profile_text = self._format_profile(profile) if profile else "제공된 프로필 없음"
        return (
            f"{question}\n\n"
            f"러너 프로필:\n{profile_text}\n\n"
            "응답은 다음 구조로 작성하세요:\n"
            "1. 핵심 요약\n"
            "2. 추천 방법\n"
            "3. 주의할 점\n"
            "4. 다음에 물어보면 좋은 질문 1개\n"
        )

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
