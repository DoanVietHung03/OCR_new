"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { ACTIVE_JOB_STATUSES, ApiError, bulkDelete, cancelJob, checkEngine, createJob, DELETABLE_JOB_STATUSES, deletePreview, getDocuments, getProviderProfiles, getReports, getState, Job, ProviderProfile, Reports, rerunJob, startJob, State, TERMINAL_JOB_STATUSES, uploadFile } from "../lib/api";
import { language, safeError, statusText, text, TextKey, useLanguage } from "../lib/i18n";
import AppShell from "./app-shell";

const metricLabels: Record<keyof State["metrics"], TextKey> = { total_jobs: "totalJobs", active_jobs: "activeJobs", completed_jobs: "completedJobs", documents: "documents", pages: "pages", correction_count: "corrections", error_jobs: "errorJobs" };
const metricGroups: { label: TextKey; keys: (keyof State["metrics"])[] }[] = [
  { label: "jobStatusMetrics", keys: ["total_jobs", "active_jobs", "completed_jobs", "error_jobs"] },
  { label: "contentMetrics", keys: ["documents", "pages", "correction_count"] },
];
const emptyState: State = {
  server_mode: true, jobs: [], documents: [], logs: [], metrics: { total_jobs: 0, active_jobs: 0, completed_jobs: 0, documents: 0, pages: 0, correction_count: 0, error_jobs: 0 },
  ocr_methods: [], limits: { max_files_per_job: 15, max_job_upload_bytes: 200 * 1024 * 1024 }, pagination: { page: 1, page_size: 25, pages: 1, total: 0 },
};
type Action = { type: "cancel" | "rerun" | "delete"; jobs: Job[]; blocked?: { id: string; name?: string | null }[] } | null;
type Task = ProviderProfile["tasks"][number];
type PageMode = ProviderProfile["page_modes"][number];
type ProcessingMode = ProviderProfile["processing_modes"][number];

