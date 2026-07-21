import type { components } from "./api-schema";

type Schemas = components["schemas"];

export type Job = Schemas["JobResponse"];
export type Document = Schemas["DocumentResponse"];
export type Field = Schemas["FieldResponse"];
export type Page = Schemas["PageResponse"];
export type State = Schemas["StateResponse"];
export type SystemMetrics = Schemas["SystemMetricsResponse"];

export const ACTIVE_JOB_STATUSES = new Set(["starting", "queued", "running", "cancelling"]);
export const TERMINAL_JOB_STATUSES = new Set(["completed", "completed_with_warnings", "error", "cancelled", "interrupted"]);
export const DELETABLE_JOB_STATUSES = new Set(["uploading", "ready", ...TERMINAL_JOB_STATUSES]);

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload?.detail?.message || payload?.detail || `Request failed (${response.status})`, response.status, payload?.detail?.code);
  return payload;
}

export const getState = (filters: { query?: string; status?: string; method?: string; page?: number } = {}) =>
  request<State>(`/api/state?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString()}`);
export const getJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`);
export const createJob = (fileCount: number, uploadName: string, cloudDataConfirmed = false) =>
  request<Job>("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_count: fileCount, upload_name: uploadName, cloud_data_confirmed: cloudDataConfirmed }) });
export const uploadFile = (id: string, file: File) =>
  request<Schemas["UploadResponse"]>(`/api/jobs/${encodeURIComponent(id)}/files?path=${encodeURIComponent(file.name)}`, { method: "PUT", body: file });
export const startJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/start`, { method: "POST" });
export const cancelJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const rerunJob = (id: string, cloudDataConfirmed = false) =>
  request<Job>(`/api/jobs/${encodeURIComponent(id)}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cloud_data_confirmed: cloudDataConfirmed }) });
export const deletePreview = (ids: string[]) =>
  request<Schemas["DeletePreviewResponse"]>("/api/jobs/delete-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: ids }) });
export const bulkDelete = (ids: string[]) =>
  request<Schemas["DeleteResponse"]>("/api/jobs/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: ids }) });
export const saveCorrections = (id: string, documentId: string, corrections: Schemas["CorrectionItem"][]) =>
  request<Schemas["CorrectionResponse"]>(`/api/jobs/${encodeURIComponent(id)}/corrections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: documentId, corrections }) });
export const crop = (id: string, documentId: string, pageIndex: number, field: string, rect: Schemas["CropRectangle"]) =>
  request<Schemas["CropEvidence"]>(`/api/jobs/${encodeURIComponent(id)}/manual-crop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: documentId, page_index: pageIndex, field, rect }) });
export const checkEngine = (id: string) =>
  request<Schemas["EngineCheckResponse"]>(`/api/engines/${encodeURIComponent(id)}/check`, { method: "POST" });
export const getSystemMetrics = () => request<Schemas["SystemMetricsResponse"]>("/api/system-metrics");
