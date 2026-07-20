const DATA = window.INTELLIDOC_DATA || { app: {}, metrics: {}, documents: [], logs: [], jobs: [] };
const I18N = window.IntelliDocI18n || { t: (key) => key, language: () => "en", setLanguage: () => {} };
const t = I18N.t;
if (!Array.isArray(DATA.documents)) DATA.documents = [];
if (!Array.isArray(DATA.logs)) DATA.logs = [];
if (!Array.isArray(DATA.jobs)) DATA.jobs = [];
if (!DATA.pagination) DATA.pagination = { page: 1, page_size: 25, total: DATA.jobs.length, pages: 1 };
if (!Array.isArray(DATA.benchmark_groups)) DATA.benchmark_groups = [];
if (!DATA.operations_report) DATA.operations_report = { by_method: [], errors: [], recent_jobs: [] };
if (!DATA.limits) DATA.limits = { max_files_per_job: 100, max_job_upload_bytes: 1024 ** 3 };
const DEFAULT_OCR_METHODS = [
  { id: "qwen", label: "Qwen VLM" },
  { id: "openai", label: "OpenAI VLM" },
  { id: "paddleocr_vl_1_6", label: "PaddleOCR-VL 1.6" }
];
if (!Array.isArray(DATA.ocr_methods) || !DATA.ocr_methods.length) DATA.ocr_methods = DEFAULT_OCR_METHODS;

const FIELD_LABELS = {
  co_quan_ban_hanh: "Issuing authority",
  so_van_ban: "Document number",
  quoc_hieu_tieu_ngu: "National title / motto",
  dia_diem_ban_hanh: "Place of issue",
  ngay_ban_hanh: "Issue date",
  loai_van_ban: "Document type",
  trich_yeu: "Summary",
  quyen_han_ky_thay: "Signing authority",
  chuc_vu_nguoi_ky: "Signer title",
  nguoi_ky: "Signer name",
  ma_luu_tru: "Archive code",
  document_type: "Document type",
  co_quan_luu_tru: "Archival agency",
  tieu_de_ho_so: "File title",
  nhiem_ky: "Term",
  phong_so: "Fonds",
  muc_luc_so: "Finding aid number",
  ho_so_dvbq: "Administrative file",
  hop_so: "Box number",
  so_tai_lieu: "Document count",
  so_trang: "Page count",
  bat_dau: "Start date",
  ket_thuc: "End date",
  thoi_han_bao_quan: "Retention period"
};

const DOCUMENT_FIELD_ORDER = [
  "co_quan_ban_hanh",
  "quoc_hieu_tieu_ngu",
  "so_van_ban",
  "dia_diem_ban_hanh",
  "ngay_ban_hanh",
  "loai_van_ban",
  "trich_yeu",
  "quyen_han_ky_thay",
  "chuc_vu_nguoi_ky",
  "nguoi_ky",
  "ma_luu_tru"
];

const COVER_FIELD_ORDER = [
  "co_quan_luu_tru",
  "nhiem_ky",
  "tieu_de_ho_so",
  "hop_so",
  "phong_so",
  "muc_luc_so",
  "bat_dau",
  "ho_so_dvbq",
  "ket_thuc",
  "so_tai_lieu",
  "thoi_han_bao_quan",
  "so_trang",
  "ma_luu_tru"
];

const FIELD_DISPLAY_ORDER = [...DOCUMENT_FIELD_ORDER, ...COVER_FIELD_ORDER];
const KNOWN_FIELD_NAMES = new Set(FIELD_DISPLAY_ORDER);

const FIELD_GROUPS = [
  {
    title: "Header",
    fields: DOCUMENT_FIELD_ORDER.slice(0, 5)
  },
  {
    title: "Title and main content",
    fields: DOCUMENT_FIELD_ORDER.slice(5, 7)
  },
  {
    title: "Signature",
    fields: DOCUMENT_FIELD_ORDER.slice(7)
  },
  {
    title: "File information",
    fields: COVER_FIELD_ORDER
  }
];

const CODE_GROUPS = [
  { id: "all", label: "All" },
  { id: "reserve_mode", label: "Backup mode" },
  { id: "use_mode", label: "Access mode" },
  { id: "doc_type", label: "Document type" },
  { id: "confidence", label: "Confidence" },
  { id: "language", label: "Language" },
  { id: "retention", label: "Retention period" },
  { id: "backup_status", label: "Backup status" },
  { id: "physical_status", label: "Physical condition" }
];

const INITIAL_CODES = [
  { id: "reserve_0", group: "reserve_mode", code: "0", label: "No", keywords: "không", order: 0, active: true },
  { id: "reserve_1", group: "reserve_mode", code: "1", label: "Yes", keywords: "có", order: 1, active: true },
  { id: "use_01", group: "use_mode", code: "01", label: "Public", keywords: "công khai", order: 0, active: true },
  { id: "use_02", group: "use_mode", code: "02", label: "Conditional access", keywords: "điều kiện,hạn chế", order: 1, active: true },
  { id: "use_03", group: "use_mode", code: "03", label: "Restricted", keywords: "mật,bí mật", order: 2, active: true },
  { id: "doc_tb", group: "doc_type", code: "TB", label: "NOTICE", keywords: "thông báo,tb", order: 1, active: true },
  { id: "doc_qd", group: "doc_type", code: "QD", label: "DECISION", keywords: "quyết định,qd", order: 2, active: true },
  { id: "doc_cv", group: "doc_type", code: "CV", label: "OFFICIAL LETTER", keywords: "công văn,cv", order: 3, active: true },
  { id: "conf_high", group: "confidence", code: "H", label: "High", keywords: "cao,>=0.9", order: 0, active: true },
  { id: "lang_vi", group: "language", code: "vie", label: "Vietnamese", keywords: "vi,vie,tiếng việt", order: 0, active: true },
  { id: "ret_vv", group: "retention", code: "VV", label: "Permanent", keywords: "vĩnh viễn,vv", order: 0, active: true },
  { id: "phys_good", group: "physical_status", code: "T", label: "Good", keywords: "tốt,rõ", order: 0, active: true }
];

const SERVER_REFRESH_MS = 10000;
const RUNNING_JOB_STATUSES = new Set(["uploading", "ready", "queued", "running", "starting", "cancelling"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "completed_with_warnings", "error", "cancelled", "interrupted"]);
const CANCELLABLE_JOB_STATUSES = new Set(["uploading", "ready", "queued", "running", "cancelling"]);

const state = {
  view: DATA.documents.length ? "manage" : DATA.server_mode ? "jobs" : "upload",
  selectedDocId: DATA.documents[0]?.id || null,
  detailMode: "overview",
  query: "",
  status: "all",
  reviewFilter: "all",
  jobQuery: "",
  jobStatus: "all",
  jobMethod: "all",
  jobPage: Number(DATA.pagination.page || 1),
  selectedJobIds: new Set(),
  deleteModal: null,
  jobActionError: "",
  stateRefreshBusy: false,
  stateRefreshError: "",
  stateLastUpdated: "",
  engineReadiness: {},
  engineCheckBusy: "",
  systemMonitorOpen: false,
  systemMetrics: null,
  systemMetricsError: "",
  resourceUsageModal: null,
  logAction: "all",
  logStatus: "all",
  uploadTab: "zip",
  uploadMethod: DATA.ocr_methods[0]?.id || "qwen",
  uploadVlmTask: "full_ocr",
  uploadVlmPages: "all",
  uploadVlmMaxPages: "0",
  uploadName: "",
  uploadFiles: [],
  uploadJob: null,
  uploadBusy: false,
  uploadError: "",
  showTechnicalLog: false,
  editSaving: false,
  editMessage: "",
  editError: "",
  editResult: null,
  jobState: null,
  cropModal: null,
  cropSelection: null,
  imageModal: null,
  imageModalZoom: "fit",
  zoomField: null,
  codeGroup: "all",
  codeItems: INITIAL_CODES.map((item) => ({ ...item })),
  codeModal: null,
  pageByDoc: {},
  loadedCorrectionUrls: new Set()
};

const app = document.getElementById("app");
let jobSearchTimer = null;
let systemMonitorTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function compact(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function currentJobId() {
  const match = window.location.pathname.match(/^\/jobs\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isRootServerApp() {
  return Boolean(DATA.server_mode) && !currentJobId();
}

function sortJobs(jobs) {
  return [...(jobs || [])].sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
}

function ocrMethodLabel(methodId) {
  const method = DATA.ocr_methods.find((item) => item.id === methodId);
  return method?.label || methodId || "Qwen VLM";
}

function isVlmMethod(methodId) {
  return Boolean(DATA.ocr_methods.find((method) => method.id === methodId));
}

function isExternalMethod(methodId) {
  return Boolean(DATA.ocr_methods.find((method) => method.id === methodId)?.external);
}

function vlmPagesLabel(value) {
  return {
    auto: "auto",
    all: "all pages",
    "first,last": "first and last pages",
    "first-last": "first and last pages"
  }[value] || value || "auto";
}

function vlmTaskLabel(value) {
  return {
    full_ocr: "Full OCR",
    metadata: "Metadata",
    legacy: "Legacy"
  }[value] || "VLM task";
}

function jobVlmLabel(job) {
  if (!isVlmMethod(job?.ocr_method)) return "";
  const maxPages = Number(job?.vlm_max_pages || 0);
  return `VLM ${vlmTaskLabel(job?.vlm_task)} / ${vlmPagesLabel(job?.vlm_pages || "auto")}${maxPages > 0 ? ` / max ${maxPages}` : ""}`;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function upsertJob(job) {
  if (!job?.id) return;
  const index = DATA.jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) DATA.jobs[index] = { ...DATA.jobs[index], ...job };
  else DATA.jobs.unshift(job);
  DATA.jobs = sortJobs(DATA.jobs);
}

function mergeServerState(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.metrics && typeof payload.metrics === "object") DATA.metrics = payload.metrics;
  if (payload.run && typeof payload.run === "object") DATA.run = payload.run;
  if (Array.isArray(payload.ocr_methods) && payload.ocr_methods.length) DATA.ocr_methods = payload.ocr_methods;
  if (Array.isArray(payload.logs)) DATA.logs = payload.logs;
  if (Array.isArray(payload.jobs)) DATA.jobs = sortJobs(payload.jobs);
  if (payload.pagination && typeof payload.pagination === "object") {
    DATA.pagination = payload.pagination;
    state.jobPage = Number(payload.pagination.page || 1);
  }
  if (Array.isArray(payload.benchmark_groups)) DATA.benchmark_groups = payload.benchmark_groups;
  if (payload.operations_report && typeof payload.operations_report === "object") DATA.operations_report = payload.operations_report;
  if (payload.limits && typeof payload.limits === "object") DATA.limits = payload.limits;
  state.selectedJobIds = new Set([...state.selectedJobIds].filter((id) => DATA.jobs.some((job) => job.id === id)));
  if (state.uploadJob?.id) {
    const latestUploadJob = DATA.jobs.find((job) => job.id === state.uploadJob.id);
    if (latestUploadJob) state.uploadJob = latestUploadJob;
  }
  return true;
}

async function refreshServerState({ renderView = true } = {}) {
  if (!isRootServerApp() || state.stateRefreshBusy) return;
  state.stateRefreshBusy = true;
  if (renderView) render();
  try {
    const params = new URLSearchParams({ page: String(state.jobPage || 1), page_size: "25" });
    if (state.jobStatus !== "all") params.set("status", state.jobStatus);
    if (state.jobMethod !== "all") params.set("method", state.jobMethod);
    if (state.jobQuery.trim()) params.set("query", state.jobQuery.trim());
    const response = await fetch(`/api/state?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!mergeServerState(payload)) throw new Error("Invalid server state");
    state.stateRefreshError = "";
    state.stateLastUpdated = new Date().toLocaleTimeString();
    if (!renderView) return;
    if (state.view === "upload") {
      renderPollingUpdate();
    } else if (["jobs", "logs", "report"].includes(state.view)) {
      render();
    }
  } catch (_error) {
    state.stateRefreshError = t("jobs.stale");
    if (renderView) render();
  } finally {
    state.stateRefreshBusy = false;
    if (renderView && ["jobs", "logs", "report"].includes(state.view)) render();
  }
}

async function loadEngineReadiness() {
  if (!DATA.server_mode) return;
  try {
    const response = await fetch("/api/engines", { cache: "no-store" });
    const payload = await response.json();
    state.engineReadiness = Object.fromEntries((payload.engines || []).map((item) => [item.id, item]));
    if (state.view === "upload") render();
  } catch (_error) {
    // Upload remains available; the engine badge stays unchecked.
  }
}

async function checkEngine(method) {
  if (!method || state.engineCheckBusy) return;
  state.engineCheckBusy = method;
  render();
  try {
    const response = await fetch(`/api/engines/${encodeURIComponent(method)}/check`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload.error, `HTTP ${response.status}`));
    state.engineReadiness[method] = payload;
  } catch (error) {
    state.engineReadiness[method] = { id: method, status: "error", summary: error instanceof Error ? error.message : String(error), retryable: true };
  } finally {
    state.engineCheckBusy = "";
    render();
  }
}

function getDoc() {
  return DATA.documents.find((doc) => doc.id === state.selectedDocId) || DATA.documents[0] || null;
}

function canPersistCorrections() {
  return Boolean(currentJobId());
}

function rememberOcrValue(field, value) {
  if (!field || typeof field !== "object") return;
  if (field.ocr_value === undefined) {
    field.ocr_value = String(value ?? field.value ?? "");
  }
}

function applyJobCorrectionState(job) {
  if (!job || typeof job !== "object") return;
  state.jobState = job;
  upsertJob(job);
  const corrected = job.corrected_documents || {};
  DATA.documents.forEach((doc) => {
    const status = corrected[doc.id];
    if (status) {
      doc.dataset_status = { ...status, saved: true };
      if (status.corrected_json_url) doc.corrected_json_url = status.corrected_json_url;
      if (status.review_status?.value) doc.status = status.review_status;
      if (status.approved) markDocumentApproved(doc, status.approved_at || status.last_saved_at);
    }
  });
}

function updateDocumentDatasetStatus(doc, status) {
  if (!doc || !status) return;
  doc.dataset_status = { ...(doc.dataset_status || {}), ...status, saved: true };
  if (status.corrected_json_url) doc.corrected_json_url = status.corrected_json_url;
  if (status.review_status?.value) doc.status = status.review_status;
  if (status.approved) markDocumentApproved(doc, status.approved_at || status.last_saved_at);
  else if (status.approved === false) delete doc.approved_at;
}

function markDocumentApproved(doc, timestamp = "") {
  if (!doc) return;
  doc.status = { value: "approved", label: "Approved" };
  doc.approved_at = timestamp || doc.approved_at || new Date().toISOString();
}

function applyCorrectedDocumentPayload(doc, payload, status = {}) {
  if (!doc || !payload || typeof payload !== "object") return false;
  const correctedFields = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
  const corrections = Array.isArray(payload.corrections) ? payload.corrections : [];
  const datasetSkipped = Array.isArray(payload.dataset?.skipped) ? payload.dataset.skipped : [];
  const correctionByField = new Map();
  corrections.forEach((correction) => {
    if (correction?.field) correctionByField.set(String(correction.field), correction);
  });

  if (!doc.fields || typeof doc.fields !== "object") doc.fields = {};
  doc.correction_records = [...(Array.isArray(doc.correction_records) ? doc.correction_records : []), ...corrections];
  doc.dataset_skip_records = [...(Array.isArray(doc.dataset_skip_records) ? doc.dataset_skip_records : []), ...datasetSkipped];
  let changed = false;
  let resolvedCount = 0;

  Object.entries(correctedFields).forEach(([name, correctedField]) => {
    if (!correctedField || typeof correctedField !== "object") return;
    const current = doc.fields[name] || {};
    const correction = correctionByField.get(name);
    const wasCorrected = Boolean(correction || correctedField.manual_corrected || correctedField.correction_loaded);
    const oldValue = correction?.old_value
      ?? correctedField.ocr_value
      ?? correctedField.correction_old_value
      ?? current.ocr_value
      ?? current.value
      ?? "";
    const newValue = correction?.new_value ?? correctedField.value ?? current.value ?? "";
    if (wasCorrected) rememberOcrValue(current, oldValue);

    const merged = { ...current, ...correctedField };
    if (wasCorrected) {
      resolvedCount += 1;
      merged.ocr_value = String(current.ocr_value ?? oldValue ?? "");
      merged.correction_old_value = String(oldValue ?? "");
      merged.correction_new_value = String(newValue ?? "");
      if (correction) {
        merged.correction_count = Number(current.correction_count || correctedField.correction_count || 0) + 1;
      }
      merged.manual_corrected = true;
      merged.correction_loaded = true;
      merged.needs_review = false;
      merged.is_valid = true;
      if (payload.timestamp && !merged.corrected_at) merged.corrected_at = payload.timestamp;
      if (status.corrected_json_url) merged.corrected_json_url = status.corrected_json_url;
    }
    doc.fields[name] = merged;
    changed = true;
  });

  corrections.forEach((correction) => {
    const name = String(correction?.field || "");
    if (!name || correctedFields[name]) return;
    const field = doc.fields[name];
    if (!field) return;
    rememberOcrValue(field, correction.old_value);
    field.value = correction.new_value ?? field.value ?? "";
    field.correction_old_value = String(correction.old_value ?? "");
    field.correction_new_value = String(correction.new_value ?? "");
    field.correction_count = Number(field.correction_count || 0) + 1;
    field.manual_corrected = true;
    field.correction_loaded = true;
    field.needs_review = false;
    field.is_valid = true;
    if (payload.timestamp && !field.corrected_at) field.corrected_at = payload.timestamp;
    if (status.corrected_json_url) field.corrected_json_url = status.corrected_json_url;
    resolvedCount += 1;
    changed = true;
  });

  if (changed) {
    doc.corrections_loaded = true;
    doc.resolved_field_count = resolvedCount || doc.resolved_field_count || 0;
    if (status.corrected_json_url) doc.corrected_json_url = status.corrected_json_url;
    const reviewStatus = payload.review_status || status.review_status || null;
    if (reviewStatus?.value) doc.status = reviewStatus;
    if (reviewStatus?.value === "approved" || status.approved) {
      markDocumentApproved(doc, status.approved_at || status.last_saved_at || payload.timestamp);
    }
  }
  return changed;
}

async function loadCorrectedDocuments(job) {
  const corrected = job?.corrected_documents || {};
  const tasks = DATA.documents.map(async (doc) => {
    const status = corrected[doc.id];
    const url = status?.corrected_json_url;
    const cacheKey = `${url || ""}#${status?.last_saved_at || ""}:${status?.correction_count || 0}`;
    if (!url || state.loadedCorrectionUrls.has(cacheKey)) return false;
    try {
      const response = await fetch(url);
      if (!response.ok) return false;
      const payload = await response.json();
      state.loadedCorrectionUrls.add(cacheKey);
      return applyCorrectedDocumentPayload(doc, payload, status);
    } catch (_error) {
      return false;
    }
  });
  const results = await Promise.all(tasks);
  return results.some(Boolean);
}

function datasetStatus(doc) {
  const status = doc?.dataset_status || {};
  const datasetCount = Number(status.dataset_sample_count || 0);
  const correctionCount = Number(status.correction_count || 0);
  if (datasetCount > 0) {
    return {
      className: "saved",
      label: `Dataset: ${datasetCount} samples`,
      detail: status.last_saved_at ? `Saved ${status.last_saved_at}` : ""
    };
  }
  if (correctionCount > 0) {
    return {
      className: "saved",
      label: "Corrections saved",
      detail: "No training samples"
    };
  }
  return { className: "pending", label: "Dataset not saved", detail: "" };
}

function renderDatasetBadge(doc, showDetail = false) {
  const status = datasetStatus(doc);
  return `<span class="status ${escapeHtml(status.className)}">${escapeHtml(status.label)}</span>${
    showDetail && status.detail ? `<div class="status-detail">${escapeHtml(status.detail)}</div>` : ""
  }`;
}

async function refreshJobCorrectionState() {
  const jobId = currentJobId();
  if (!jobId) return;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) return;
    const job = await response.json();
    applyJobCorrectionState(job);
    const appliedCorrections = await loadCorrectedDocuments(job);
    if (appliedCorrections) render();
    else renderPollingUpdate();
  } catch (_error) {
    // The report still works as a static page when the server state endpoint is unavailable.
  }
}

function missingField(name, doc = null) {
  const metadataValue = name === "hop_so" ? String(doc?.hop_so || "") : "";
  return {
    name,
    value: metadataValue,
    raw_value: metadataValue,
    confidence: metadataValue ? 1 : 0,
    final_confidence: metadataValue ? 1 : 0,
    method: metadataValue ? "document_metadata" : "missing_display",
    is_valid: Boolean(metadataValue),
    needs_review: !metadataValue,
    review_reason: metadataValue ? "" : "missing_field"
  };
}

function getField(doc, name) {
  if (!doc) return null;
  const fields = doc.fields && typeof doc.fields === "object" ? doc.fields : {};
  return fields[name] || (FIELD_LABELS[name] ? missingField(name, doc) : null);
}

function ensureFieldForEdit(doc, name) {
  if (!doc) return null;
  if (!doc.fields || typeof doc.fields !== "object") doc.fields = {};
  if (!doc.fields[name] && FIELD_LABELS[name]) doc.fields[name] = missingField(name, doc);
  return doc.fields[name] || null;
}

function orderedFieldNames(doc, includeExpected = false, expectedOrder = FIELD_DISPLAY_ORDER) {
  const existing = Object.keys(doc?.fields || {});
  const expected = new Set(expectedOrder);
  const extras = existing.filter((name) => !KNOWN_FIELD_NAMES.has(name) || expected.has(name));
  const names = includeExpected ? [...expectedOrder, ...extras] : existing;
  const seen = new Set();
  return names.filter((name) => {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return includeExpected || Boolean(doc?.fields?.[name]);
  });
}

function documentTypeValue(doc) {
  return String(doc?.document_type?.value || "").trim();
}

function logicalDocumentTypes(doc) {
  return (Array.isArray(doc?.logical_documents) ? doc.logical_documents : [])
    .map((segment) => String(segment?.document_type?.value || "").trim())
    .filter(Boolean);
}

function isCoverOnlyDocument(doc) {
  const types = logicalDocumentTypes(doc);
  if (types.length) return types.every((type) => type === "bia_ho_so");
  return documentTypeValue(doc) === "bia_ho_so";
}

function normalizeDetailMode(mode, doc) {
  if (mode === "edit" || mode === "overview") return mode;
  return mode === "cover" && isCoverOnlyDocument(doc) ? "cover" : "overview";
}

function editFieldContext(doc) {
  return isCoverOnlyDocument(doc) ? "cover" : "document";
}

function editFieldOrder(doc) {
  return editFieldContext(doc) === "cover" ? COVER_FIELD_ORDER : DOCUMENT_FIELD_ORDER;
}

function fieldLabel(name, context = "") {
  if (context === "cover" && name === "tieu_de_ho_so") return "Content";
  return FIELD_LABELS[name] || name;
}

