from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    ocr_data_dir: Path = Path("data/jobs")
    ocr_provider: str = "minimax"
    ocr_base_url: str = ""
    ocr_api_key: str = ""
    ocr_model: str = ""
    ocr_timeout_seconds: float = 180
    ocr_endpoint_external: bool = True
    ocr_provider_config_version: str = "default"
    ocr_default_profile: str = ""
    ocr_enabled_profiles: str = ""
    minimax_base_url: str = ""
    minimax_api_key: str = ""
    minimax_endpoint_external: bool = True
    minimax_timeout_seconds: float = Field(default=180, gt=0)
    minimax_config_version: str = "minimax-m3-v1"
    qwen_base_url: str = ""
    qwen_api_key: str = ""
    qwen_endpoint_external: bool = False
    qwen_timeout_seconds: float = Field(default=180, gt=0)
    qwen_config_version: str = "qwen35-9b-v1"
    qwen_thinking_mode: bool = True
    qwen_structured_output: bool = False
    qwen_max_tokens_metadata: int | None = Field(default=None, ge=1)
    qwen_max_tokens_full_ocr: int | None = Field(default=None, ge=1)
    qwen_max_tokens_segmentation: int | None = Field(default=None, ge=1)
    celery_broker_url: str = "redis://localhost:6380/0"
    celery_result_backend: str = "redis://localhost:6380/1"
    ocr_auth_mode: str = "disabled"
    ocr_public_origin: str = ""
    ocr_auth_username: str = ""
    ocr_auth_password_hash: str = ""
    ocr_auth_session_secret: str = ""

    @model_validator(mode="after")
    def validate_auth(self):
        if self.ocr_auth_mode not in {"disabled", "shared"}:
            raise ValueError("OCR_AUTH_MODE must be disabled or shared")
        self.ocr_auth_username = self.ocr_auth_username.strip()
        if self.ocr_auth_mode == "shared":
            if not 1 <= len(self.ocr_auth_username) <= 64:
                raise ValueError("OCR_AUTH_USERNAME must contain 1-64 characters")
            if not all((self.ocr_public_origin, self.ocr_auth_password_hash, self.ocr_auth_session_secret)):
                raise ValueError("shared auth configuration is incomplete")
            if len(self.ocr_auth_session_secret) != 64:
                raise ValueError("OCR_AUTH_SESSION_SECRET must be 64 hex characters")
            bytes.fromhex(self.ocr_auth_session_secret)
        return self


settings = Settings()
