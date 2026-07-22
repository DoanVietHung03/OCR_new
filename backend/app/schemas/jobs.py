from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PublicModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class CreateJobRequest(PublicModel):
    file_count: int = Field(ge=1, le=15)
    upload_name: str = ""
    cloud_data_confirmed: bool = False
    provider_profile_id: str | None = None
    vlm_task: Literal["full_ocr", "metadata"] = "full_ocr"
    vlm_pages: Literal["all", "auto", "first,last"] = "all"
    vlm_max_pages: int = Field(default=0, ge=0, le=100)
    processing_mode: Literal["administrative_document", "dossier_cover", "combined_dossier"] = "administrative_document"

    @model_validator(mode="after")
    def valid_scope(self):
        if self.vlm_task == "full_ocr" and (self.vlm_pages != "all" or self.vlm_max_pages):
            raise ValueError("invalid_vlm_scope")
        return self


class FieldResponse(PublicModel):
    value: Any = ""
    raw_value: Any = ""
    source_text: str = ""
    confidence: float | None = None
    final_confidence: float | None = None
    raw_confidence: float | None = None
    method: str = ""
    bbox: list[float] = Field(default_factory=list)
    page_index: int = 0
    region_label: str = ""
    is_valid: bool | None = None
    needs_review: bool = False
    review_reason: str = ""
    review_context: str = ""
    suggested_value: Any = ""
    suggestion_confidence: float | None = None
    suggestion_reason: str = ""
    suggestions: list[Any] = Field(default_factory=list)
    evidence_candidates: list[Any] = Field(default_factory=list)
    evidence_source: str = ""
    evidence_confidence: float | None = None
    evidence_status: str = ""
    decision_crop_image: str = ""
    crop_image: str = ""
    ocr_value: Any | None = None
    corrected_value: Any | None = None
    corrected_at: str | None = None


class PageResponse(PublicModel):
    page_index: int = 0
    image_url: str = ""
    status: str = ""
    message: str = ""
    ocr_scope: str = ""
    ocr_line_count: int = 0
    avg_score: float | None = None
    text: str = ""
    images: dict[str, str] = Field(default_factory=dict)
    links: dict[str, str] = Field(default_factory=dict)
    quality: dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    source_pdf_id: str | None = None
    source_page_index: int | None = None


class SegmentationPage(PublicModel):
    source_page_index: int
    image_url: str
    classification: Literal["cover", "document_start", "continuation", "blank", "separator", "unclassified"]
    error: str = ""


class Segment(PublicModel):
    id: str = ""
    logical_document_type: Literal["dossier_cover", "administrative_document", "excluded", "unclassified"]
    start_page: int = Field(ge=0)
    end_page: int = Field(ge=0)


class SourcePdfResponse(PublicModel):
    id: str
    file_name: str
    page_count: int = 0
    pages: list[SegmentationPage] = Field(default_factory=list)
    proposal: list[Segment] = Field(default_factory=list)
    confirmed_segments: list[Segment] = Field(default_factory=list)
    revision: int = 0
    confirmed: bool = False


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
    logical_document_type: Literal["dossier_cover", "administrative_document"] | None = None
    source_pdf_id: str | None = None


class JobResponse(PublicModel):
    id: str
    status: str
    created_at: str = ""
    updated_at: str = ""
    started_at: str | None = None
    completed_at: str | None = None
    ocr_method: str = ""
    provider_profile_id: str = ""
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
    processing_mode: Literal["administrative_document", "dossier_cover", "combined_dossier"] | None = None
    source_pdfs: list[SourcePdfResponse] = Field(default_factory=list)
    source_pdf_count: int = 0
    dossier_cover_count: int = 0
    administrative_document_count: int = 0
    excluded_page_count: int = 0
    segmentation_completed_pages: int = 0
    segmentation_total_pages: int = 0


class ConfirmSegmentationRequest(BaseModel):
    revision: int = Field(ge=0)
    segments: list[Segment]


class RerunRequest(BaseModel):
    cloud_data_confirmed: bool = False
    rerun_mode: Literal["reuse_segmentation", "resegment"] = "reuse_segmentation"


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


class ProviderProfileResponse(EngineResponse):
    tasks: list[Literal["full_ocr", "metadata"]]
    page_modes: list[Literal["all", "auto", "first,last"]]
    max_pages: int
    processing_modes: list[Literal["administrative_document", "dossier_cover", "combined_dossier"]]


class ProviderProfilesResponse(BaseModel):
    profiles: list[ProviderProfileResponse]