const size = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.ceil(value / 1024 ** 2)} MB`;
const message = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : reason instanceof Error ? reason.message : String(reason));

export default function Home() {
  useLanguage();
  const router = useRouter();
  const uploadOnly = usePathname() === "/upload";
  const [state, setState] = useState<State>(emptyState);
  const [files, setFiles] = useState<File[]>([]); const [jobName, setJobName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false); const [stale, setStale] = useState(false); const [uploadOpen, setUploadOpen] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const syncingUrl = useRef<string | null>(null);
  const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [method, setMethod] = useState("all"); const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<string[]>([]); const [engineMessage, setEngineMessage] = useState("");
  const [consent, setConsent] = useState(false); const [progress, setProgress] = useState(""); const [action, setAction] = useState<Action>(null);
  const [actionConsent, setActionConsent] = useState(false); const actionDialog = useRef<HTMLDialogElement>(null); const uploadPanel = useRef<HTMLElement>(null); const fileInput = useRef<HTMLInputElement>(null); const folderInput = useRef<HTMLInputElement>(null);
  const [rerunMode, setRerunMode] = useState<"reuse_segmentation" | "resegment">("reuse_segmentation");
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]); const [profileId, setProfileId] = useState("");
  const [reports, setReports] = useState<Reports | null>(null);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [task, setTask] = useState<Task>("full_ocr"); const [pages, setPages] = useState<PageMode>("all"); const [maxPages, setMaxPages] = useState(0);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("administrative_document");
  const availableProfiles: ProviderProfile[] = profiles.length ? profiles : state.ocr_methods.map((item) => ({ ...item, model: "", tasks: ["full_ocr", "metadata"], page_modes: ["all", "auto", "first,last"], max_pages: 100, processing_modes: ["administrative_document"] }));
  const engine = availableProfiles.find((item) => item.id === profileId) || availableProfiles[0]; const external = Boolean(engine?.external); const configured = engine?.status === "configured";
  const automaticJobName = files.length ? `${files[0].name}${files.length > 1 ? ` +${files.length - 1}` : ""}` : "";

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      const initialQuery = params.get("q") || ""; syncingUrl.current = initialQuery; setSearch(initialQuery); setQuery(initialQuery);
      setStatus(params.get("status") || "all"); setMethod(params.get("engine") || "all"); setSort(params.get("sort") || "created_desc"); setPage(Math.max(1, Number(params.get("page")) || 1));
      if (params.get("upload") === "1") requestAnimationFrame(() => uploadPanel.current?.scrollIntoView({ behavior: "smooth" }));
      setUrlReady(true);
    };
    sync(); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => { setUploadOpen(uploadOnly); }, [uploadOnly]);
  useEffect(() => { if (syncingUrl.current !== null) { if (search === syncingUrl.current) syncingUrl.current = null; return; } const timer = setTimeout(() => { setQuery(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(location.search); ["q", "status", "engine", "sort", "page"].forEach((key) => params.delete(key));
    if (query) params.set("q", query); if (status !== "all") params.set("status", status); if (method !== "all") params.set("engine", method); if (sort !== "created_desc") params.set("sort", sort); if (page > 1) params.set("page", String(page));
    const next = `${location.pathname}${params.size ? `?${params}` : ""}`;
    if (`${location.pathname}${location.search}` !== next) history.pushState(null, "", next);
    setSelected([]);
  }, [query, status, method, sort, page, urlReady]);

  const refresh = useCallback(async () => {
    try {
      const next = await getState({ query, status, method, sort, page });
      const normalized = { ...emptyState, ...next, metrics: { ...emptyState.metrics, ...next.metrics }, limits: { ...emptyState.limits, ...next.limits }, pagination: { ...emptyState.pagination, ...next.pagination } };
      setState(normalized); setSelected((ids) => ids.filter((id) => normalized.jobs.some((job) => job.id === id && DELETABLE_JOB_STATUSES.has(job.status)))); setLoadError(""); setStale(false); setLoaded(true);
    } catch (reason) { if (loaded) setStale(true); else setLoadError(message(reason)); }
  }, [query, status, method, sort, page, loaded]);
  useEffect(() => {
    if (!urlReady) return;
    refresh(); const tick = () => { if (!document.hidden) refresh(); }; const timer = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick); return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh, urlReady]);
  useEffect(() => { if (action) actionDialog.current?.showModal(); else actionDialog.current?.close(); }, [action]);
  useEffect(() => { getProviderProfiles().then(({ profiles }) => { setProfiles(profiles); if (profiles[0]) applyProfile(profiles[0]); }).catch(() => { /* old backend: state.ocr_methods remains the compatibility fallback */ }); }, []);
  useEffect(() => { if (!uploadOnly) getReports().then(setReports).catch(() => setReports(null)); }, [uploadOnly]);
  useEffect(() => { if (!uploadOnly) getDocuments({ page_size: 1 }).then((value) => setReviewCount(value.triage_counts?.needs_review ?? 0)).catch(() => setReviewCount(null)); }, [uploadOnly]);

  function choose(incoming: File[]) {
    const next = incoming;
    const names = next.map((file) => file.name.toLocaleLowerCase());
    if (next.some((file) => !file.name.toLocaleLowerCase().endsWith(".pdf"))) return setError(text("invalidPdf"));
    if (new Set(names).size !== names.length) return setError(text("duplicateFile"));
    if (next.length > state.limits.max_files_per_job || next.reduce((total, file) => total + file.size, 0) > state.limits.max_job_upload_bytes) return setError(text("fileLimit"));
    setFiles(next); setError("");
  }
  function applyProfile(profile: ProviderProfile) {
    const nextTask = profile.tasks.includes(task) ? task : profile.tasks[0] || task;
    const nextPages = nextTask === "full_ocr" ? "all" : profile.page_modes.includes(pages) ? pages : profile.page_modes[0] || pages;
    setProfileId(profile.id); setTask(nextTask); setPages(nextPages);
    setProcessingMode(profile.processing_modes.includes(processingMode) ? processingMode : profile.processing_modes[0] || processingMode);
    setMaxPages((value) => Math.min(value, profile.max_pages)); setConsent(false); setEngineMessage("");
  }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); if (!busy) choose(Array.from(event.dataTransfer.files)); }
  async function upload() {
    if (!files.length || !configured || (external && !consent)) return;
    setBusy(true); setError("");
    try {
      const job = await createJob({ file_count: files.length, upload_name: jobName.trim() || automaticJobName, cloud_data_confirmed: consent,
        provider_profile_id: engine.id, vlm_task: task, vlm_pages: task === "full_ocr" ? "all" : pages,
        vlm_max_pages: task === "metadata" && pages === "auto" && processingMode !== "dossier_cover" ? maxPages : 0, processing_mode: processingMode });
      for (const [index, file] of files.entries()) { setProgress(text("uploading", { current: index + 1, total: files.length, name: file.name })); await uploadFile(job.id, file); }
      await startJob(job.id); router.push(`/jobs/${job.id}`);
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); setProgress(""); }
  }
  async function requestDelete(jobs: Job[]) {
    try {
      const preview = await deletePreview(jobs.map((job) => job.id));
      setAction({ type: "delete", jobs: jobs.filter((job) => preview.deletable.some((item) => item.id === job.id)), blocked: preview.skipped });
    } catch (reason) { setError(message(reason)); }
  }
  async function confirmAction() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.type === "cancel") await cancelJob(action.jobs[0].id);
      if (action.type === "rerun") {
        const job = action.jobs[0]; const next = await rerunJob(job.id, Boolean(job.endpoint_external && actionConsent), rerunMode); setAction(null); router.push(`/jobs/${next.id}`); return;
      }
      if (action.type === "delete" && action.jobs.length) {
        const result = await bulkDelete(action.jobs.map((job) => job.id));
        const incomplete = result.skipped.length + result.failed.length;
        setAction(null); setActionConsent(false); await refresh();
        if (incomplete) setError(text("deleteIncomplete", { count: incomplete }));
        return;
      }
      setAction(null); setActionConsent(false); await refresh();
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  const openUpload = () => { if (!uploadOnly) return router.push("/upload"); setUploadOpen(true); requestAnimationFrame(() => uploadPanel.current?.scrollIntoView({ behavior: "smooth" })); };

  if (!loaded && loadError) return <AppShell onNew={openUpload}><section className="panel empty" role="alert"><p>{loadError}</p><button className="button secondary" onClick={refresh}>{text("retry")}</button></section></AppShell>;
  const terminalIds = state.jobs.filter((job) => TERMINAL_JOB_STATUSES.has(job.status)).map((job) => job.id);
  const selectedFileBytes = files.reduce((total, file) => total + file.size, 0);

  return <AppShell onNew={openUpload}>
    <header className="page-header"><div><p className="eyebrow">{text("title")}</p><h1>{text(uploadOnly ? "upload" : "jobs")}</h1><p>{text(uploadOnly ? "uploadSubtitle" : "subtitle")}</p></div>{!uploadOnly && <button className="button primary" onClick={openUpload}>＋ {text("newOcr")}</button>}</header>
    {uploadOpen && <section ref={uploadPanel} className="panel upload-panel">
      <div className="section-head"><div><p className="eyebrow">{language() === "vi" ? "CHỈ PDF" : "PDF ONLY"}</p>{!uploadOnly && <h2>{text("upload")}</h2>}<p>{text("uploadHint", { files: state.limits.max_files_per_job, size: size(state.limits.max_job_upload_bytes) })} {text("pageLimit")}</p></div>{!uploadOnly && <button className="icon-button" aria-label={text("close")} onClick={() => setUploadOpen(false)}>×</button>}</div>
      <div className="upload-options">
        <label className="upload-option-card job-name-card"><span>{text("jobName")}</span><input value={jobName} maxLength={120} disabled={busy} placeholder={automaticJobName || text("jobNamePlaceholder")} onChange={(event) => setJobName(event.target.value)} /><small>{text("jobNameHint")}</small></label>
        <label className="upload-option-card"><span>{language() === "vi" ? "Chế độ xử lý" : "Processing mode"}</span><select value={processingMode} disabled={busy} onChange={(event) => setProcessingMode(event.target.value as typeof processingMode)}>{(engine?.processing_modes || ["administrative_document"]).map((mode) => <option value={mode} key={mode}>{{ administrative_document: language() === "vi" ? "Văn bản hành chính" : "Administrative document", dossier_cover: language() === "vi" ? "Bìa hồ sơ" : "Dossier cover", combined_dossier: language() === "vi" ? "Hồ sơ gộp" : "Combined dossier" }[mode]}</option>)}</select></label>
        {availableProfiles.length > 1 ? <label className="upload-option-card"><span>{text("engine")}</span><select value={engine?.id || ""} disabled={busy} onChange={(event) => applyProfile(availableProfiles.find((item) => item.id === event.target.value)!)}>{availableProfiles.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label> : <div className="upload-option-card option-value locked-value"><span aria-hidden="true">🔒</span><strong>{engine?.label || "—"}</strong><small>{text("systemManaged")}</small></div>}
        <label className="upload-option-card"><span>{text("task")}</span><select value={task} disabled={busy} onChange={(event) => { const value = event.target.value as Task; setTask(value); if (value === "full_ocr") { setPages("all"); setMaxPages(0); } }}>{(engine?.tasks || ["full_ocr", "metadata"]).map((value) => <option value={value} key={value}>{text(value === "full_ocr" ? "fullOcr" : "metadata")}</option>)}</select></label>
        <div className="upload-option-card page-scope-card">
          <label><span>{text("pageScope")}</span><select value={pages} disabled={busy || task === "full_ocr"} onChange={(event) => setPages(event.target.value as typeof pages)}>{(engine?.page_modes || ["all", "auto", "first,last"]).map((value) => <option value={value} key={value}>{text(value === "all" ? "allPages" : value === "auto" ? "autoPages" : "edgePages")}</option>)}</select></label>
          {task === "metadata" && pages === "auto" && processingMode !== "dossier_cover" && <div className="page-scope-details"><small>{text("autoPagesHint")}</small><label><span>{text("maxPages")}</span><input type="number" min="0" max={engine?.max_pages || 100} value={maxPages} disabled={busy} onChange={(event) => setMaxPages(Math.max(0, Math.min(engine?.max_pages || 100, Number(event.target.value) || 0)))} /></label></div>}
        </div>
      </div>
      <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <input ref={fileInput} hidden aria-label={text("pdfFiles")} type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => choose(Array.from(event.target.files || []))} />
        <input ref={(element) => { folderInput.current = element; element?.setAttribute("webkitdirectory", ""); }} hidden aria-label={language() === "vi" ? "Thư mục PDF" : "PDF folder"} type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => choose(Array.from(event.target.files || []))} />
        <span className="drop-icon">⇧</span><strong>{text("dropFiles")}</strong><small>{text("selectedFiles", { count: files.length })}</small>
        <div className="dropzone-links"><button className="text-button" disabled={busy} onClick={() => fileInput.current?.click()}>{text("chooseFiles")}</button><span aria-hidden="true">·</span><button className="text-button" disabled={busy} onClick={() => folderInput.current?.click()}>{text("chooseFolder")}</button></div>
      </div>
      {!!files.length && <div className="file-list"><div className="file-list-head"><b>{text("selectedFiles", { count: files.length })} · {size(selectedFileBytes)}</b><button className="button secondary" disabled={busy} onClick={() => setFiles([])}>{language() === "vi" ? "Xóa tất cả" : "Clear all"}</button></div><div className="file-list-items">{files.map((file) => <div key={file.name}><span><b>{file.name}</b><small>{size(file.size)}</small></span><button aria-label={text("removeFile", { name: file.name })} disabled={busy} onClick={() => choose(files.filter((item) => item !== file))}>×</button></div>)}</div></div>}
      {external && <label className="consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />{text("consent")}</label>}
      <div className="upload-actions"><div><span className={`status ${engine?.status || "not_configured"}`}>{statusText(engine?.status || "not_configured")}</span><small>{engineMessage || text("configuredHint")}</small></div><button className="button secondary" disabled={!engine || busy} onClick={() => engine && checkEngine(engine.id).then((result) => setEngineMessage(statusText(result.status))).catch((reason) => setEngineMessage(message(reason)))}>{text("checkEngine")}</button><button className="button primary" disabled={busy || !files.length || !configured || (external && !consent)} onClick={upload}>{progress || text("start")}</button></div>
    </section>}
    {(error || (!uploadOnly && stale)) && <div className={error ? "notice error" : "notice warning"} role="alert"><span>{error || text("stale")}</span><button className="button secondary" onClick={refresh}>{text("retry")}</button></div>}
    {!uploadOnly && <>
    <section className="metric-summary" aria-label={text("jobMetrics")}>
      {metricGroups.map((group) => <div className="metric-group" key={group.label}><h2>{text(group.label)}</h2><div className={`metrics metrics-${group.keys.length}`}>{group.keys.map((key) => <article className="panel metric" key={key}><span>{text(metricLabels[key])}</span><strong>{state.metrics[key]}</strong></article>)}</div></div>)}
      <small className="metrics-note">{text("filteredResults")}</small>
    </section>
    <Link className="panel review-queue-cta" href="/documents?triage=needs_review"><span><b>{text("documentsNeedReview")}</b><small>{text("reviewQueueCta")}</small></span><strong>{reviewCount ?? "—"} →</strong></Link>
    {!!reports?.benchmark_samples?.length && <section className="panel benchmark-panel"><div className="section-head"><div><p className="eyebrow">OCR</p><h2>{text("benchmark")}</h2></div><span>{reports.benchmark_samples.length} {text("samples")}</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>{text("provider")}</th><th>{text("fixtureGroup")}</th><th>{text("task")}</th><th>{text("sampleSize")}</th><th>{text("measured")}</th></tr></thead><tbody>{reports.benchmark_samples.map((sample) => <tr key={`${sample.provider_profile_id}-${sample.fixture_group}-${sample.measured_at}`}><td>{sample.provider_profile_id}</td><td>{sample.fixture_group}</td><td>{sample.task} · {sample.page_scope}</td><td>{sample.sample_size}</td><td>{new Date(sample.measured_at).toLocaleString(language())}</td></tr>)}</tbody></table></div></section>}
    <section className="panel jobs-panel">
      <div className="section-head"><div><h2>{text("jobs")}</h2><p>{text("matchingJobs", { count: state.pagination.total })}</p></div><button className="button secondary" onClick={refresh}>{text("refresh")}</button></div>
      <div className="filters"><input aria-label={text("search")} placeholder={text("search")} value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={text("status")} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">{text("allStatuses")}</option><option value="active">{text("activeJobs")}</option>{["uploading", "ready", "starting", "queued", "segmenting", "awaiting_segmentation_review", "segmentation_confirmed", "extraction_starting", "running", "cancelling", "completed", "completed_with_warnings", "error", "cancelled", "interrupted"].map((value) => <option value={value} key={value}>{statusText(value)}</option>)}</select><select aria-label={text("engine")} value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }}><option value="all">{text("allEngines")}</option>{state.ocr_methods.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><select aria-label={text("sort")} value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="created_desc">{text("newest")}</option><option value="created_asc">{text("oldest")}</option><option value="updated_desc">{text("recentlyUpdated")}</option><option value="updated_asc">{text("leastRecentlyUpdated")}</option></select></div>
      {!!selected.length && <div className="bulk-toolbar"><b>{text("selectedJobs", { count: selected.length })}</b><button className="button danger" onClick={() => requestDelete(state.jobs.filter((job) => selected.includes(job.id)))}>{text("delete")}</button></div>}
      <div className="job-table">
        <div className="job-row job-head"><input aria-label={text("selectAllTerminal")} type="checkbox" disabled={!terminalIds.length} checked={terminalIds.length > 0 && terminalIds.every((id) => selected.includes(id))} onChange={(event) => setSelected(event.target.checked ? terminalIds : [])} /><span>{text("job")}</span><span>{text("status")}</span><span>{text("provider")}</span><span>{text("pages")}</span><span>{text("updated")}</span><span>{text("actions")}</span></div>
        {state.jobs.map((job) => <article className="job-row" key={job.id}>
          <input aria-label={text("selectJob", { name: job.upload_name || job.id })} type="checkbox" disabled={!DELETABLE_JOB_STATUSES.has(job.status)} checked={selected.includes(job.id)} onChange={() => setSelected((ids) => ids.includes(job.id) ? ids.filter((id) => id !== job.id) : [...ids, job.id])} />
          <div><Link href={`/jobs/${job.id}`}><b>{job.upload_name || job.id}</b></Link><small>{job.id.slice(0, 8)}</small></div><span className={`status ${job.status}`}>{statusText(job.status)}</span>
          <span>{job.provider || job.ocr_method || "—"}</span><span>{text("filesAndPages", { files: job.uploaded_files, expected: job.expected_files, pages: job.page_count, failed: job.failed_pages })}<small>{text("corrections")}: {job.correction_count}{job.error ? ` · ${safeError(job.error)}` : ""}</small>{ACTIVE_JOB_STATUSES.has(job.status) && job.total_pages > 0 && <><progress value={job.completed_pages} max={job.total_pages} /><small>{job.progress_stage.replaceAll("_", " ")} · {job.completed_pages}/{job.total_pages}</small></>}</span><time>{new Date(job.updated_at || job.created_at).toLocaleString(language())}</time>
          <div className="actions"><Link className="button secondary" href={`/jobs/${job.id}`}>{text("open")}</Link>{ACTIVE_JOB_STATUSES.has(job.status) && <button className="button danger" disabled={job.status === "cancelling"} onClick={() => setAction({ type: "cancel", jobs: [job] })}>{text("cancel")}</button>}{TERMINAL_JOB_STATUSES.has(job.status) && <button className="button secondary" onClick={() => setAction({ type: "rerun", jobs: [job] })}>{text("rerun")}</button>}{DELETABLE_JOB_STATUSES.has(job.status) && <details className="row-menu"><summary aria-label={text("moreActions")} title={text("moreActions")}>···</summary><button onClick={() => requestDelete([job])}>{text("delete")}</button></details>}</div>
        </article>)}
        {!state.jobs.length && <p className="empty">{loaded ? text("noJobs") : text("loading")}</p>}
      </div>
      <nav className="pagination" aria-label={text("pageOf", { page: state.pagination.page, pages: state.pagination.pages })}><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{text("previous")}</button><span>{text("pageOf", { page: state.pagination.page, pages: state.pagination.pages })}</span><button className="button secondary" disabled={page >= state.pagination.pages} onClick={() => setPage(page + 1)}>{text("next")}</button></nav>
    </section></>}
    <dialog ref={actionDialog} className="modal" onClose={() => { setAction(null); setActionConsent(false); }}>
      {action && <><div className="modal-head"><h2>{text(action.type === "delete" ? "deleteTitle" : action.type === "cancel" ? "cancelTitle" : "rerunTitle")}</h2><button className="icon-button" aria-label={text("close")} onClick={() => setAction(null)}>×</button></div>
        <p>{action.type === "delete" ? text("deleteSummary", { count: action.jobs.length }) : text(action.type === "cancel" ? "cancelBody" : "rerunBody")}</p>
        <ul>{action.jobs.map((job) => <li key={job.id}>{job.upload_name || job.id}</li>)}</ul>{!!action.blocked?.length && <><b>{text("blocked")}</b><ul>{action.blocked.map((job) => <li key={job.id}>{job.name || job.id}</li>)}</ul></>}
        {action.type === "rerun" && action.jobs[0]?.endpoint_external && <label className="consent"><input type="checkbox" checked={actionConsent} onChange={(event) => setActionConsent(event.target.checked)} />{text("consent")}</label>}
        {action.type === "rerun" && <><p><b>{action.jobs[0].processing_mode || "legacy"}</b> · {action.jobs[0].provider_profile_id} · {action.jobs[0].vlm_task} · {action.jobs[0].vlm_pages}{action.jobs[0].vlm_max_pages ? ` · max ${action.jobs[0].vlm_max_pages}` : ""}</p>{action.jobs[0].processing_mode === "combined_dossier" && <label><span>{language() === "vi" ? "Phân đoạn" : "Segmentation"}</span><select value={rerunMode} onChange={(event) => setRerunMode(event.target.value as typeof rerunMode)}><option value="reuse_segmentation">{language() === "vi" ? "Dùng lại và xác nhận lại" : "Reuse and reconfirm"}</option><option value="resegment">{language() === "vi" ? "Phân đoạn lại" : "Resegment"}</option></select></label>}</>}
        <footer className="modal-actions"><button className="button secondary" onClick={() => setAction(null)}>{text("close")}</button><button className={action.type === "delete" || action.type === "cancel" ? "button danger" : "button primary"} disabled={busy || (action.type === "rerun" && Boolean(action.jobs[0]?.endpoint_external) && !actionConsent) || (action.type === "delete" && !action.jobs.length)} onClick={confirmAction}>{text(action.type === "delete" ? "confirmDelete" : "confirm")}</button></footer></>}
    </dialog>
  </AppShell>;
}
