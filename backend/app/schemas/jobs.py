from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator


class PublicModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


ScalarValue = str | int | float | bool | None
ScalarSuggestion = Annotated[ScalarValue, BeforeValidator(lambda value: "" if isinstance(value, (dict, list)) else value)]
ReviewReason = Annotated[
    Literal["", "low_confidence", "missing_evidence", "validation_warning"],
    BeforeValidator(lambda value: value if isinstance(value, str) and value in {"low_confidence", "missing_evidence", "validation_warning"} else ""),
]
SuggestionSource = Annotated[
    Literal["", "provider"], BeforeValidator(lambda value: "provider" if value == "provider" else ""),
]
EvidenceReason = Annotated[
    Literal["", "bbox_missing", "bbox_invalid", "crop_blank"],
    BeforeValidator(
        lambda value: value
        if isinstance(value, str) and value in {"bbox_missing", "bbox_invalid", "crop_blank"}
        else ""
    ),
]


class CreateJobRequest(RequestModel):
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


class SuggestionResponse(PublicModel):
    value: ScalarSuggestion = ""
    confidence: float | None = None
    reason: str = ""
    source: SuggestionSource = ""


class EvidenceCandidateResponse(PublicModel):
    source_text: str = ""
    page_index: int = Field(default=0, ge=0)
    confidence: float | None = None
    evidence_url: str = ""
    evidence_source: str = ""
    evidence_status: str = ""


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
    review_reason: ReviewReason = ""
    review_context: str = ""
    suggested_value: ScalarSuggestion = ""
    suggestion_confidence: float | None = None
    suggestion_reason: str = ""
    suggestions: list[SuggestionResponse | ScalarValue] = Field(default_factory=list)
    evidence_candidates: list[EvidenceCandidateResponse | ScalarValue] = Field(default_factory=list)
    evidence_source: str = ""
    evidence_confidence: float | None = None
    evidence_status: str = ""
    evidence_reason: EvidenceReason = ""
    decision_crop_image: str = ""
    crop_image: str = ""
    ocr_value: Any | None = None
    corrected_value: Any | None = None
    corrected_at: str | None = None
    evidence_url: str = ""
    suggestion_source: SuggestionSource = ""


class ReviewIssue(BaseModel):
    code: str
    field: str | None = None
    page_index: int | None = None


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
    warnings: list[str] = Field(default_factory=list)
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


class SegmentationSegmentRequest(RequestModel):
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
    expected_fields: list[str] = Field(default_factory=list)
    required_fields: list[str] = Field(default_factory=list)
    approval_blockers: list[ReviewIssue] = Field(default_factory=list)
    review_risks: list[ReviewIssue] = Field(default_factory=list)
    review_risk_count: int = 0
    corrected_artifact: str | None = None


class FailureResponse(BaseModel):
    code: str
    retryable: bool = False
    operator_hint: str = ""
    page_index: int | None = None


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
    related_job_id: str | None = None
    ocr_pass: str | None = None
    duration_seconds: float | None = None
    status: str | None = None
    warning_codes: list[str] = Field(default_factory=list)
    message: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    blockers: list[ReviewIssue] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    detail: ErrorDetail


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
    logs: list[SafeEvent] = Field(default_factory=list)
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
    review_status: Literal["unreviewed", "partially_approved", "approved"] | None = None
    progress_stage: str = ""
    progress_detail: str = ""
    completed_pages: int = 0
    total_pages: int = 0
    failure: FailureResponse | None = None


class ConfirmSegmentationRequest(RequestModel):
    revision: int = Field(ge=0)
    segments: list[SegmentationSegmentRequest]


class RerunRequest(RequestModel):
    cloud_data_confirmed: bool = False
    rerun_mode: Literal["reuse_segmentation", "resegment"] = "reuse_segmentation"


class CorrectionItem(RequestModel):
    field: str
    old_value: Any = ""
    new_value: Any = ""


class CorrectionRequest(RequestModel):
    document_id: str
    corrections: list[CorrectionItem] = Field(default_factory=list)


