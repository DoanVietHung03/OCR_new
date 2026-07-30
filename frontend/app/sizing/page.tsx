"use client";

import { FormEvent, Fragment, useEffect, useState } from "react";
import {
  ApiError, applySizingRetention, calculateSizing, createSizingSnapshot,
  deleteSizingSnapshot, getSizingCatalog, getSizingJobs, getSizingOperations,
  getSizingOverview, getSizingSnapshots, getExchangeRateSources, patchSizingSnapshot,
  previewSizingRetention, previewSizingSnapshotDelete, putSizingCatalog,
  suggestExchangeRate,
  SizingCatalog, SizingJob, SizingOperations, SizingOverview, SizingSnapshots,
} from "../../lib/api";
import { safeError, useLanguage } from "../../lib/i18n";
import AppShell from "../app-shell";
import SizingChart from "./sizing-chart";
import "./sizing.css";

type View = "overview" | "explorer" | "calculator" | "retention";
const copy = {
  vi: {
    title: "Định cỡ và chi phí", subtitle: "Token, chi phí và năng lực dựa trên dữ liệu đo thực từ provider.",
    overview: "Tổng quan", explorer: "Khám phá tài liệu", calculator: "Kịch bản", retention: "Lưu giữ và ảnh chụp",
    unavailable: "Chưa có dữ liệu đo tương thích", honest: "Không ước lượng token ảnh và không biến dữ liệu thiếu thành số 0.",
    jobs: "Công việc tương thích", attempts: "Lần gọi provider", usage: "Mức phủ dữ liệu usage", billing: "Mức chắc chắn chi phí",
    tokens: "Tổng token", tokensPerMeasuredAttempt: "Token / lần gọi có usage", knownCost: "Chi phí đã biết", filters: "Bộ lọc", jobLimit: "Số công việc hiển thị", refresh: "Làm mới",
    provider: "Hồ sơ provider", task: "Tác vụ", mode: "Chế độ xử lý", inspect: "Xem lần gọi",
    calculate: "Tính bản xem trước", saveSnapshot: "Lưu ảnh chụp", price: "Hồ sơ giá", savePrice: "Lưu hồ sơ giá",
    monthly: "Công việc/tháng", days: "Ngày vận hành", hours: "Giờ/ngày", peak: "Hệ số tải đỉnh", reserve: "Dự phòng",
    snapshots: "Ảnh chụp đã lưu", archive: "Lưu trữ", remove: "Xóa", previewDelete: "Xem trước việc xóa dữ liệu đo",
    previewReady: "Bản xem trước đã sẵn sàng", rollups: "Dữ liệu tổng hợp",
    applyDelete: "Xác nhận xóa", noChart: "Cần ít nhất 2 công việc tương thích để mở biểu đồ so sánh.",
    exportCsv: "Xuất CSV", exportJson: "Xuất JSON", copyId: "Sao chép ID",
    emptySnapshots: "Chưa có ảnh chụp nào.", snapshotHint: "Lưu một kết quả xem trước để so sánh hoặc xuất lại sau.",
    snapshotDisabled: "Hãy tính bản xem trước trước khi lưu ảnh chụp.", priceDisabled: "Hãy xác nhận tỷ giá trước khi lưu.",
    saveWorkload: "Lưu hồ sơ khối lượng", hardware: "Hồ sơ phần cứng", saveHardware: "Lưu hồ sơ phần cứng",
    all: "Tất cả", utcStart: "Bắt đầu (UTC)", utcEnd: "Kết thúc (UTC)", unit: "Đơn vị", timezone: "Múi giờ", local: "Địa phương",
    gate: "Ngưỡng", status: "Trạng thái", available: "Khả dụng", job: "Công việc", loading: "Đang tải…",
    page: "Trang", attempt: "Lần", usageLabel: "Usage", scenarioPreview: "Kịch bản · Bản xem trước",
    documentsPerDossier: "Văn bản / hồ sơ", pagesPerDocument: "Trang / văn bản", pagesPerJob: "Trang / công việc",
    model: "Mô hình", inputPerMillion: "Đầu vào / 1 triệu", outputPerMillion: "Đầu ra / 1 triệu", cachedPerMillion: "Cache / 1 triệu",
    exchangeSource: "Nguồn tỷ giá", manualUnavailable: "Nhập tay / không khả dụng", exchangeRate: "Tỷ giá",
    confirmExchange: "Xác nhận tỷ giá", fetchSuggestion: "Lấy tỷ giá gợi ý", description: "Mô tả",
    name: "Tên", created: "Thời điểm tạo", archived: "Đã lưu trữ", active: "Đang hoạt động",
    retentionHint: "Xem trước → Xác nhận · dữ liệu đo", systemOperations: "Hoạt động hệ thống", pinnedBenchmarks: "Benchmark đã ghim",
    measurementFirst: "Ưu tiên dữ liệu đo", unavailableValue: "Không khả dụng", chartLabel: "Token prompt và completion theo công việc",
  },
  en: {
    title: "Sizing and cost", subtitle: "Tokens, cost, and capacity from measured provider data.",
    overview: "Overview", explorer: "Document Explorer", calculator: "Scenario", retention: "Retention & snapshots",
    unavailable: "No compatible measurements", honest: "Image tokens are not estimated and missing data is not shown as zero.",
    jobs: "Compatible jobs", attempts: "Provider attempts", usage: "Response usage coverage", billing: "Billing certainty",
    tokens: "Total tokens", tokensPerMeasuredAttempt: "Tokens / measured attempt", knownCost: "Known cost", filters: "Filters", jobLimit: "Jobs shown", refresh: "Refresh",
    provider: "Provider Profile", task: "Task", mode: "Processing Mode", inspect: "View attempts",
    calculate: "Calculate Preview", saveSnapshot: "Save snapshot", price: "Price Profile", savePrice: "Save Price Profile",
    monthly: "Jobs/month", days: "Operating days", hours: "Hours/day", peak: "Peak factor", reserve: "Reserve",
    snapshots: "Saved snapshots", archive: "Archive", remove: "Delete", previewDelete: "Preview measurement deletion",
    previewReady: "Preview ready", rollups: "Rollups",
    applyDelete: "Confirm deletion", noChart: "At least 2 compatible jobs are required for a comparison chart.",
    exportCsv: "Export CSV", exportJson: "Export JSON", copyId: "Copy ID",
    emptySnapshots: "No snapshots yet.", snapshotHint: "Save a Preview result to compare or export it later.",
    snapshotDisabled: "Calculate a Preview before saving a snapshot.", priceDisabled: "Confirm the exchange rate before saving.",
    saveWorkload: "Save Workload Profile", hardware: "Hardware Profile", saveHardware: "Save Hardware Profile",
    all: "All", utcStart: "UTC start", utcEnd: "UTC end", unit: "Unit", timezone: "Timezone", local: "Local",
    gate: "Gate", status: "Status", available: "Available", job: "Job", loading: "Loading…",
    page: "Page", attempt: "Attempt", usageLabel: "Usage", scenarioPreview: "Scenario · Preview",
    documentsPerDossier: "Documents / dossier", pagesPerDocument: "Pages / document", pagesPerJob: "Pages / job",
    model: "Model", inputPerMillion: "Input / 1M", outputPerMillion: "Output / 1M", cachedPerMillion: "Cached / 1M",
    exchangeSource: "Exchange source", manualUnavailable: "Manual / unavailable", exchangeRate: "Exchange rate",
    confirmExchange: "Confirm exchange rate", fetchSuggestion: "Fetch suggestion", description: "Description",
    name: "Name", created: "Created", archived: "Archived", active: "Active",
    retentionHint: "Preview → Confirm · measurement data", systemOperations: "System operations", pinnedBenchmarks: "Pinned benchmarks",
    measurementFirst: "Measurement first", unavailableValue: "Unavailable", chartLabel: "Prompt and completion tokens by job",
  },
} as const;