function fieldText(doc, name, fallback = "") {
  const field = getField(doc, name);
  if (!field) return fallback;
  if (looksLikeSerializedFieldPayload(field.value)) {
    const suggestion = bestSuggestion(field);
    return String(suggestion?.value && !looksLikeSerializedFieldPayload(suggestion.value) ? suggestion.value : fallback || "");
  }
  return String(field.value || field.raw_value || field.source_text || fallback || "");
}

function fieldDisplay(field) {
  if (!field) return "-";
  const rawValue = String(field.value || "");
  const payloadLeak = looksLikeSerializedFieldPayload(rawValue);
  const suggestion = payloadLeak ? bestSuggestion(field) : null;
  const value = payloadLeak
    ? String(suggestion?.value && !looksLikeSerializedFieldPayload(suggestion.value) ? suggestion.value : "")
    : rawValue;
  if (value.trim()) return value;
  if (field.needs_review) return "Needs review";
  return "-";
}

function bestSuggestion(field) {
  if (!field) return null;
  if (field.suggested_value) {
    return {
      value: String(field.suggested_value),
      confidence: field.suggestion_confidence,
      reason: field.suggestion_reason || "",
      source: field.suggestion_source || ""
    };
  }
  const suggestions = Array.isArray(field.suggestions) ? field.suggestions : [];
  if (!suggestions.length) return null;
  return suggestions
    .filter((item) => item && item.value)
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
}

function suggestionConfidenceText(suggestion) {
  const value = Number(suggestion?.confidence);
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "";
}

function suggestionReasonLabel(value) {
  return {
    qwen_vlm_alternative_candidate: "alternative from Qwen VLM",
    suggestion_available: "suggestion available",
    box_number_visual_normalization: "visual box-number normalization",
    numeric_visual_normalization: "visual numeric normalization",
    typed_text_spellcheck: "typed-text spellcheck"
  }[value] || "";
}

function suggestionSourceLabel(value) {
  return {
    qwen_vlm: "Qwen VLM",
    openai_vlm: "OpenAI VLM",
    paddleocr_vl_1_6_vlm: "PaddleOCR-VL 1.6",
    typed_text_spellcheck: "typed-text spellcheck"
  }[value] || "";
}

function renderSuggestion(field, name = "") {
  const suggestion = bestSuggestion(field);
  if (!suggestion?.value) return "";
  const meta = [suggestionConfidenceText(suggestion), suggestionReasonLabel(suggestion.reason), suggestionSourceLabel(suggestion.source)].filter(Boolean).join(" · ");
  return `<div class="suggestion-box">
    <span class="mini-pill suggestion-pill">Suggestion</span>
    <b>${escapeHtml(suggestion.value)}</b>
    ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
    ${name ? `<button class="mini-action" tabindex="-1" data-apply-suggestion="${escapeHtml(name)}">Use suggestion</button>` : ""}
  </div>`;
}

function correctionDiffValues(field) {
  if (!field?.manual_corrected && !field?.correction_loaded) return null;
  const oldValue = String(field.ocr_value ?? field.correction_old_value ?? "");
  const newValue = String(field.value ?? field.correction_new_value ?? "");
  if (!oldValue.trim() && !newValue.trim()) return null;
  return { oldValue, newValue };
}

function renderCorrectionDiff(field) {
  const diff = correctionDiffValues(field);
  if (!diff) return "";
  const changed = diff.oldValue !== diff.newValue;
  return `<div class="correction-diff">
    <span class="mini-pill corrected-pill">Resolved</span>
    ${changed ? `<div class="correction-diff-line"><span>OCR</span><del>${nl2br(diff.oldValue || "-")}</del></div>
    <div class="correction-diff-line"><span>Edited</span><ins>${nl2br(diff.newValue || "-")}</ins></div>` : ""}
  </div>`;
}

function cropUrl(field) {
  if (!field) return "";
  return field.decision_crop_image
    || field.crop_image
    || field.decision_raw_crop_image
    || field.raw_crop_image
    || field.region_crop_image
    || field.supporting_crop_image
    || "";
}

function fieldThumbnailUrl(field) {
  const trusted = trustedDecisionCropUrl(field);
  if (trusted) return trusted;
  const evidence = firstEvidenceCropImage(field);
  if (evidence) return evidence;
  const crop = cropUrl(field);
  if (field?.evidence_source === "full_page" || field?.decision_crop_source === "vlm_page_image") return "";
  return crop;
}

function looksLikeSerializedFieldPayload(value) {
  const text = String(value ?? "");
  return FIELD_DISPLAY_ORDER.some((name) => new RegExp(`["']?${name}["']?\\s*:`, "i").test(text));
}

function editValue(field) {
  if (!field) return "";
  if (field.edit_value !== undefined) return field.edit_value;
  const value = String(field.value ?? "");
  const payloadLeak = looksLikeSerializedFieldPayload(value);
  if (value.trim() && !payloadLeak) return value;
  const suggestion = bestSuggestion(field);
  if (suggestion?.value && !looksLikeSerializedFieldPayload(suggestion.value)) return suggestion.value;
  return payloadLeak ? "" : value;
}

function pageImageUrl(page) {
  return page?.images?.normalized_image || page?.images?.original_image || page?.images?.processed_image || page?.images?.layout_overlay || "";
}

function pageForField(doc, field) {
  const fieldPage = Number(field?.page_index);
  if (Number.isFinite(fieldPage)) {
    return (doc.pages || []).find((page) => Number(page.page_index || 0) === fieldPage) || null;
  }
  return selectedPage(doc);
}

function firstEvidenceImage(field) {
  const candidates = Array.isArray(field?.evidence_candidates) ? field.evidence_candidates : [];
  return candidates.find((candidate) => candidate?.image)?.image || "";
}

function firstEvidenceCropImage(field) {
  const candidates = Array.isArray(field?.evidence_candidates) ? field.evidence_candidates : [];
  // ponytail: static source ranking is display-only; replace it with calibrated crop quality when labels exist.
  const statusPriority = { trusted: 4, existing: 3, review_only: 2, weak: 1 };
  const sourcePriority = {
    manual_crop: 100,
    ocr_match: 90,
    field_resolver: 70,
    visual_ink: 60,
    layout_prior: 50,
    full_page: 0
  };
  const ranked = candidates
    .filter((candidate) => candidate?.image && candidate.source !== "full_page")
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const a = left.candidate;
      const b = right.candidate;
      return Number(statusPriority[b.status] || 2) - Number(statusPriority[a.status] || 2)
        || Number(sourcePriority[b.source] || 40) - Number(sourcePriority[a.source] || 40)
        || Number(b.confidence || 0) - Number(a.confidence || 0)
        || left.index - right.index;
    });
  return ranked[0]?.candidate?.image || "";
}

function layoutPreviewUrl(doc, field) {
  const page = pageForField(doc, field);
  return page?.images?.layout_overlay || field?.region_crop_image || firstEvidenceImage(field) || cropUrl(field) || "";
}

function trustedDecisionCropUrl(field) {
  const crop = cropUrl(field);
  if (!crop) return "";
  if (field?.manual_crop || field?.decision_crop_source === "manual_crop") return crop;
  if (field?.evidence_status === "weak" || field?.evidence_status === "review_only") return "";
  if (field?.evidence_source === "full_page" || field?.decision_crop_source === "vlm_page_image") return "";
  return crop;
}

function evidenceSourceLabel(value) {
  return {
    manual_crop: "manual crop",
    ocr_match: "OCR match",
    visual_ink: "ink region",
    field_resolver: "field resolver",
    layout_prior: "layout prior",
    full_page: "full page",
    vlm_layout_prior: "layout prior",
    vlm_visual_ink: "ink region"
  }[value] || "evidence source";
}

function evidenceStatusLabel(value) {
  return {
    trusted: "trusted",
    review_only: "review only",
    weak: "weak",
    existing: "existing"
  }[value] || (value ? "unknown" : "");
}

function renderEvidenceChips(field) {
  const chips = [];
  if (field?.evidence_source) {
    const confidence = Number(field.evidence_confidence);
    const suffix = Number.isFinite(confidence) ? ` ${Math.round(confidence * 100)}%` : "";
    chips.push(`<span class="evidence-chip ${escapeHtml(field.evidence_status || "")}">${escapeHtml(evidenceSourceLabel(field.evidence_source) + suffix)}</span>`);
  }
  const candidates = Array.isArray(field?.evidence_candidates) ? field.evidence_candidates : [];
  candidates.slice(0, 4).forEach((candidate) => {
    const label = evidenceSourceLabel(candidate?.source);
    const status = evidenceStatusLabel(candidate?.status);
    const text = status ? `${label} / ${status}` : label;
    chips.push(candidate?.image
      ? `<a class="evidence-chip ${escapeHtml(candidate.status || "")}" href="${escapeHtml(candidate.image)}" target="_blank">${escapeHtml(text)}</a>`
      : `<span class="evidence-chip ${escapeHtml(candidate?.status || "")}">${escapeHtml(text)}</span>`);
  });
  if (!chips.length) return "";
  return `<div class="evidence-chips">${chips.join("")}</div>`;
}

function renderEvidenceWarning(field) {
  if (field?.evidence_status === "weak" || field?.evidence_status === "review_only" || field?.evidence_source === "full_page" || field?.decision_crop_source === "vlm_page_image") {
    return `<div class="evidence-warning">This crop is weak or review-only. Select a manual crop before correcting the field.</div>`;
  }
  return "";
}

function visualLabel(type) {
  return {
    typed_text: "typed text",
    handwriting_or_signature: "handwriting/signature",
    stamp: "stamp",
    mixed_signature_stamp: "signature + stamp",
    empty_or_background: "empty/background",
    unknown: "unknown"
  }[type] || "unknown";
}

function isDatasetVisualCandidate(field) {
  const flags = field?.visual_flags || [];
  return ["handwriting_or_signature", "stamp", "mixed_signature_stamp"].includes(field?.visual_type)
    || flags.includes("dataset_candidate_visual");
}

function visualBadge(field) {
  if (!field?.visual_type) return "";
  const candidate = isDatasetVisualCandidate(field);
  const warning = (field.visual_flags || []).includes("crop_may_miss_colored_ink");
  const confidence = Number(field.visual_confidence);
  const suffix = Number.isFinite(confidence) ? ` ${Math.round(confidence * 100)}%` : "";
  return `<span class="mini-pill visual-pill ${candidate ? "candidate" : ""} ${warning ? "warning" : ""}">${escapeHtml(visualLabel(field.visual_type) + suffix)}</span>`;
}