class CropRectangle(RequestModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(ge=2)
    height: float = Field(ge=2)


class ManualCropRequest(RequestModel):
    document_id: str
    page_index: int = Field(ge=0)
    field: str
    rect: CropRectangle


class JobIdsRequest(RequestModel):
    job_ids: list[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    job: JobResponse


class EngineResponse(PublicModel):
    id: str
    label: str
    external: bool = True
    status: str


class ProviderProfileResponse(EngineResponse):
    model: str
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
    needs_review: bool = False
    has_blocker: bool = False
    has_risk: bool = False
    low_confidence: bool = False
    has_suggestion: bool = False
    has_manual_crop: bool = False
    blocker_count: int = 0
    risk_count: int = 0
    low_confidence_count: int = 0
    suggestion_count: int = 0
    manual_crop_count: int = 0
    target_page_index: int | None = None
    target_field: str | None = None
    updated_at: str
    deep_link: str


class DocumentTriageCounts(BaseModel):
    all: int = 0
    needs_review: int = 0
    blocker: int = 0
    risk: int = 0
    low_confidence: int = 0
    suggestion: int = 0
    manual_crop: int = 0


class DocumentsResponse(BaseModel):
    items: list[DocumentIndexItem]
    pagination: PaginationResponse
    triage_counts: DocumentTriageCounts = Field(default_factory=DocumentTriageCounts)


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
    field: str | None = None
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


class ProfileReport(BaseModel):
    provider_profile_id: str
    operations: OperationsReport
    quality: QualityReport
    recent_errors: list[str] = Field(default_factory=list)


class ReportsResponse(BaseModel):
    operations: OperationsReport
    quality: QualityReport
    profiles: list[ProfileReport]
    benchmark_samples: list[BenchmarkSample] | None = None


class SizingGate(BaseModel):
    minimum_jobs: int = Field(ge=1)
    available: bool = False
    reason: str


class SizingCoverage(BaseModel):
    response_usage_percent: float | None = None
    billing_certainty_percent: float | None = None
    complete_usage_attempts: int = 0
    response_attempts: int = 0
    known_billing_attempts: int = 0
    total_attempts: int = 0


class LatestPriceEstimate(BaseModel):
    value_kind: Literal["estimated_latest_price"]
    profile_id: str
    billing_amount: float = Field(ge=0)
    billing_currency: str
    display_amount: float | None = Field(default=None, ge=0)
    display_currency: str | None = None
    exchange_rate: float | None = Field(default=None, gt=0)
    exchange_source: str | None = None
    exchange_rate_kind: str | None = None
    exchange_source_time: str | None = None
    exchange_fetched_at: str | None = None
    estimated_attempts: int = Field(ge=0)
    coverage_percent: float | None = Field(default=None, ge=0, le=100)
    sensitivity_1_percent: float | None = Field(default=None, ge=0)


class SizingOverviewResponse(BaseModel):
    generated_at: str
    sample_count: int = 0
    operation_count: int = 0
    value_kind: Literal["measured", "calculated", "assumed", "unavailable"]
    coverage: SizingCoverage
    gates: dict[str, SizingGate]
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    duration_ms_p50: float | None = None
    duration_ms_p95: float | None = None
    known_cost: float | None = None
    total_cost: float | None = None
    latest_price_estimate: LatestPriceEstimate | None = None
    unknown_cost_attempts: int = 0
    series: list[dict[str, Any]] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    unit: Literal["attempt", "page", "document", "job", "system"] = "job"
    unit_sample_count: int = 0


class SizingOperation(PublicModel):
    schema_version: int = 1
    operation_id: str
    attempt: int
    scope: Literal["job", "system"]
    job_id: str | None = None
    provider_profile_id: str | None = None
    model: str | None = None
    task: str | None = None
    processing_mode: str | None = None
    source_pdf_id: str | None = None
    document_id: str | None = None
    page_index: int | None = None
    status: str
    started_at: str
    duration_ms: int | None = None
    request_bytes: int
    response_bytes: int | None = None
    http_status: int | None = None
    retryable: bool = False
    usage_status: str
    usage: dict[str, int | None] | None = None


class SizingOperationsResponse(BaseModel):
    items: list[SizingOperation]
    pagination: PaginationResponse


class SizingJobSummary(PublicModel):
    job_id: str
    provider_profile_id: str | None = None
    processing_mode: str | None = None
    operation_count: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    known_cost: float | None = None
    total_cost: float | None = None
    response_usage_percent: float | None = None
    billing_certainty_percent: float | None = None
    started_at: str | None = None


class SizingJobsResponse(BaseModel):
    items: list[SizingJobSummary]
    pagination: PaginationResponse


class SizingDocumentSummary(BaseModel):
    document_id: str
    source_pdf_id: str | None = None
    operation_count: int = 0
    total_tokens: int = 0
    page_count: int = 0


class SizingJobDetailResponse(BaseModel):
    job: SizingJobSummary
    documents: list[SizingDocumentSummary]
    system_overhead_separate: bool = True


class SizingCatalogResponse(BaseModel):
    revision: int
    price_profiles: list[dict[str, Any]]
    workload_profiles: list[dict[str, Any]]
    hardware_profiles: list[dict[str, Any]]


class SizingCatalogRequest(RequestModel):
    revision: int = Field(ge=0)
    price_profiles: list[dict[str, Any]] = Field(default_factory=list)
    workload_profiles: list[dict[str, Any]] = Field(default_factory=list)
    hardware_profiles: list[dict[str, Any]] = Field(default_factory=list)


class PriceSuggestionRequest(RequestModel):
    provider_profile_id: str = Field(min_length=1, max_length=128)
    model: str = Field(min_length=1, max_length=256)
    exchange_source: Literal["vietcombank", "agribank", "vietinbank", "techcombank", "bidv", "ecb"]


class PriceSuggestionResponse(BaseModel):
    provider_profile_id: str
    model: str
    billing_currency: str
    display_currency: str
    input_per_million: float = Field(ge=0)
    output_per_million: float = Field(ge=0)
    cached_per_million: float = Field(ge=0)
    maximum_input_tokens: int | None = Field(default=None, ge=1)
    price_basis: str
    price_source: str
    price_source_url: str
    price_fetched_at: datetime
    exchange_source: str
    exchange_rate: float = Field(gt=0)
    exchange_rate_kind: str
    exchange_source_url: str
    exchange_source_time: str | None = None
    exchange_fetched_at: datetime


class SizingCalculateRequest(RequestModel):
    monthly_jobs: float = Field(gt=0)
    operating_days: float = Field(gt=0, le=31)
    operating_hours: float = Field(gt=0, le=24)
    processing_mode: Literal["administrative_document", "dossier_cover", "combined_dossier"]
    peak_factor: float = Field(default=1, ge=1)
    reserve: float = Field(default=0, ge=0, le=5)
    minimum_success_rate: float = Field(default=.95, gt=0, le=1)
    artifact_retention_days: int = Field(default=30, ge=0)
    average_pages_per_job: float | None = Field(default=None, gt=0)
    average_documents_per_dossier: float | None = Field(default=None, gt=0)
    average_pages_per_document: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def combined_averages(self):
        if self.processing_mode == "combined_dossier" and (
            self.average_documents_per_dossier is None or self.average_pages_per_document is None
        ):
            raise ValueError("combined_dossier_averages_required")
        return self


class SizingCalculateResponse(PublicModel):
    value_kind: Literal["calculated"]
    average_jobs_per_hour: float
    peak_jobs_per_hour: float
    required_capacity_jobs_per_hour: float
    measured_capacity_jobs_per_hour: float | None = None
    theoretical_capacity_units: int | None = None
    capacity_verdict: str
    cost_forecast_available: bool
    estimated_monthly_tokens: float | None = None
    estimated_monthly_known_cost: float | None = None
    latest_price_forecast_available: bool = False
    estimated_monthly_price: LatestPriceEstimate | None = None
    self_host_tco: None = None


class SnapshotCreateRequest(RequestModel):
    name: str = Field(min_length=1, max_length=200)
    inputs: dict[str, Any]
    aggregate: dict[str, Any]
    result: dict[str, Any]
    provenance: dict[str, Any]


class SnapshotPatchRequest(RequestModel):
    revision: int = Field(ge=0)
    archived: bool


class SnapshotResponse(PublicModel):
    id: str
    revision: int
    archived: bool
    created_at: str
    name: str
    inputs: dict[str, Any]
    aggregate: dict[str, Any]
    result: dict[str, Any]
    provenance: dict[str, Any]


class SnapshotsResponse(BaseModel):
    items: list[SnapshotResponse]
    pagination: PaginationResponse
    quota_used: int
    quota_limit: int = 1000


class DeleteSnapshotRequest(RequestModel):
    revision: int = Field(ge=0)
    checksum: str = Field(pattern=r"^[0-9a-f]{64}$")


class RetentionPreviewRequest(RequestModel):
    start_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    include_system: bool = False
    include_rollups: bool = False
    include_pinned_benchmarks: bool = False

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start_date > self.end_date:
            raise ValueError("invalid_date_range")
        return self


class RetentionApplyRequest(RequestModel):
    plan_token: str = Field(pattern=r"^[0-9a-f]{32}$")
    checksum: str = Field(pattern=r"^[0-9a-f]{64}$")


class StateResponse(PublicModel):
    server_mode: bool
    jobs: list[JobResponse]
    documents: list[DocumentResponse]
    logs: list[SafeEvent]
    metrics: MetricsResponse
    ocr_methods: list[EngineResponse]
    limits: LimitsResponse
    pagination: PaginationResponse


class EnginesResponse(BaseModel):
    engines: list[EngineResponse]


class EngineCheckResponse(BaseModel):
    id: str
    status: Literal["not_configured", "unreachable", "reachable", "ready"]
    summary: str
    checked_at: str | None = None
    cached: bool = False


CodeGroup = Literal[
    "reserve_mode", "use_mode", "doc_type", "confidence", "language",
    "retention", "backup_status", "physical_status",
]


class CodeInput(RequestModel):
    group: CodeGroup
    code: str = Field(pattern=r"^[A-Za-z0-9._-]{1,32}$")
    label: str = Field(min_length=1, max_length=200)
    keywords: str = Field(default="", max_length=500)
    order: int = Field(default=0, ge=0, le=10000)
    active: bool = True


class CodeUpdate(RequestModel):
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
