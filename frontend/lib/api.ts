import type { components, operations } from "./api-schema";

type Schemas = components["schemas"];

export type Job = Schemas["JobResponse"];
export type Document = Schemas["DocumentResponse"];
export type Field = Schemas["FieldResponse"];
export type Page = Schemas["PageResponse"];
export type State = Schemas["StateResponse"];
export type SystemMetrics = Schemas["SystemMetricsResponse"];
export type ProviderProfile = Schemas["ProviderProfileResponse"];
export type Documents = Schemas["DocumentsResponse"];
export type Events = Schemas["EventsResponse"];
export type Reports = Schemas["ReportsResponse"];
export type SizingOverview = Schemas["SizingOverviewResponse"];
export type SizingJobs = Schemas["SizingJobsResponse"];
export type SizingJob = Schemas["SizingJobSummary"];
export type SizingOperations = Schemas["SizingOperationsResponse"];
export type SizingCatalog = Schemas["SizingCatalogResponse"];
export type SizingSnapshot = Schemas["SnapshotResponse"];
export type SizingSnapshots = Schemas["SnapshotsResponse"];
export type CodeCatalog = Schemas["CodeCatalogResponse"];
export type CodeEntry = Schemas["CodeEntry"];
export type CodeInput = Schemas["CodeInput"];
export type Artifacts = Schemas["ArtifactsResponse"];
export type Artifact = Schemas["ArtifactEntry"];
export type SourcePdf = Schemas["SourcePdfResponse"];
export type Segment = Schemas["Segment"];

export const ACTIVE_JOB_STATUSES = new Set(["starting", "queued", "running", "cancelling", "segmenting", "awaiting_segmentation_review", "segmentation_confirmed", "extraction_starting"]);
export const TERMINAL_JOB_STATUSES = new Set(["completed", "completed_with_warnings", "error", "cancelled", "interrupted"]);
export const DELETABLE_JOB_STATUSES = new Set(["uploading", "ready", ...TERMINAL_JOB_STATUSES]);

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public detail?: Schemas["ErrorDetail"]) { super(message); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.detail === "object" ? payload.detail as Schemas["ErrorDetail"] : undefined;
    throw new ApiError(detail?.message || String(payload?.detail || `Request failed (${response.status})`), response.status, detail?.code, detail);
  }
  return payload;
}

export const getState = (filters: NonNullable<operations["state_api_state_get"]["parameters"]["query"]> = {}) =>
  request<State>(`/api/state?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString()}`);
export const getJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`);
export const createJob = (payload: Schemas["CreateJobRequest"]) =>
  request<Job>("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const uploadFile = (id: string, file: File) =>
  request<Schemas["UploadResponse"]>(`/api/jobs/${encodeURIComponent(id)}/files?path=${encodeURIComponent(file.name)}`, { method: "PUT", body: file });
export const startJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/start`, { method: "POST" });
export const confirmSegmentation = (id: string, sourceId: string, revision: number, segments: Segment[]) => {
  const body: Schemas["ConfirmSegmentationRequest"] = { revision, segments: segments.map(({ id, logical_document_type, start_page, end_page }) => ({ id, logical_document_type, start_page, end_page })) };
  return request<Job>(`/api/jobs/${encodeURIComponent(id)}/source-pdfs/${encodeURIComponent(sourceId)}/segmentation/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
};
export const continueJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/continue`, { method: "POST" });
export const cancelJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const rerunJob = (id: string, cloudDataConfirmed = false, rerunMode: Schemas["RerunRequest"]["rerun_mode"] = "reuse_segmentation") =>
  request<Job>(`/api/jobs/${encodeURIComponent(id)}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cloud_data_confirmed: cloudDataConfirmed, rerun_mode: rerunMode } satisfies Schemas["RerunRequest"]) });
export const deletePreview = (ids: string[]) =>
  request<Schemas["DeletePreviewResponse"]>("/api/jobs/delete-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: ids } satisfies Schemas["JobIdsRequest"]) });
export const bulkDelete = (ids: string[]) =>
  request<Schemas["DeleteResponse"]>("/api/jobs/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: ids } satisfies Schemas["JobIdsRequest"]) });
export const saveCorrections = (id: string, documentId: string, corrections: Schemas["CorrectionItem"][]) =>
  request<Schemas["CorrectionResponse"]>(`/api/jobs/${encodeURIComponent(id)}/corrections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: documentId, corrections } satisfies Schemas["CorrectionRequest"]) });