function confidenceText(field) {
  const value = Number(field?.confidence);
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function confidenceLevel(field) {
  const value = Number(field?.confidence);
  if (!Number.isFinite(value)) return "unknown";
  if (value < 0.6) return "low";
  if (value < 0.75) return "warning";
  return "good";
}

function confidenceLabel(level) {
  return {
    low: "High risk",
    warning: "Needs review",
    good: "Trusted",
    unknown: "No score"
  }[level] || "No score";
}

const SOFT_REVIEW_REASONS = new Set(["suggestion_available"]);
const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.8;

function isResolvedField(field) {
  return Boolean(field?.manual_corrected || field?.correction_loaded);
}

function fieldReviewReason(field) {
  return String(field?.review_reason || field?.validation_reason || "").trim();
}

function reviewReasonLabel(value) {
  const reason = String(value || "").trim().toLowerCase();
  if (!reason) return "";
  if (reason === "suggestion_available") return "Suggestion available";
  if (reason.includes("low_confidence")) return "Low confidence";
  if (reason.includes("archive_code")) return "Archive code needs review";
  if (reason.includes("document_number")) return "Document number needs review";
  if (reason.includes("issue_date") || reason.startsWith("date_")) return "Issue date needs review";
  if (reason.includes("document_type")) return "Document type needs review";
  if (reason.includes("signing_authority")) return "Signing authority needs review";
  if (reason.includes("signer_role")) return "Signer title needs review";
  if (reason.includes("signer_name")) return "Signer name needs review";
  if (reason.includes("signature") || reason.includes("seal")) return "Signature or stamp needs review";
  if (reason.includes("handwrit")) return "Handwriting needs review";
  if (/(crop|layout|geometry|evidence)/.test(reason)) return "Crop or layout needs review";
  if (/(vlm|qwen|openai|paddleocr_vl)/.test(reason)) return "VLM output needs review";
  if (reason.includes("text_layer")) return "Text layer needs review";
  if (reason.includes("missing") || reason.includes("unreadable")) return "Missing or unreadable data";
  if (reason.includes("suggestion")) return "Suggestion available";
  return "Needs review";
}

function fieldReviewSignals(field) {
  const signals = Array.isArray(field?.review_signals) ? field.review_signals : [];
  return signals.map((signal) => String(signal || "").trim()).filter(Boolean);
}

function isSoftReviewReason(reason) {
  return SOFT_REVIEW_REASONS.has(String(reason || "").trim());
}

function fieldConfidenceValue(field) {
  const value = Number(field?.final_confidence ?? field?.confidence);
  return Number.isFinite(value) ? value : NaN;
}

function hasFieldSuggestion(field) {
  return Boolean(bestSuggestion(field)?.value || field?.suggested_value);
}

function hasManualCropPending(field) {
  if (isResolvedField(field)) return false;
  return Boolean(field?.manual_crop || field?.crop_method === "manual" || field?.decision_crop_source === "manual_crop");
}

function hasBlockingReviewReason(field) {
  const reason = fieldReviewReason(field);
  if (reason && !isSoftReviewReason(reason)) return true;
  if (field?.is_valid === false) return true;
  return fieldReviewSignals(field).some((signal) => !isSoftReviewReason(signal));
}

function hasLowConfidenceReview(field) {
  if (isResolvedField(field)) return false;
  const reason = fieldReviewReason(field);
  const confidence = fieldConfidenceValue(field);
  if (reason.includes("low_confidence")) return true;
  if (isSoftReviewReason(reason)) return false;
  return Number.isFinite(confidence) && confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD;
}

function hasTrueReviewRisk(field) {
  if (isResolvedField(field)) return false;
  if (hasManualCropPending(field)) return true;
  if (hasLowConfidenceReview(field)) return true;
  if (hasBlockingReviewReason(field)) return true;
  return Boolean(field?.needs_review && !isSoftReviewReason(fieldReviewReason(field)));
}

function hasSuggestionOnlyReview(field) {
  if (isResolvedField(field)) return false;
  const reason = fieldReviewReason(field);
  return Boolean((hasFieldSuggestion(field) || isSoftReviewReason(reason)) && !hasTrueReviewRisk(field));
}

function fieldReviewTags(field) {
  return {
    risk: hasTrueReviewRisk(field),
    suggestionOnly: hasSuggestionOnlyReview(field),
    manualCrop: hasManualCropPending(field),
    lowConfidence: hasLowConfidenceReview(field)
  };
}

function documentReviewStats(doc) {
  const stats = { risk: 0, suggestionOnly: 0, manualCrop: 0, lowConfidence: 0 };
  Object.values(doc?.fields || {}).forEach((field) => {
    const tags = fieldReviewTags(field);
    if (tags.risk) stats.risk += 1;
    if (tags.suggestionOnly) stats.suggestionOnly += 1;
    if (tags.manualCrop) stats.manualCrop += 1;
    if (tags.lowConfidence) stats.lowConfidence += 1;
  });
  return stats;
}

function documentWorkflowStatus(doc) {
  const base = doc?.status || {};
  const stats = documentReviewStats(doc);
  const savedCorrection = Boolean(
    doc?.approved_at
    || doc?.corrections_loaded
    || doc?.dataset_status?.saved
    || Number(doc?.dataset_status?.correction_count || 0) > 0
  );
  if (base.value === "approved" || doc?.approved_at) {
    return { value: "approved", label: "Approved" };
  }
  if (base.value !== "error" && stats.risk > 0) {
    return { value: "dang_duyet", label: "Under review" };
  }
  if ((base.value === "dang_duyet" || savedCorrection) && stats.risk === 0) {
    return { value: "approved", label: "Approved" };
  }
  return {
    value: base.value || "pending",
    label: {
      pending: "Pending",
      processing: "Processing",
      draft: "Draft",
      dang_duyet: "Under review",
      approved: "Approved",
      error: "Error"
    }[base.value] || base.label || "Unknown"
  };
}

function effectiveMetrics() {
  const metrics = { ...(DATA.metrics || {}) };
  let reviewItems = 0;
  let suggestionItems = 0;
  DATA.documents.forEach((doc) => {
    const stats = documentReviewStats(doc);
    reviewItems += stats.risk;
    suggestionItems += stats.suggestionOnly;
  });
  metrics.review_items = reviewItems;
  metrics.suggestion_items = suggestionItems;
  return metrics;
}

function documentMatchesReviewFilter(doc) {
  const stats = documentReviewStats(doc);
  if (state.reviewFilter === "risk") return stats.risk > 0;
  if (state.reviewFilter === "suggestion") {
    return stats.suggestionOnly > 0 && stats.risk === 0 && stats.manualCrop === 0 && stats.lowConfidence === 0;
  }
  if (state.reviewFilter === "manual_crop") return stats.manualCrop > 0;
  if (state.reviewFilter === "low_confidence") return stats.lowConfidence > 0;
  return true;
}

function renderFieldReviewBadge(field) {
  const tags = fieldReviewTags(field);
  if (isResolvedField(field)) return `<span class="status saved">Resolved</span>`;
  if (tags.manualCrop) return `<span class="status review">Manual crop review</span>`;
  if (tags.lowConfidence) return `<span class="status review">Low confidence</span>`;
  if (tags.risk) return `<span class="status review">Review risk</span>`;
  if (tags.suggestionOnly) return `<span class="status suggestion">Suggestion only</span>`;
  return `<span class="status success">Valid</span>`;
}

function renderReviewTriageBadge(doc) {
  const stats = documentReviewStats(doc);
  const chips = [];
  if (stats.risk) chips.push(`<span class="status review">Review risk ${stats.risk}</span>`);
  if (stats.manualCrop) chips.push(`<span class="status review">Manual crop ${stats.manualCrop}</span>`);
  if (stats.lowConfidence) chips.push(`<span class="status review">Low confidence ${stats.lowConfidence}</span>`);
  if (stats.suggestionOnly) chips.push(`<span class="status suggestion">Suggestions ${stats.suggestionOnly}</span>`);
  if (!chips.length) chips.push(`<span class="status success">Valid</span>`);
  return `<div class="triage-badges">${chips.join("")}</div>`;
}

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

const DEFAULT_PROGRESS_STAGES = [
  { id: "input_extraction", label: "Prepare files" },
  { id: "render_pages", label: "Render pages" },
  { id: "layout", label: "Layout analysis" },
  { id: "ocr", label: "OCR" },
  { id: "extraction", label: "Field extraction" },
  { id: "validation", label: "Validation" },
  { id: "retry", label: "Retry" },
  { id: "web", label: "Web report" }
];

function fallbackProgressStage(percent, status = "") {
  if (status === "completed" || status === "completed_with_warnings") return "completed";
  if (status === "error") return "error";
  if (percent <= 0) return "starting";
  if (percent < 10) return "input_extraction";
  if (percent < 24) return "render_pages";
  if (percent < 46) return "layout";
  if (percent < 78) return "ocr";
  if (percent < 87) return "extraction";
  if (percent < 94) return "validation";
  if (percent < 98) return "retry";
  return "web";
}

function progressStageLabel(stage) {
  return {
    upload: "Upload",
    ready: "Ready",
    starting: "Starting pipeline",
    input_extraction: "Prepare files",
    render_pages: "Render pages",
    layout: "Layout analysis",
    ocr: "OCR",
    vlm_inference: "VLM inference",
    extraction: "Field extraction",
    validation: "Validation",
    retry: "Retry",
    web: "Web report",
    completed: "Completed",
    completed_with_warnings: "Completed with warnings",
    error: "Error"
  }[stage] || "Processing";
}

function renderProgressBar(job) {
  const percent = clampProgress(job?.progress_percentage);
  const stage = String(job?.progress_stage || fallbackProgressStage(percent, job?.status));
  const phase = progressStageLabel(job?.status === "completed_with_warnings" && stage === "completed" ? "completed_with_warnings" : stage);
  const completedPages = Math.max(0, Number(job?.progress_completed_pages || 0));
  const totalPages = Math.max(0, Number(job?.progress_total_pages || 0));
  const completedDocs = Math.max(0, Number(job?.progress_completed_documents || 0));
  const totalDocs = Math.max(0, Number(job?.progress_total_documents || 0));
  const detailParts = [];
  if (job?.progress_stage_detail) detailParts.push(localizeProgressDetail(job.progress_stage_detail));
  const pageStage = ["render_pages", "layout", "ocr", "vlm_inference", "extraction", "validation", "retry", "web", "completed"].includes(stage);
  if (!job?.progress_stage_detail && totalDocs > 1) {
    detailParts.push(`${Math.min(completedDocs, totalDocs)}/${totalDocs} documents`);
  } else if (!job?.progress_stage_detail && pageStage && totalPages) {
    detailParts.push(`${Math.min(completedPages, totalPages)}/${totalPages} pages`);
  }
  const detailLabel = detailParts.length ? `<small>${escapeHtml(detailParts.join(" · "))}</small>` : "";
  const segments = Array.isArray(job?.progress_stages) && job.progress_stages.length
    ? job.progress_stages
    : DEFAULT_PROGRESS_STAGES;
  const activeIndex = segments.findIndex((item) => item.id === stage);
  return `<div class="progress-card">
    <div class="progress-head">
      <span class="progress-title"><span>${escapeHtml(phase)}</span>${detailLabel}</span>
      <b>${percent}%</b>
    </div>
    <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
      <div class="progress-fill" style="width:${percent}%"></div>
    </div>
    <div class="progress-phases">
      ${segments.map((item, index) => {
        const done = stage === "completed" || job?.status === "completed_with_warnings" || (activeIndex >= 0 && index < activeIndex);
        const active = item.id === stage;
        return `<span class="${done ? "done" : active ? "active" : ""}">${escapeHtml(progressStageLabel(item.id))}</span>`;
      }).join("")}
    </div>
  </div>`;
}

function statusClass(value) {
  return String(value || "").replace(/_/g, "-");
}

function jobStatusLabel(value) {
  return {
    uploading: "Uploading",
    ready: "Ready",
    queued: "Queued",
    running: "Running OCR",
    cancelling: "Cancelling",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
    completed: "Completed",
    completed_with_warnings: "Completed with warnings",
    error: "Error",
    starting: "Starting"
  }[value] || (value ? "Unknown" : "-");
}

function jobShortId(job) {
  const value = String(job?.id || "").replace(/^job_/, "");
  return value.length > 32 ? `${value.slice(0, 23)}…${value.slice(-6)}` : value;
}

function jobDisplayName(job) {
  return String(job?.display_name || jobShortId(job) || "OCR job");
}

function localizeJobLogLine(value) {
  return String(value || "")
    .replace("Bắt đầu quy trình OCR.", "Starting OCR pipeline.")
    .replace("Bắt đầu OCR pipeline.", "Starting OCR pipeline.")
    .replace("Bộ máy OCR:", "OCR engine:")
    .replace("Đang chuẩn hóa kết quả VLM.", "Normalizing VLM output for web report.")
    .replace("Chuan hoa ket qua VLM sang web report.", "Normalizing VLM output for web report.")
    .replace("Bắt đầu trích xuất trường từ kết quả VLM.", "Starting field extraction from VLM output.")
    .replace("Bat dau field extraction tu ket qua VLM.", "Starting field extraction from VLM output.")
    .replace("Đã tạo báo cáo web.", "Created web report.")
    .replace("Da tao web report.", "Created web report.")
    .replace("Đã ghi kết quả tại:", "Wrote outputs to:")
    .replace("Đã ghi trường cuối tại:", "Wrote final fields to:")
    .replace(/Đã ghi trường cuối cho (\d+) hồ sơ\./, "Wrote final fields for $1 document(s).")
    .replace("Không có kết quả trang siêu dữ liệu đạt chuẩn nghiêm ngặt; đang xuất báo cáo một phần kèm cảnh báo.", "No strict-ok metadata page result; publishing partial report with warnings.")
    .replace("Không có kết quả trang OCR toàn văn đạt chuẩn nghiêm ngặt; đang xuất báo cáo một phần kèm cảnh báo.", "No strict-ok full_ocr page result; publishing partial report with warnings.")
    .replace("Không tạo được kết quả trang siêu dữ liệu có thể sử dụng.", "No usable metadata page result was produced.")
    .replace("Không tạo được kết quả trang OCR toàn văn có thể sử dụng.", "No usable full_ocr page result was produced.")
    .replace("Kết quả trường:", "Field output:")
    .replace("Kết quả cuối:", "Final output:")
    .replace("Báo cáo web:", "Web report:")
    .replace("Chạy lại từ ", "Rerun from ")
    .replace("Rerun tu ", "Rerun from ")
    .replace("Đã lưu vùng cắt thủ công", "Saved manual crop")
    .replace("Đã lưu crop thủ công", "Saved manual crop")
    .replace("Quy trình thiếu thành phần phụ thuộc OCR/bố cục:", "Pipeline is missing OCR/layout dependencies:")
    .replace("Pipeline bị thiếu dependency OCR/layout:", "Pipeline is missing OCR/layout dependencies:")
    .replace("Quy trình kết thúc với mã ", "Pipeline exited with code ")
    .replace("Pipeline kết thúc với mã ", "Pipeline exited with code ")
    .replace(" Lần chạy mới nhất:", " Latest run:")
    .replace(" Run mới nhất:", " Latest run:");
}

function localizeProgressDetail(value) {
  const normalized = String(value || "")
    .replace("Đang chuẩn bị tệp đã tải lên", "Preparing uploaded files")
    .replace(/^Đang giải nén /, "Extracting ")
    .replace(/^Đã giải nén /, "Extracted ")
    .replace("Tệp đã tải lên sẵn sàng", "Uploaded files ready")
    .replace(/^Đang chạy /, "Running ")
    .replace(/^chạy lại từ /, "rerun from ");
  const rendering = normalized.match(/^(\d+) pages rendered · determining total$/);
  return rendering ? t("progress.rendering_unknown", { count: rendering[1] }) : normalized;
}

function apiErrorMessage(value, fallback) {
  const message = String(value || "").replace(/^(ValueError|RuntimeError):\s*/, "");
  return {
    job_not_found: "Job not found.",
    invalid_ocr_method: "Invalid OCR engine.",
    invalid_path: "Invalid file path.",
    content_length_required: "Content-Length is required.",
    request_too_large: "The request is too large.",
    upload_incomplete: "The upload was interrupted and discarded.",
    unsupported_file: "Unsupported or invalid PDF/image file.",
    unsafe_archive: "The ZIP archive is unsafe or contains unsupported files.",
    job_quota_exceeded: "This upload exceeds the job quota.",
    insufficient_storage: "The server does not have enough free storage.",
    duplicate_upload_path: "A file with this path was already uploaded.",
    job_already_terminal: "This job is already finished; create a rerun instead.",
    job_not_terminal: "Cancel this job and wait for it to finish before deleting it.",
    job_delete_failed: "The server could not delete this job.",
    cloud_vlm_disabled: "This external VLM provider is disabled by the administrator.",
    cloud_data_confirmation_required: "Confirm external data processing before starting this job.",
    not_found: "Resource not found.",
    "Không tìm thấy ảnh trang trong tác vụ này.": "Page image was not found in this job.",
    "Page image was not found in this job.": "Page image was not found in this job.",
    "Khung vùng cắt không hợp lệ.": "Invalid crop rectangle.",
    "Invalid crop rectangle.": "Invalid crop rectangle.",
    "Khung vùng cắt quá nhỏ.": "Crop rectangle is too small.",
    "Crop rectangle is too small.": "Crop rectangle is too small.",
    "Trường này không hỗ trợ chọn vùng cắt thủ công.": "This field does not support manual cropping.",
    "Unsupported field for manual crop.": "This field does not support manual cropping.",
    "This field does not support manual cropping.": "This field does not support manual cropping.",
    "Danh sách chỉnh lý không hợp lệ.": "Corrections must be a list.",
    "Corrections must be a list.": "Corrections must be a list.",
    "Không tìm thấy tệp kết quả gốc của hồ sơ này.": "Raw final artifact was not found for this document.",
    "Raw final artifact was not found for this document.": "Raw final artifact was not found for this document.",
    "Thư mục tệp tải lên của tác vụ nguồn không hợp lệ.": "Source job upload directory is invalid.",
    "invalid source upload directory": "Source job upload directory is invalid.",
    "Không tìm thấy thư mục tệp tải lên của tác vụ nguồn.": "Source job upload directory was not found.",
    "source upload directory not found": "Source job upload directory was not found."
  }[message] || message || fallback;
}

function uploadSelectionName(files) {
  if (!files.length) return "";
  const firstPath = String(files[0]?.webkitRelativePath || files[0]?.name || "");
  if (files.length > 1) {
    const root = firstPath.split(/[\\/]/)[0];
    return root ? `${root} (${files.length} files)` : `${files.length} files`;
  }
  return files[0]?.name || firstPath || "";
}

function formatJobTime(value) {
  const raw = String(value || "");
  if (!raw) return "-";
  return raw.replace("T", " ").slice(0, 19);
}

function parseJobTimeMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function legacyJobDurationMs(job, allowRunning = false) {
  const start = parseJobTimeMs(job?.started_at);
  if (start === null) return null;
  const finished = parseJobTimeMs(job?.finished_at);
  const running = allowRunning && RUNNING_JOB_STATUSES.has(String(job?.status || ""));
  const end = finished ?? (running ? Date.now() : null);
  if (end === null || end <= start) return null;
  return end - start;
}

function hasTimingSchema(job) {
  return Number(job?.timings?.schema_version || 0) === 1;
}

function jobDurationMs(job, allowRunning = false) {
  const duration = Number(job?.timings?.e2e?.duration_ms || 0);
  if (hasTimingSchema(job) && duration > 0) return duration;
  return legacyJobDurationMs(job, allowRunning);
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

function formatSecondsPerPage(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s/page`;
  return `${(seconds / 60).toFixed(1)}m/page`;
}

function strictModuleBenchmark(job) {
  if (!hasTimingSchema(job)) return null;
  const benchmark = job?.timings?.benchmark || {};
  const profile = job?.benchmark_profile || {};
  const duration = Number(benchmark.duration_ms || 0);
  const pages = Math.max(0, Number(benchmark.pages || 0), Number(profile.page_count || 0));
  if (!duration || !pages) return null;
  const secondsPerPage = Number(benchmark.seconds_per_page || 0) || duration / 1000 / pages;
  return { duration, pages, secondsPerPage, metric: benchmark.metric || "standardized_pipeline" };
}

function jobTimingSummary(job, allowRunning = false) {
  const e2eDuration = jobDurationMs(job, allowRunning);
  const moduleBenchmark = strictModuleBenchmark(job);
  return {
    e2eDuration,
    moduleDuration: moduleBenchmark?.duration || null,
    modulePages: moduleBenchmark?.pages || 0,
    moduleSecondsPerPage: moduleBenchmark?.secondsPerPage || null
  };
}

function benchmarkableJobs() {
  return (DATA.jobs || []).filter((job) => {
    const profileKey = String(job?.benchmark_profile?.profile_key || "");
    return ["completed", "completed_with_warnings"].includes(job?.status) && profileKey && strictModuleBenchmark(job);
  });
}

function benchmarkProfileLabel(profile) {
  const groupJob = (DATA.jobs || []).find((job) => String(job.id || "") === String(profile?.group_id || ""));
  const group = String(profile?.dataset_label || "").trim()
    || (groupJob ? jobDisplayName(groupJob) : jobShortId({ id: profile?.group_id || "" }) || "-");
  const pages = profile?.pages || "-";
  const dpi = Number(profile?.dpi || 0) || "-";
  const pageCount = Number(profile?.page_count || 0) || "-";
  return `Set ${group} / pages=${pages} / dpi=${dpi} / ${pageCount} pages`;
}

function jobBenchmarkGroups() {
  if (Array.isArray(DATA.benchmark_groups) && DATA.benchmark_groups.length) {
    return DATA.benchmark_groups.map((group) => ({
      ...group,
      methods: (group.methods || []).map((item) => ({
        ...item,
        duration: Number(item.duration_ms || 0),
        e2eDuration: Number(item.e2e_duration_ms || 0),
        secondsPerPage: Number(item.seconds_per_page || 0) || null
      }))
    }));
  }
  const methodOrder = new Map(DATA.ocr_methods.map((method, index) => [method.id, index]));
  const groups = new Map();
  benchmarkableJobs().forEach((job) => {
    const profile = job.benchmark_profile || {};
    const profileKey = String(profile.profile_key || "");
    const benchmark = strictModuleBenchmark(job);
    if (!profileKey || !benchmark) return;
    if (!groups.has(profileKey)) {
      groups.set(profileKey, { profile, jobs: 0, pages: benchmark.pages, methods: new Map() });
    }
    const group = groups.get(profileKey);
    group.jobs += 1;
    const method = String(job.ocr_method || "qwen");
    const current = group.methods.get(method) || { method, jobs: 0, pages: 0, duration: 0, e2eDuration: 0, resourceUsage: null };
    current.jobs += 1;
    current.pages += benchmark.pages;
    current.duration += benchmark.duration;
    current.e2eDuration += jobDurationMs(job) || 0;
    current.resourceUsage ||= job.resource_usage || null;
    group.methods.set(method, current);
  });
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      methods: Array.from(group.methods.values())
        .map((item) => ({ ...item, resource_usage: item.resourceUsage, secondsPerPage: item.pages ? item.duration / 1000 / item.pages : null }))
        .sort((a, b) => (methodOrder.get(a.method) ?? 999) - (methodOrder.get(b.method) ?? 999)),
      valid: group.methods.size >= 2
    }));
}

function renderBenchmarkPanel() {
  const groups = jobBenchmarkGroups();
  const validGroups = groups.filter((group) => group.valid);
  const rows = groups.map((group, groupIndex) => {
    const status = group.valid ? "Ready to compare" : "Need two completed modules with the same configuration";
    const header = `<tr class="benchmark-group-row ${group.valid ? "" : "pending"}"><td colspan="6"><b>${escapeHtml(benchmarkProfileLabel(group.profile))}</b><span>${escapeHtml(status)}</span></td></tr>`;
    const methodRows = group.methods.map((item, methodIndex) => `<tr>
      <td></td>
      <td><b>${escapeHtml(ocrMethodLabel(item.method))}</b></td>
      <td><b>${escapeHtml(formatSecondsPerPage(item.secondsPerPage))}</b></td>
      <td><button class="chip-button resource-info-button" data-resource-usage-group="${groupIndex}" data-resource-usage-method="${methodIndex}">${escapeHtml(t("system.view_resources"))}</button></td>
      <td>${escapeHtml(formatDurationMs(item.e2eDuration))}</td>
      <td>${escapeHtml(item.pages)} pages / ${escapeHtml(item.jobs)} jobs</td>
    </tr>`).join("");
    return header + methodRows;
  }).join("");
  const measuredJobs = groups.reduce((sum, group) => sum + group.jobs, 0);
  const note = validGroups.length
    ? "Module time includes the runner and report generation; it excludes web upload and file preparation."
    : measuredJobs
      ? "Module timing exists, but no two modules completed with the same dataset, pages, and DPI."
      : "No completed jobs with valid timing and page counts.";
  return `<section class="panel benchmark-panel">
    <div class="benchmark-head">
      <h3>Run comparison</h3>
      <span class="mini-pill">${escapeHtml(validGroups.length)} comparison groups / ${escapeHtml(measuredJobs)} measured jobs</span>
    </div>
    <p class="note benchmark-note">${escapeHtml(note)}</p>
    <div class="table-shell benchmark-table-shell">
      <table class="table benchmark-table">
        <thead><tr><th>Benchmark set</th><th>Method</th><th>Module/page</th><th>Resource info</th><th>End-to-end</th><th>Pages/job</th></tr></thead>
        <tbody>${rows || `<tr class="benchmark-empty"><td colspan="6">No valid benchmark jobs.</td></tr>`}</tbody>
      </table>
    </div>
  </section>`;
}

function jobDocumentSummary(job) {
  const docsDone = Number(job?.progress_completed_documents || 0);
  const docsTotal = Number(job?.progress_total_documents || 0);
  const pagesDone = Number(job?.progress_completed_pages || 0);
  const pagesTotal = Number(job?.progress_total_pages || 0);
  const stage = String(job?.progress_stage || "");
  const pageStages = new Set(["render_pages", "layout", "ocr", "vlm_inference"]);
  const docStages = new Set(["extraction", "validation", "retry", "web"]);
  if (pageStages.has(stage) && pagesTotal) return `${Math.min(pagesDone, pagesTotal)}/${pagesTotal} pages`;
  if ((docStages.has(stage) || stage === "completed") && docsTotal > 1) return `${Math.min(docsDone, docsTotal)}/${docsTotal} documents`;
  if (pagesTotal) return `${Math.min(pagesDone, pagesTotal)}/${pagesTotal} pages`;
  if (docsTotal > 1) return `${Math.min(docsDone, docsTotal)}/${docsTotal} documents`;
  const uploaded = Number(job?.uploaded_files || 0);
  const expected = Number(job?.expected_files || 0);
  if (expected) return `${Math.min(uploaded, expected)}/${expected} files`;
  return `${uploaded || 0} files`;
}

function renderJobProgressCompact(job) {
  const percent = clampProgress(job?.progress_percentage);
  const stageId = job?.progress_stage || fallbackProgressStage(percent, job?.status);
  const stage = progressStageLabel(job?.status === "completed_with_warnings" && stageId === "completed" ? "completed_with_warnings" : stageId);
  const benchmark = strictModuleBenchmark(job);
  const benchmarkLine = benchmark
    ? `<small class="benchmark-inline">Module ${escapeHtml(formatSecondsPerPage(benchmark.secondsPerPage))} / ${escapeHtml(formatDurationMs(benchmark.duration))}</small>`
    : "";
  return `<div class="job-progress">
    <div><b>${percent}%</b><span>${escapeHtml(stage)}</span></div>
    <div class="job-progress-track"><span style="width:${percent}%"></span></div>
    <small>${escapeHtml(jobDocumentSummary(job))}</small>
    ${benchmarkLine}
  </div>`;
}

function filteredJobs() {
  return sortJobs(DATA.jobs);
}

function jobMetricCounts() {
  const jobs = DATA.jobs || [];
  return {
    total: Number(DATA.metrics?.total_jobs ?? DATA.pagination?.total ?? jobs.length),
    active: Number(DATA.metrics?.active_jobs ?? jobs.filter((job) => RUNNING_JOB_STATUSES.has(String(job?.status || ""))).length),
    completed: Number(DATA.metrics?.completed_jobs ?? jobs.filter((job) => ["completed", "completed_with_warnings"].includes(job?.status)).length),
    errors: Number(DATA.metrics?.error_jobs ?? jobs.filter((job) => job?.status === "error").length)
  };
}

function renderFailureCard(job) {
  const failure = job?.failure;
  if (!failure || typeof failure !== "object") return job?.error ? `<div class="job-error">${escapeHtml(localizeJobLogLine(job.error))}</div>` : "";
  return `<div class="failure-card"><b>${escapeHtml(t(failure.message_key || `errors.${failure.code}`))}</b>${failure.detail ? `<small>${escapeHtml(failure.detail)}</small>` : ""}<div>
    ${failure.retryable ? `<button class="mini-action" data-rerun-job="${escapeHtml(job.id)}" data-rerun-method="${escapeHtml(job.ocr_method)}">${escapeHtml(t("failure.retry"))}</button>` : ""}
    <button class="mini-action" data-copy-diagnostics="${escapeHtml(job.id)}">${escapeHtml(t("failure.copy"))}</button>
    <button class="mini-action" data-show-job-log="${escapeHtml(job.id)}">${escapeHtml(t("failure.log"))}</button>
  </div></div>`;
}

function renderJobMenus(job) {
  const rerunItems = DATA.ocr_methods.map((method) => `<button data-rerun-job="${escapeHtml(job.id)}" data-rerun-method="${escapeHtml(method.id)}">${escapeHtml(method.label)}</button>`).join("");
  const rerunMenu = RUNNING_JOB_STATUSES.has(String(job.status || "")) ? "" : `<details class="action-menu"><summary class="chip-button">${escapeHtml(t("jobs.rerun"))}</summary><div>${rerunItems}</div></details>`;
  const deleteItem = TERMINAL_JOB_STATUSES.has(String(job.status || "")) ? `<button class="danger" data-delete-job="${escapeHtml(job.id)}">${escapeHtml(t("jobs.delete"))}</button>` : "";
  return `${rerunMenu}<details class="action-menu"><summary class="chip-button">${escapeHtml(t("jobs.more"))}</summary><div><button data-copy-job-id="${escapeHtml(job.id)}">${escapeHtml(t("jobs.copy_id"))}</button><button data-download-job-log="${escapeHtml(job.id)}">${escapeHtml(t("jobs.download_log"))}</button>${deleteItem}</div></details>`;
}

function formatDateWords(value) {
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const [, year, month, day] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function documentDateLine(doc) {
  const place = fieldText(doc, "dia_diem_ban_hanh");
  const date = formatDateWords(fieldText(doc, "ngay_ban_hanh"));
  if (place && date) return `${place}, ${date}`;
  return place || date || "";
}

function groupLabel(id) {
  return CODE_GROUPS.find((group) => group.id === id)?.label || id;
}

function navButton(view, label, icon) {
  const active = state.view === view ? " active" : "";
  return `<button class="nav-button${active}" data-view="${view}" title="${escapeHtml(label)}">
    <span class="nav-icon" data-icon="${escapeHtml(icon)}"></span><span>${escapeHtml(label)}</span>
  </button>`;
}

function metricGauge(label, percent, detail) {
  const value = percent !== null && percent !== undefined && Number.isFinite(Number(percent)) ? Math.max(0, Math.min(100, Number(percent))) : null;
  return `<article class="resource-card"><div><b>${escapeHtml(label)}</b><strong>${value === null ? "—" : `${value.toFixed(1)}%`}</strong></div>
    <div class="resource-bar" aria-label="${escapeHtml(label)}"><span style="width:${value ?? 0}%"></span></div><small>${escapeHtml(detail || "")}</small></article>`;
}

function renderSystemMonitorContent() {
  if (state.systemMetricsError) return `<div class="errors">${escapeHtml(state.systemMetricsError)}</div>`;
  const metrics = state.systemMetrics;
  if (!metrics) return `<div class="empty compact-empty">${escapeHtml(t("system.loading"))}</div>`;
  const cpu = metrics.cpu || {};
  const memory = metrics.memory || {};
  const disk = metrics.disk || {};
  const runtime = metrics.runtime || {};
  const load = Array.isArray(cpu.load_average) ? cpu.load_average.join(" / ") : "—";
  const coreDetail = [
    cpu.physical_cores ? `${cpu.physical_cores} ${t("system.physical_cores")}` : "",
    `${cpu.logical_cores || 0} ${t("system.logical_cores")}`,
    cpu.allowed_cores && cpu.allowed_cores !== cpu.logical_cores ? `${cpu.allowed_cores} ${t("system.available_cores")}` : ""
  ].filter(Boolean).join(" · ");
  const cards = [
    metricGauge(t("system.cpu"), cpu.percent, `${coreDetail} · load ${load}`),
    metricGauge(t("system.ram"), memory.percent, `${formatBytes(memory.used_bytes)} / ${formatBytes(memory.total_bytes)}`),
    metricGauge(t("system.disk"), disk.percent, `${formatBytes(disk.used_bytes)} / ${formatBytes(disk.total_bytes)}`)
  ];
  const gpuCards = (metrics.gpus || []).map((gpu) => `<section class="gpu-resource-card">
    <div class="resource-title"><div><b>GPU ${escapeHtml(gpu.index)} · ${escapeHtml(gpu.name)}</b><small>${escapeHtml(t("system.driver"))} ${escapeHtml(gpu.driver_version || "—")}</small></div><span>${escapeHtml(gpu.temperature_c ?? "—")}°C</span></div>
    ${metricGauge(t("system.gpu_util"), gpu.utilization_percent, `${escapeHtml(gpu.power_draw_w ?? "—")} / ${escapeHtml(gpu.power_limit_w ?? "—")} W`)}
    ${metricGauge(t("system.vram"), gpu.memory_percent, `${formatBytes(Number(gpu.memory_used_mb || 0) * 1024 * 1024)} / ${formatBytes(Number(gpu.memory_total_mb || 0) * 1024 * 1024)}`)}
  </section>`).join("");
  const specifications = `<div class="resource-spec-grid">
    <article><b>${escapeHtml(t("system.cpu_model"))}</b><span>${escapeHtml(cpu.model || "—")}</span></article>
    <article><b>${escapeHtml(t("system.runtime"))}</b><span>${escapeHtml(`${runtime.platform || "—"} ${runtime.release || ""} · ${runtime.architecture || "—"} · Python ${runtime.python || "—"}`)}</span></article>
    <article><b>PaddleOCR-VL</b><span>${escapeHtml(`${runtime.paddle_device || "—"} · engine=${runtime.paddle_engine || "—"} · concurrency=${runtime.paddle_max_concurrency || 1}`)}</span></article>
  </div>`;
  return `<div class="resource-grid">${cards.join("")}</div>
    <div class="gpu-resource-list">${gpuCards || `<div class="empty compact-empty">${escapeHtml(metrics.gpu_error || t("system.no_gpu"))}</div>`}</div>${specifications}
    <footer class="resource-footer"><span>${escapeHtml(t("system.queue"))}: ${escapeHtml(metrics.jobs?.queued || 0)} · ${escapeHtml(t("system.active"))}: ${escapeHtml(metrics.jobs?.active_processes || 0)}</span><span>${escapeHtml(metrics.checked_at || "")}</span></footer>`;
}

function renderSystemMonitorModal() {
  if (!state.systemMonitorOpen) return "";
  return `<div class="modal-backdrop system-monitor-backdrop" data-system-monitor-close><section class="modal system-monitor-modal" role="dialog" aria-modal="true" aria-labelledby="system-monitor-title" data-system-monitor-panel>
    <div class="system-monitor-head"><div><h3 id="system-monitor-title">${escapeHtml(t("system.title"))}</h3><p>${escapeHtml(t("system.subtitle"))}</p></div><button class="icon-button" data-system-monitor-close aria-label="${escapeHtml(t("system.close"))}">×</button></div>
    <div data-system-monitor-content>${renderSystemMonitorContent()}</div>
  </section></div>`;
}

function renderResourceUsageModal() {
  const modal = state.resourceUsageModal;
  if (!modal) return "";
  const usage = modal.usage || {};
  const cpu = usage.cpu || {};
  const memory = usage.memory || {};
  const host = usage.host || {};
  const noSamples = !Number(usage.samples || 0);
  const gpuCards = (usage.gpus || []).map((gpu) => `<section class="gpu-resource-card">
    <div class="resource-title"><div><b>GPU ${escapeHtml(gpu.index)} · ${escapeHtml(gpu.name || "—")}</b><small>${escapeHtml(t("system.driver"))} ${escapeHtml(gpu.driver_version || "—")}</small></div><span>${escapeHtml(gpu.peak_temperature_c || "—")}°C peak</span></div>
    ${metricGauge(t("usage.gpu_avg"), gpu.average_utilization_percent, `${t("usage.peak")}: ${Number(gpu.peak_utilization_percent || 0).toFixed(1)}%`)}
    ${metricGauge(t("usage.vram_avg"), gpu.memory_total_mb ? Number(gpu.average_memory_used_mb || 0) * 100 / Number(gpu.memory_total_mb) : null, `${formatBytes(Number(gpu.average_memory_used_mb || 0) * 1024 * 1024)} avg · ${formatBytes(Number(gpu.peak_memory_used_mb || 0) * 1024 * 1024)} peak / ${formatBytes(Number(gpu.memory_total_mb || 0) * 1024 * 1024)}`)}
    <small>${escapeHtml(t("usage.power"))}: ${escapeHtml(Number(gpu.average_power_w || 0).toFixed(1))} W avg · ${escapeHtml(Number(gpu.peak_power_w || 0).toFixed(1))} W peak</small>
  </section>`).join("");
  const coreDetail = `${Number(cpu.average_cores || 0).toFixed(2)} avg · ${Number(cpu.peak_cores || 0).toFixed(2)} peak / ${host.allowed_cores || host.logical_cores || 0} cores`;
  return `<div class="modal-backdrop system-monitor-backdrop" data-resource-usage-close><section class="modal system-monitor-modal" role="dialog" aria-modal="true" aria-labelledby="resource-usage-title" data-resource-usage-panel>
    <div class="system-monitor-head"><div><h3 id="resource-usage-title">${escapeHtml(modal.methodLabel)} · ${escapeHtml(t("usage.title"))}</h3><p>${escapeHtml(t("usage.subtitle"))}</p></div><button class="icon-button" data-resource-usage-close aria-label="${escapeHtml(t("system.close"))}">×</button></div>
    ${noSamples ? `<div class="empty compact-empty">${escapeHtml(t("usage.unavailable"))}</div>` : `<div class="resource-grid">
      ${metricGauge(t("usage.cpu_avg"), cpu.average_percent, `${coreDetail} · ${t("usage.peak")} ${Number(cpu.peak_percent || 0).toFixed(1)}%`)}
      ${metricGauge(t("usage.ram_avg"), host.memory_total_bytes ? Number(memory.average_rss_bytes || 0) * 100 / Number(host.memory_total_bytes) : null, `${formatBytes(memory.average_rss_bytes)} avg · ${formatBytes(memory.peak_rss_bytes)} peak / ${formatBytes(host.memory_total_bytes)}`)}
    </div><div class="gpu-resource-list">${gpuCards || `<div class="empty compact-empty">${escapeHtml(t("system.no_gpu"))}</div>`}</div>`}
    <div class="resource-spec-grid">
      <article><b>${escapeHtml(t("system.cpu_model"))}</b><span>${escapeHtml(host.cpu_model || "—")} · ${escapeHtml(host.physical_cores || "—")} physical / ${escapeHtml(host.logical_cores || "—")} logical</span></article>
      <article><b>${escapeHtml(t("system.runtime"))}</b><span>${escapeHtml(`${host.platform || "—"} ${host.release || ""} · ${host.architecture || "—"} · Python ${host.python || "—"}`)}</span></article>
      <article><b>PaddleOCR-VL</b><span>${escapeHtml(`${host.paddle_device || "—"} · engine=${host.paddle_engine || "—"} · concurrency=${host.paddle_max_concurrency || 1}`)}</span></article>
      <article><b>${escapeHtml(t("usage.sample"))}</b><span>${escapeHtml(`${usage.samples || 0} samples · ${Number(usage.duration_seconds || 0).toFixed(1)}s · ${usage.runs || 1} run(s)`)}</span></article>
    </div>
  </section></div>`;
}


function renderShell(content) {
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"></div>
        <div><h1>${escapeHtml(DATA.app?.name || "IntelliDoc")}</h1><p>${escapeHtml(DATA.app?.subtitle || "Archive digitization")}</p></div>
      </div>
      <nav class="nav">
        ${DATA.server_mode ? navButton("jobs", t("nav.jobs"), "▦") : ""}
        ${currentJobId() ? `<a class="nav-button nav-link" href="/" title="${escapeHtml(t("nav.jobs"))}">
          <span class="nav-icon" data-icon="▦"></span><span>${escapeHtml(t("nav.jobs"))}</span>
        </a>` : ""}
        ${navButton("upload", t("nav.upload"), "⇧")}
        ${navButton("manage", t("nav.manage"), "▣")}
        ${navButton("logs", t("nav.logs"), "▤")}
        ${navButton("report", t("nav.report"), "▥")}
        <div class="nav-section-label">${escapeHtml(t("nav.admin"))}</div>
        ${navButton("codes", t("nav.codes"), "▧")}
      </nav>
      ${DATA.server_mode ? `<button class="system-monitor-button" data-system-monitor-open><span class="nav-icon" data-icon="◫"></span><span>${escapeHtml(t("system.title"))}</span></button>` : ""}
      <div class="language-switch" aria-label="Language">
        <button class="chip-button ${I18N.language() === "vi" ? "active" : ""}" data-language="vi">${escapeHtml(t("lang.vi"))}</button>
        <button class="chip-button ${I18N.language() === "en" ? "active" : ""}" data-language="en">${escapeHtml(t("lang.en"))}</button>
      </div>
    </aside>
    <main class="main">${content}</main>${renderSystemMonitorModal()}${renderResourceUsageModal()}
  </div>`;
}

function renderUpload() {
  const tabLabel = "PDF";
  const serverReady = Boolean(DATA.server_mode);
  const runningInsideJobReport = window.location.pathname.startsWith("/jobs/");
  const hasFiles = state.uploadFiles.length > 0;
  const fileIssues = uploadSelectionIssues(state.uploadFiles);
  const canUpload = serverReady && hasFiles && !state.uploadBusy && !fileIssues.length;
  const uploadLabel = state.uploadBusy ? t("upload.processing") : t("upload.start");
  const methodOptions = DATA.ocr_methods.map((method) => `<option value="${escapeHtml(method.id)}" ${state.uploadMethod === method.id ? "selected" : ""}>${escapeHtml(method.label)}</option>`).join("");
  const externalDataNotice = isExternalMethod(state.uploadMethod)
    ? `<p class="external-data-notice">${escapeHtml(t("upload.external", { provider: ocrMethodLabel(state.uploadMethod) }))}</p>`
    : "";
  const readiness = state.engineReadiness[state.uploadMethod] || { status: "unchecked", summary: t("engine.unchecked") };
  const readinessTime = readiness.checked_at ? t("engine.checked", { time: String(readiness.checked_at).split(" ").pop() }) : t("engine.unchecked");
  const readinessCard = `<div class="engine-readiness ${escapeHtml(readiness.status || "unchecked")}">
    <div><span class="readiness-dot"></span><b>${escapeHtml(readiness.summary || readiness.status)}</b><small>${escapeHtml(readinessTime)}</small></div>
    <button class="chip-button" data-check-engine="${escapeHtml(state.uploadMethod)}" ${state.engineCheckBusy ? "disabled" : ""}>${escapeHtml(state.engineCheckBusy === state.uploadMethod ? t("jobs.refreshing") : t("engine.check"))}</button>
  </div>`;
  const fileRows = state.uploadFiles.map((file, index) => `<li><span title="${escapeHtml(uploadFilePath(file))}">${escapeHtml(uploadFilePath(file))}</span><small>${escapeHtml(formatBytes(file.size))}</small><button class="icon-button" aria-label="Remove ${escapeHtml(file.name)}" data-remove-upload-file="${index}">×</button></li>`).join("");
  const fileList = hasFiles ? `<section class="upload-file-list"><div><b>${escapeHtml(t("upload.files", { count: state.uploadFiles.length, size: formatBytes(state.uploadFiles.reduce((sum, file) => sum + Number(file.size || 0), 0)) }))}</b><button class="chip-button" data-clear-upload-files>${escapeHtml(t("upload.clear"))}</button></div><ul>${fileRows}</ul>${fileIssues.length ? `<div class="errors">${fileIssues.map(escapeHtml).join("<br>")}</div>` : ""}</section>` : "";
  const fullOcrTask = state.uploadVlmTask === "full_ocr";
  const vlmOptions = isVlmMethod(state.uploadMethod) ? `<div class="vlm-options">
        <label>
          <span>VLM task</span>
          <select class="select" data-vlm-task ${state.uploadBusy ? "disabled" : ""}>
            <option value="full_ocr" ${fullOcrTask ? "selected" : ""}>Full OCR</option>
            <option value="metadata" ${!fullOcrTask ? "selected" : ""}>Quick metadata</option>
          </select>
        </label>
        <label>
          <span>VLM pages</span>
          <select class="select" data-vlm-pages ${state.uploadBusy || fullOcrTask ? "disabled" : ""}>
            <option value="auto" ${state.uploadVlmPages === "auto" ? "selected" : ""}>Auto</option>
            <option value="all" ${state.uploadVlmPages === "all" ? "selected" : ""}>All pages</option>
            <option value="first,last" ${state.uploadVlmPages === "first,last" ? "selected" : ""}>First and last pages</option>
          </select>
        </label>
        <label>
          <span>Maximum pages</span>
          <input class="input" type="number" min="0" step="1" data-vlm-max-pages value="${escapeHtml(state.uploadVlmMaxPages)}" ${state.uploadBusy || fullOcrTask ? "disabled" : ""}>
        </label>
        <p class="note">${fullOcrTask
          ? "Full OCR always reads every page and then extracts metadata."
          : "Auto selects the first page, the final two pages, and pages that show a signature, stamp, or document heading."}</p>
      </div>` : "";
  return `<section class="view-head">
      <div><h2>${escapeHtml(t("upload.title"))}</h2></div>
    </section>
    <section class="panel upload-wrap">
      <div class="upload-options">
        <label>
          <span>${escapeHtml(t("upload.engine"))}</span>
          <select class="select" data-ocr-method ${state.uploadBusy ? "disabled" : ""}>${methodOptions}</select>
        </label>
        ${vlmOptions}
      </div>
      ${readinessCard}
      ${externalDataNotice}
      <div class="dropzone" id="dropzone">
        <div>
          <div class="upload-symbol"></div>
          <div>${escapeHtml(t("upload.drop", { kind: tabLabel }))}</div>
          <p>${state.uploadName ? escapeHtml(state.uploadName) : escapeHtml(t("upload.accepts"))}</p>
        </div>
      </div>
      <input id="upload-input" type="file" accept=".pdf,application/pdf" multiple hidden>
      ${fileList}
      <button class="button upload-action" data-upload-start ${canUpload ? "" : "disabled"}>${escapeHtml(uploadLabel)}</button>
      ${serverReady ? "" : `<p class="empty" style="padding-bottom:0">${
        runningInsideJobReport
          ? `You are viewing a static report. <a href="/">Return to upload</a> to process another document.`
          : `To upload through the web app, run <code>python apps\\web_server.py</code> or <code>bash scripts/run_web.sh</code>.`
      }</p>`}
      <div data-upload-job-slot>${renderUploadJob()}</div>
    </section>`;
}

function renderUploadJob() {
  if (!state.uploadJob && !state.uploadError) return "";
  const job = state.uploadJob || {};
  const logs = (job.logs || []).map((line) => escapeHtml(localizeJobLogLine(line))).join("\n");
  const report = job.report_url ? `<a class="button" href="${escapeHtml(job.report_url)}">Open OCR result</a>` : "";
  const dashboardButton = DATA.server_mode ? `<button class="button secondary" data-view="jobs">Results list</button>` : "";
  const resetButton = !state.uploadBusy ? `<button class="button secondary" data-upload-reset>Upload another file</button>` : "";
  const cancelButton = CANCELLABLE_JOB_STATUSES.has(String(job.status || "")) ? `<button class="button red" data-cancel-job="${escapeHtml(job.id)}">Cancel job</button>` : "";
  const logTools = (job.logs || []).length ? `<button class="button ghost" data-copy-upload-log>Copy log</button><button class="button ghost" data-download-upload-log>Download log</button>` : "";
  const methodLabel = ocrMethodLabel(job.ocr_method || state.uploadMethod);
  const vlmLabel = jobVlmLabel(job);
  return `<section class="panel review-pane" style="margin-top:18px" data-upload-job-panel>
    <h3>Processing status</h3>
    ${state.uploadError ? `<div class="errors">${escapeHtml(state.uploadError)}</div>` : ""}
    ${job.id ? `<p><b>${escapeHtml(jobDisplayName(job))}</b> / <span class="status ${statusClass(job.status)}">${escapeHtml(jobStatusLabel(job.status))}</span> / <span class="mini-pill">${escapeHtml(methodLabel)}</span>${vlmLabel ? ` / <span class="mini-pill">${escapeHtml(vlmLabel)}</span>` : ""} / ${escapeHtml(job.uploaded_files || 0)}/${escapeHtml(job.expected_files || 0)} files<br><small title="${escapeHtml(job.id || "")}">${escapeHtml(jobShortId(job))}</small></p>` : ""}
    ${job.id ? renderProgressBar(job) : ""}
    ${report || dashboardButton || resetButton || logTools ? `<div class="toolbar" style="margin:14px 0">${report}${dashboardButton}${resetButton}${cancelButton}${logTools}</div>` : ""}
    <details class="technical-log" ${state.showTechnicalLog ? "open" : ""}><summary>${escapeHtml(t("failure.log"))}</summary><pre class="raw-text" data-preserve-scroll="upload-log">${logs || "Waiting for upload..."}</pre></details>
  </section>`;
}

function renderBulkJobToolbar() {
  const count = state.selectedJobIds.size;
  return count ? `<div class="bulk-toolbar"><b>${escapeHtml(t("jobs.selected", { count }))}</b><button class="button red" data-preview-delete-jobs>${escapeHtml(t("jobs.delete_selected"))}</button></div>` : "";
}

function renderJobPagination() {
  const pagination = DATA.pagination || {};
  const page = Number(pagination.page || 1);
  const pages = Number(pagination.pages || 1);
  return `<nav class="pagination" aria-label="Pagination"><button class="chip-button" data-job-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>${escapeHtml(t("pagination.previous"))}</button><span>${escapeHtml(t("pagination.page", { page, pages }))}</span><button class="chip-button" data-job-page="${page + 1}" ${page >= pages ? "disabled" : ""}>${escapeHtml(t("pagination.next"))}</button></nav>`;
}

function renderDeleteModal() {
  const modal = state.deleteModal;
  if (!modal) return "";
  const rows = (modal.deletable || []).map((job) => `<li><span>${escapeHtml(job.display_name || job.id)}</span><small>${escapeHtml(formatBytes(job.bytes))}</small></li>`).join("");
  return `<div class="modal-backdrop" data-modal-close><section class="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" data-modal>
    <h3 id="delete-modal-title">${escapeHtml(t("delete.title"))}</h3><p>${escapeHtml(t("delete.summary", { count: (modal.deletable || []).length, size: formatBytes(modal.total_bytes) }))}</p>
    <ul>${rows}</ul>${modal.blocked?.length ? `<div class="errors">${escapeHtml(t("delete.blocked", { count: modal.blocked.length }))}</div>` : ""}
    <div class="toolbar"><button class="button secondary" data-delete-modal-cancel>${escapeHtml(t("delete.cancel"))}</button><button class="button red" data-confirm-delete-jobs ${modal.busy || !modal.deletable?.length ? "disabled" : ""}>${escapeHtml(t("delete.confirm"))}</button></div>
  </section></div>`;
}

function closeDeleteModal() {
  state.deleteModal = null;
  render();
  app.querySelector("[data-preview-delete-jobs]")?.focus();
}

function renderJobs() {
  const counts = jobMetricCounts();
  const currentJobs = filteredJobs();
  const terminalPageJobs = currentJobs.filter((job) => TERMINAL_JOB_STATUSES.has(String(job.status || "")));
  const allPageSelected = terminalPageJobs.length > 0 && terminalPageJobs.every((job) => state.selectedJobIds.has(job.id));
  const methodOptions = [`<option value="all" ${state.jobMethod === "all" ? "selected" : ""}>${escapeHtml(t("jobs.all_engines"))}</option>`]
    .concat(DATA.ocr_methods.map((method) => `<option value="${escapeHtml(method.id)}" ${state.jobMethod === method.id ? "selected" : ""}>${escapeHtml(method.label)}</option>`))
    .join("");
  const rows = currentJobs.map((job) => {
    const active = RUNNING_JOB_STATUSES.has(String(job.status || ""));
    const methodLabel = ocrMethodLabel(job.ocr_method);
    const vlmLabel = jobVlmLabel(job);
    const reportLink = job.report_url
      ? `<a class="chip-button green" href="${escapeHtml(job.report_url)}">${escapeHtml(t("jobs.open"))}</a>`
      : `<span class="status pending">No report</span>`;
    const followButton = active
      ? `<button class="chip-button teal" data-follow-job="${escapeHtml(job.id)}">${escapeHtml(t("jobs.follow"))}</button>`
      : "";
    const cancelButton = CANCELLABLE_JOB_STATUSES.has(String(job.status || "")) ? `<button class="chip-button red" data-cancel-job="${escapeHtml(job.id)}">${escapeHtml(t("jobs.cancel"))}</button>` : "";
    const checkbox = TERMINAL_JOB_STATUSES.has(String(job.status || "")) ? `<input type="checkbox" data-select-job="${escapeHtml(job.id)}" aria-label="Select ${escapeHtml(jobDisplayName(job))}" ${state.selectedJobIds.has(job.id) ? "checked" : ""}>` : "";
    const timing = jobTimingSummary(job, true);
    const error = renderFailureCard(job);
    return `<tr>
      <td class="job-select-cell">${checkbox}</td>
      <td>
        <div class="job-title">
          <b>${escapeHtml(jobDisplayName(job))}</b>
          <span title="${escapeHtml(job.id || "")}">${escapeHtml(jobShortId(job))}</span>
          <span class="mini-pill">${escapeHtml(methodLabel)}</span>
          ${vlmLabel ? `<span class="mini-pill">${escapeHtml(vlmLabel)}</span>` : ""}
        </div>
      </td>
      <td><span class="status ${statusClass(job.status)}">${escapeHtml(jobStatusLabel(job.status))}</span>${error}</td>
      <td>${renderJobProgressCompact(job)}</td>
      <td>
        <div class="job-time"><b>End-to-end</b><span>${escapeHtml(formatDurationMs(timing.e2eDuration))}</span></div>
        <div class="job-time"><b>Module</b><span>${escapeHtml(formatDurationMs(timing.moduleDuration))}</span></div>
        <div class="job-time benchmark-time"><b>Module/page</b><span>${escapeHtml(formatSecondsPerPage(timing.moduleSecondsPerPage))}</span></div>
      </td>
      <td>
        <span class="mini-pill">${escapeHtml(Number(job.correction_count || 0))} corrections</span>
        <span class="mini-pill">${escapeHtml(Number(job.dataset_sample_count || 0))} dataset samples</span>
      </td>
      <td><div class="action-list">${reportLink}${followButton}${cancelButton}${renderJobMenus(job)}</div></td>
    </tr>`;
  }).join("");
  return `<section class="view-head">
      <div>
        <h2>${escapeHtml(t("jobs.title"))}</h2>
        <p>${escapeHtml(t("jobs.subtitle"))}</p>
      </div>
      <button class="button" data-view="upload">${escapeHtml(t("jobs.new"))}</button>
    </section>
    <section class="metrics job-metrics">
      <div class="panel metric"><span>${escapeHtml(t("jobs.total"))}</span><b>${counts.total}</b></div>
      <div class="panel metric blue"><span>${escapeHtml(t("jobs.running"))}</span><b>${counts.active}</b></div>
      <div class="panel metric green"><span>${escapeHtml(t("jobs.completed"))}</span><b>${counts.completed}</b></div>
      <div class="panel metric red"><span>${escapeHtml(t("jobs.errors"))}</span><b>${counts.errors}</b></div>
    </section>
    <section class="filter-row job-filter-row">
      <input class="input" data-job-query placeholder="${escapeHtml(t("jobs.search"))}" value="${escapeHtml(state.jobQuery)}">
      <select class="select" data-job-status>
        <option value="all" ${state.jobStatus === "all" ? "selected" : ""}>${escapeHtml(t("jobs.all"))}</option>
        <option value="active" ${state.jobStatus === "active" ? "selected" : ""}>${escapeHtml(t("jobs.running"))}</option>
        <option value="completed" ${state.jobStatus === "completed" ? "selected" : ""}>${escapeHtml(t("jobs.completed"))}</option>
        <option value="completed_with_warnings" ${state.jobStatus === "completed_with_warnings" ? "selected" : ""}>${escapeHtml(t("jobs.with_warnings"))}</option>
        <option value="error" ${state.jobStatus === "error" ? "selected" : ""}>${escapeHtml(t("jobs.errors"))}</option>
        <option value="uploading" ${state.jobStatus === "uploading" ? "selected" : ""}>Uploading</option>
        <option value="ready" ${state.jobStatus === "ready" ? "selected" : ""}>Ready</option>
      </select>
      <select class="select" data-job-method>${methodOptions}</select>
      <button class="button dark" data-refresh-jobs ${state.stateRefreshBusy ? "disabled" : ""}>${escapeHtml(state.stateRefreshBusy ? t("jobs.refreshing") : t("jobs.refresh"))}</button>
    </section>
    <div class="refresh-feedback">${state.stateRefreshError ? `<span class="errors">${escapeHtml(state.stateRefreshError)} <button class="mini-action" data-refresh-jobs>${escapeHtml(t("jobs.retry_refresh"))}</button></span>` : state.stateLastUpdated ? `<span>${escapeHtml(t("jobs.updated", { time: state.stateLastUpdated }))}</span>` : ""}</div>
    ${state.jobActionError ? `<div class="errors">${escapeHtml(state.jobActionError)}</div>` : ""}
    ${renderBulkJobToolbar()}
    ${renderBenchmarkPanel()}
    <section class="panel table-shell job-browser">
      <table class="table job-table">
        <thead><tr><th><input type="checkbox" data-select-page-jobs aria-label="${escapeHtml(t("jobs.select_page"))}" ${allPageSelected ? "checked" : ""} ${terminalPageJobs.length ? "" : "disabled"}></th><th>Job</th><th>Status</th><th>Progress</th><th>Time</th><th>Corrections</th><th>Result</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">${escapeHtml(t("jobs.empty"))}</td></tr>`}</tbody>
      </table>
    </section>${renderJobPagination()}${renderDeleteModal()}`;
}


function filteredDocuments() {
  const query = compact(state.query);
  return DATA.documents.filter((doc) => {
    const text = compact([doc.hop_so, doc.phong_luu_tru, doc.file_name, fieldText(doc, "so_van_ban"), fieldText(doc, "trich_yeu")].join(" "));
    const matchesQuery = !query || text.includes(query);
    const status = documentWorkflowStatus(doc);
    const matchesStatus = state.status === "all" || status.value === state.status;
    const matchesReview = documentMatchesReviewFilter(doc);
    return matchesQuery && matchesStatus && matchesReview;
  });
}

function renderManage() {
  const docs = filteredDocuments();
  const rows = docs.map((doc) => {
    const status = documentWorkflowStatus(doc);
    return `<tr>
    <td><b>${escapeHtml(doc.hop_so || "-")}</b></td>
    <td>${escapeHtml(doc.phong_luu_tru || "-")}</td>
    <td>${renderDatasetBadge(doc, true)}</td>
    <td>${renderReviewTriageBadge(doc)}</td>
    <td><span class="status ${statusClass(status.value)}">${escapeHtml(status.label)}</span></td>
    <td>${escapeHtml(doc.processed_at || "-")}</td>
    <td>
      <div class="action-list">
        <button class="chip-button" data-doc-action="overview" data-doc-id="${escapeHtml(doc.id)}">Details</button>
      </div>
    </td>
  </tr>`;
  }).join("");

  return `<section class="view-head">
      <div><h2>${escapeHtml(t("nav.manage"))}</h2></div>
      <button class="button" data-view="upload">+ New upload</button>
    </section>
    <section class="filter-row">
      <input class="input" data-filter-query placeholder="Search box number, fonds..." value="${escapeHtml(state.query)}">
      <select class="select" data-filter-status>
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="started">Processing</option>
        <option value="draft">Draft</option>
        <option value="dang_duyet">Under review</option>
        <option value="approved">Approved</option>
        <option value="error">Error</option>
      </select>
      <select class="select" data-filter-review>
        <option value="all">All OCR reviews</option>
        <option value="risk">Review risk</option>
        <option value="suggestion">Suggestions only</option>
        <option value="manual_crop">Manual crop review</option>
        <option value="low_confidence">Low confidence</option>
      </select>
      <button class="button dark" data-apply-filter>Apply</button>
    </section>
    <section class="panel table-shell">
      <table class="table">
        <thead><tr><th>Box</th><th>Fonds</th><th>Dataset</th><th>OCR review</th><th>Status</th><th>Processed date</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No matching documents.</td></tr>`}</tbody>
      </table>
    </section>`;
}

function detailModeButton(mode, label) {
  return `<button class="chip-button ${state.detailMode === mode ? "green" : ""}" data-detail-mode="${mode}">${escapeHtml(label)}</button>`;
}

function renderFieldRow(doc, name, context = "") {
  const field = getField(doc, name);
  if (!field) return "";
  const crop = fieldThumbnailUrl(field);
  const supportingCrop = field.supporting_crop_image || "";
  const regionCrop = field.region_crop_image || "";
  const label = fieldLabel(name, context);
  return `<div class="field-row">
    ${crop ? `<img src="${escapeHtml(crop)}" alt="${escapeHtml(label)}">` : `<div class="crop-empty"></div>`}
    <div>
      <b>${escapeHtml(label)}</b>
      <p>${nl2br(fieldDisplay(field))}</p>
      ${renderSuggestion(field)}
      ${renderEvidenceWarning(field)}
      ${renderEvidenceChips(field)}
      <div class="field-meta">
        <span class="mini-pill">conf ${escapeHtml(confidenceText(field))}</span>
        <span class="mini-pill">${escapeHtml(field.method || "rule")}</span>
        ${visualBadge(field)}
        ${supportingCrop && !crop ? `<a class="mini-pill" href="${escapeHtml(supportingCrop)}" target="_blank">Evidence image</a>` : ""}
        ${regionCrop && regionCrop !== crop ? `<a class="mini-pill" href="${escapeHtml(regionCrop)}" target="_blank">Layout crop</a>` : ""}
        ${renderFieldReviewBadge(field)}
      </div>
    </div>
  </div>`;
}

function renderFieldGroups(doc) {
  const groups = isCoverOnlyDocument(doc)
    ? [{ title: "Cover file information", fields: COVER_FIELD_ORDER }]
    : FIELD_GROUPS.filter((group) => group.fields.some((name) => DOCUMENT_FIELD_ORDER.includes(name)));
  return `<div class="field-groups">${groups.map((group) => {
    const context = isCoverOnlyDocument(doc) ? "cover" : "document";
    const rows = group.fields.map((name) => renderFieldRow(doc, name, context)).join("");
    if (!rows) return "";
    return `<section class="field-section"><h3>${escapeHtml(group.title)}</h3><div class="field-list">${rows}</div></section>`;
  }).join("")}</div>`;
}

function firstReviewField(doc, names) {
  return names.find((name) => hasTrueReviewRisk(doc.fields?.[name]))
    || names.find((name) => hasSuggestionOnlyReview(doc.fields?.[name]))
    || names.find((name) => ["low", "warning"].includes(confidenceLevel(doc.fields?.[name])))
    || names.find((name) => fieldThumbnailUrl(doc.fields?.[name]))
    || names[0]
    || "";
}

function artifactLink(label, href) {
  return href ? `<a class="mini-action link-action" href="${escapeHtml(href)}" target="_blank">${escapeHtml(label)}</a>` : "";
}

function formatBool(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "n/a";
}

function shortDebugText(value, maxLength = 180) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function fieldRetryCandidates(field) {
  return Array.isArray(field?.ocr_retry_candidates) ? field.ocr_retry_candidates.filter((item) => item && typeof item === "object") : [];
}

function timelineStep(title, value, detail = "", links = "", className = "") {
  const body = value ? `<b>${escapeHtml(value)}</b>` : `<span class="muted">No data</span>`;
  return `<li class="${escapeHtml(className)}">
    <div><span>${escapeHtml(title)}</span>${body}${detail ? `<small>${nl2br(detail)}</small>` : ""}</div>
    ${links ? `<div class="debug-links">${links}</div>` : ""}
  </li>`;
}

function renderFieldDebugTimeline(doc, name, field) {
  const page = pageForField(doc, field) || selectedPage(doc);
  const suggestion = bestSuggestion(field);
  const retries = fieldRetryCandidates(field);
  const retryPreview = retries.slice(0, 3).map((item) => {
    const text = shortDebugText(item.normalized_value || item.text || item.error || "", 60);
    return [item.kind, text].filter(Boolean).join(": ");
  }).filter(Boolean).join("\n");
  const suggestionList = [
    suggestion?.value ? `${suggestion.value}${suggestionConfidenceText(suggestion) ? ` (${suggestionConfidenceText(suggestion)})` : ""}` : "",
    ...(Array.isArray(field.suggestions) ? field.suggestions.slice(0, 2).map((item) => {
      const confidence = suggestionConfidenceText(item);
      return `${item.value || ""}${confidence ? ` (${confidence})` : ""}`;
    }) : [])
  ].filter(Boolean);
  const links = doc.links || {};
  return `<section class="debug-section">
    <h4>Field debug timeline</h4>
    <ol class="debug-timeline">
      ${timelineStep(
        "OCR text and crop",
        field.raw_value || field.source_text || field.value,
        [
          field.source_text ? `source: ${shortDebugText(field.source_text)}` : "",
          Number.isFinite(Number(field.page_index)) ? `page: ${Number(field.page_index) + 1}` : "",
          field.region_label ? `region: ${field.region_label}` : ""
        ].filter(Boolean).join("\n"),
        [
          artifactLink("OCR JSON", page?.links?.ocr_result),
          artifactLink("Text", page?.links?.text_result),
          artifactLink("Crop", fieldThumbnailUrl(field)),
          artifactLink("Layout", page?.links?.layout_result)
        ].join("")
      )}
      ${timelineStep(
        "Extraction",
        field.raw_value || field.value,
        `method: ${field.method || "n/a"}`,
        artifactLink("fields.json", links.extraction)
      )}
      ${timelineStep(
        "Validation",
        reviewReasonLabel(fieldReviewReason(field)) || (field.is_valid === false ? "invalid" : "valid"),
        `valid: ${formatBool(field.is_valid)}\nconfidence: ${confidenceText(field)}`,
        artifactLink("validation", links.validation),
        hasTrueReviewRisk(field) ? "risk" : ""
      )}
      ${timelineStep(
        "Field retry",
        retries.length ? `${retries.length} variants` : "No retry",
        retryPreview,
      )}
      ${timelineStep(
        "Suggestions",
        suggestionList[0] || "No suggestion",
        suggestionList.slice(1).join("\n"),
        artifactLink("review", links.review),
        hasSuggestionOnlyReview(field) ? "suggestion" : ""
      )}
      ${timelineStep(
        "Final result",
        field.value || "-",
        isResolvedField(field) ? "resolved manually or through correction" : "",
        artifactLink("final result", links.final)
      )}
    </ol>
  </section>`;
}

function artifactImageCard(label, src, detail = "", links = "") {
  if (!src) return "";
  return `<figure class="artifact-card">
    <button class="artifact-image-button" tabindex="-1" data-open-image-preview data-preview-src="${escapeHtml(src)}" data-preview-layout-src="${escapeHtml(src)}" data-preview-decision-src="${escapeHtml(src)}" data-preview-title="${escapeHtml(label)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(label)}">
    </button>
    <figcaption><b>${escapeHtml(label)}</b>${detail ? `<small>${nl2br(detail)}</small>` : ""}${links ? `<div class="debug-links">${links}</div>` : ""}</figcaption>
  </figure>`;
}

function uniqueArtifactEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.src || seen.has(entry.src)) return false;
    seen.add(entry.src);
    return true;
  });
}

