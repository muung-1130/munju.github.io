import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    aws_region: str
    knowledge_base_id: str
    model_arn: str
    guardrail_id: str
    guardrail_version: str
    allowed_origins: list[str]
    database_url: str

    def __init__(self) -> None:
        self.aws_region = os.getenv("AWS_REGION", "ap-northeast-2")
        self.knowledge_base_id = os.getenv("BEDROCK_KNOWLEDGE_BASE_ID", "")
        self.model_arn = os.getenv("BEDROCK_MODEL_ARN", "")
        self.guardrail_id = os.getenv("BEDROCK_GUARDRAIL_ID", "").strip()
        self.guardrail_version = os.getenv("BEDROCK_GUARDRAIL_VERSION", "DRAFT").strip()
        raw_origins = os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:3001,http://192.168.0.212:3000",
        )
        self.allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        self.database_url = os.getenv("DATABASE_URL", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