export const crop = (id: string, documentId: string, pageIndex: number, field: string, rect: Schemas["CropRectangle"]) =>
  request<Schemas["CropEvidence"]>(`/api/jobs/${encodeURIComponent(id)}/manual-crop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: documentId, page_index: pageIndex, field, rect } satisfies Schemas["ManualCropRequest"]) });
export const checkEngine = (id: string) =>
  request<Schemas["EngineCheckResponse"]>(`/api/engines/${encodeURIComponent(id)}/check`, { method: "POST" });
export const getSystemMetrics = () => request<Schemas["SystemMetricsResponse"]>("/api/system-metrics");
export const getProviderProfiles = () => request<Schemas["ProviderProfilesResponse"]>("/api/provider-profiles");
export const getDocuments = (filters: NonNullable<operations["get_documents_api_documents_get"]["parameters"]["query"]> = {}) =>
  request<Documents>(`/api/documents?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString()}`);
export const getEvents = (filters: NonNullable<operations["get_events_api_events_get"]["parameters"]["query"]> = {}) =>
  request<Events>(`/api/events?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString()}`);
export const getReports = () => request<Reports>("/api/reports");
const sizingQuery = (filters: Record<string, string | number | undefined> = {}) =>
  new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])).toString();
export const getSizingOverview = (filters: Record<string, string | undefined> = {}) => request<SizingOverview>(`/api/sizing/overview?${sizingQuery(filters)}`);
export const getSizingJobs = (page = 1) => request<SizingJobs>(`/api/sizing/jobs?${sizingQuery({ page })}`);
export const getSizingOperations = (jobId: string, filters: Record<string, string | number | undefined> = {}) =>
  request<SizingOperations>(`/api/sizing/jobs/${encodeURIComponent(jobId)}/operations?${sizingQuery(filters)}`);
export const getSizingCatalog = () => request<SizingCatalog>("/api/sizing/catalog");
export const putSizingCatalog = (payload: Schemas["SizingCatalogRequest"]) =>
  request<SizingCatalog>("/api/sizing/catalog", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const calculateSizing = (payload: Schemas["SizingCalculateRequest"]) =>
  request<Schemas["SizingCalculateResponse"]>("/api/sizing/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const getSizingSnapshots = () => request<SizingSnapshots>("/api/sizing/snapshots");
export const createSizingSnapshot = (payload: Schemas["SnapshotCreateRequest"]) =>
  request<SizingSnapshot>("/api/sizing/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const patchSizingSnapshot = (id: string, payload: Schemas["SnapshotPatchRequest"]) =>
  request<SizingSnapshot>(`/api/sizing/snapshots/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const previewSizingSnapshotDelete = (id: string) =>
  request<{ snapshot_id: string; revision: number; checksum: string }>(`/api/sizing/snapshots/${encodeURIComponent(id)}/delete-preview`, { method: "POST" });
export const deleteSizingSnapshot = (id: string, payload: Schemas["DeleteSnapshotRequest"]) =>
  request<void>(`/api/sizing/snapshots/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const previewSizingRetention = (payload: Schemas["RetentionPreviewRequest"]) =>
  request<{ plan_token: string; checksum: string; operation_count: number }>("/api/sizing/retention/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const applySizingRetention = (payload: Schemas["RetentionApplyRequest"]) =>
  request<{ deleted_operations: number }>("/api/sizing/retention/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const getExchangeRateSources = () => request<{ items: { id: string; label: string; currencies: string[]; url: string }[] }>("/api/sizing/exchange-rate-sources");
export const suggestExchangeRate = (sourceId: string) =>
  request<{ items: unknown[] }>(`/api/sizing/exchange-rate-suggestions?source_id=${encodeURIComponent(sourceId)}`, { method: "POST" });
export const getArtifacts = (id: string) => request<Artifacts>(`/api/jobs/${encodeURIComponent(id)}/artifacts`);
export const getCodes = () => request<CodeCatalog>("/api/codes");
export const createCode = (payload: Schemas["CodeInput"]) =>
  request<CodeCatalog>("/api/codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const updateCode = (code: string, payload: Schemas["CodeUpdate"]) =>
  request<CodeCatalog>(`/api/codes/${encodeURIComponent(code)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const deleteCode = (code: string, revision: number) =>
  request<CodeCatalog>(`/api/codes/${encodeURIComponent(code)}?revision=${revision}`, { method: "DELETE" });