function pageArtifactEntries(doc, field) {
  const page = pageForField(doc, field) || selectedPage(doc);
  const images = page?.images || {};
  return uniqueArtifactEntries([
    { label: "Original page", src: images.original_image },
    { label: "Normalized", src: images.normalized_image },
    { label: "Enhanced", src: images.enhanced_image },
    { label: "Processed", src: images.processed_image },
    { label: "Layout overlay", src: images.layout_overlay }
  ]);
}

function fieldArtifactEntries(doc, name, field) {
  const page = pageForField(doc, field) || selectedPage(doc);
  const evidenceEntries = (Array.isArray(field?.evidence_candidates) ? field.evidence_candidates : []).map((candidate, index) => {
    const confidence = Number(candidate?.confidence);
    const detail = [
      candidate?.source ? `source: ${evidenceSourceLabel(candidate.source)}` : "",
      candidate?.status ? `status: ${evidenceStatusLabel(candidate.status)}` : "",
      Number.isFinite(confidence) ? `confidence: ${Math.round(confidence * 100)}%` : ""
    ].filter(Boolean).join("\n");
    return { label: `Evidence ${index + 1}`, src: candidate?.image, detail };
  });
  return uniqueArtifactEntries([
    { label: "Decision crop", src: trustedDecisionCropUrl(field), detail: evidenceSourceLabel(field.decision_crop_source || field.decision_crop_kind) },
    { label: "Raw decision crop", src: field.decision_raw_crop_image },
    { label: "Raw crop", src: field.raw_crop_image },
    { label: "Region crop", src: field.region_crop_image, links: artifactLink("Layout JSON", page?.links?.layout_result) },
    { label: "Supporting crop", src: field.supporting_crop_image },
    ...evidenceEntries
  ]);
}

