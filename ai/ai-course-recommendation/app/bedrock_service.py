import asyncio
import json
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import settings
from app.schemas import AiGeneratedCourseRequest, AiGeneratedCourseResult


SYSTEM_PROMPT = """
당신은 DAI RUN의 AI 러닝 코스 추천 엔진입니다.

역할:
- 사용자의 현재 위치, 검색 반경, 선호 거리, 난이도, 선호 러닝 환경, 추천 유형을 기준으로 러닝 코스를 추천합니다.
- 후보 코스(candidate_routes)가 주어지면 반드시 그 후보 중 하나를 선택합니다.
- 실제 존재하지 않는 GPS 경로나 좌표를 임의로 만들어내면 안 됩니다.
- 추천 이유는 사용자가 이해할 수 있도록 구체적으로 작성합니다.

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

응답 규칙:
- 반드시 JSON만 반환합니다.
- 마크다운, 설명 문장, 코드블록은 사용하지 않습니다.
- difficulty는 1, 2, 3 중 하나입니다.
- selected_candidate_id는 선택한 후보 코스의 candidate_id를 넣습니다.
- selection_reason에는 위치, 거리, 난이도, 인기/평가 데이터 중 어떤 근거를 반영했는지 포함합니다.

JSON 형식:
{
  "course_name": "추천 코스 이름",
  "description": "코스 설명",
  "selection_reason": "추천 근거",
  "selected_candidate_id": "선택한 후보 코스 ID",
  "distance_m": 5000,
  "difficulty": 2,
  "region": "서울"
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
    ) -> AiGeneratedCourseResult:
        return await asyncio.to_thread(self._generate_course_sync, request)

    def _generate_course_sync(
        self,
        request: AiGeneratedCourseRequest,
    ) -> AiGeneratedCourseResult:
        user_payload = {
            "user_location": request.location.model_dump(),
            "preference": request.preference.model_dump(),
            "candidate_routes": [
                route.model_dump() for route in request.candidate_routes
            ],
        }

        try:
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
                    "temperature": 0.2,
                    "maxTokens": 1000,
                },
            )

            text = response["output"]["message"]["content"][0]["text"]
            data = self._parse_json(text)

            return AiGeneratedCourseResult(**data)

        except (BotoCoreError, ClientError) as exc:
            raise RuntimeError(f"Bedrock 호출 중 오류가 발생했습니다: {exc}") from exc

    def _parse_json(self, text: str) -> dict[str, Any]:
        cleaned = text.strip()

        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Bedrock 응답을 JSON으로 파싱할 수 없습니다: {text}") from exc
