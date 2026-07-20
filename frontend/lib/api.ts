export type Job = {
  id: string; status: string; expected_files: number; uploaded_files: number;
  upload_name?: string; documents?: Document[]; correction_count?: number;
  page_count?: number; [key: string]: unknown;
};
export type Document = { id: string; file_name: string; status: string; fields?: Record<string, Field>; pages?: Page[]; [key: string]: unknown };
export type Field = { value?: string; confidence?: number; bbox?: number[]; page_index?: number; [key: string]: unknown };
export type Page = { page_index: number; image_url: string; [key: string]: unknown };
export type State = { jobs: Job[]; metrics: Record<string, number>; ocr_methods: { id: string; label: string; status: string }[]; pagination: { total: number } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.detail?.message || payload?.detail || `Request failed (${response.status})`);
  return payload;
}
export const getState = (query = "") => request<State>(`/api/state?query=${encodeURIComponent(query)}`);
export const getJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`);
export const createJob = (fileCount: number, uploadName: string) => request<Job>("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_count: fileCount, upload_name: uploadName, ocr_method: "qwen" }) });
export const uploadFile = (id: string, file: File) => request<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}/files?path=${encodeURIComponent(file.name)}`, { method: "PUT", body: file });
export const startJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/start`, { method: "POST" });
export const cancelJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const rerunJob = (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}/rerun`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
export const deletePreview = (ids: string[]) => request<{ deletable: { id: string; name: string }[]; skipped: { id: string }[] }>("/api/jobs/delete-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: ids }) });
export const bulkDelete = (ids: string[]) => request<{ deleted: string[] }>("/api/jobs/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: ids }) });
export const saveCorrections = (id: string, documentId: string, corrections: object[]) => request<{ job: Job }>(`/api/jobs/${id}/corrections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: documentId, corrections }) });
export const crop = (id: string, documentId: string, pageIndex: number, field: string, rect: Record<string, number>) => request<{ crop_image: string }>(`/api/jobs/${id}/manual-crop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: documentId, page_index: pageIndex, field, rect }) });
export const checkEngine = (id: string) => request<{ status: string; summary: string }>(`/api/engines/${encodeURIComponent(id)}/check`, { method: "POST" });
export const getSystemMetrics = () => request<{ cpu_percent: number | null; memory_percent: number | null; gpu: unknown }>("/api/system-metrics");
