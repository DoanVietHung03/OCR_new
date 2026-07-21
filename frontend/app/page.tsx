"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { ACTIVE_JOB_STATUSES, ApiError, bulkDelete, cancelJob, checkEngine, createJob, DELETABLE_JOB_STATUSES, deletePreview, getProviderProfiles, getReports, getState, Job, ProviderProfile, Reports, rerunJob, startJob, State, TERMINAL_JOB_STATUSES, uploadFile } from "../lib/api";
import { language, safeError, statusText, text, TextKey, useLanguage } from "../lib/i18n";
import LegacyShell from "./legacy-shell";

const metricLabels: Record<keyof State["metrics"], TextKey> = { total_jobs: "totalJobs", active_jobs: "activeJobs", completed_jobs: "completedJobs", documents: "documents", pages: "pages", correction_count: "corrections", error_jobs: "errorJobs" };
const emptyState: State = {
  server_mode: true, jobs: [], documents: [], logs: [], metrics: { total_jobs: 0, active_jobs: 0, completed_jobs: 0, documents: 0, pages: 0, correction_count: 0, error_jobs: 0 },
  ocr_methods: [], limits: { max_files_per_job: 15, max_job_upload_bytes: 200 * 1024 * 1024 }, pagination: { page: 1, page_size: 25, pages: 1, total: 0 },
};
type Action = { type: "cancel" | "rerun" | "delete"; jobs: Job[]; blocked?: { id: string; name?: string | null }[] } | null;

