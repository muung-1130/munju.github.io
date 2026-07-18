import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    aws_region: str
    knowledge_base_id: str
    model_arn: str
    allowed_origins: list[str]

    def __init__(self) -> None:
        self.aws_region = os.getenv("AWS_REGION", "ap-northeast-2")
        self.knowledge_base_id = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID", "CPDWCKU24Y")
        self.model_arn = os.getenv(
            "BEDROCK_MODEL_ARN",
            "arn:aws:bedrock:ap-northeast-2:311233338510:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0",
        )
        raw_origins = os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:3001,http://192.168.0.201:3000",
        )
        self.allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
