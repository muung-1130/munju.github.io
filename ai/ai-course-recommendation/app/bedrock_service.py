import asyncio
import json
import logging
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.schemas import AiGeneratedCourseRequest, AiGeneratedCourseResult, AiGeneratedCourseResultList

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """
당신은 DAI RUN의 AI 러닝 코스 추천 엔진입니다.

역할:
- 사용자의 현재 위치, 검색 반경, 선호 거리, 난이도, 선호 러닝 환경, 추천 유형을 기준으로 러닝 코스를 추천합니다.
- 후보 코스(candidate_routes)가 주어지면 그 후보 중에서 서로 다른 코스 최대 3개를 골라 순위대로 추천합니다.
- 후보가 3개 미만이면 있는 만큼만(1개 또는 2개) 반환합니다. 같은 candidate_id를 중복 선택하지 않습니다.
- 실제 존재하지 않는 GPS 경로나 좌표를 임의로 만들어내면 안 됩니다.
- 각 코스의 추천 이유는 사용자가 이해할 수 있도록 구체적으로 작성합니다.

추천 시 고려할 정보:
1. 현재 위치와의 적합성
2. 선호 거리와 후보 코스 거리의 유사성
3. 사용자가 선택한 난이도와 후보 코스 난이도의 일치 여부
4. 선호 러닝 환경과 코스 설명의 관련성
5. 조회수(view_count)
6. 찜 수(like_count)
7. 리뷰 수(review_count)
8. 평균 평점(review_average)

주의:
- review_count가 0이고 review_average가 0이면 낮은 평점이 아니라 아직 리뷰가 없는 코스로 해석합니다.
- 인기 데이터가 부족한 경우에는 위치, 거리, 난이도, 코스 설명을 더 중요하게 봅니다.
- 인기 데이터가 충분한 경우에는 조회수, 찜 수, 리뷰 수, 평균 평점을 보조 근거로 활용합니다.
- 추천 유형이 popular_based이면 인기 데이터를 더 중요하게 반영합니다.
- 추천 유형이 location_based이면 현재 위치와 가까운 코스를 더 중요하게 반영합니다.
- 추천 유형이 distance_based이면 선호 거리와 가까운 코스를 더 중요하게 반영합니다.
- 추천 유형이 difficulty_based이면 사용자가 선택한 난이도와 맞는 코스를 더 중요하게 반영합니다.
- recommendations 배열의 순서가 곧 추천 순위입니다(1번째가 가장 추천).

응답 규칙:
- 반드시 JSON만 반환합니다.
- 마크다운, 설명 문장, 코드블록은 사용하지 않습니다.
- difficulty는 1, 2, 3 중 하나입니다.
- selected_candidate_id는 선택한 후보 코스의 candidate_id를 넣습니다.
- selection_reason에는 위치, 거리, 난이도, 인기/평가 데이터 중 어떤 근거를 반영했는지 포함합니다.

JSON 형식:
{
  "recommendations": [
    {
      "course_name": "추천 코스 이름",
      "description": "코스 설명",
      "selection_reason": "추천 근거",
      "selected_candidate_id": "선택한 후보 코스 ID",
      "distance_m": 5000,
      "difficulty": 2,
      "region": "서울"
    }
  ]
}
"""


class BedrockCourseRecommendationService:
    def __init__(self) -> None:
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=settings.aws_region,
        )

    async def generate_course(
        self,
        request: AiGeneratedCourseRequest,
    ) -> list[AiGeneratedCourseResult]:
        return await asyncio.to_thread(self._generate_course_sync, request)

    def _generate_course_sync(
        self,
        request: AiGeneratedCourseRequest,
    ) -> list[AiGeneratedCourseResult]:
        user_payload = {
            "user_location": request.location.model_dump(),
            "preference": request.preference.model_dump(),
            "candidate_routes": [
                route.model_dump() for route in request.candidate_routes
            ],
        }

        try:
            text = self._invoke(user_payload)
            try:
                data = self._parse_json(text)
            except RuntimeError:
                # candidate_routes가 많을수록 모델이 긴 selection_reason을 생성하다 maxTokens에
                # 걸려 JSON이 잘리거나, 지시를 못 지키고 부가 텍스트를 섞는 경우가 비결정적으로
                # 발생한다(간헐적 500의 원인) — 같은 요청으로 한 번만 재시도한다.
                logger.warning("Bedrock 응답 파싱 실패, 동일 요청으로 1회 재시도합니다.")
                text = self._invoke(user_payload)
                data = self._parse_json(text)

            results = AiGeneratedCourseResultList(**data).recommendations
            # 프롬프트에서 중복 선택 금지를 지시했지만, 모델이 지키지 않을 가능성에 대비해
            # 서버에서도 같은 candidate_id 중복을 걸러낸다(최대 3개로 자른다).
            seen: set[str] = set()
            deduped: list[AiGeneratedCourseResult] = []
            for item in results:
                if item.selected_candidate_id and item.selected_candidate_id in seen:
                    continue
                if item.selected_candidate_id:
                    seen.add(item.selected_candidate_id)
                deduped.append(item)
            return deduped[:3]

        except (BotoCoreError, ClientError) as exc:
            logger.error("Bedrock 호출 중 오류가 발생했습니다: %s", exc)
            raise RuntimeError(f"Bedrock 호출 중 오류가 발생했습니다: {exc}") from exc

    def _invoke(self, user_payload: dict[str, Any]) -> str:
        response = self.client.converse(
            modelId=settings.bedrock_model_id,
            system=[
                {
                    "text": SYSTEM_PROMPT,
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "text": json.dumps(
                                user_payload,
                                ensure_ascii=False,
                            )
                        }
                    ],
                }
            ],
            inferenceConfig={
                # 후보(candidate_routes)가 많을 때 모델이 생성하는 selection_reason이 길어지면
                # JSON이 중간에 잘려 파싱에 실패했다 — 이제 코스 1개가 아니라 최대 3개(각자
                # description/selection_reason 포함)를 배열로 받으므로 여유를 더 늘린다.
                "temperature": 0.2,
                "maxTokens": 3000,
            },
        )
        return response["output"]["message"]["content"][0]["text"]

    def _parse_json(self, text: str) -> dict[str, Any]:
        cleaned = text.strip()

        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # 마크다운 코드블록 처리 후에도 순수 JSON이 아니면, 모델이 지시를 못 지키고 앞뒤에
        # 부가 설명을 붙였을 가능성이 있다 — 텍스트 안에서 짝이 맞는 첫 JSON 객체 구간만 추출한다.
        extracted = self._extract_json_object(cleaned)
        if extracted is not None:
            try:
                return json.loads(extracted)
            except json.JSONDecodeError:
                pass

        logger.error("Bedrock 응답을 JSON으로 파싱하지 못했습니다. 원본 응답: %s", text)
        raise RuntimeError(f"Bedrock 응답을 JSON으로 파싱할 수 없습니다: {text}")

    @staticmethod
    def _extract_json_object(text: str) -> str | None:
        start = text.find("{")
        if start == -1:
            return None
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        return None