function renderArtifactGroup(title, entries, emptyText = "No intermediate files.") {
  return `<div class="artifact-group">
    <h5>${escapeHtml(title)}</h5>
    ${entries.length ? `<div class="artifact-grid">${entries.map((entry) => artifactImageCard(entry.label, entry.src, entry.detail || "", entry.links || "")).join("")}</div>` : `<p class="empty small-empty">${escapeHtml(emptyText)}</p>`}
  </div>`;
}

function retryArtifactEntries(field) {
  return fieldRetryCandidates(field).slice(0, 12).flatMap((item, index) => {
    const base = [
      item.kind ? `type: ${item.kind}` : "",
      item.text ? `OCR: ${shortDebugText(item.text, 70)}` : "",
      item.normalized_value ? `normalized: ${shortDebugText(item.normalized_value, 70)}` : "",
      item.error ? `error: ${shortDebugText(item.error, 70)}` : "",
      item.plausible !== undefined ? `plausible: ${formatBool(item.plausible)}` : "",
      item.requires_review ? "needs review" : ""
    ].filter(Boolean).join("\n");
    return uniqueArtifactEntries([
      { label: `Attempt ${index + 1}`, src: item.image, detail: base },
      { label: `Original attempt ${index + 1}`, src: item.raw_image, detail: base }
    ]);
  });
}

function renderRetryTextTable(field) {
  const retries = fieldRetryCandidates(field);
  if (!retries.length) return "";
  const rows = retries.slice(0, 16).map((item, index) => `<tr>
    <td>${index + 1}</td>
    <td>${escapeHtml(item.kind || "-")}</td>
    <td>${escapeHtml(item.text || "-")}</td>
    <td>${escapeHtml(item.normalized_value || "-")}</td>
    <td>${escapeHtml(item.error || (item.plausible === false ? "Not plausible" : ""))}</td>
  </tr>`).join("");
  return `<div class="artifact-group retry-text">
    <h5>OCR text by retry variant</h5>
    <div class="retry-table-wrap">
      <table class="mini-table">
        <thead><tr><th>#</th><th>Variant</th><th>OCR text</th><th>Normalized</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

function renderArtifactExplorer(doc, name, field) {
  const pageEntries = pageArtifactEntries(doc, field);
  const fieldEntries = fieldArtifactEntries(doc, name, field);
  const retryEntries = retryArtifactEntries(field);
  const retryTotal = fieldRetryCandidates(field).length;
  return `<section class="debug-section">
    <h4>Artifact explorer</h4>
    ${renderArtifactGroup("Page images", pageEntries)}
    ${renderArtifactGroup("Field crops", fieldEntries)}
    ${renderArtifactGroup(`Retry variants${retryTotal > 12 ? ` (${retryTotal}, first 12 shown)` : ""}`, retryEntries)}
    ${renderRetryTextTable(field)}
  </section>`;
}

function renderZoomPanelContent(doc, name) {
  const field = getField(doc, name);
  if (!field) {
    return `<div class="zoom-empty">Select a field to view its crop.</div>`;
  }
  const label = fieldLabel(name, editFieldContext(doc));
  const level = confidenceLevel(field);
  const crop = fieldThumbnailUrl(field);
  const layoutCrop = layoutPreviewUrl(doc, field);
  const decisionCrop = trustedDecisionCropUrl(field) || crop;
  return `<div class="zoom-head">
      <div>
        <span>${escapeHtml(label)}</span>
        <b>${escapeHtml(name)}</b>
      </div>
      <span class="confidence-badge ${escapeHtml(level)}">${escapeHtml(confidenceText(field))}</span>
    </div>
    ${crop ? `<button class="zoom-stage zoom-image-button" data-open-image-preview data-preview-src="${escapeHtml(crop)}" data-preview-layout-src="${escapeHtml(crop)}" data-preview-decision-src="${escapeHtml(crop)}" data-preview-title="${escapeHtml(label)}">
      <img src="${escapeHtml(crop)}" alt="${escapeHtml(label)}">
      <span class="zoom-image-hint">Click image to enlarge</span>
    </button>` : `<div class="zoom-empty">No crop for this field.</div>`}
    <div class="crop-tools review-crop-tools">
      <button class="mini-action" data-open-crop="${escapeHtml(doc.id)}" data-crop-field="${escapeHtml(name)}">Select crop</button>
      ${layoutCrop && layoutCrop !== decisionCrop ? `<button class="mini-action link-action" data-open-image-preview data-preview-layout-src="${escapeHtml(layoutCrop)}" data-preview-decision-src="${escapeHtml(decisionCrop || crop)}" data-preview-title="${escapeHtml(label)}">Layout crop</button>` : ""}
    </div>
    <div class="zoom-meta">
      <span class="mini-pill ${escapeHtml(`confidence-${level}`)}">${escapeHtml(confidenceLabel(level))}</span>
      <span class="mini-pill">${escapeHtml(field.method || "rule")}</span>
      ${visualBadge(field)}
    </div>
    ${renderEvidenceWarning(field)}
    ${renderEvidenceChips(field)}
    ${renderFieldDebugTimeline(doc, name, field)}
    ${renderArtifactExplorer(doc, name, field)}`;
}

function renderReviewZoomPanel(doc, name) {
  return `<aside class="panel review-zoom" data-review-zoom>
    ${renderZoomPanelContent(doc, name)}
  </aside>`;
}

function renderPaper(doc) {
  const signatureFields = ["quyen_han_ky_thay", "chuc_vu_nguoi_ky", "nguoi_ky"].map((name) => getField(doc, name)).filter(Boolean);
  const signatureField = signatureFields.find((field) => fieldThumbnailUrl(field)) || signatureFields[0];
  const signatureCrop = fieldThumbnailUrl(signatureField);
  return `<section class="doc-sheet">
    <div class="letter-top">
      <div class="agency-block">
        ${nl2br(fieldText(doc, "co_quan_ban_hanh", "ISSUING AUTHORITY"))}
        <span class="doc-number">${escapeHtml(fieldText(doc, "so_van_ban") ? `No. ${fieldText(doc, "so_van_ban")}` : "")}</span>
      </div>
      <div class="national-block">
        <span class="national-title">${escapeHtml(fieldText(doc, "quoc_hieu_tieu_ngu", "NATIONAL TITLE"))}</span>
        <span class="date-line">${escapeHtml(documentDateLine(doc))}</span>
      </div>
    </div>
    <div class="title-block">
      <span class="doc-type">${escapeHtml(fieldText(doc, "loai_van_ban", "DOCUMENT"))}</span>
      <span class="summary">${escapeHtml(fieldText(doc, "trich_yeu"))}</span>
    </div>
    <div class="signature-block">
      <b>${escapeHtml(fieldText(doc, "quyen_han_ky_thay"))}</b>
      <span>${escapeHtml(fieldText(doc, "chuc_vu_nguoi_ky"))}</span>
      ${signatureCrop ? `<img class="signature-crop" src="${escapeHtml(signatureCrop)}" alt="Signing authority">` : ""}
      <span class="signer">${escapeHtml(fieldText(doc, "nguoi_ky"))}</span>
    </div>
  </section>`;
}

function selectedPage(doc) {
  const index = state.pageByDoc[doc.id] || 0;
  return doc.pages[index] || doc.pages[0] || null;
}

function renderPreview(doc) {
  const page = selectedPage(doc);
  const image = page?.images?.layout_overlay || pageImageUrl(page);
  const options = (doc.pages || []).map((pageItem, index) => {
    const pageNumber = Number(pageItem.page_index || 0) + 1;
    return `<option value="${index}" ${selectedPage(doc) === pageItem ? "selected" : ""}>Page ${pageNumber}</option>`;
  }).join("");
  return `<aside class="panel page-preview">
    <div class="preview-tools">
      <select class="select" data-page-select data-doc-id="${escapeHtml(doc.id)}">${options}</select>
      <span class="mini-pill">${escapeHtml(page?.ocr_line_count ?? 0)} OCR lines</span>
    </div>
    ${image ? `<img src="${escapeHtml(image)}" alt="Document page">` : `<div class="empty">No page image.</div>`}
  </aside>`;
}

function warningText(item) {
  if (!item || typeof item !== "object") return String(item || "");
  if (item.type === "missing_required_fields") {
    const fields = Array.isArray(item.fields) ? item.fields.join(", ") : "unknown";
    return `Missing required fields: ${fields}`;
  }
  const hasPage = item.page_index !== null && item.page_index !== undefined && Number.isFinite(Number(item.page_index));
  const page = hasPage ? `Page ${Number(item.page_index) + 1}` : "Document";
  const retry = Math.max(0, Number(item.ocr_attempt_count || 0) + Number(item.metadata_attempt_count || 0) - 2);
  const reason = item.ocr_error || item.metadata_error || item.error || item.type || "processing failed";
  return `${page}: ${reason}${retry > 0 ? `, retry ${retry}` : ""}`;
}

function blockerText(value) {
  const text = String(value || "");
  const suffix = "_missing_required_fields";
  return text.endsWith(suffix) ? `${text.slice(0, -suffix.length)}: missing required fields` : text;
}

function renderQualityBanner(doc) {
  const warnings = Array.isArray(doc?.quality_warnings) ? doc.quality_warnings : [];
  const blockers = Array.isArray(doc?.approval_blockers) ? doc.approval_blockers : [];
  const summary = doc?.quality_summary || {};
  if (!warnings.length && !blockers.length) return "";
  const expected = Number(summary.expected_page_count || 0);
  const success = Number(summary.successful_page_count || 0);
  const failed = Number(summary.failed_page_count ?? 0);
  const retry = Number(summary.retry_count || 0);
  const documentWarnings = warnings.filter((item) => item?.page_index === null || item?.page_index === undefined || !Number.isFinite(Number(item.page_index))).length;
  const lines = warnings.slice(0, 6).map((item) => `<li>${escapeHtml(warningText(item))}</li>`).join("");
  const more = warnings.length > 6 ? `<li>... ${escapeHtml(warnings.length - 6)} more warnings</li>` : "";
  return `<section class="panel">
    <div class="errors">
      <b>Completed with warnings; approval is blocked while issues remain.</b>
      <div>${escapeHtml(success)}/${escapeHtml(expected || success + failed)} successful pages, ${escapeHtml(failed)} failed pages, ${escapeHtml(documentWarnings)} document warnings, retry ${escapeHtml(retry)}.</div>
      ${lines || more ? `<ul>${lines}${more}</ul>` : ""}
      ${blockers.length ? `<small>Approval blockers: ${escapeHtml(blockers.map(blockerText).join(", "))}</small>` : ""}
    </div>
  </section>`;
}

function renderOverview(doc) {
  const page = selectedPage(doc);
  return `<div class="detail-grid">
    ${renderPreview(doc)}
    <div>
      ${renderPaper(doc)}
      ${renderFieldGroups(doc)}
      <section class="panel review-pane">
        <h3>OCR text for current page</h3>
        <pre class="raw-text">${escapeHtml(page?.text || "No OCR text.")}</pre>
      </section>
    </div>
  </div>`;
}

function renderEdit(doc) {
  const fieldContext = editFieldContext(doc);
  const names = orderedFieldNames(doc, true, editFieldOrder(doc));
  const emptyMessage = doc.error ? `Pipeline error: ${doc.error}` : "No fields to correct.";
  const persistReady = canPersistCorrections();
  const correctedJsonUrl = state.editResult?.corrected_json_url || doc.corrected_json_url || doc.dataset_status?.corrected_json_url || "";
  const resultLink = correctedJsonUrl
    ? `<a class="button ghost" href="${escapeHtml(correctedJsonUrl)}" target="_blank">Open corrected JSON</a>`
    : "";
  const activeZoomField = state.zoomField && names.includes(state.zoomField) ? state.zoomField : firstReviewField(doc, names);
  const rows = names.map((name) => {
    const field = getField(doc, name);
    const suggestion = renderSuggestion(field, name);
    const level = confidenceLevel(field);
    const isZoomed = name === activeZoomField;
    const label = fieldLabel(name, fieldContext);
    return `<tr data-field-row="${escapeHtml(name)}" class="confidence-row confidence-${escapeHtml(level)} ${isZoomed ? "zoom-active" : ""}">
      <td><button class="field-select-button" data-select-review-field="${escapeHtml(name)}"><b>${escapeHtml(label)}</b><br><span class="mini-pill">${escapeHtml(name)}</span><span class="field-meta"><span class="confidence-badge ${escapeHtml(level)}">${escapeHtml(confidenceText(field))}</span></span></button></td>
      <td>
        <textarea class="textarea confidence-input confidence-${escapeHtml(level)}" data-field-edit="${escapeHtml(name)}" data-field-label="${escapeHtml(label)}">${escapeHtml(editValue(field))}</textarea>
        ${renderCorrectionDiff(field)}
        ${suggestion}
      </td>
      <td>${renderFieldReviewBadge(field)}</td>
    </tr>`;
  }).join("");
  return `<div class="review-edit-layout" data-edit-review data-edit-doc-id="${escapeHtml(doc.id)}">
  <section class="panel table-shell review-edit-table">
    <table class="table">
      <thead><tr><th>Field</th><th>Corrected value</th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" class="empty">${escapeHtml(emptyMessage)}</td></tr>`}</tbody>
    </table>
    <div class="edit-actions">
      ${state.editError ? `<div class="errors">${escapeHtml(state.editError)}</div>` : ""}
      ${state.editMessage ? `<p class="edit-message"><span class="status success">${escapeHtml(state.editMessage)}</span></p>` : ""}
      ${persistReady ? "" : `<p class="note">This static report only saves changes in the browser. Open the report through /jobs/... to write corrections to disk.</p>`}
      <div class="toolbar">
        <button class="button" data-save-edits="${escapeHtml(doc.id)}" ${state.editSaving ? "disabled" : ""}>${state.editSaving ? "Saving..." : "Save corrections"}</button>
        ${resultLink}
      </div>
    </div>
  </section>
  ${renderReviewZoomPanel(doc, activeZoomField)}
  </div>`;
}

function renderImageModal() {
  const modal = state.imageModal;
  const layoutSrc = modal?.layoutSrc || modal?.src || "";
  const decisionSrc = modal?.decisionSrc || modal?.src || "";
  if (!layoutSrc && !decisionSrc) return "";
  const zoom = state.imageModalZoom === "actual" ? "actual" : "fit";
  const panel = (label, src) => `<figure class="image-modal-panel">
    <figcaption>${escapeHtml(label)}</figcaption>
    <div class="image-modal-stage zoom-${escapeHtml(zoom)}">
      ${src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}">` : `<div class="empty">No image.</div>`}
    </div>
  </figure>`;
  const singleImage = layoutSrc && layoutSrc === decisionSrc;
  const downloadHref = decisionSrc || layoutSrc;
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal image-modal" data-modal>
      <div class="image-modal-head">
        <h3>${escapeHtml(modal.title || "View image")}</h3>
        <div class="image-modal-toolbar">
          <button class="mini-action ${zoom === "fit" ? "active" : ""}" data-image-zoom="fit">Fit</button>
          <button class="mini-action ${zoom === "actual" ? "active" : ""}" data-image-zoom="actual">100%</button>
          ${downloadHref ? `<a class="mini-action link-action" href="${escapeHtml(downloadHref)}" download>Download</a>` : ""}
          <button class="mini-action" data-close-image-preview>Close</button>
        </div>
      </div>
      <div class="image-modal-grid ${singleImage ? "single" : ""}">
        ${singleImage ? panel(modal.title || "Intermediate file", layoutSrc) : `${panel("Layout crop", layoutSrc)}${panel("Result crop", decisionSrc)}`}
      </div>
    </section>
  </div>`;
}


