from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DAI RUN AI Course Recommendation API"
    app_env: str = "local"

    aws_region: str = "ap-northeast-2"
    bedrock_model_id: str
    prompt_version: str = "course-ai-v1"

    database_url: str

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