const pct = (value: number | null | undefined, unavailable: string) => value == null ? unavailable : `${value.toFixed(1)}%`;
const money = (value: number | null | undefined, unavailable: string) => value == null ? unavailable : value.toFixed(6);
const jobFilters = (filters: Record<string, string>) => Object.fromEntries(Object.entries(filters).filter(([key]) => key !== "unit"));
const statusTone = (value: string) =>
  ["available", "success"].includes(value) ? "good"
    : ["insufficient_sample", "unavailable", "missing"].includes(value) ? "warning"
      : ["error", "timeout", "connect_failure", "invalid_json"].includes(value) ? "bad" : "info";
const errorText = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason));
const download = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
};

export default function SizingPage() {
  const [locale] = useLanguage(); const t = copy[locale];
  const modeLabel = (value: string) => ({
    administrative_document: locale === "vi" ? "Văn bản hành chính" : "Administrative document",
    dossier_cover: locale === "vi" ? "Bìa hồ sơ" : "Dossier cover",
    combined_dossier: locale === "vi" ? "Hồ sơ gộp" : "Combined dossier",
  }[value] || value);
  const taskLabel = (value: string) => ({
    full_ocr: locale === "vi" ? "OCR toàn văn" : "Full OCR",
    metadata: "Metadata",
    segmentation: locale === "vi" ? "Phân đoạn" : "Segmentation",
    readiness_probe: locale === "vi" ? "Kiểm tra sẵn sàng" : "Readiness probe",
  }[value] || value);
  const valueLabel = (value: string) => locale === "en" ? ({
    available: "Available", measured: "Measured", calculated: "Calculated", assumed: "Assumed", unavailable: "Unavailable",
    insufficient_sample: "Insufficient sample", measurement_foundation_pending: "Measurement data pending", success: "Success",
    complete: "Complete", missing: "Missing", error: "Error", timeout: "Timeout", connect_failure: "Connection failure",
    invalid_json: "Invalid JSON", preview: "Preview", comparison: "Comparison", trend: "Trend", capacity: "Capacity",
  }[value] || value) : ({
    available: "Khả dụng", measured: "Đã đo", calculated: "Đã tính", assumed: "Giả định", unavailable: "Không khả dụng",
    insufficient_sample: "Chưa đủ mẫu", measurement_foundation_pending: "Chưa có dữ liệu đo", success: "Thành công",
    complete: "Đầy đủ", missing: "Thiếu", error: "Lỗi", timeout: "Hết thời gian", connect_failure: "Lỗi kết nối",
    invalid_json: "JSON không hợp lệ", attempt: "Lần gọi", page: "Trang", document: "Tài liệu", job: "Công việc", system: "Hệ thống",
    preview: "Xem trước", comparison: "So sánh", trend: "Xu hướng", capacity: "Năng lực",
  }[value] || value);
  const [view, setView] = useState<View>("overview");
  const [overview, setOverview] = useState<SizingOverview | null>(null);
  const [jobs, setJobs] = useState<SizingJob[]>([]);
  const [operations, setOperations] = useState<Record<string, SizingOperations>>({});
  const [expandedJobs, setExpandedJobs] = useState<string[]>([]);
  const [loadingJobs, setLoadingJobs] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<SizingCatalog | null>(null); const [snapshots, setSnapshots] = useState<SizingSnapshots | null>(null);
  const [filters, setFilters] = useState({ provider_profile_id: "", task: "", processing_mode: "", start_date: "", end_date: "", unit: "job" });
  const [jobLimit, setJobLimit] = useState(25);
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState({ monthly_jobs: 100, operating_days: 20, operating_hours: 8, processing_mode: "administrative_document" as "administrative_document" | "dossier_cover" | "combined_dossier", peak_factor: 1.5, reserve: .25, minimum_success_rate: .95, artifact_retention_days: 30, average_pages_per_job: 1, average_documents_per_dossier: 1, average_pages_per_document: 1 });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [price, setPrice] = useState({ id: "", provider_profile_id: "", model: "", billing_currency: "USD", display_currency: "VND", input_per_million: 0, output_per_million: 0, cached_per_million: 0, fixed_cost: 0, fixed_cost_policy: "successful_response", surcharge_rate: 0, effective_from: new Date().toISOString(), exchange_rate: 0, exchange_source: "", exchange_confirmed: false });
  const [exchangeSources, setExchangeSources] = useState<{ id: string; label: string; currencies: string[]; url: string }[]>([]);
  const [retention, setRetention] = useState({ start_date: "", end_date: "", include_system: false, include_rollups: false, include_pinned_benchmarks: false });
  const [hardware, setHardware] = useState({ id: "", description: "", cpu: "", ram_gb: 0, gpu: "" });
  const [retentionPlan, setRetentionPlan] = useState<{ plan_token: string; checksum: string; operation_count: number; rollup_count: number } | null>(null);

  const load = async () => {
    try {
      const [nextOverview, nextJobs, nextCatalog, nextSnapshots] = await Promise.all([
        getSizingOverview(filters), getSizingJobs(jobFilters(filters), 1, jobLimit), getSizingCatalog(), getSizingSnapshots(),
      ]);
      setOverview(nextOverview); setJobs(nextJobs.items); setCatalog(nextCatalog); setSnapshots(nextSnapshots); setError("");
    } catch (reason) { setError(errorText(reason)); }
  };
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initial = { provider_profile_id: params.get("provider") || "", task: params.get("task") || "", processing_mode: params.get("mode") || "", start_date: params.get("start") || "", end_date: params.get("end") || "", unit: params.get("unit") || "job" };
    const initialLimit = [10, 25, 50].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 25;
    setFilters(initial); setView((params.get("view") as View) || "overview");
    setTimezone(params.get("tz") || "UTC"); setJobLimit(initialLimit);
    getSizingOverview(initial).then(setOverview).catch((reason) => setError(errorText(reason)));
    Promise.all([getSizingJobs(jobFilters(initial), 1, initialLimit), getSizingCatalog(), getSizingSnapshots()]).then(([j, c, s]) => { setJobs(j.items); setCatalog(c); setSnapshots(s); }).catch((reason) => setError(errorText(reason)));
    getExchangeRateSources().then((value) => setExchangeSources(value.items)).catch(() => setExchangeSources([]));
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "overview") params.set("view", view);
    if (filters.provider_profile_id) params.set("provider", filters.provider_profile_id);
    if (filters.task) params.set("task", filters.task);
    if (filters.processing_mode) params.set("mode", filters.processing_mode);
    if (filters.start_date) params.set("start", filters.start_date);
    if (filters.end_date) params.set("end", filters.end_date);
    if (filters.unit !== "job") params.set("unit", filters.unit);
    if (jobLimit !== 25) params.set("limit", String(jobLimit));
    if (timezone !== "UTC") params.set("tz", timezone);
    history.replaceState(null, "", `/sizing${params.size ? `?${params}` : ""}`);
  }, [view, filters, timezone, jobLimit]);
  useEffect(() => { setRetentionPlan(null); }, [retention]);

  async function inspect(jobId: string) {
    if (expandedJobs.includes(jobId)) {
      setExpandedJobs((ids) => ids.filter((id) => id !== jobId));
      return;
    }
    setExpandedJobs((ids) => [...ids, jobId]);
    if (operations[jobId]) return;
    setLoadingJobs((ids) => [...ids, jobId]);
    try {
      const result = await getSizingOperations(jobId);
      setOperations((items) => ({ ...items, [jobId]: result })); setError("");
    } catch (reason) {
      setExpandedJobs((ids) => ids.filter((id) => id !== jobId)); setError(errorText(reason));
    } finally {
      setLoadingJobs((ids) => ids.filter((id) => id !== jobId));
    }
  }
  async function calculate(event: FormEvent) {
    event.preventDefault();
    try { setResult(await calculateSizing(scenario)); setError(""); } catch (reason) { setError(errorText(reason)); }
  }
  async function savePrice(event: FormEvent) {
    event.preventDefault(); if (!catalog) return;
    try {
      setCatalog(await putSizingCatalog({ revision: catalog.revision, price_profiles: [...catalog.price_profiles, price], workload_profiles: catalog.workload_profiles, hardware_profiles: catalog.hardware_profiles }));
      setError("");
    } catch (reason) { setError(errorText(reason)); }
  }
  async function saveWorkload() {
    if (!catalog) return;
    try {
      setCatalog(await putSizingCatalog({ revision: catalog.revision, price_profiles: catalog.price_profiles, workload_profiles: [...catalog.workload_profiles, { id: `workload-${Date.now()}`, ...scenario }], hardware_profiles: catalog.hardware_profiles }));
    } catch (reason) { setError(errorText(reason)); }
  }
  async function saveHardware(event: FormEvent) {
    event.preventDefault(); if (!catalog) return;
    try {
      setCatalog(await putSizingCatalog({ revision: catalog.revision, price_profiles: catalog.price_profiles, workload_profiles: catalog.workload_profiles, hardware_profiles: [...catalog.hardware_profiles, { ...hardware, provenance: "operator_declared" }] }));
    } catch (reason) { setError(errorText(reason)); }
  }
  async function saveSnapshot() {
    if (!overview || !result) return;
    try {
      await createSizingSnapshot({ name: new Date().toLocaleString(locale), inputs: scenario, aggregate: overview, result, provenance: { generated_at: overview.generated_at, filters } });
      setSnapshots(await getSizingSnapshots()); setError("");
    } catch (reason) { setError(errorText(reason)); }
  }
  async function removeSnapshot(id: string) {
    try {
      const preview = await previewSizingSnapshotDelete(id);
      if (!confirm(`${t.remove}: ${id}?`)) return;
      await deleteSizingSnapshot(id, { revision: preview.revision, checksum: preview.checksum });
      setSnapshots(await getSizingSnapshots());
    } catch (reason) { setError(errorText(reason)); }
  }

  return <AppShell>
    <header className="page-header"><div><p className="eyebrow">X17 · {t.measurementFirst}</p><h1>{t.title}</h1><p>{t.subtitle}</p></div><button className="button secondary" onClick={load}>{t.refresh}</button></header>
    {error && <div className="notice error" role="alert">{error}</div>}
    <nav className="code-tabs sizing-tabs" aria-label={t.title}>{(["overview", "explorer", "calculator", "retention"] as View[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{t[item]}</button>)}</nav>

    {view === "overview" && <><section className="panel sizing-filters"><h2>{t.filters}</h2><div className="form-grid">
      <label>{t.provider}<input value={filters.provider_profile_id} onChange={(event) => setFilters({ ...filters, provider_profile_id: event.target.value })} /></label>
      <label>{t.task}<select value={filters.task} onChange={(event) => setFilters({ ...filters, task: event.target.value })}><option value="">{t.all}</option>{["full_ocr", "metadata", "segmentation", "readiness_probe"].map((value) => <option value={value} key={value}>{taskLabel(value)}</option>)}</select></label>
      <label>{t.mode}<select value={filters.processing_mode} onChange={(event) => setFilters({ ...filters, processing_mode: event.target.value })}><option value="">{t.all}</option>{["administrative_document", "dossier_cover", "combined_dossier"].map((value) => <option value={value} key={value}>{modeLabel(value)}</option>)}</select></label>
      <label>{t.utcStart}<input type="date" value={filters.start_date} onChange={(event) => setFilters({ ...filters, start_date: event.target.value })} /></label><label>{t.utcEnd}<input type="date" value={filters.end_date} onChange={(event) => setFilters({ ...filters, end_date: event.target.value })} /></label>
      <label>{t.unit}<select value={filters.unit} onChange={(event) => setFilters({ ...filters, unit: event.target.value })}>{["attempt", "page", "document", "job", "system"].map((value) => <option value={value} key={value}>{valueLabel(value)}</option>)}</select></label>
      <label>{t.jobLimit}<select value={jobLimit} onChange={(event) => setJobLimit(Number(event.target.value))}>{[10, 25, 50].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>{t.timezone}<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>UTC</option><option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>{t.local} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</option></select></label>
    </div></section>
    <section className="metric-grid">
      <article className="metric-card"><span>{t.jobs}</span><strong>{overview?.sample_count ?? "—"}</strong></article>
      <article className="metric-card"><span>{t.attempts}</span><strong>{overview?.operation_count ?? "—"}</strong></article>
      <article className="metric-card"><span>{t.tokens}</span><strong>{overview?.operation_count ? overview.total_tokens.toLocaleString(locale) : t.unavailableValue}</strong></article>
      <article className="metric-card"><span>{t.tokensPerMeasuredAttempt}</span><strong>{overview?.coverage.complete_usage_attempts ? Math.round(overview.total_tokens / overview.coverage.complete_usage_attempts).toLocaleString(locale) : t.unavailableValue}</strong></article>
      <article className="metric-card"><span>{t.usage}</span><strong>{pct(overview?.coverage.response_usage_percent, t.unavailableValue)}</strong></article>
      <article className="metric-card"><span>{t.billing}</span><strong>{pct(overview?.coverage.billing_certainty_percent, t.unavailableValue)}</strong></article>
      <article className="metric-card"><span>{t.knownCost}</span><strong>{money(overview?.known_cost, t.unavailableValue)}</strong></article>
    </section>
    <section className="panel sizing-card"><div className="section-head"><div><h2>{overview?.operation_count ? t.overview : t.unavailable}</h2><p>{t.honest}</p></div><span className={`sizing-status ${statusTone(overview?.value_kind || "unavailable")}`}>{valueLabel(overview?.value_kind || "unavailable")}</span></div>
      <SizingChart jobs={jobs} label={t.chartLabel} />{jobs.length < 2 && <div className="notice warning sizing-notice"><span aria-hidden="true">⚠</span><p>{t.noChart}</p></div>}
      <div className="table-scroll"><table className="data-table"><thead><tr><th>{t.gate}</th><th className="numeric">n</th><th>{t.status}</th></tr></thead><tbody>{Object.entries(overview?.gates || {}).map(([name, gate]) => { const status = gate.available ? "available" : gate.reason; return <tr key={name}><td>{valueLabel(name)}</td><td className="numeric">{gate.minimum_jobs}</td><td><span className={`sizing-status ${statusTone(status.toLowerCase())}`}>{valueLabel(status)}</span></td></tr>; })}</tbody></table></div>
    </section></>}

    {view === "explorer" && <section className="panel sizing-card"><div className="section-head"><h2>{t.explorer}</h2><button className="button secondary" onClick={() => download("sizing-jobs.csv", [`generated_at,timezone,sample_count,response_usage_percent,billing_certainty_percent`, [overview?.generated_at, timezone, overview?.sample_count, overview?.coverage.response_usage_percent, overview?.coverage.billing_certainty_percent].map((value) => JSON.stringify(value ?? "")).join(","), `filters,${JSON.stringify(JSON.stringify(filters))}`, "job_id,provider_profile_id,processing_mode,total_tokens,response_usage_percent", ...jobs.map((job) => [job.job_id, job.provider_profile_id, job.processing_mode, job.total_tokens, job.response_usage_percent].map((value) => JSON.stringify(value ?? "")).join(","))].join("\n"), "text/csv")}>{t.exportCsv}</button></div><div className="table-scroll"><table className="data-table sizing-jobs-table"><thead><tr><th>{t.job}</th><th>{t.provider}</th><th>{t.mode}</th><th className="numeric">{t.tokens}</th><th className="numeric">{t.usage}</th><th /></tr></thead><tbody>{jobs.map((job) => <Fragment key={job.job_id}><tr><td><span className="job-id" title={job.job_id}>{job.job_id.slice(0, 8)}</span><button className="copy-id" type="button" title={t.copyId} aria-label={`${t.copyId} ${job.job_id}`} onClick={() => navigator.clipboard.writeText(job.job_id)}>⧉</button></td><td>{job.provider_profile_id || "—"}</td><td>{modeLabel(job.processing_mode || "") || "—"}</td><td className="numeric">{job.total_tokens.toLocaleString(locale)}</td><td className="numeric">{pct(job.response_usage_percent, t.unavailableValue)}</td><td><button className="button secondary" aria-expanded={expandedJobs.includes(job.job_id)} onClick={() => inspect(job.job_id)}>{loadingJobs.includes(job.job_id) ? "…" : t.inspect}</button></td></tr>
      {expandedJobs.includes(job.job_id) && <tr className="attempt-row"><td colSpan={6}>{loadingJobs.includes(job.job_id) ? <p className="empty">{t.loading}</p> : <div className="attempt-shell"><h3 title={job.job_id}>{job.job_id.slice(0, 8)} · {t.attempts}</h3><div className="table-scroll"><table className="data-table attempts-table"><thead><tr><th>{t.task}</th><th className="numeric">{t.page}</th><th className="numeric">{t.attempt}</th><th>{t.status}</th><th>{t.usageLabel}</th><th className="numeric">ms</th></tr></thead><tbody>{operations[job.job_id]?.items.map((item) => <tr key={`${item.operation_id}-${item.attempt}`}><td>{taskLabel(item.task || "")}</td><td className="numeric">{item.page_index ?? "—"}</td><td className="numeric">{item.attempt}</td><td><span className={`sizing-status ${statusTone(item.status || "missing")}`}>{valueLabel(item.status || "missing")}</span></td><td><span className={`sizing-status subtle ${statusTone(item.usage_status || "missing")}`}>{valueLabel(item.usage_status || "missing")}</span></td><td className="numeric">{item.duration_ms?.toLocaleString(locale) ?? "—"}</td></tr>)}</tbody></table></div></div>}</td></tr>}</Fragment>)}</tbody></table></div>
    </section>}

    {view === "calculator" && <div className="sizing-stack"><form className="panel sizing-card" onSubmit={calculate}><h2>{t.scenarioPreview}</h2><div className="form-grid sizing-form-grid">
      <label>{t.monthly}<input type="number" min="1" value={scenario.monthly_jobs} onChange={(event) => setScenario({ ...scenario, monthly_jobs: Number(event.target.value) })} /></label>
      <label>{t.days}<input type="number" min="1" max="31" value={scenario.operating_days} onChange={(event) => setScenario({ ...scenario, operating_days: Number(event.target.value) })} /></label>
      <label>{t.hours}<input type="number" min="1" max="24" value={scenario.operating_hours} onChange={(event) => setScenario({ ...scenario, operating_hours: Number(event.target.value) })} /></label>
      <label>{t.mode}<select value={scenario.processing_mode} onChange={(event) => setScenario({ ...scenario, processing_mode: event.target.value as typeof scenario.processing_mode })}>{["administrative_document", "dossier_cover", "combined_dossier"].map((value) => <option value={value} key={value}>{modeLabel(value)}</option>)}</select></label>
      {scenario.processing_mode === "combined_dossier" ? <><label>{t.documentsPerDossier}<input type="number" min="1" step=".1" value={scenario.average_documents_per_dossier} onChange={(event) => setScenario({ ...scenario, average_documents_per_dossier: Number(event.target.value) })} /></label><label>{t.pagesPerDocument}<input type="number" min="1" step=".1" value={scenario.average_pages_per_document} onChange={(event) => setScenario({ ...scenario, average_pages_per_document: Number(event.target.value) })} /></label></> : <label>{t.pagesPerJob}<input type="number" min="1" step=".1" value={scenario.average_pages_per_job} onChange={(event) => setScenario({ ...scenario, average_pages_per_job: Number(event.target.value) })} /></label>}
      <label>{t.peak}<input type="number" min="1" step=".1" value={scenario.peak_factor} onChange={(event) => setScenario({ ...scenario, peak_factor: Number(event.target.value) })} /></label>
      <label>{t.reserve}<input type="number" min="0" step=".05" value={scenario.reserve} onChange={(event) => setScenario({ ...scenario, reserve: Number(event.target.value) })} /></label>
    </div><footer className="modal-actions"><button className="button primary" type="submit">{t.calculate}</button><button className="button secondary" type="button" onClick={saveWorkload}>{t.saveWorkload}</button><span className="disabled-help" title={!result ? t.snapshotDisabled : undefined}><button className="button secondary" type="button" disabled={!result} aria-describedby={!result ? "snapshot-disabled-reason" : undefined} onClick={saveSnapshot}>{t.saveSnapshot}</button></span></footer>{!result && <small id="snapshot-disabled-reason" className="field-help">{t.snapshotDisabled}</small>}{result && <pre className="safe-json">{JSON.stringify(result, null, 2)}</pre>}</form>
    <form className="panel sizing-card" onSubmit={savePrice}><h2>{t.price}</h2><div className="form-grid sizing-form-grid">
      <label>ID<input required value={price.id} onChange={(event) => setPrice({ ...price, id: event.target.value })} /></label><label>{t.provider}<input required value={price.provider_profile_id} onChange={(event) => setPrice({ ...price, provider_profile_id: event.target.value })} /></label><label>{t.model}<input required value={price.model} onChange={(event) => setPrice({ ...price, model: event.target.value })} /></label>
      <label>{t.inputPerMillion}<input type="number" min="0" step=".000001" value={price.input_per_million} onChange={(event) => setPrice({ ...price, input_per_million: Number(event.target.value) })} /></label><label>{t.outputPerMillion}<input type="number" min="0" step=".000001" value={price.output_per_million} onChange={(event) => setPrice({ ...price, output_per_million: Number(event.target.value) })} /></label><label>{t.cachedPerMillion}<input type="number" min="0" step=".000001" value={price.cached_per_million} onChange={(event) => setPrice({ ...price, cached_per_million: Number(event.target.value) })} /></label>
      <label>{t.exchangeSource}<select value={price.exchange_source} onChange={(event) => setPrice({ ...price, exchange_source: event.target.value, exchange_confirmed: false })}><option value="">{t.manualUnavailable}</option>{exchangeSources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label><label>{t.exchangeRate}<input type="number" min="0" step=".000001" value={price.exchange_rate} onChange={(event) => setPrice({ ...price, exchange_rate: Number(event.target.value), exchange_confirmed: false })} /></label><label className="check-label"><input type="checkbox" checked={price.exchange_confirmed} onChange={(event) => setPrice({ ...price, exchange_confirmed: event.target.checked })} />{t.confirmExchange}</label>
    </div><footer className="modal-actions"><button className="button secondary" type="button" disabled={!price.exchange_source} onClick={() => suggestExchangeRate(price.exchange_source).catch((reason) => setError(errorText(reason)))}>{t.fetchSuggestion}</button><span className="disabled-help" title={price.exchange_rate > 0 && !price.exchange_confirmed ? t.priceDisabled : undefined}><button className="button primary" type="submit" disabled={price.exchange_rate > 0 && !price.exchange_confirmed}>{t.savePrice}</button></span></footer>{price.exchange_rate > 0 && !price.exchange_confirmed && <small className="field-help">{t.priceDisabled}</small>}</form>
    <form className="panel sizing-card" onSubmit={saveHardware}><h2>{t.hardware}</h2><div className="form-grid sizing-form-grid"><label>ID<input required value={hardware.id} onChange={(event) => setHardware({ ...hardware, id: event.target.value })} /></label><label>{t.description}<input required value={hardware.description} onChange={(event) => setHardware({ ...hardware, description: event.target.value })} /></label><label>CPU<input value={hardware.cpu} onChange={(event) => setHardware({ ...hardware, cpu: event.target.value })} /></label><label>RAM GB<input type="number" min="0" value={hardware.ram_gb} onChange={(event) => setHardware({ ...hardware, ram_gb: Number(event.target.value) })} /></label><label>GPU<input value={hardware.gpu} onChange={(event) => setHardware({ ...hardware, gpu: event.target.value })} /></label></div><button className="button primary" type="submit">{t.saveHardware}</button></form></div>}

    {view === "retention" && <div className="sizing-stack"><section className="panel sizing-card"><h2>{t.snapshots}</h2>{snapshots?.items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{t.name}</th><th>{t.created}</th><th>{t.status}</th><th /></tr></thead><tbody>{snapshots.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{new Date(item.created_at).toLocaleString(locale)}</td><td><span className={`sizing-status ${item.archived ? "info" : "good"}`}>{item.archived ? t.archived : t.active}</span></td><td><button className="button secondary" onClick={() => download(`${item.id}.json`, JSON.stringify(item, null, 2), "application/json")}>{t.exportJson}</button><button className="button secondary" onClick={() => patchSizingSnapshot(item.id, { revision: item.revision, archived: !item.archived }).then(() => getSizingSnapshots().then(setSnapshots))}>{t.archive}</button><button className="button danger ghost" onClick={() => removeSnapshot(item.id)}>{t.remove}</button></td></tr>)}</tbody></table></div> : <div className="snapshot-empty"><span aria-hidden="true">◇</span><b>{t.emptySnapshots}</b><p>{t.snapshotHint}</p></div>}</section>
    <section className="panel sizing-card retention-danger"><div className="retention-warning"><span aria-hidden="true">⚠</span><div><h2>{t.previewDelete}</h2><p>{t.retentionHint}</p></div></div><div className="form-grid sizing-form-grid"><label>{t.utcStart}<input type="date" value={retention.start_date} onChange={(event) => setRetention({ ...retention, start_date: event.target.value })} /></label><label>{t.utcEnd}<input type="date" value={retention.end_date} onChange={(event) => setRetention({ ...retention, end_date: event.target.value })} /></label><label className="check-label"><input type="checkbox" checked={retention.include_system} onChange={(event) => setRetention({ ...retention, include_system: event.target.checked })} />{t.systemOperations}</label><label className="check-label"><input type="checkbox" checked={retention.include_rollups} onChange={(event) => setRetention({ ...retention, include_rollups: event.target.checked })} />{t.rollups}</label><label className="check-label"><input type="checkbox" checked={retention.include_pinned_benchmarks} onChange={(event) => setRetention({ ...retention, include_pinned_benchmarks: event.target.checked })} />{t.pinnedBenchmarks}</label></div>{retentionPlan && <div className="retention-preview" role="status" aria-live="polite"><strong>{t.previewReady}</strong><span><b className="retention-preview-operations">{retentionPlan.operation_count}</b> {t.attempts}</span><span><b className="retention-preview-rollups">{retentionPlan.rollup_count}</b> {t.rollups}</span></div>}<footer className="modal-actions"><button className="button danger outline-danger" disabled={!retention.start_date || !retention.end_date} onClick={() => previewSizingRetention(retention).then((plan) => { setRetentionPlan(plan); setError(""); }).catch((reason) => setError(errorText(reason)))}>{t.previewDelete}</button>{retentionPlan && <button className="button danger solid-danger" onClick={() => applySizingRetention({ plan_token: retentionPlan.plan_token, checksum: retentionPlan.checksum }).then(() => { setRetentionPlan(null); void load(); }).catch((reason) => setError(errorText(reason)))}>{t.applyDelete} ({retentionPlan.operation_count})</button>}</footer></section></div>}
  </AppShell>;
}