function cropModalPageIndex(doc, field) {
  const modal = state.cropModal || {};
  if (Number.isInteger(modal.pageIndex)) return modal.pageIndex;
  const fieldPage = Number(field?.page_index);
  if (Number.isFinite(fieldPage)) {
    const index = (doc.pages || []).findIndex((page) => Number(page.page_index || 0) === fieldPage);
    if (index >= 0) return index;
  }
  return state.pageByDoc[doc.id] || 0;
}

function renderCropModal(doc) {
  const modal = state.cropModal;
  if (!modal || modal.docId !== doc.id) return "";
  const field = getField(doc, modal.field);
  const pageIndex = cropModalPageIndex(doc, field);
  const page = doc.pages?.[pageIndex] || doc.pages?.[0] || null;
  const image = pageImageUrl(page);
  const label = fieldLabel(modal.field, editFieldContext(doc));
  const options = (doc.pages || []).map((pageItem, index) => {
    const pageNumber = Number(pageItem.page_index || 0) + 1;
    return `<option value="${index}" ${index === pageIndex ? "selected" : ""}>Page ${pageNumber}</option>`;
  }).join("");
  const persistReady = canPersistCorrections();
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal crop-modal" data-modal>
      <h3>Select crop for ${escapeHtml(label)}</h3>
      <div class="crop-toolbar">
        <select class="select" data-crop-page>${options}</select>
        <span class="mini-pill">${escapeHtml(field?.name || modal.field)}</span>
      </div>
      ${modal.error ? `<div class="errors">${escapeHtml(modal.error)}</div>` : ""}
      ${persistReady ? "" : `<p class="note">Open the report through /jobs/... to save a manual crop to disk.</p>`}
      ${image ? `<div class="crop-stage-wrap">
        <div class="crop-stage" data-crop-stage>
          <img data-crop-image src="${escapeHtml(image)}" alt="Page image">
          <div class="crop-selection" data-crop-box hidden></div>
        </div>
      </div>` : `<div class="empty">No page image is available for crop selection.</div>`}
      <div class="modal-actions">
        <button class="button" data-save-crop ${modal.saving || !image || !persistReady ? "disabled" : ""}>${modal.saving ? "Saving..." : "Save crop"}</button>
        <button class="button secondary" data-crop-cancel>Cancel</button>
      </div>
    </section>
  </div>`;
}

function renderCover(doc) {
  const rows = COVER_FIELD_ORDER.map((name) => {
    const value = fieldText(doc, name, name === "hop_so" ? doc.hop_so : "");
    return `<tr><td>${escapeHtml(fieldLabel(name, "cover"))}</td><td>${escapeHtml(value || "-")}</td></tr>`;
  }).join("");
  return `<section class="panel table-shell">
    <table class="table">
      <thead><tr><th>Cover information</th><th>OCR value</th></tr></thead>
      <tbody>
        <tr><td>Fonds</td><td>${escapeHtml(doc.phong_luu_tru || "-")}</td></tr>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

function renderDetail() {
  const doc = getDoc();
  if (!doc) return `<div class="empty">No OCR documents.</div>`;
  state.detailMode = normalizeDetailMode(state.detailMode, doc);
  const modeContent = {
    overview: () => renderOverview(doc),
    edit: () => renderEdit(doc),
    cover: () => renderCover(doc)
  }[state.detailMode]();

  return `<section class="view-head">
    <div>
      <h2>Box ${escapeHtml(doc.hop_so || "")} details</h2>
      <p>${escapeHtml(doc.phong_luu_tru || doc.file_name || "")} ${renderDatasetBadge(doc)}</p>
    </div>
    <div class="toolbar">
      ${detailModeButton("overview", "Details")}
      ${detailModeButton("edit", "Corrections")}
      ${isCoverOnlyDocument(doc) ? detailModeButton("cover", "Cover") : ""}
      <button class="button secondary" data-view="manage">Back</button>
    </div>
  </section>${renderQualityBanner(doc)}${modeContent}${renderCropModal(doc)}${renderImageModal()}`;
}

function filteredLogs() {
  return (DATA.logs || []).filter((row) => {
    const actionOk = state.logAction === "all" || row.action === state.logAction;
    const statusOk = state.logStatus === "all" || row.status === state.logStatus;
    return actionOk && statusOk;
  });
}

function logActionLabel(value) {
  return {
    web_upload: "Web upload",
    upload: "Upload",
    ocr: "OCR recognition",
    correction: "Corrections",
    manual_crop: "Manual crop"
  }[value] || (value ? "Other action" : "-");
}

function logStatusLabel(value) {
  return {
    success: "Success",
    error: "Error",
    started: "Started",
    running: "Running"
  }[value] || (value ? "Unknown" : "-");
}

function renderLogs() {
  const actions = Array.from(new Set((DATA.logs || []).map((row) => row.action))).sort();
  const rows = filteredLogs().map((row) => `<tr>
    <td>${escapeHtml(row.id)}</td>
    <td>${escapeHtml(row.box || "-")}</td>
    <td>${escapeHtml(logActionLabel(row.action))}</td>
    <td><span class="status ${statusClass(row.status)}">${escapeHtml(logStatusLabel(row.status))}</span></td>
    <td>${escapeHtml(row.message || "")}</td>
    <td>${escapeHtml(row.time || "")}</td>
    <td>${escapeHtml(row.detail || "-")}</td>
  </tr>`).join("");
  return `<section class="view-head"><div><h2>${escapeHtml(t("nav.logs"))}</h2></div></section>
    <section class="toolbar" style="margin-bottom:18px">
      <select class="select" data-log-action style="max-width:180px">
        <option value="all">All actions</option>
        ${actions.map((action) => `<option value="${escapeHtml(action)}" ${state.logAction === action ? "selected" : ""}>${escapeHtml(logActionLabel(action))}</option>`).join("")}
      </select>
      <select class="select" data-log-status style="max-width:180px">
        <option value="all">All statuses</option>
        <option value="success" ${state.logStatus === "success" ? "selected" : ""}>Success</option>
        <option value="error" ${state.logStatus === "error" ? "selected" : ""}>Error</option>
        <option value="started" ${state.logStatus === "started" ? "selected" : ""}>Started</option>
      </select>
      <button class="button dark">Filter</button>
    </section>
    <section class="panel table-shell">
      <table class="table">
        <thead><tr><th>ID</th><th>Box</th><th>Action</th><th>Status</th><th>Message</th><th>Time</th><th>Details</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No matching logs.</td></tr>`}</tbody>
      </table>
    </section>`;
}

function incrementCounter(map, key, amount = 1) {
  const normalized = String(key || "").trim() || "unknown";
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function topCounterRows(map, limit = 8) {
  return Array.from(map.entries())
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function comparableFieldText(value) {
  return compact(String(value ?? "")).replace(/\s+/g, "");
}

function isManualCropField(field) {
  return Boolean(field?.manual_crop || field?.crop_method === "manual" || field?.decision_crop_source === "manual_crop");
}

function emptyFieldQuality(name) {
  return {
    name,
    label: FIELD_LABELS[name] || name,
    total: 0,
    corrections: 0,
    manualCrops: 0,
    reviewRisks: 0,
    suggestionOnly: 0,
    suggestions: 0,
    suggestionAccepted: 0,
    suggestionRejected: 0,
    suggestionPending: 0,
    datasetSkipped: 0,
    cropNotFound: 0,
    missingCrop: 0,
    confidence: { good: 0, warning: 0, low: 0, unknown: 0 },
    reasons: new Map()
  };
}

function qualityFieldMapEntry(map, name) {
  const key = String(name || "unknown");
  if (!map.has(key)) map.set(key, emptyFieldQuality(key));
  return map.get(key);
}

function correctionCountsByField(doc) {
  const counts = new Map();
  (Array.isArray(doc?.correction_records) ? doc.correction_records : []).forEach((record) => {
    if (record?.field) incrementCounter(counts, record.field);
  });
  return counts;
}

function datasetSkipsByField(doc) {
  const skips = new Map();
  (Array.isArray(doc?.dataset_skip_records) ? doc.dataset_skip_records : []).forEach((record) => {
    const field = String(record?.field || "unknown");
    const reason = String(record?.reason || "unknown");
    if (!skips.has(field)) skips.set(field, []);
    skips.get(field).push(reason);
  });
  return skips;
}

function buildQualityDashboard() {
  const fields = new Map();
  const reasonCounts = new Map();
  const confidenceTotals = { good: 0, warning: 0, low: 0, unknown: 0 };
  const suggestionTotals = { total: 0, accepted: 0, rejected: 0, pending: 0 };
  const pageIssues = { skippedPages: 0, errorPages: 0, cropNotFound: 0, missingCrop: 0, datasetSkipped: 0 };

  DATA.documents.forEach((doc) => {
    const correctionCounts = correctionCountsByField(doc);
    const datasetSkips = datasetSkipsByField(doc);
    (doc.pages || []).forEach((page) => {
      const scope = String(page?.ocr_scope || "");
      const error = String(page?.error || "");
      if (scope === "skipped" || /ocr skipped/i.test(String(page?.message || page?.text || ""))) pageIssues.skippedPages += 1;
      if (error) pageIssues.errorPages += 1;
    });

    datasetSkips.forEach((reasons, fieldName) => {
      const stat = qualityFieldMapEntry(fields, fieldName);
      reasons.forEach((reason) => {
        stat.datasetSkipped += 1;
        pageIssues.datasetSkipped += 1;
        if (reason === "crop_not_found") {
          stat.cropNotFound += 1;
          pageIssues.cropNotFound += 1;
        }
        if (reason === "missing_label_or_crop") {
          stat.missingCrop += 1;
          pageIssues.missingCrop += 1;
        }
      });
    });

    Object.entries(doc.fields || {}).forEach(([name, field]) => {
      if (!field || typeof field !== "object") return;
      const stat = qualityFieldMapEntry(fields, name);
      stat.total += 1;

      const correctedCount = correctionCounts.get(name)
        || Number(field.correction_count || 0)
        || (isResolvedField(field) ? 1 : 0);
      stat.corrections += correctedCount;

      if (isManualCropField(field)) stat.manualCrops += 1;
      if (hasTrueReviewRisk(field)) stat.reviewRisks += 1;
      if (hasSuggestionOnlyReview(field)) stat.suggestionOnly += 1;

      const reason = fieldReviewReason(field);
      if (reason && !isSoftReviewReason(reason)) {
        incrementCounter(stat.reasons, reason);
        incrementCounter(reasonCounts, reason);
      }

      const level = confidenceLevel(field);
      stat.confidence[level] = Number(stat.confidence[level] || 0) + 1;
      confidenceTotals[level] = Number(confidenceTotals[level] || 0) + 1;

      const suggestion = bestSuggestion(field);
      if (suggestion?.value) {
        const finalValue = comparableFieldText(field.value || field.correction_new_value || "");
        const suggestionValue = comparableFieldText(suggestion.value);
        stat.suggestions += 1;
        suggestionTotals.total += 1;
        if (!finalValue) {
          stat.suggestionPending += 1;
          suggestionTotals.pending += 1;
        } else if (finalValue === suggestionValue) {
          stat.suggestionAccepted += 1;
          suggestionTotals.accepted += 1;
        } else {
          stat.suggestionRejected += 1;
          suggestionTotals.rejected += 1;
        }
      }
    });
  });

  const fieldRows = Array.from(fields.values())
    .sort((a, b) => (
      Number(b.corrections || 0) - Number(a.corrections || 0)
      || Number(b.reviewRisks || 0) - Number(a.reviewRisks || 0)
      || Number(b.manualCrops || 0) - Number(a.manualCrops || 0)
      || String(a.label).localeCompare(String(b.label))
    ));
  return { fieldRows, reasonRows: topCounterRows(reasonCounts), confidenceTotals, suggestionTotals, pageIssues };
}

function renderConfidenceBuckets(buckets) {
  const labels = {
    good: "Trusted",
    warning: "Review",
    low: "High risk",
    unknown: "No score"
  };
  return Object.entries(labels).map(([key, label]) => `<div class="bucket-row">
    <span>${escapeHtml(label)}</span>
    <b>${Number(buckets?.[key] || 0)}</b>
  </div>`).join("");
}

function renderQualityDashboard() {
  const quality = buildQualityDashboard();
  const totals = quality.fieldRows.reduce((acc, row) => {
    acc.corrections += row.corrections;
    acc.manualCrops += row.manualCrops;
    acc.reviewRisks += row.reviewRisks;
    acc.cropNotFound += row.cropNotFound;
    return acc;
  }, { corrections: 0, manualCrops: 0, reviewRisks: 0, cropNotFound: 0 });
  const fieldRows = quality.fieldRows.slice(0, 18).map((row) => {
    const topReason = topCounterRows(row.reasons, 1)[0];
    return `<tr>
      <td><b>${escapeHtml(row.label)}</b><br><code>${escapeHtml(row.name)}</code></td>
      <td>${row.total}</td>
      <td>${row.corrections}</td>
      <td>${row.manualCrops}</td>
      <td>${row.reviewRisks}</td>
      <td>${row.suggestionAccepted}/${row.suggestionRejected}${row.suggestionPending ? `/${row.suggestionPending}` : ""}</td>
      <td>${row.confidence.good}/${row.confidence.warning}/${row.confidence.low}/${row.confidence.unknown}</td>
      <td>${row.datasetSkipped}${row.cropNotFound ? ` · crop ${row.cropNotFound}` : ""}${row.missingCrop ? ` · missing ${row.missingCrop}` : ""}</td>
      <td>${escapeHtml(topReason ? `${reviewReasonLabel(topReason.key)} (${topReason.count})` : "-")}</td>
    </tr>`;
  }).join("");
  const reasonRows = quality.reasonRows.map((row) => `<tr><td>${escapeHtml(reviewReasonLabel(row.key))}</td><td>${row.count}</td></tr>`).join("");
  return `<section class="panel report-panel quality-dashboard">
    <h3>Field quality dashboard</h3>
    <div class="quality-stat-grid">
      <div class="quality-stat"><span>Corrections</span><b>${totals.corrections}</b></div>
      <div class="quality-stat"><span>Manual crops</span><b>${totals.manualCrops}</b></div>
      <div class="quality-stat"><span>Review risks</span><b>${totals.reviewRisks}</b></div>
      <div class="quality-stat"><span>Suggestions accepted/rejected/pending</span><b>${quality.suggestionTotals.accepted}/${quality.suggestionTotals.rejected}/${quality.suggestionTotals.pending}</b></div>
      <div class="quality-stat"><span>Crop not found</span><b>${quality.pageIssues.cropNotFound}</b></div>
      <div class="quality-stat"><span>Skipped/error pages</span><b>${quality.pageIssues.skippedPages}/${quality.pageIssues.errorPages}</b></div>
    </div>
    <div class="quality-layout">
      <div class="quality-table-wrap">
        <table class="table quality-table">
          <thead><tr><th>Field</th><th>Count</th><th>Corrections</th><th>Manual crops</th><th>Risks</th><th>Suggestion A/R/P</th><th>Trusted/review/low/n/a</th><th>Skipped samples</th><th>Main reason</th></tr></thead>
          <tbody>${fieldRows || `<tr><td colspan="9" class="empty">No field data.</td></tr>`}</tbody>
        </table>
      </div>
      <aside class="quality-side">
        <div>
          <h4>Most frequent review reasons</h4>
          <table class="mini-table">
            <tbody>${reasonRows || `<tr><td class="empty">No review risk.</td><td>0</td></tr>`}</tbody>
          </table>
        </div>
        <div>
          <h4>Confidence groups</h4>
          <div class="bucket-list">${renderConfidenceBuckets(quality.confidenceTotals)}</div>
        </div>
        <div>
          <h4>Page and dataset issues</h4>
          <div class="bucket-list">
            <div class="bucket-row"><span>Skipped samples</span><b>${quality.pageIssues.datasetSkipped}</b></div>
            <div class="bucket-row"><span>Missing label or crop</span><b>${quality.pageIssues.missingCrop}</b></div>
            <div class="bucket-row"><span>Crop not found</span><b>${quality.pageIssues.cropNotFound}</b></div>
            <div class="bucket-row"><span>Skipped OCR pages</span><b>${quality.pageIssues.skippedPages}</b></div>
            <div class="bucket-row"><span>Error pages</span><b>${quality.pageIssues.errorPages}</b></div>
          </div>
        </div>
      </aside>
    </div>
  </section>`;
}

function renderOperationsReport() {
  const metrics = DATA.metrics || {};
  const report = DATA.operations_report || { by_method: [], errors: [], recent_jobs: [] };
  const methodRows = (report.by_method || []).map((row) => `<tr>
    <td><b>${escapeHtml(ocrMethodLabel(row.method))}</b></td><td>${Number(row.jobs || 0)}</td>
    <td>${Number(row.completed || 0)}</td><td>${Number(row.errors || 0)}</td><td>${Number(row.active || 0)}</td>
    <td><b>${escapeHtml(Number(row.success_rate || 0).toFixed(1))}%</b></td><td>${Number(row.pages || 0)}</td>
    <td>${escapeHtml(formatSecondsPerPage(Number(row.seconds_per_page || 0)))}</td><td>${Number(row.corrections || 0)}</td>
  </tr>`).join("");
  const errorRows = (report.errors || []).map((item) => `<tr><td>${escapeHtml(t(`errors.${item.code}`))}</td><td><code>${escapeHtml(item.code)}</code></td><td><b>${Number(item.count || 0)}</b></td></tr>`).join("");
  const recentRows = (report.recent_jobs || []).map((job) => `<tr><td>${escapeHtml(jobDisplayName(job))}</td><td>${escapeHtml(ocrMethodLabel(job.ocr_method))}</td><td><span class="status ${statusClass(job.status)}">${escapeHtml(jobStatusLabel(job.status))}</span></td><td>${escapeHtml(jobDocumentSummary(job))}</td><td>${escapeHtml(formatJobTime(job.created_at))}</td><td>${job.report_url ? `<a class="mini-action" href="${escapeHtml(job.report_url)}">${escapeHtml(t("jobs.open"))}</a>` : "-"}</td></tr>`).join("");
  return `<section class="view-head"><div><h2>${escapeHtml(t("report.operations"))}</h2><p>${escapeHtml(t("report.operations_subtitle"))}</p></div></section>
    <section class="metrics"><div class="panel metric"><span>${escapeHtml(t("report.jobs"))}</span><b>${Number(metrics.total_jobs || 0)}</b></div><div class="panel metric blue"><span>${escapeHtml(t("report.pages"))}</span><b>${Number(metrics.pages || 0)}</b></div><div class="panel metric green"><span>${escapeHtml(t("report.corrections"))}</span><b>${Number(metrics.correction_count || 0)}</b></div><div class="panel metric red"><span>${escapeHtml(t("report.errors"))}</span><b>${Number(metrics.error_jobs || 0)}</b></div></section>
    <section class="panel report-panel"><h3>${escapeHtml(t("report.by_engine"))}</h3><div class="table-shell"><table class="table operations-engine-table"><thead><tr><th>${escapeHtml(t("report.engine"))}</th><th>Jobs</th><th>${escapeHtml(t("jobs.completed"))}</th><th>${escapeHtml(t("jobs.errors"))}</th><th>${escapeHtml(t("jobs.running"))}</th><th>${escapeHtml(t("report.success_rate"))}</th><th>Pages</th><th>${escapeHtml(t("report.module_page"))}</th><th>${escapeHtml(t("report.corrections"))}</th></tr></thead><tbody>${methodRows || `<tr><td colspan="9" class="empty">${escapeHtml(t("jobs.empty"))}</td></tr>`}</tbody></table></div></section>
    <section class="report-grid"><div class="panel report-panel"><h3>${escapeHtml(t("report.common_errors"))}</h3><table class="table"><thead><tr><th>Error</th><th>Code</th><th>Count</th></tr></thead><tbody>${errorRows || `<tr><td colspan="3" class="empty">${escapeHtml(t("report.no_errors"))}</td></tr>`}</tbody></table></div><div class="panel report-panel"><h3>${escapeHtml(t("report.recent"))}</h3><div class="table-shell"><table class="table"><thead><tr><th>Job</th><th>${escapeHtml(t("report.engine"))}</th><th>Status</th><th>Scope</th><th>Date</th><th>Result</th></tr></thead><tbody>${recentRows || `<tr><td colspan="6" class="empty">${escapeHtml(t("jobs.empty"))}</td></tr>`}</tbody></table></div></div></section>
    ${renderBenchmarkPanel()}`;
}

function renderReport() {
  if (isRootServerApp()) return renderOperationsReport();
  const metrics = effectiveMetrics();
  const chart = [
    ["Boxes", metrics.documents || 0, "var(--accent)"],
    ["Files", metrics.logical_documents || 0, "var(--blue)"],
    ["Documents", metrics.fields || 0, "var(--green)"],
    ["Review needed", metrics.review_items || 0, "var(--purple)"],
    ["Errors", metrics.errors || 0, "var(--danger)"]
  ];
  const maxValue = Math.max(...chart.map((item) => Number(item[1]) || 0), 1);
  const recentRows = DATA.documents.length ? DATA.documents.slice(0, 10).map((doc) => {
    const status = documentWorkflowStatus(doc);
    return `<tr>
    <td>${escapeHtml(doc.hop_so)}</td>
    <td>${escapeHtml(doc.phong_luu_tru)}</td>
    <td><span class="status ${statusClass(status.value)}">${escapeHtml(status.label)}</span></td>
    <td>${escapeHtml((doc.processed_at || "").slice(0, 10))}</td>
  </tr>`;
  }).join("") : DATA.jobs.slice(0, 10).map((job) => `<tr>
    <td>${escapeHtml(jobDisplayName(job))}</td>
    <td>${escapeHtml(jobDocumentSummary(job))}</td>
    <td><span class="status ${statusClass(job.status)}">${escapeHtml(jobStatusLabel(job.status))}</span></td>
    <td>${escapeHtml(formatJobTime(job.created_at).slice(0, 10))}</td>
  </tr>`).join("");
  const recentTitle = DATA.documents.length ? "Latest 10 boxes" : "Latest 10 OCR jobs";
  const firstColumn = DATA.documents.length ? "Box" : "Job";
  const secondColumn = DATA.documents.length ? "Fonds" : "Scope";

  return `<section class="view-head"><div><h2>${escapeHtml(t("nav.report"))}</h2></div></section>
    <section class="metrics">
      <div class="panel metric"><span>Boxes</span><b>${metrics.documents || 0}</b></div>
      <div class="panel metric blue"><span>Files</span><b>${metrics.logical_documents || 0}</b></div>
      <div class="panel metric green"><span>Documents</span><b>${metrics.fields || 0}</b></div>
      <div class="panel metric purple"><span>Review needed</span><b>${metrics.review_items || 0}</b></div>
    </section>
    ${renderQualityDashboard()}
    <section class="report-grid">
      <div class="panel report-panel">
        <h3>${escapeHtml(recentTitle)}</h3>
        <div class="table-shell">
          <table class="table" style="min-width:520px">
            <thead><tr><th>${escapeHtml(firstColumn)}</th><th>${escapeHtml(secondColumn)}</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>${recentRows || `<tr><td colspan="4" class="empty">No data.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      <div class="panel report-panel">
        <h3>Overview</h3>
        <div class="bar-chart">
          ${chart.map(([label, value, color]) => `<div class="bar">
            <div class="bar-fill" style="height:${Math.max(6, (Number(value) / maxValue) * 100)}%;background:${color}" title="${escapeHtml(label)}: ${escapeHtml(value)}"></div>
            <div class="bar-label">${escapeHtml(label)}</div>
          </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderCodes() {
  const items = state.codeItems
    .filter((item) => state.codeGroup === "all" || item.group === state.codeGroup)
    .sort((a, b) => a.group.localeCompare(b.group) || Number(a.order) - Number(b.order));
  const rows = items.map((item) => `<tr>
    <td>${escapeHtml(groupLabel(item.group))}</td>
    <td><b>${escapeHtml(item.code)}</b></td>
    <td>${escapeHtml(item.label)}</td>
    <td>${escapeHtml(item.keywords)}</td>
    <td>${escapeHtml(item.order)}</td>
    <td><span class="status active">${item.active ? "Active" : "Hidden"}</span></td>
    <td><div class="action-list"><button class="chip-button" data-code-edit="${escapeHtml(item.id)}">Edit</button><button class="chip-button red" data-code-delete="${escapeHtml(item.id)}">Delete</button></div></td>
  </tr>`).join("");
  return `<section class="view-head">
      <div><h2>TT05 code catalog</h2></div>
      <button class="button" data-code-add>+ Add item</button>
    </section>
    <p class="codes-note">TT 05/2025/TT-BNV code list for EAD.xml. For document types, Code is the abbreviation and Display label is the OCR-recognized name.</p>
    <section class="code-tabs">
      ${CODE_GROUPS.map((group) => `<button class="code-tab ${state.codeGroup === group.id ? "active" : ""}" data-code-group="${escapeHtml(group.id)}">${escapeHtml(group.label)}</button>`).join("")}
    </section>
    <section class="panel table-shell">
      <table class="table">
        <thead><tr><th>Group</th><th>Code</th><th>Display label</th><th>OCR keywords</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No codes in this group.</td></tr>`}</tbody>
      </table>
    </section>
    ${renderCodeModal()}`;
}

function renderCodeModal() {
  if (!state.codeModal) return "";
  const item = state.codeModal.id ? state.codeItems.find((entry) => entry.id === state.codeModal.id) : null;
  return `<div class="modal-backdrop" data-modal-close>
    <section class="modal" data-modal>
      <h3>${item ? "Edit code item" : "Add code item"}</h3>
      <div class="form-grid">
        <label>Group *
          <select class="select" id="code-group-input">
            ${CODE_GROUPS.filter((group) => group.id !== "all").map((group) => `<option value="${escapeHtml(group.id)}" ${(item?.group || state.codeGroup) === group.id ? "selected" : ""}>${escapeHtml(group.label)}</option>`).join("")}
          </select>
        </label>
        <label>Code *<input class="input" id="code-code-input" value="${escapeHtml(item?.code || "")}" placeholder="e.g. 01"></label>
        <label>Display label *<input class="input" id="code-label-input" value="${escapeHtml(item?.label || "")}" placeholder="e.g. Permanent"></label>
        <label>OCR keywords<input class="input" id="code-keywords-input" value="${escapeHtml(item?.keywords || "")}" placeholder="e.g. permanent"></label>
        <label>Order<input class="input" id="code-order-input" type="number" value="${escapeHtml(item?.order ?? 0)}"></label>
      </div>
      <div class="modal-actions">
        <button class="button" data-code-save="${escapeHtml(item?.id || "")}">Save</button>
        <button class="button secondary" data-code-cancel>Cancel</button>
      </div>
    </section>
  </div>`;
}

function renderPlaceholder(title) {
  return `<section class="view-head"><div><h2>${escapeHtml(title)}</h2></div></section>
    <section class="panel empty">This section keeps the administrative layout. OCR data is currently available in File management, Processing log, and Reports.</section>`;
}

function currentView() {
  if (state.view === "jobs") return renderJobs();
  if (state.view === "upload") return renderUpload();
  if (state.view === "manage") return renderManage();
  if (state.view === "detail") return renderDetail();
  if (state.view === "logs") return renderLogs();
  if (state.view === "report") return renderReport();
  if (state.view === "codes") return renderCodes();
  if (state.view === "account") return renderPlaceholder("Account");
  if (state.view === "settings") return renderPlaceholder("Settings");
  return DATA.documents.length ? renderManage() : renderJobs();
}

function captureRenderFocus() {
  const element = document.activeElement;
  if (!element || !app.contains(element) || !element.matches("[data-field-edit]")) return null;
  return {
    field: element.dataset.fieldEdit,
    start: element.selectionStart,
    end: element.selectionEnd
  };
}

function restoreRenderFocus(focusState) {
  if (!focusState?.field) return;
  const input = Array.from(app.querySelectorAll("[data-field-edit]")).find((item) => item.dataset.fieldEdit === focusState.field);
  if (!input) return;
  input.focus({ preventScroll: true });
  if (typeof input.setSelectionRange === "function") {
    const start = Number.isInteger(focusState.start) ? focusState.start : input.value.length;
    const end = Number.isInteger(focusState.end) ? focusState.end : start;
    input.setSelectionRange(start, end);
  }
  state.zoomField = focusState.field;
  updateReviewZoomPanel();
}

function capturePreservedScroll() {
  return Array.from(app.querySelectorAll("[data-preserve-scroll]")).map((element) => ({
    key: element.dataset.preserveScroll,
    top: element.scrollTop,
    atBottom: element.scrollTop + element.clientHeight >= element.scrollHeight - 12
  }));
}

function restorePreservedScroll(scrollState) {
  if (!Array.isArray(scrollState)) return;
  scrollState.forEach((item) => {
    if (!item?.key) return;
    const element = Array.from(app.querySelectorAll("[data-preserve-scroll]"))
      .find((candidate) => candidate.dataset.preserveScroll === item.key);
    if (!element) return;
    const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = item.atBottom ? maxTop : Math.min(item.top, maxTop);
  });
}

function updateUploadJobPanel() {
  const slot = app.querySelector("[data-upload-job-slot]");
  if (!slot) {
    render();
    return;
  }
  const scrollState = capturePreservedScroll();
  slot.innerHTML = renderUploadJob();
  I18N.translate?.(slot);
  restorePreservedScroll(scrollState);
}

function renderPollingUpdate() {
  if (state.view !== "upload") return;
  updateUploadJobPanel();
}

function updateSystemMonitorPanel() {
  const slot = app.querySelector("[data-system-monitor-content]");
  if (slot) slot.innerHTML = renderSystemMonitorContent();
}

async function refreshSystemMetrics() {
  if (!state.systemMonitorOpen) return;
  try {
    const response = await fetch("/api/system-metrics", { cache: "no-store" });
    if (!response.ok) throw new Error(`${t("system.fetch_error")} (${response.status})`);
    state.systemMetrics = await response.json();
    state.systemMetricsError = "";
  } catch (error) {
    state.systemMetricsError = error instanceof Error ? error.message : String(error);
  }
  updateSystemMonitorPanel();
  clearTimeout(systemMonitorTimer);
  if (state.systemMonitorOpen) systemMonitorTimer = setTimeout(refreshSystemMetrics, 2000);
}

function openSystemMonitor() {
  state.systemMonitorOpen = true;
  state.systemMetricsError = "";
  render();
  app.querySelector("[data-system-monitor-close]")?.focus();
  refreshSystemMetrics();
}

function closeSystemMonitor() {
  state.systemMonitorOpen = false;
  clearTimeout(systemMonitorTimer);
  systemMonitorTimer = null;
  render();
  app.querySelector("[data-system-monitor-open]")?.focus();
}

function openResourceUsage(groupIndex, methodIndex) {
  const item = jobBenchmarkGroups()[Number(groupIndex)]?.methods?.[Number(methodIndex)];
  if (!item) return;
  state.resourceUsageModal = { groupIndex: Number(groupIndex), methodIndex: Number(methodIndex), methodLabel: ocrMethodLabel(item.method), usage: item.resource_usage || {} };
  render();
  app.querySelector("[data-resource-usage-close]")?.focus();
}

function closeResourceUsage() {
  const modal = state.resourceUsageModal;
  state.resourceUsageModal = null;
  render();
  app.querySelector(`[data-resource-usage-group="${modal?.groupIndex}"][data-resource-usage-method="${modal?.methodIndex}"]`)?.focus();
}

function render() {
  const focusState = captureRenderFocus();
  const scrollState = capturePreservedScroll();
  if (state.view === "detail" && state.detailMode === "edit") {
    captureEditInputs(getDoc());
  }
  app.innerHTML = renderShell(currentView());
  I18N.translate?.(app);
  const statusSelect = app.querySelector("[data-filter-status]");
  if (statusSelect) statusSelect.value = state.status;
  const reviewSelect = app.querySelector("[data-filter-review]");
  if (reviewSelect) reviewSelect.value = state.reviewFilter;
  const jobStatusSelect = app.querySelector("[data-job-status]");
  if (jobStatusSelect) jobStatusSelect.value = state.jobStatus;
  bindTransientControls();
  restoreRenderFocus(focusState);
  restorePreservedScroll(scrollState);
}

function bindTransientControls() {
  const dropzone = document.getElementById("dropzone");
  const uploadInput = document.getElementById("upload-input");
  if (dropzone && uploadInput) {
    dropzone.addEventListener("click", () => {
      uploadInput.value = "";
      uploadInput.click();
    });
    uploadInput.addEventListener("change", () => {
      const files = Array.from(uploadInput.files || []);
      state.uploadFiles = files;
      state.uploadName = uploadSelectionName(files);
      render();
    });
    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
        if (eventName === "drop") {
          const files = Array.from(event.dataTransfer?.files || []);
          state.uploadFiles = files;
          state.uploadName = uploadSelectionName(files);
          render();
        }
      });
    });
  }
  bindManualCropEditor();
}

function openCropEditor(docId, fieldName) {
  const doc = DATA.documents.find((item) => item.id === docId);
  captureEditInputs(doc);
  const field = ensureFieldForEdit(doc, fieldName);
  state.cropModal = {
    docId,
    field: fieldName,
    pageIndex: cropModalPageIndex(doc, field),
    error: "",
    saving: false
  };
  state.cropSelection = null;
  render();
}

function captureEditInputs(doc) {
  if (!doc?.fields) return;
  app.querySelectorAll("[data-field-edit]").forEach((input) => {
    const field = doc.fields?.[input.dataset.fieldEdit];
    if (field) field.edit_value = input.value;
  });
}

function closeCropEditor() {
  state.cropModal = null;
  state.cropSelection = null;
}

function openImagePreview(layoutSrc, decisionSrc = "", title = "") {
  captureEditInputs(getDoc());
  state.imageModal = { layoutSrc, decisionSrc, title };
  state.imageModalZoom = "fit";
  render();
}

function closeImagePreview() {
  state.imageModal = null;
}

function updateReviewZoomPanel() {
  const doc = getDoc();
  const panel = app.querySelector("[data-review-zoom]");
  if (!doc || !panel) return;
  const names = orderedFieldNames(doc, state.detailMode === "edit", editFieldOrder(doc));
  const name = state.zoomField && names.includes(state.zoomField) ? state.zoomField : firstReviewField(doc, names);
  panel.innerHTML = renderZoomPanelContent(doc, name);
  app.querySelectorAll("[data-field-row]").forEach((row) => {
    row.classList.toggle("zoom-active", row.dataset.fieldRow === name);
  });
}

function cropPoint(event, image) {
  const rect = image.getBoundingClientRect();
  const displayX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const displayY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  const naturalWidth = image.naturalWidth || rect.width || 1;
  const naturalHeight = image.naturalHeight || rect.height || 1;
  return {
    displayX,
    displayY,
    x: Math.round((displayX / Math.max(1, rect.width)) * naturalWidth),
    y: Math.round((displayY / Math.max(1, rect.height)) * naturalHeight)
  };
}

function drawCropBox(box, image, start, current) {
  const left = Math.min(start.displayX, current.displayX);
  const top = Math.min(start.displayY, current.displayY);
  const width = Math.abs(current.displayX - start.displayX);
  const height = Math.abs(current.displayY - start.displayY);
  box.hidden = width < 2 || height < 2;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;
  const cropLeft = Math.min(start.x, current.x);
  const cropTop = Math.min(start.y, current.y);
  state.cropSelection = {
    x: cropLeft,
    y: cropTop,
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
    natural_width: image.naturalWidth || 0,
    natural_height: image.naturalHeight || 0
  };
}

function bindManualCropEditor() {
  const stage = app.querySelector("[data-crop-stage]");
  const image = app.querySelector("[data-crop-image]");
  const box = app.querySelector("[data-crop-box]");
  if (!stage || !image || !box) return;

  let start = null;
  stage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    start = cropPoint(event, image);
    stage.setPointerCapture(event.pointerId);
    drawCropBox(box, image, start, start);
  });
  stage.addEventListener("pointermove", (event) => {
    if (!start) return;
    drawCropBox(box, image, start, cropPoint(event, image));
  });
  const finish = (event) => {
    if (!start) return;
    drawCropBox(box, image, start, cropPoint(event, image));
    start = null;
  };
  stage.addEventListener("pointerup", finish);
  stage.addEventListener("pointercancel", () => {
    start = null;
  });
}

async function saveManualCrop() {
  const modal = state.cropModal;
  const selection = state.cropSelection;
  const jobId = currentJobId();
  if (!modal || modal.saving) return;
  if (!jobId) {
    modal.error = "Open the report through /jobs/... to save a crop.";
    render();
    return;
  }
  if (!selection || selection.width < 4 || selection.height < 4) {
    modal.error = "Draw a sufficiently large crop rectangle on the image.";
    render();
    return;
  }

  const doc = DATA.documents.find((item) => item.id === modal.docId);
  const field = getField(doc, modal.field);
  const page = doc?.pages?.[modal.pageIndex] || doc?.pages?.[0];
  const imageUrl = pageImageUrl(page);
  if (!doc || !field || !imageUrl) {
    modal.error = "No page image or field is available to save a crop.";
    render();
    return;
  }

  modal.saving = true;
  modal.error = "";
  render();

  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/manual-crop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: doc.id,
        field: modal.field,
        page_index: page.page_index,
        image_url: imageUrl,
        rect: selection
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(apiErrorMessage(payload.error, `Cannot save crop (${response.status})`));
    }
    field.crop_image = payload.crop_image;
    field.raw_crop_image = payload.crop_image;
    field.decision_crop_image = payload.crop_image;
    field.decision_raw_crop_image = payload.crop_image;
    field.decision_crop_source = "manual_crop";
    field.evidence_source = payload.evidence_source || "manual_crop";
    field.evidence_status = payload.evidence_status || "trusted";
    field.evidence_confidence = payload.evidence_confidence ?? 1;
    field.evidence_candidates = payload.evidence_candidates || [{ source: "manual_crop", status: "trusted", confidence: 1, image: payload.crop_image, bbox: payload.bbox }];
    field.dataset_eligible = true;
    field.manual_crop = true;
    field.crop_method = "manual";
    field.bbox = payload.bbox;
    field.page_index = payload.page_index;
    field.page_width = payload.page_width;
    field.page_height = payload.page_height;
    field.visual_type = payload.visual_type || field.visual_type;
    field.visual_confidence = payload.visual_confidence ?? field.visual_confidence;
    field.visual_scores = payload.visual_scores || field.visual_scores || {};
    field.visual_flags = payload.visual_flags || field.visual_flags || [];
    field.visual_features = payload.visual_features || field.visual_features || {};
    state.editMessage = "Manual crop updated. Verify the label and save corrections.";
    closeCropEditor();
    render();
  } catch (error) {
    state.cropModal = { ...modal, saving: false, error: error instanceof Error ? error.message : String(error) };
    render();
  }
}

async function rerunJob(jobId, methodId = "") {
  if (!DATA.server_mode || state.uploadBusy || !jobId) return;
  state.uploadBusy = true;
  state.uploadError = "";
  render();
  try {
    const body = {};
    if (methodId) body.ocr_method = methodId;
    const sourceJob = DATA.jobs.find((item) => item.id === jobId);
    const selectedMethod = methodId || sourceJob?.ocr_method || "qwen";
    if (isExternalMethod(selectedMethod)) {
      body.cloud_data_confirmed = true;
    }
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload.error, `Cannot rerun job (${response.status})`));
    state.uploadJob = payload;
    state.uploadBusy = RUNNING_JOB_STATUSES.has(String(payload.status || ""));
    state.view = "upload";
    upsertJob(payload);
    renderPollingUpdate();
    pollJob(payload.id);
  } catch (error) {
    state.uploadBusy = false;
    state.uploadError = error instanceof Error ? error.message : String(error);
    render();
  }
}

async function cancelJob(jobId) {
  if (!DATA.server_mode || !jobId) return;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload.error, `Cannot cancel job (${response.status})`));
    state.uploadJob = payload;
    state.uploadBusy = RUNNING_JOB_STATUSES.has(String(payload.status || ""));
    upsertJob(payload);
    renderPollingUpdate();
  } catch (error) {
    state.uploadError = error instanceof Error ? error.message : String(error);
    renderPollingUpdate();
  }
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function uploadFilePath(file) {
  return String(file?.webkitRelativePath || file?.name || "");
}

function uploadSelectionIssues(files) {
  const allowed = new Set(["pdf"]);
  const seen = new Set();
  const issues = [];
  (files || []).forEach((file) => {
    const path = uploadFilePath(file);
    const extension = path.split(".").pop().toLowerCase();
    if (!allowed.has(extension)) issues.push(`${path}: unsupported file type`);
    if (seen.has(path.toLowerCase())) issues.push(`${path}: duplicate path`);
    seen.add(path.toLowerCase());
  });
  const maxFiles = Number(DATA.limits?.max_files_per_job || 100);
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (files.length > maxFiles) issues.push(`More than ${maxFiles} files selected.`);
  if (totalBytes > Number(DATA.limits?.max_job_upload_bytes || 1024 ** 3)) issues.push("Selected files exceed the job upload size limit.");
  return issues;
}

async function deleteJob(jobId) {
  if (!DATA.server_mode || !jobId) return;
  await previewBulkDelete([jobId]);
}

async function previewBulkDelete(jobIds = [...state.selectedJobIds]) {
  if (!jobIds.length) return;
  state.jobActionError = "";
  try {
    const response = await fetch("/api/jobs/delete-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: jobIds }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload.error, `HTTP ${response.status}`));
    state.deleteModal = payload;
    render();
    app.querySelector("[data-delete-modal-cancel]")?.focus();
  } catch (error) {
    state.jobActionError = error instanceof Error ? error.message : String(error);
    render();
  }
}

async function confirmBulkDelete() {
  const jobIds = (state.deleteModal?.deletable || []).map((job) => job.id);
  if (!jobIds.length) return;
  state.deleteModal.busy = true;
  render();
  try {
    const response = await fetch("/api/jobs/bulk-delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job_ids: jobIds }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiErrorMessage(payload.error, `HTTP ${response.status}`));
    const deleted = new Set(payload.deleted || []);
    DATA.jobs = DATA.jobs.filter((job) => !deleted.has(job.id));
    state.selectedJobIds = new Set([...state.selectedJobIds].filter((id) => !deleted.has(id)));
    state.deleteModal = null;
    if (payload.failed?.length) state.jobActionError = `${payload.failed.length} jobs could not be deleted.`;
    render();
    refreshServerState({ renderView: true });
  } catch (error) {
    state.deleteModal.busy = false;
    state.jobActionError = error instanceof Error ? error.message : String(error);
    render();
  }
}

async function startUpload() {
  if (!DATA.server_mode) {
    state.uploadError = "This is a static web report. Run python apps\\web_server.py or bash scripts/run_web.sh to upload files.";
    render();
    return;
  }
  if (!state.uploadFiles.length || state.uploadBusy) return;

  state.uploadBusy = true;
  state.uploadError = "";
  state.uploadJob = null;
  render();

  try {
    const jobPayload = {
      kind: state.uploadTab,
      file_count: state.uploadFiles.length,
      ocr_method: state.uploadMethod,
      upload_name: state.uploadName || uploadSelectionName(state.uploadFiles),
      cloud_data_confirmed: isExternalMethod(state.uploadMethod)
    };
    if (isVlmMethod(state.uploadMethod)) {
      jobPayload.vlm_task = state.uploadVlmTask || "full_ocr";
      jobPayload.vlm_pages = state.uploadVlmTask === "full_ocr" ? "all" : (state.uploadVlmPages || "auto");
      jobPayload.vlm_max_pages = state.uploadVlmTask === "full_ocr"
        ? 0
        : Number(state.uploadVlmMaxPages || 0) || 0;
    }
    const createResponse = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobPayload)
    });
    if (!createResponse.ok) throw new Error(`Cannot create upload job (${createResponse.status})`);
    let job = await createResponse.json();
    state.uploadJob = job;
    upsertJob(job);
    renderPollingUpdate();

    for (let index = 0; index < state.uploadFiles.length; index += 1) {
      const file = state.uploadFiles[index];
      const relativePath = file.webkitRelativePath || file.name || `upload_${index}`;
      const uploadResponse = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/files?path=${encodeURIComponent(relativePath)}`, {
        method: "PUT",
        body: file
      });
      const payload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(apiErrorMessage(payload.error, `Upload error for ${relativePath} (${uploadResponse.status})`));
      state.uploadJob = payload.job || { ...job, uploaded_files: index + 1 };
      upsertJob(state.uploadJob);
      renderPollingUpdate();
    }

    const startResponse = await fetch(`/api/jobs/${encodeURIComponent(job.id)}/start`, { method: "POST" });
    if (!startResponse.ok) throw new Error(`Cannot start OCR (${startResponse.status})`);
    state.uploadJob = await startResponse.json();
    upsertJob(state.uploadJob);
    renderPollingUpdate();
    pollJob(job.id);
  } catch (error) {
    state.uploadBusy = false;
    state.uploadError = error instanceof Error ? error.message : String(error);
    renderPollingUpdate();
  }
}

