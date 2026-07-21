from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    ocr_data_dir: str = "data/jobs"
    ocr_provider: str = "qwen"
    ocr_base_url: str = ""
    ocr_api_key: str = ""
    ocr_model: str = ""
    ocr_timeout_seconds: float = 120
    celery_broker_url: str = "redis://localhost:6380/0"
    celery_result_backend: str = "redis://localhost:6380/1"


settings = Settings()