const size = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${Math.ceil(value / 1024 ** 2)} MB`;
const duration = (start?: string | null, end?: string | null) => { const seconds = start && end ? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000)) : NaN; return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : ""; };
const message = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : reason instanceof Error ? reason.message : String(reason));

export default function Home() {
  useLanguage();
  const router = useRouter();
  const uploadOnly = usePathname() === "/upload";
  const [state, setState] = useState<State>(emptyState);
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false); const [stale, setStale] = useState(false); const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [method, setMethod] = useState("all"); const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<string[]>([]); const [engineMessage, setEngineMessage] = useState("");
  const [consent, setConsent] = useState(false); const [progress, setProgress] = useState(""); const [action, setAction] = useState<Action>(null);
  const [actionConsent, setActionConsent] = useState(false); const actionDialog = useRef<HTMLDialogElement>(null); const uploadPanel = useRef<HTMLElement>(null);
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]); const [profileId, setProfileId] = useState("");
  const [reports, setReports] = useState<Reports | null>(null); const [reportsReady, setReportsReady] = useState(false);
  const [task, setTask] = useState<"full_ocr" | "metadata">("full_ocr"); const [pages, setPages] = useState<"all" | "auto" | "first,last">("all"); const [maxPages, setMaxPages] = useState(0);
  const availableProfiles: ProviderProfile[] = profiles.length ? profiles : state.ocr_methods.map((item) => ({ ...item, tasks: ["full_ocr", "metadata"], page_modes: ["all", "auto", "first,last"], max_pages: 100 }));
  const engine = availableProfiles.find((item) => item.id === profileId) || availableProfiles[0]; const external = Boolean(engine?.external); const configured = engine?.status === "configured";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialQuery = params.get("q") || ""; setSearch(initialQuery); setQuery(initialQuery);
    setStatus(params.get("status") || "all"); setMethod(params.get("engine") || "all"); setSort(params.get("sort") || "created_desc"); setPage(Math.max(1, Number(params.get("page")) || 1));
    if (params.get("upload") === "1") requestAnimationFrame(() => uploadPanel.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);
  useEffect(() => { setUploadOpen(uploadOnly); }, [uploadOnly]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query); if (status !== "all") params.set("status", status); if (method !== "all") params.set("engine", method); if (sort !== "created_desc") params.set("sort", sort); if (page > 1) params.set("page", String(page));
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`); setSelected([]);
  }, [query, status, method, sort, page]);

  const refresh = useCallback(async () => {
    try {
      const next = await getState({ query, status, method, sort, page });
      const normalized = { ...emptyState, ...next, metrics: { ...emptyState.metrics, ...next.metrics }, limits: { ...emptyState.limits, ...next.limits }, pagination: { ...emptyState.pagination, ...next.pagination } };
      setState(normalized); setSelected((ids) => ids.filter((id) => normalized.jobs.some((job) => job.id === id && DELETABLE_JOB_STATUSES.has(job.status)))); setLoadError(""); setStale(false); setLoaded(true);
    } catch (reason) { if (loaded) setStale(true); else setLoadError(message(reason)); }
  }, [query, status, method, sort, page, loaded]);
  useEffect(() => {
    refresh(); const tick = () => { if (!document.hidden) refresh(); }; const timer = setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick); return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);
  useEffect(() => { if (action) actionDialog.current?.showModal(); else actionDialog.current?.close(); }, [action]);
  useEffect(() => { getProviderProfiles().then(({ profiles }) => { setProfiles(profiles); setProfileId((value) => value || profiles[0]?.id || ""); }).catch(() => { /* old backend: state.ocr_methods remains the compatibility fallback */ }); }, []);
  useEffect(() => { if (uploadOnly) return; getReports().then(setReports).catch(() => setReports(null)).finally(() => setReportsReady(true)); }, [uploadOnly]);

  function choose(incoming: File[]) {
    const next = incoming;
    const names = next.map((file) => file.name.toLocaleLowerCase());
    if (next.some((file) => !file.name.toLocaleLowerCase().endsWith(".pdf"))) return setError(text("invalidPdf"));
    if (new Set(names).size !== names.length) return setError(text("duplicateFile"));
    if (next.length > state.limits.max_files_per_job || next.reduce((total, file) => total + file.size, 0) > state.limits.max_job_upload_bytes) return setError(text("fileLimit"));
    setFiles(next); setError("");
  }
  function drop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); if (!busy) choose(Array.from(event.dataTransfer.files)); }
  async function upload() {
    if (!files.length || !configured || (external && !consent)) return;
    setBusy(true); setError("");
    try {
      const uploadName = `${files[0].name}${files.length > 1 ? ` +${files.length - 1}` : ""}`;
      const job = await createJob({ file_count: files.length, upload_name: uploadName, cloud_data_confirmed: consent,
        provider_profile_id: engine.id, vlm_task: task, vlm_pages: task === "full_ocr" ? "all" : pages,
        vlm_max_pages: task === "full_ocr" ? 0 : maxPages });
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
        const job = action.jobs[0]; const next = await rerunJob(job.id, Boolean(job.endpoint_external && actionConsent)); setAction(null); router.push(`/jobs/${next.id}`); return;
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

  if (!loaded && loadError) return <LegacyShell onNew={openUpload}><section className="panel empty" role="alert"><p>{loadError}</p><button className="button secondary" onClick={refresh}>{text("retry")}</button></section></LegacyShell>;

  return <LegacyShell onNew={openUpload}>
    <header className="page-header"><div><p className="eyebrow">{text("title")}</p><h1>{text(uploadOnly ? "upload" : "jobs")}</h1><p>{text(uploadOnly ? "uploadSubtitle" : "subtitle")}</p></div>{!uploadOnly && <button className="button primary" onClick={openUpload}>＋ {text("newOcr")}</button>}</header>
    {uploadOpen && <section ref={uploadPanel} className="panel upload-panel">
      <div className="section-head"><div><p className="eyebrow">PDF ONLY</p><h2>{text("upload")}</h2><p>{text("uploadHint", { files: state.limits.max_files_per_job, size: size(state.limits.max_job_upload_bytes) })} {text("pageLimit")}</p></div>{!uploadOnly && <button className="icon-button" aria-label={text("close")} onClick={() => setUploadOpen(false)}>×</button>}</div>
      <div className="upload-options">
        <label><span>{text("engine")}</span><select value={engine?.id || ""} disabled={busy} onChange={(event) => { setProfileId(event.target.value); setConsent(false); }}>{availableProfiles.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label><span>{text("task")}</span><select value={task} disabled={busy} onChange={(event) => { const value = event.target.value as "full_ocr" | "metadata"; setTask(value); if (value === "full_ocr") { setPages("all"); setMaxPages(0); } }}><option value="full_ocr">{text("fullOcr")}</option><option value="metadata">{text("metadata")}</option></select></label>
        <label><span>{text("pageScope")}</span><select value={pages} disabled={busy || task === "full_ocr"} onChange={(event) => setPages(event.target.value as typeof pages)}><option value="all">{text("allPages")}</option><option value="auto">{text("autoPages")}</option><option value="first,last">{text("edgePages")}</option></select></label>
        <label><span>{text("maxPages")}</span><input type="number" min="0" max={engine?.max_pages || 100} value={maxPages} disabled={busy || task === "full_ocr"} onChange={(event) => setMaxPages(Math.max(0, Math.min(engine?.max_pages || 100, Number(event.target.value) || 0)))} /></label>
      </div>
      <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <input aria-label={text("pdfFiles")} type="file" accept="application/pdf,.pdf" multiple disabled={busy} onChange={(event) => choose(Array.from(event.target.files || []))} />
        <span className="drop-icon">⇧</span><strong>{text("chooseFiles")}</strong><small>{text("selectedFiles", { count: files.length })}</small>
      </label>
      {!!files.length && <div className="file-list">{files.map((file) => <div key={file.name}><span><b>{file.name}</b><small>{size(file.size)}</small></span><button aria-label={text("removeFile", { name: file.name })} disabled={busy} onClick={() => choose(files.filter((item) => item !== file))}>×</button></div>)}<button className="text-button" disabled={busy} onClick={() => setFiles([])}>{text("clear")}</button></div>}
      {external && <label className="consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />{text("consent")}</label>}
      <div className="upload-actions"><div><span className={`status ${engine?.status || "not_configured"}`}>{statusText(engine?.status || "not_configured")}</span><small>{engineMessage || text("configuredHint")}</small></div><button className="button secondary" disabled={!engine || busy} onClick={() => engine && checkEngine(engine.id).then((result) => setEngineMessage(statusText(result.status))).catch((reason) => setEngineMessage(message(reason)))}>{text("checkEngine")}</button><button className="button primary" disabled={busy || !files.length || !configured || (external && !consent)} onClick={upload}>{progress || text("start")}</button></div>
    </section>}
    {(error || (!uploadOnly && stale)) && <div className={error ? "notice error" : "notice warning"} role="alert"><span>{error || text("stale")}</span><button className="button secondary" onClick={refresh}>{text("retry")}</button></div>}
    {!uploadOnly && <>
    <section className="metrics" aria-label={text("jobMetrics")}>{Object.entries(state.metrics).map(([key, value]) => <article className="panel metric" key={key}><span>{text(metricLabels[key as keyof State["metrics"]])}</span><strong>{value}</strong><small>{text("filteredResults")}</small></article>)}</section>
    <section className="panel benchmark-panel"><div className="section-head"><div><p className="eyebrow">Legacy+</p><h2>{text("benchmark")}</h2></div><span>{reports?.benchmark_samples.length || 0} {text("samples")}</span></div>{!reportsReady ? <p className="empty">{text("loading")}</p> : !reports ? <p className="empty">{text("unavailable")}</p> : reports.benchmark_samples.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>{text("provider")}</th><th>{text("fixtureGroup")}</th><th>{text("task")}</th><th>{text("sampleSize")}</th><th>{text("measured")}</th></tr></thead><tbody>{reports.benchmark_samples.map((sample) => <tr key={`${sample.provider_profile_id}-${sample.fixture_group}-${sample.measured_at}`}><td>{sample.provider_profile_id}</td><td>{sample.fixture_group}</td><td>{sample.task} · {sample.page_scope}</td><td>{sample.sample_size}</td><td>{new Date(sample.measured_at).toLocaleString(language())}</td></tr>)}</tbody></table></div> : <p className="empty">{text("noBenchmark")}</p>}</section>
    <section className="panel jobs-panel">
      <div className="section-head"><div><h2>{text("jobs")}</h2><p>{text("matchingJobs", { count: state.pagination.total })}</p></div><button className="button secondary" onClick={refresh}>{text("refresh")}</button></div>
      <div className="filters"><input aria-label={text("search")} placeholder={text("search")} value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label={text("status")} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">{text("allStatuses")}</option>{["uploading", "ready", "starting", "queued", "running", "cancelling", "completed", "completed_with_warnings", "error", "cancelled", "interrupted"].map((value) => <option value={value} key={value}>{statusText(value)}</option>)}</select><select aria-label={text("engine")} value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }}><option value="all">{text("allEngines")}</option>{state.ocr_methods.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select><select aria-label={text("sort")} value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="created_desc">{text("newest")}</option><option value="created_asc">{text("oldest")}</option><option value="updated_desc">{text("recentlyUpdated")}</option><option value="updated_asc">{text("leastRecentlyUpdated")}</option></select></div>
      {!!selected.length && <div className="bulk-toolbar"><b>{text("selectedJobs", { count: selected.length })}</b><button className="button danger" onClick={() => requestDelete(state.jobs.filter((job) => selected.includes(job.id)))}>{text("delete")}</button></div>}
      <div className="job-table">
        <div className="job-row job-head"><span /><span>{text("job")}</span><span>{text("status")}</span><span>{text("provider")}</span><span>{text("pages")}</span><span>{text("updated")}</span><span>{text("actions")}</span></div>
        {state.jobs.map((job) => <article className="job-row" key={job.id}>
          <input aria-label={text("selectJob", { name: job.upload_name || job.id })} type="checkbox" disabled={!DELETABLE_JOB_STATUSES.has(job.status)} checked={selected.includes(job.id)} onChange={() => setSelected((ids) => ids.includes(job.id) ? ids.filter((id) => id !== job.id) : [...ids, job.id])} />
          <div><Link href={`/jobs/${job.id}`}><b>{job.upload_name || job.id}</b></Link><small>{job.id.slice(0, 8)}</small></div><span className={`status ${job.status}`}>{statusText(job.status)}</span>
          <span>{job.provider || job.ocr_method || "—"}<small>{job.provider_profile_id || ""} · {job.model || ""}</small></span><span>{text("filesAndPages", { files: job.uploaded_files, expected: job.expected_files, pages: job.page_count, failed: job.failed_pages })}<small>{text("corrections")}: {job.correction_count}{job.error ? ` · ${safeError(job.error)}` : ""}</small></span><time>{new Date(job.updated_at || job.created_at).toLocaleString(language())}<small>{text("created")}: {new Date(job.created_at).toLocaleString(language())}{duration(job.started_at, job.completed_at) ? ` · ${text("duration")}: ${duration(job.started_at, job.completed_at)}` : ""}</small></time>
          <div className="actions"><Link className="button secondary" href={`/jobs/${job.id}`}>{text("open")}</Link>{ACTIVE_JOB_STATUSES.has(job.status) && <button className="button danger" disabled={job.status === "cancelling"} onClick={() => setAction({ type: "cancel", jobs: [job] })}>{text("cancel")}</button>}{DELETABLE_JOB_STATUSES.has(job.status) && <button className="button danger ghost" onClick={() => requestDelete([job])}>{text("delete")}</button>}{TERMINAL_JOB_STATUSES.has(job.status) && <button className="button secondary" onClick={() => setAction({ type: "rerun", jobs: [job] })}>{text("rerun")}</button>}</div>
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
        <footer className="modal-actions"><button className="button secondary" onClick={() => setAction(null)}>{text("close")}</button><button className={action.type === "delete" || action.type === "cancel" ? "button danger" : "button primary"} disabled={busy || (action.type === "rerun" && Boolean(action.jobs[0]?.endpoint_external) && !actionConsent) || (action.type === "delete" && !action.jobs.length)} onClick={confirmAction}>{text(action.type === "delete" ? "confirmDelete" : "confirm")}</button></footer></>}
    </dialog>
  </LegacyShell>;
}