async function pollJob(jobId) {
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error(`Cannot load job status (${response.status})`);
    const job = await response.json();
    state.uploadJob = job;
    upsertJob(job);
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      state.uploadBusy = false;
      state.uploadFiles = [];
      state.uploadName = "";
      refreshServerState({ renderView: false });
      renderPollingUpdate();
      return;
    }
    renderPollingUpdate();
    window.setTimeout(() => pollJob(jobId), 1500);
  } catch (error) {
    state.uploadBusy = false;
    state.uploadError = error instanceof Error ? error.message : String(error);
    renderPollingUpdate();
  }
}

async function saveDocumentEdits(docId) {
  const doc = DATA.documents.find((item) => item.id === docId);
  if (!doc || state.editSaving) return;

  state.editError = "";
  state.editMessage = "";
  state.editResult = null;

  try {
    const corrections = [];
    app.querySelectorAll("[data-field-edit]").forEach((input) => {
      const name = input.dataset.fieldEdit;
      const field = getField(doc, name);
      if (!field) return;
      const oldValue = String(field.value || "");
      const newValue = input.value;
      const crop = cropUrl(field);
      const forceManualResolution = Boolean(
        newValue.trim()
        && field.needs_review
        && (field.manual_crop || field.decision_crop_source === "manual_crop")
      );
      if (newValue !== oldValue || forceManualResolution) {
        ensureFieldForEdit(doc, name);
        corrections.push({
          field: name,
          label: FIELD_LABELS[name] || name,
          old_value: oldValue,
          new_value: newValue,
          raw_value: field.raw_value || "",
          source_text: field.source_text || "",
          confidence: field.confidence,
          method: field.method || "",
          visual_type: field.visual_type || "",
          visual_confidence: field.visual_confidence,
          visual_scores: field.visual_scores || {},
          visual_flags: field.visual_flags || [],
          visual_features: field.visual_features || {},
          page_index: field.page_index,
          region_index: field.region_index,
          region_label: field.region_label || "",
          bbox: field.bbox || null,
          page_width: field.page_width,
          page_height: field.page_height,
          crop_image: crop,
          decision_crop_image: field.decision_crop_image || crop,
          decision_raw_crop_image: field.decision_raw_crop_image || field.raw_crop_image || "",
          decision_crop_kind: field.decision_crop_kind || "",
          decision_crop_source: field.decision_crop_source || "",
          raw_crop_image: field.raw_crop_image || "",
          region_crop_image: field.region_crop_image || "",
          evidence_source: field.evidence_source || "",
          evidence_status: field.evidence_status || "",
          evidence_confidence: field.evidence_confidence,
          dataset_eligible: field.dataset_eligible,
          dataset_include: false
        });
      }
    });

    state.editSaving = true;
    render();

    for (const correction of corrections) {
      const field = doc.fields?.[correction.field];
      if (!field) continue;
      rememberOcrValue(field, correction.old_value);
      field.value = correction.new_value;
      delete field.edit_value;
      field.correction_old_value = field.ocr_value;
      field.correction_new_value = correction.new_value;
      field.correction_count = Number(field.correction_count || 0) + 1;
      field.needs_review = false;
      field.is_valid = true;
      field.manual_corrected = true;
      field.corrected_at = new Date().toISOString();
    }

    const jobId = currentJobId();
    if (jobId) {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: doc.id,
          source: doc.source || doc.file_name || "",
          page_url: window.location.pathname,
          links: doc.links || {},
          corrections
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(apiErrorMessage(payload.error, `Cannot save corrections (${response.status})`));
      }
      state.editResult = payload;
      if (payload.document_status) updateDocumentDatasetStatus(doc, payload.document_status);
      if (payload.job) applyJobCorrectionState(payload.job);
      const reviewStatus = payload.document_status?.review_status || payload.review_status || {};
      if (reviewStatus.value === "approved") markDocumentApproved(doc, payload.document_status?.last_saved_at);
      doc.correction_records = [...(Array.isArray(doc.correction_records) ? doc.correction_records : []), ...corrections];
      const savedCount = Number(payload.saved_count ?? corrections.length);
      const remainingRisk = Number(reviewStatus.risk_count || 0);
      const reviewText = remainingRisk ? `${remainingRisk} review risks remain` : "approved";
      state.editMessage = `Saved ${savedCount} corrections; ${reviewText}`;
    } else {
      if (reviewStatus.value === "approved") markDocumentApproved(doc);
      state.editMessage = corrections.length
        ? `Temporarily updated ${corrections.length} corrections and approved the document`
        : "Document approved in the browser";
    }

    state.editSaving = false;
    render();
  } catch (error) {
    state.editSaving = false;
    state.editError = error instanceof Error ? error.message : String(error);
    render();
  }
}

