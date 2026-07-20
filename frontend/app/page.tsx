"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { bulkDelete, cancelJob, checkEngine, createJob, deletePreview, getState, getSystemMetrics, Job, startJob, uploadFile } from "../lib/api";
import { text } from "../lib/i18n";

export default function Home() {
  const [state, setState] = useState<{ jobs: Job[]; metrics: Record<string, number>; ocr_methods?: { id: string; label: string; status: string }[] }>({ jobs: [], metrics: {} });
  const [system, setSystem] = useState("System metrics unavailable"); const [engine, setEngine] = useState("");
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [query, setQuery] = useState("");
  const refresh = () => getState(query).then(setState).catch((e) => setError(e.message));
  useEffect(() => { refresh(); getSystemMetrics().then(() => setSystem("System metrics connected")).catch(() => setSystem("System metrics unavailable")); const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, [query]);
  async function upload() {
    if (!files.length) return; setBusy(true); setError("");
    try { const job = await createJob(files.length, files.map((f) => f.name).join(", ")); for (const file of files) await uploadFile(job.id, file); await startJob(job.id); setFiles([]); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function remove(job: Job) { const preview = await deletePreview([job.id]); if (preview.deletable.length && confirm(`${text("delete")}: ${job.upload_name || job.id}?`)) { await bulkDelete([job.id]); refresh(); } }
  return <main className="shell"><header><div><p className="eyebrow">{text("title")}</p><h1>{text("jobs")}</h1></div><button onClick={() => { const lang = localStorage.getItem("intellidoc.language") === "en" ? "vi" : "en"; localStorage.setItem("intellidoc.language", lang); location.reload(); }}>VI / EN</button></header>
    <section className="card upload"><h2>{text("upload")}</h2><input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /><button disabled={busy || !files.length} onClick={upload}>{busy ? "..." : text("start")}</button>{error && <p className="error">{error}</p>}</section>
    <section className="metrics">{Object.entries(state.metrics).map(([key, value]) => <div className="metric" key={key}><strong>{value}</strong><span>{key}</span></div>)}<div className="metric"><strong>{state.ocr_methods?.[0]?.label || "OCR"}</strong><span>{system}</span></div></section>
    <section className="card toolbar"><span>{state.ocr_methods?.[0]?.status || "not_configured"}</span><button onClick={() => { const id = state.ocr_methods?.[0]?.id; if (id) checkEngine(id).then((r) => setEngine(r.summary)).catch((e) => setEngine(e.message)); }}>{engine || "Kiểm tra engine"}</button></section>
    <section className="card"><div className="toolbar"><h2>{text("jobs")}</h2><input aria-label="Search" placeholder="Tìm kiếm" value={query} onChange={(e) => setQuery(e.target.value)} /><button onClick={refresh}>{text("refresh")}</button></div><div className="table">{state.jobs.map((job) => <article className="row" key={job.id}><div><Link href={`/jobs/${job.id}`}><strong>{job.upload_name || job.id}</strong></Link><small>{job.id}</small></div><span className={`status ${job.status}`}>{job.status}</span><div className="actions">{["uploading", "ready", "queued", "running", "cancelling"].includes(job.status) && <button onClick={() => cancelJob(job.id).then(refresh)}>{text("cancel")}</button>}{["completed", "completed_with_warnings", "error", "cancelled"].includes(job.status) && <button onClick={() => remove(job)}>{text("delete")}</button>}</div></article>)}{!state.jobs.length && <p>Chưa có công việc.</p>}</div></section>
  </main>;
}
