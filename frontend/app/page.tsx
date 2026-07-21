"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bulkDelete, cancelJob, checkEngine, createJob, deletePreview, getState, Job, rerunJob, startJob, State, uploadFile } from "../lib/api";
import { initializeLanguage, language, setLanguage, statusText, text, TextKey } from "../lib/i18n";

const active = new Set(["starting", "queued", "running", "cancelling"]);
const deletable = new Set(["uploading", "ready", "completed", "completed_with_warnings", "error", "cancelled", "interrupted"]);
const metricLabels: Record<keyof State["metrics"], TextKey> = {
  total_jobs: "totalJobs", pages: "pages", correction_count: "corrections", error_jobs: "errorJobs",
};
const emptyState: State = {
  server_mode: true, jobs: [], documents: [], logs: [],
  metrics: { total_jobs: 0, pages: 0, correction_count: 0, error_jobs: 0 }, ocr_methods: [],
  limits: { max_files_per_job: 15, max_job_upload_bytes: 200 * 1024 * 1024 },
  pagination: { page: 1, page_size: 25, pages: 1, total: 0 },
};

export default function Home() {
  const [, setLocale] = useState("vi");
  const [state, setState] = useState<State>(emptyState);
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<string[]>([]); const [engineMessage, setEngineMessage] = useState(""); const [consent, setConsent] = useState(false);
  const engine = state.ocr_methods[0]; const external = Boolean(engine?.external);
  const refresh = () => getState({ query, status, method, page }).then((next) => { setState(next); setSelected([]); }).catch((reason) => setError(reason.message));

  useEffect(() => { setLocale(initializeLanguage()); }, []);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 10_000); return () => clearInterval(timer); }, [query, status, method, page]);

  async function upload() {
    if (!files.length || (external && !consent)) return;
    setBusy(true); setError("");
    try {
      const job = await createJob(files.length, files.map((file) => file.name).join(", "), consent);
      for (const file of files) await uploadFile(job.id, file);
      await startJob(job.id); setFiles([]); setConsent(false); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  }
  async function remove(ids: string[]) {
    try {
      const preview = await deletePreview(ids);
      if (preview.deletable.length && confirm(`${text("delete")}: ${preview.deletable.map((job) => job.name).join(", ")}?`)) { await bulkDelete(preview.deletable.map((job) => job.id)); refresh(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function rerun(job: Job) {
    if (job.endpoint_external && !confirm(text("consentConfirm"))) return;
    try { await rerunJob(job.id, Boolean(job.endpoint_external)); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">{text("title")}</p><h1>{text("jobs")}</h1><p className="subtitle">{text("subtitle")}</p></div><button className="button secondary" onClick={() => { setLanguage(language() === "en" ? "vi" : "en"); location.reload(); }}>VI / EN</button></header>
    <section className="panel upload-panel"><div><h2>{text("upload")}</h2><p>{text("uploadHint")}</p></div><label className="file-picker"><input aria-label={text("pdfFiles")} type="file" accept="application/pdf,.pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><span>{files.length ? text("selectedFiles", { count: files.length }) : text("chooseFiles")}</span></label>{external && <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{text("consent")}</label>}<button className="button primary" disabled={busy || !files.length || (external && !consent)} onClick={upload}>{busy ? text("uploading") : text("start")}</button>{error && <p className="error" role="alert">{error}</p>}</section>
    <section className="metrics" aria-label={text("jobMetrics")}>{Object.entries(state.metrics).map(([key, value]) => <div className="panel metric" key={key}><span>{text(metricLabels[key as keyof State["metrics"]])}</span><strong>{value}</strong></div>)}<div className="panel metric"><span>{text("engine")}</span><strong>{engine?.label || "OCR"}</strong></div></section>
    <section className="panel engine-panel"><div><span className={`status ${engine?.status || "not_configured"}`}>{statusText(engine?.status || "not_configured")}</span><p>{engineMessage || text("engineHint")}</p></div><button aria-label={text("checkEngine")} className="button secondary" onClick={() => engine && checkEngine(engine.id).then((result) => setEngineMessage(statusText(result.status))).catch((reason) => setEngineMessage(reason.message))}>{text("checkEngine")}</button></section>
    <section className="panel jobs-panel"><div className="section-head"><div><h2>{text("jobs")}</h2><p>{text("matchingJobs", { count: state.pagination.total })}</p></div><button className="button secondary" onClick={refresh}>{text("refresh")}</button></div>
      <div className="filters"><input aria-label={text("search")} placeholder={text("search")} value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} /><select aria-label={text("status")} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="all">{text("allStatuses")}</option>{["running", "completed", "error", "cancelled", "interrupted"].map((value) => <option value={value} key={value}>{statusText(value)}</option>)}</select><select aria-label={text("engine")} value={method} onChange={(event) => { setPage(1); setMethod(event.target.value); }}><option value="all">{text("allEngines")}</option>{state.ocr_methods.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
      {selected.length > 0 && <div className="bulk-toolbar"><b>{text("selectedJobs", { count: selected.length })}</b><button className="button danger" onClick={() => remove(selected)}>{text("delete")}</button></div>}
      <div className="job-table" role="table"><div className="job-row job-head" role="row"><span /><span>{text("job")}</span><span>{text("status")}</span><span>{text("progress")}</span><span>{text("actions")}</span></div>{state.jobs.map((job) => <div className="job-row" role="row" key={job.id}><span>{deletable.has(job.status) && <input aria-label={text("selectJob", { name: job.upload_name || job.id })} type="checkbox" checked={selected.includes(job.id)} onChange={() => toggle(job.id)} />}</span><div><Link href={`/jobs/${job.id}`}><b>{job.upload_name || job.id}</b></Link><small>{job.id}</small></div><span className={`status ${job.status}`}>{statusText(job.status)}</span><span>{text("filesPages", { files: job.uploaded_files, expected: job.expected_files, pages: job.page_count })}</span><div className="actions"><Link className="button link-button" href={`/jobs/${job.id}`}>{text("open")}</Link>{active.has(job.status) && <button className="button danger" onClick={() => cancelJob(job.id).then(refresh).catch((reason) => setError(reason.message))}>{text("cancel")}</button>}{deletable.has(job.status) && <button className="button danger" onClick={() => remove([job.id])}>{text("delete")}</button>}{!active.has(job.status) && !["uploading", "ready"].includes(job.status) && <button className="button secondary" onClick={() => rerun(job)}>{text("rerun")}</button>}</div></div>)}{!state.jobs.length && <p className="empty">{text("noJobs")}</p>}</div>
      <nav className="pagination" aria-label={text("pagination")}><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{text("previous")}</button><span>{text("page", { page: state.pagination.page, pages: state.pagination.pages })}</span><button className="button secondary" disabled={page >= state.pagination.pages} onClick={() => setPage(page + 1)}>{text("next")}</button></nav>
    </section>
  </main>;
}
