from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PublicModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class CreateJobRequest(PublicModel):
    file_count: int = Field(ge=1, le=15)
    upload_name: str = ""
    cloud_data_confirmed: bool = False
    vlm_task: str = "full_ocr"
    vlm_pages: str = "all"
    vlm_max_pages: int = 0


class FieldResponse(PublicModel):
    value: Any = ""
    confidence: float = 0
    bbox: list[float] = Field(default_factory=list)
    page_index: int = 0
    ocr_value: Any | None = None
    corrected_value: Any | None = None
    corrected_at: str | None = None


class PageResponse(PublicModel):
    page_index: int = 0
    image_url: str = ""


class CropEvidence(PublicModel):
    crop_image: str
    evidence_source: str = "manual_crop"
    evidence_status: str = "trusted"
    bbox: dict[str, float]
    page_index: int
    field: str
    created_at: str


class DocumentResponse(PublicModel):
    id: str = ""
    file_name: str = ""
    status: str = ""
    fields: dict[str, FieldResponse] = Field(default_factory=dict)
    pages: list[PageResponse] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    error: str | None = None
    review_status: str | None = None
    approved_at: str | None = None
    crop_evidence: list[CropEvidence] = Field(default_factory=list)


class JobResponse(PublicModel):
    id: str
    status: str
    created_at: str = ""
    updated_at: str = ""
    ocr_method: str = ""
    provider: str = ""
    model: str = ""
    prompt_version: str = ""
    endpoint_external: bool = True
    cloud_data_confirmed: bool = False
    expected_files: int = 0
    uploaded_files: int = 0
    upload_name: str = ""
    documents: list[DocumentResponse] = Field(default_factory=list)
    logs: list[Any] = Field(default_factory=list)
    correction_count: int = 0
    page_count: int = 0
    failed_pages: int = 0
    vlm_task: str = "full_ocr"
    vlm_pages: str = "all"
    vlm_max_pages: int = 0
    report_url: str | None = None
    error: str | None = None


class CorrectionItem(PublicModel):
    field: str
    old_value: Any = ""
    new_value: Any = ""


class CorrectionRequest(PublicModel):
    document_id: str
    corrections: list[CorrectionItem] = Field(default_factory=list)


class CropRectangle(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(ge=2)
    height: float = Field(ge=2)


class ManualCropRequest(PublicModel):
    document_id: str
    page_index: int = Field(ge=0)
    field: str
    rect: CropRectangle


class JobIdsRequest(PublicModel):
    job_ids: list[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    job: JobResponse


class EngineResponse(PublicModel):
    id: str
    label: str
    external: bool = True
    status: str


class MetricsResponse(BaseModel):
    total_jobs: int
    pages: int
    correction_count: int
    error_jobs: int


class LimitsResponse(BaseModel):
    max_files_per_job: int
    max_job_upload_bytes: int


class PaginationResponse(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int


class StateResponse(PublicModel):
    server_mode: bool
    jobs: list[JobResponse]
    documents: list[Any]
    logs: list[Any]
    metrics: MetricsResponse
    ocr_methods: list[EngineResponse]
    limits: LimitsResponse
    pagination: PaginationResponse


class EnginesResponse(BaseModel):
    engines: list[EngineResponse]


class EngineCheckResponse(BaseModel):
    id: str
    status: str
    summary: str


class CorrectionResponse(PublicModel):
    saved_count: int
    job: JobResponse
    document_status: dict[str, Any]


class DeleteItem(BaseModel):
    id: str
    name: str | None = None


class DeletePreviewResponse(BaseModel):
    deletable: list[DeleteItem]
    skipped: list[DeleteItem]


class DeleteResponse(BaseModel):
    deleted: list[str]
    skipped: list[str]
    failed: list[str]


class DiskMetricsResponse(BaseModel):
    used_bytes: int
    total_bytes: int
    free_bytes: int
    percent: float


class GPUDeviceResponse(BaseModel):
    index: int
    name: str
    utilization_percent: float | None
    memory_used_mb: float | None
    memory_total_mb: float | None
    temperature_c: float | None


class GPUMetricsResponse(BaseModel):
    status: Literal["available", "unavailable", "error"]
    devices: list[GPUDeviceResponse] = Field(default_factory=list)


class SystemMetricsResponse(BaseModel):
    cpu_percent: float | None
    memory_percent: float | None
    disk: DiskMetricsResponse | None
    gpu: GPUMetricsResponse | None
