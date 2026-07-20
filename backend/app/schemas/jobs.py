from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class CreateJobRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    kind: str = "zip"
    file_count: int = Field(ge=1, le=15)
    ocr_method: str = "qwen"
    upload_name: str = ""
    model: str = ""
    cloud_data_confirmed: bool = False
    vlm_task: str = "full_ocr"
    vlm_pages: str = "all"
    vlm_max_pages: int = 0
    prompt_version: str = "3"


class CorrectionRequest(BaseModel):
    document_id: str = ""
    corrections: list[dict[str, Any]]


class JobResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    status: str
