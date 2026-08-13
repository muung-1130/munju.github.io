"""Real, model-driven tool-call routing (Bedrock Converse API).

Distinct from the keyword-matched DB shortcuts in main.py/tools.py: those
decide deterministically in Python before the model ever runs. This module
asks the model itself whether a tool is needed, via `converse()` with
`toolConfig` -- `retrieve_and_generate()` (bedrock_kb.py) has no tool
support at all, so this uses a separate bedrock-runtime client and a
separate, cheap call scoped to just the routing decision.
"""

from botocore.exceptions import BotoCoreError, ClientError
import boto3

from app.config import Settings

WEATHER_TOOL_SPEC = {
    "toolSpec": {
        "name": "get_weather",
        "description": (
            "사용자가 지금 이 순간의 날씨, 기온, 습도, 강수, 바람을 묻거나 그 정보를 "
            "바탕으로 지금 러닝하기 괜찮은지, 복장이나 시간대를 조언해달라고 할 때 호출한다. "
            "과거 날씨나 특정 미래 날짜의 예보를 묻는 질문에는 호출하지 않는다."
        ),
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {},
                "additionalProperties": False,
            }
        },
    }
}

ROUTER_SYSTEM_PROMPT = (
    "너는 러닝 앱 챗봇의 도구 라우터다. 사용자 질문 하나만 보고, 제공된 도구 중 "
    "지금 필요한 게 있으면 반드시 그 도구를 호출해라. 필요한 도구가 없으면 아무 "
    "도구도 호출하지 말고 빈 문자열로만 답해라. 질문에 실제로 답하려 하지 마라 -- "
    "너의 역할은 도구 필요 여부 판단뿐이다."
)


class ToolRouter:
    """Routes a single user question to zero or one real tool call.

    One tool today (weather); adding more just means appending to the
    `tools` list passed to converse() and checking the returned name.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = boto3.client("bedrock-runtime", region_name=settings.aws_region)

    def wants_weather_tool(self, question: str) -> bool:
        if not self.settings.model_arn or not question.strip():
            return False

        try:
            response = self.client.converse(
                modelId=self.settings.model_arn,
                system=[{"text": ROUTER_SYSTEM_PROMPT}],
                messages=[{"role": "user", "content": [{"text": question}]}],
                toolConfig={"tools": [WEATHER_TOOL_SPEC]},
                inferenceConfig={"maxTokens": 200, "temperature": 0},
            )
        except (ClientError, BotoCoreError):
            # Routing is an enhancement, not the critical path -- if Bedrock
            # is unavailable here, fall through to the normal RAG flow
            # rather than failing the whole chat request.
            return False

        content = response.get("output", {}).get("message", {}).get("content", [])
        return any(
            block.get("toolUse", {}).get("name") == "get_weather"
            for block in content
            if isinstance(block, dict)
        )
