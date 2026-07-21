"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bulkDelete, cancelJob, checkEngine, createJob, deletePreview, getState, Job, rerunJob, startJob, uploadFile } from "../lib/api";
import { text } from "../lib/i18n";

const active = new Set(["uploading", "ready", "queued", "running", "cancelling"]);
const terminal = new Set(["completed", "completed_with_warnings", "error", "cancelled", "interrupted"]);
const readableStatus = (status: string) => status.replaceAll("_", " ");

export default function Home() {
  const [state, setState] = useState({ jobs: [] as Job[], metrics: {} as Record<string, number>, ocr_methods: [] as { id: string; label: string; status: string }[], pagination: { page: 1, pages: 1, total: 0 } });
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [method, setMethod] = useState("all"); const [page, setPage] = useState(1); const [selected, setSelected] = useState<string[]>([]); const [engine, setEngine] = useState("");
  const refresh = () => getState({ query, status, method, page }).then((next) => { setState(next); setSelected([]); }).catch((e) => setError(e.message));
  useEffect(() => { refresh(); const timer = setInterval(refresh, 10_000); return () => clearInterval(timer); }, [query, status, method, page]);
  const terminalJobs = useMemo(() => state.jobs.filter((job) => terminal.has(job.status)), [state.jobs]);
  async function upload() {
    if (!files.length) return; setBusy(true); setError("");
    try { const job = await createJob(files.length, files.map((file) => file.name).join(", ")); for (const file of files) await uploadFile(job.id, file); await startJob(job.id); setFiles([]); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  }
  async function remove(ids: string[]) { const preview = await deletePreview(ids); if (preview.deletable.length && confirm(`${text("delete")}: ${preview.deletable.map((job) => job.name).join(", ")}?`)) { await bulkDelete(preview.deletable.map((job) => job.id)); refresh(); } }
  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">{text("title")}</p><h1>{text("jobs")}</h1><p className="subtitle">Theo dõi, kiểm tra và hiệu chỉnh kết quả OCR.</p></div><button className="button secondary" onClick={() => { const lang = localStorage.getItem("intellidoc.language") === "en" ? "vi" : "en"; localStorage.setItem("intellidoc.language", lang); location.reload(); }}>VI / EN</button></header>
    <section className="panel upload-panel"><div><h2>{text("upload")}</h2><p>Chọn tối đa 15 tệp PDF cho một công việc.</p></div><label className="file-picker"><input aria-label="PDF files" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /><span>{files.length ? `${files.length} tệp đã chọn` : "Chọn tệp PDF"}</span></label><button className="button primary" disabled={busy || !files.length} onClick={upload}>{busy ? "Đang tải…" : text("start")}</button>{error && <p className="error" role="alert">{error}</p>}</section>
    <section className="metrics" aria-label="Job metrics">{Object.entries(state.metrics).map(([key, value]) => <div className="panel metric" key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value}</strong></div>)}<div className="panel metric"><span>OCR engine</span><strong>{state.ocr_methods[0]?.label || "OCR"}</strong></div></section>
    <section className="panel engine-panel"><div><span className={`status ${state.ocr_methods[0]?.status || "not_configured"}`}>{state.ocr_methods[0]?.status || "not configured"}</span><p>{engine || "Kiểm tra kết nối OCR trước khi bắt đầu."}</p></div><button aria-label="Check engine" className="button secondary" onClick={() => { const id = state.ocr_methods[0]?.id; if (id) checkEngine(id).then((result) => setEngine(result.summary)).catch((reason) => setEngine(reason.message)); }}>Kiểm tra engine</button></section>
    <section className="panel jobs-panel"><div className="section-head"><div><h2>{text("jobs")}</h2><p>{state.pagination.total} công việc phù hợp</p></div><button className="button secondary" onClick={refresh}>{text("refresh")}</button></div>
      <div className="filters"><input aria-label="Search" placeholder="Tìm kiếm" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} /><select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="all">Tất cả trạng thái</option><option value="running">Đang chạy</option><option value="completed">Hoàn thành</option><option value="error">Lỗi</option><option value="cancelled">Đã hủy</option></select><select value={method} onChange={(event) => { setPage(1); setMethod(event.target.value); }}><option value="all">Tất cả engine</option>{state.ocr_methods.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
      {selected.length > 0 && <div className="bulk-toolbar"><b>Đã chọn {selected.length} công việc</b><button className="button danger" onClick={() => remove(selected)}>{text("delete")}</button></div>}
      <div className="job-table" role="table"><div className="job-row job-head" role="row"><span /><span>Công việc</span><span>Trạng thái</span><span>Tiến độ</span><span>Thao tác</span></div>{state.jobs.map((job) => <div className="job-row" role="row" key={job.id}><span>{terminal.has(job.status) && <input aria-label={`Select ${job.upload_name || job.id}`} type="checkbox" checked={selected.includes(job.id)} onChange={() => toggle(job.id)} />}</span><div><Link href={`/jobs/${job.id}`}><b>{job.upload_name || job.id}</b></Link><small>{job.id}</small></div><span className={`status ${job.status}`}>{readableStatus(job.status)}</span><span>{job.uploaded_files}/{job.expected_files} tệp · {job.page_count || 0} trang</span><div className="actions"><Link className="button link-button" href={`/jobs/${job.id}`}>Mở</Link>{active.has(job.status) && <button className="button danger" onClick={() => cancelJob(job.id).then(refresh)}>{text("cancel")}</button>}{terminal.has(job.status) && <><button className="button secondary" onClick={() => rerunJob(job.id).then(refresh)}>{text("rerun")}</button><button className="button danger" onClick={() => remove([job.id])}>{text("delete")}</button></>}</div></div>)}{!state.jobs.length && <p className="empty">Chưa có công việc.</p>}</div>
      <nav className="pagination" aria-label="Pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {state.pagination.page} / {state.pagination.pages}</span><button className="button secondary" disabled={page >= state.pagination.pages} onClick={() => setPage(page + 1)}>Sau</button></nav>
    </section>
  </main>;
}