function saveCurrentEditDocument() {
  const doc = getDoc();
  if (!doc || state.view !== "detail" || state.detailMode !== "edit") return false;
  captureEditInputs(doc);
  saveDocumentEdits(doc.id);
  return true;
}

function cancelEditSession() {
  const doc = getDoc();
  if (!doc || state.view !== "detail" || state.detailMode !== "edit") return false;
  Object.values(doc.fields || {}).forEach((field) => {
    if (field && typeof field === "object") delete field.edit_value;
  });
  state.editSaving = false;
  state.editError = "";
  state.editResult = null;
  state.editMessage = "Temporary changes canceled";
  state.zoomField = null;
  closeCropEditor();
  closeImagePreview();
  render();
  return true;
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-modal-close], [data-system-monitor-close], [data-resource-usage-close]");
  if (!target) return;

  if (target.dataset.resourceUsageGroup !== undefined) {
    openResourceUsage(target.dataset.resourceUsageGroup, target.dataset.resourceUsageMethod);
    return;
  }
  if (target.dataset.resourceUsageClose !== undefined) {
    if (target.matches("button") || !event.target.closest("[data-resource-usage-panel]")) closeResourceUsage();
    return;
  }
  if (target.dataset.systemMonitorOpen !== undefined) {
    openSystemMonitor();
    return;
  }
  if (target.dataset.systemMonitorClose !== undefined) {
    if (target.matches("button") || !event.target.closest("[data-system-monitor-panel]")) closeSystemMonitor();
    return;
  }

  if (target.dataset.language) {
    I18N.setLanguage(target.dataset.language);
    render();
    return;
  }
  if (target.dataset.checkEngine) {
    checkEngine(target.dataset.checkEngine);
    return;
  }
  if (target.dataset.removeUploadFile !== undefined) {
    state.uploadFiles.splice(Number(target.dataset.removeUploadFile), 1);
    state.uploadName = uploadSelectionName(state.uploadFiles);
    render();
    return;
  }
  if (target.dataset.clearUploadFiles !== undefined) {
    state.uploadFiles = [];
    state.uploadName = "";
    render();
    return;
  }
  if (target.dataset.jobPage) {
    state.jobPage = Math.max(1, Number(target.dataset.jobPage));
    refreshServerState({ renderView: true });
    return;
  }
  if (target.dataset.previewDeleteJobs !== undefined) {
    previewBulkDelete();
    return;
  }
  if (target.dataset.confirmDeleteJobs !== undefined) {
    confirmBulkDelete();
    return;
  }
  if (target.dataset.deleteModalCancel !== undefined) {
    closeDeleteModal();
    return;
  }
  if (target.dataset.copyJobId) {
    navigator.clipboard?.writeText(target.dataset.copyJobId);
    target.closest("details")?.removeAttribute("open");
    return;
  }
  if (target.dataset.downloadJobLog) {
    const job = DATA.jobs.find((item) => item.id === target.dataset.downloadJobLog);
    if (job) downloadTextFile(`${job.id}.log`, (job.logs || []).join("\n"));
    return;
  }
  if (target.dataset.copyDiagnostics) {
    const job = DATA.jobs.find((item) => item.id === target.dataset.copyDiagnostics);
    if (job) navigator.clipboard?.writeText(JSON.stringify({ job_id: job.id, method: job.ocr_method, failure: job.failure }, null, 2));
    return;
  }

  if (target.dataset.view) {
    state.view = target.dataset.view;
    if (state.view !== "detail") state.detailMode = "overview";
    if (state.view !== "detail") {
      closeCropEditor();
      closeImagePreview();
    }
    render();
    return;
  }

  if (target.dataset.uploadTab) {
    state.uploadTab = target.dataset.uploadTab;
    state.uploadName = "";
    state.uploadFiles = [];
    state.uploadError = "";
    render();
    return;
  }

  if (target.dataset.uploadStart !== undefined) {
    startUpload();
    return;
  }

  if (target.dataset.uploadReset !== undefined) {
    state.uploadFiles = [];
    state.uploadName = "";
    state.uploadJob = null;
    state.uploadBusy = false;
    state.uploadError = "";
    render();
    return;
  }

  if (target.dataset.refreshJobs !== undefined) {
    refreshServerState({ renderView: true });
    return;
  }

  if (target.dataset.copyUploadLog !== undefined) {
    const logs = (state.uploadJob?.logs || []).join("\n");
    if (logs && navigator.clipboard?.writeText) navigator.clipboard.writeText(logs).catch(() => {});
    return;
  }

  if (target.dataset.downloadUploadLog !== undefined) {
    const jobId = state.uploadJob?.id || "job";
    downloadTextFile(`${jobId}.log`, (state.uploadJob?.logs || []).join("\n"));
    return;
  }

  if (target.dataset.rerunAllPages) {
    rerunJob(target.dataset.rerunAllPages);
    return;
  }

  if (target.dataset.cancelJob) {
    cancelJob(target.dataset.cancelJob);
    return;
  }

  if (target.dataset.deleteJob) {
    deleteJob(target.dataset.deleteJob);
    return;
  }

  if (target.dataset.rerunJob) {
    rerunJob(target.dataset.rerunJob, target.dataset.rerunMethod || "");
    return;
  }

  if (target.dataset.followJob) {
    const job = DATA.jobs.find((item) => item.id === target.dataset.followJob);
    if (job) {
      state.uploadJob = job;
      state.uploadBusy = RUNNING_JOB_STATUSES.has(String(job.status || ""));
      state.showTechnicalLog = false;
      state.view = "upload";
      render();
      if (state.uploadBusy) pollJob(job.id);
    }
    return;
  }

  if (target.dataset.showJobLog) {
    const job = DATA.jobs.find((item) => item.id === target.dataset.showJobLog);
    if (job) {
      state.uploadJob = job;
      state.uploadBusy = RUNNING_JOB_STATUSES.has(String(job.status || ""));
      state.showTechnicalLog = true;
      state.view = "upload";
      render();
    }
    return;
  }

  if (target.dataset.docAction) {
    state.selectedDocId = target.dataset.docId;
    state.detailMode = normalizeDetailMode(target.dataset.docAction, getDoc());
    state.view = "detail";
    render();
    return;
  }

  if (target.dataset.detailMode) {
    state.detailMode = normalizeDetailMode(target.dataset.detailMode, getDoc());
    closeImagePreview();
    closeCropEditor();
    render();
    return;
  }

  if (target.dataset.selectReviewField) {
    state.zoomField = target.dataset.selectReviewField;
    updateReviewZoomPanel();
    return;
  }

  if (target.dataset.openImagePreview !== undefined) {
    const fallbackSrc = target.dataset.previewSrc || "";
    openImagePreview(
      target.dataset.previewLayoutSrc || fallbackSrc,
      target.dataset.previewDecisionSrc || fallbackSrc,
      target.dataset.previewTitle || ""
    );
    return;
  }

  if (target.dataset.closeImagePreview !== undefined) {
    closeImagePreview();
    render();
    return;
  }

  if (target.dataset.imageZoom) {
    state.imageModalZoom = target.dataset.imageZoom === "actual" ? "actual" : "fit";
    render();
    return;
  }

  if (target.dataset.openCrop) {
    openCropEditor(target.dataset.openCrop, target.dataset.cropField);
    return;
  }

  if (target.dataset.saveCrop !== undefined) {
    saveManualCrop();
    return;
  }

  if (target.dataset.cropCancel !== undefined) {
    closeCropEditor();
    render();
    return;
  }

  if (target.dataset.applySuggestion) {
    const doc = getDoc();
    const name = target.dataset.applySuggestion;
    const field = doc?.fields?.[name];
    const suggestion = bestSuggestion(field);
    const input = Array.from(app.querySelectorAll("[data-field-edit]")).find((item) => item.dataset.fieldEdit === name);
    if (suggestion?.value && input) {
      input.value = suggestion.value;
      field.edit_value = suggestion.value;
      state.editMessage = `Applied suggestion to field ${FIELD_LABELS[name] || name}`;
      render();
    }
    return;
  }

  if (target.dataset.saveEdits) {
    saveDocumentEdits(target.dataset.saveEdits);
    return;
  }

  if (target.dataset.codeGroup) {
    state.codeGroup = target.dataset.codeGroup;
    render();
    return;
  }

  if (target.dataset.codeAdd !== undefined) {
    state.codeModal = { id: null };
    render();
    return;
  }

  if (target.dataset.codeEdit) {
    state.codeModal = { id: target.dataset.codeEdit };
    render();
    return;
  }

  if (target.dataset.codeDelete) {
    state.codeItems = state.codeItems.filter((item) => item.id !== target.dataset.codeDelete);
    render();
    return;
  }

  if (target.dataset.codeCancel !== undefined) {
    state.codeModal = null;
    render();
    return;
  }

  if (target.dataset.codeSave !== undefined) {
    const id = target.dataset.codeSave;
    const values = {
      group: document.getElementById("code-group-input")?.value || "doc_type",
      code: document.getElementById("code-code-input")?.value || "",
      label: document.getElementById("code-label-input")?.value || "",
      keywords: document.getElementById("code-keywords-input")?.value || "",
      order: Number(document.getElementById("code-order-input")?.value || 0),
      active: true
    };
    if (id) {
      state.codeItems = state.codeItems.map((item) => item.id === id ? { ...item, ...values } : item);
    } else {
      state.codeItems.push({ id: `${values.group}_${Date.now()}`, ...values });
    }
    state.codeModal = null;
    render();
    return;
  }

  if (target.dataset.modalClose !== undefined && !event.target.closest("[data-modal]")) {
    const closingDeleteModal = Boolean(state.deleteModal);
    state.deleteModal = null;
    state.codeModal = null;
    closeCropEditor();
    closeImagePreview();
    render();
    if (closingDeleteModal) app.querySelector("[data-preview-delete-jobs]")?.focus();
  }
});

app.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!target.matches("[data-field-edit]")) return;
  state.zoomField = target.dataset.fieldEdit;
  updateReviewZoomPanel();
});

app.addEventListener("toggle", (event) => {
  if (event.target.matches?.("details.technical-log")) state.showTechnicalLog = event.target.open;
}, true);

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-filter-query]")) {
    state.query = target.value;
    render();
    return;
  }
  if (target.matches("[data-job-query]")) {
    state.jobQuery = target.value;
    state.jobPage = 1;
    clearTimeout(jobSearchTimer);
    jobSearchTimer = setTimeout(() => refreshServerState({ renderView: true }), 300);
    return;
  }
  if (target.matches("[data-vlm-max-pages]")) {
    state.uploadVlmMaxPages = target.value;
    return;
  }
  if (target.matches("[data-field-edit]")) {
    const doc = getDoc();
    const field = ensureFieldForEdit(doc, target.dataset.fieldEdit);
    if (field) field.edit_value = target.value;
    state.zoomField = target.dataset.fieldEdit;
    updateReviewZoomPanel();
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-select-job]")) {
    if (target.checked) state.selectedJobIds.add(target.dataset.selectJob);
    else state.selectedJobIds.delete(target.dataset.selectJob);
    render();
    return;
  }
  if (target.matches("[data-select-page-jobs]")) {
    filteredJobs().filter((job) => TERMINAL_JOB_STATUSES.has(String(job.status || ""))).forEach((job) => {
      if (target.checked) state.selectedJobIds.add(job.id);
      else state.selectedJobIds.delete(job.id);
    });
    render();
    return;
  }
  if (target.matches("[data-filter-status]")) {
    state.status = target.value;
    render();
    return;
  }
  if (target.matches("[data-filter-review]")) {
    state.reviewFilter = target.value;
    render();
    return;
  }
  if (target.matches("[data-job-status]")) {
    state.jobStatus = target.value;
    state.jobPage = 1;
    refreshServerState({ renderView: true });
    return;
  }
  if (target.matches("[data-job-method]")) {
    state.jobMethod = target.value || "all";
    state.jobPage = 1;
    refreshServerState({ renderView: true });
    return;
  }
  if (target.matches("[data-ocr-method]")) {
    state.uploadMethod = target.value || "qwen";
    render();
    return;
  }
  if (target.matches("[data-vlm-task]")) {
    state.uploadVlmTask = target.value === "metadata" ? "metadata" : "full_ocr";
    state.uploadVlmPages = state.uploadVlmTask === "full_ocr" ? "all" : "auto";
    state.uploadVlmMaxPages = "0";
    render();
    return;
  }
  if (target.matches("[data-vlm-pages]")) {
    state.uploadVlmPages = target.value || "auto";
    render();
    return;
  }
  if (target.matches("[data-log-action]")) {
    state.logAction = target.value;
    render();
    return;
  }
  if (target.matches("[data-log-status]")) {
    state.logStatus = target.value;
    render();
    return;
  }
  if (target.matches("[data-page-select]")) {
    state.pageByDoc[target.dataset.docId] = Number(target.value);
    render();
    return;
  }
  if (target.matches("[data-crop-page]") && state.cropModal) {
    state.cropModal.pageIndex = Number(target.value);
    state.cropModal.error = "";
    state.cropSelection = null;
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (state.resourceUsageModal && event.key === "Escape") {
    event.preventDefault();
    closeResourceUsage();
    return;
  }
  if (state.systemMonitorOpen && event.key === "Escape") {
    event.preventDefault();
    closeSystemMonitor();
    return;
  }
  if (state.deleteModal) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDeleteModal();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [...app.querySelectorAll("[data-modal] button:not(:disabled)")];
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    return;
  }
  if (state.view !== "detail" || state.detailMode !== "edit") return;
  if (event.isComposing) return;

  const target = event.target;
  const insideEdit = Boolean(target?.closest?.("[data-edit-review]"));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentEditDocument();
    return;
  }
  if (insideEdit && target?.matches?.("[data-field-edit]") && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveCurrentEditDocument();
    return;
  }
  if (insideEdit && event.key === "Escape") {
    event.preventDefault();
    cancelEditSession();
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest?.("details.action-menu")) return;
  document.querySelectorAll("details.action-menu[open]").forEach((item) => item.removeAttribute("open"));
});

render();
loadEngineReadiness();
refreshJobCorrectionState();
refreshServerState({ renderView: false });
if (isRootServerApp()) {
  window.setInterval(() => { if (!document.hidden) refreshServerState(); }, SERVER_REFRESH_MS);
}