class MetricsResponse(BaseModel):
    total_jobs: int
    active_jobs: int
    completed_jobs: int
    documents: int
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


class DocumentIndexItem(BaseModel):
    id: str
    job_id: str
    job_status: str
    file_name: str
    status: str
    review_status: str | None = None
    page_count: int
    confidence_average: float | None = None
    document_type: str | None = None
    warning_count: int = 0
    updated_at: str
    deep_link: str


class DocumentsResponse(BaseModel):
    items: list[DocumentIndexItem]
    pagination: PaginationResponse


class SafeEvent(BaseModel):
    timestamp: str
    severity: Literal["info", "warning", "error"]
    category: Literal["lifecycle", "document", "review"]
    code: str
    job_id: str
    provider_profile_id: str | None = None
    document_id: str | None = None
    page_index: int | None = None
    source_pdf_id: str | None = None
    revision: int | None = None
    message: str


class EventsResponse(BaseModel):
    items: list[SafeEvent]
    pagination: PaginationResponse


class ArtifactEntry(BaseModel):
    name: str
    kind: Literal["image", "json", "text", "other"]
    status: Literal["available", "missing", "unknown"] = "available"
    size_bytes: int
    updated_at: str
    document_id: str | None = None
    page_index: int | None = None
    download_url: str


class ArtifactsResponse(BaseModel):
    items: list[ArtifactEntry]


class OperationsReport(BaseModel):
    total_jobs: int
    active_jobs: int
    completed_jobs: int
    error_jobs: int
    documents: int
    pages: int
    duration_seconds_average: float | None = None
    pages_per_minute: float | None = None
    failure_codes: dict[str, int] = Field(default_factory=dict)


class QualityReport(BaseModel):
    documents: int
    approved_documents: int
    corrected_fields: int
    confidence_average: float | None = None
    total_fields: int = 0
    confidence_coverage: float | None = None
    evidence_coverage: float | None = None
    warning_documents: int = 0


class BenchmarkSample(BaseModel):
    provider_profile_id: str
    fixture_group: str
    task: str
    page_scope: str
    sample_size: int = Field(ge=1)
    measured_at: str
    duration_seconds_average: float | None = None
    pages_per_minute: float | None = None
    resource_summary: str = ""


class ReportsResponse(BaseModel):
    operations: OperationsReport
    quality: QualityReport
    benchmark_samples: list[BenchmarkSample]


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


CodeGroup = Literal[
    "reserve_mode", "use_mode", "doc_type", "confidence", "language",
    "retention", "backup_status", "physical_status",
]


class CodeInput(BaseModel):
    group: CodeGroup
    code: str = Field(pattern=r"^[A-Za-z0-9._-]{1,32}$")
    label: str = Field(min_length=1, max_length=200)
    keywords: str = Field(default="", max_length=500)
    order: int = Field(default=0, ge=0, le=10000)
    active: bool = True


class CodeUpdate(BaseModel):
    revision: int = Field(ge=0)
    label: str = Field(min_length=1, max_length=200)
    keywords: str = Field(default="", max_length=500)
    order: int = Field(default=0, ge=0, le=10000)
    active: bool = True


class CodeEntry(CodeInput):
    created_at: str
    updated_at: str


class CodeCatalogResponse(BaseModel):
    revision: int
    items: list[CodeEntry]


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
    power_w: float | None = None
    driver_version: str = ""


class GPUMetricsResponse(BaseModel):
    status: Literal["available", "unavailable", "error"]
    devices: list[GPUDeviceResponse] = Field(default_factory=list)


class CPUMetricsResponse(BaseModel):
    model: str = ""
    physical_cores: int | None = None
    logical_cores: int | None = None
    percent: float | None = None
    load_1m: float | None = None
    load_5m: float | None = None
    load_15m: float | None = None


class MemoryMetricsResponse(BaseModel):
    total_bytes: int
    used_bytes: int
    available_bytes: int
    percent: float


class RuntimeMetricsResponse(BaseModel):
    os_family: str
    architecture: str
    python_version: str


class OperationsMetricsResponse(BaseModel):
    states: dict[str, int] = Field(default_factory=dict)


class SystemMetricsResponse(BaseModel):
    cpu_percent: float | None
    memory_percent: float | None
    cpu: CPUMetricsResponse | None = None
    memory: MemoryMetricsResponse | None = None
    runtime: RuntimeMetricsResponse | None = None
    disk: DiskMetricsResponse | None
    gpu: GPUMetricsResponse | None
    operations: OperationsMetricsResponse | None = None
