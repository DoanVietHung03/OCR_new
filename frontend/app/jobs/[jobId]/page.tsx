"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelJob, crop, Document, getJob, Job, rerunJob, saveCorrections } from "../../../lib/api";
import { initializeLanguage, statusText, text } from "../../../lib/i18n";
import "./review.css";

const activeStatuses = new Set(["starting", "queued", "running", "cancelling"]);
const terminalStatuses = new Set(["completed", "completed_with_warnings", "error", "cancelled", "interrupted"]);

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const router = useRouter();
  const [, setLocale] = useState("vi");
  const [id, setId] = useState(""); const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(""); const [values, setValues] = useState<Record<string, string>>({});
  const [cropUrl, setCropUrl] = useState(""); const [field, setField] = useState(""); const [pageIndex, setPageIndex] = useState(0);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 100, height: 100 });

  useEffect(() => { setLocale(initializeLanguage()); }, []);
  useEffect(() => { params.then(({ jobId }) => setId(jobId)); }, [params]);
  useEffect(() => {
    if (!id) return;
    const load = () => getJob(id).then(setJob).catch((reason) => setError(reason.message));
    load(); const timer = setInterval(load, 2_000); return () => clearInterval(timer);
  }, [id]);

  if (!job) return <main className="shell"><Link className="button secondary" href="/">← {text("back")}</Link><p className="empty">{error || text("loading")}</p></main>;
  const currentJob = job;
  const documents = job.documents || [];
  const document = (documents.find((item) => item.id === documentId) || documents[0] || null) as Document | null;
  const fields = Object.entries(document?.fields || {}); const pages = document?.pages || [];
  const active = activeStatuses.has(job.status); const terminal = terminalStatuses.has(job.status);

  const selectDocument = (selected: string) => { setDocumentId(selected); setValues({}); setField(""); setPageIndex(0); setCropUrl(""); };
  async function save() {
    if (!document) return;
    try {
      const corrections = Object.entries(values).map(([name, value]) => ({ field: name, old_value: document.fields?.[name]?.value ?? "", new_value: value }));
      if (!corrections.length) return;
      setJob((await saveCorrections(id, document.id, corrections)).job); setValues({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function approve() {
    if (!document) return;
    try { setJob((await saveCorrections(id, document.id, [])).job); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function makeCrop() {
    if (!document || !field || !pages[pageIndex]) return;
    try { setCropUrl((await crop(id, document.id, pages[pageIndex].page_index, field, rect)).crop_image); setJob(await getJob(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }
  async function rerun() {
    if (currentJob.endpoint_external && !confirm(text("consentConfirm"))) return;
    try { router.push(`/jobs/${(await rerunJob(id, Boolean(currentJob.endpoint_external))).id}`); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  return <main className="shell">
    <Link className="button secondary" href="/">← {text("back")}</Link>
    <header className="topbar job-title"><div><p className="eyebrow">{job.id}</p><h1>{job.upload_name || text("job")}</h1><p className="subtitle">{text("jobSummary", { pages: job.page_count, corrections: job.correction_count })}</p></div><span className={`status ${job.status}`}>{statusText(job.status)}</span></header>
    <section className="panel engine-panel"><p>{active ? text("activeHint") : text("terminalHint")}</p><div className="actions">{active && <button className="button danger" onClick={() => cancelJob(id).then(setJob).catch((reason) => setError(reason.message))}>{text("cancel")}</button>}{terminal && <button className="button secondary" onClick={rerun}>{text("rerun")}</button>}{job.report_url && <a className="button link-button" href={job.report_url}>{text("report")}</a>}</div></section>
    {(error || job.error) && <p className="error" role="alert">{error || job.error}</p>}
    {documents.length > 1 && <nav className="document-tabs" aria-label={text("documents")}>{documents.map((item) => <button className={`button ${item.id === document?.id ? "primary" : "secondary"}`} key={item.id} onClick={() => selectDocument(item.id)}>{item.file_name}</button>)}</nav>}
    {document ? <section className="review-grid">
      <div className="panel review-panel"><h2>{document.file_name}</h2><p className="subtitle">{statusText(document.status)}</p>{(document.error || document.errors?.length) && <p className="error" role="alert">{document.error || document.errors?.join(", ")}</p>}{pages.map((page) => <img className="page-preview" key={page.page_index} src={page.image_url} alt={text("page", { page: page.page_index + 1, pages: pages.length })} />)}</div>
      <div className="panel editor-panel"><h2>{text("fields")}</h2>{fields.map(([name, data]) => <label className="field" key={name}><span>{name} <small>{text("confidence", { value: Math.round(Number(data.confidence || 0) * 100) })}</small></span><input disabled={!terminal} value={values[name] ?? String(data.value ?? "")} onChange={(event) => setValues({ ...values, [name]: event.target.value })} /></label>)}{terminal && <div className="actions"><button className="button primary" disabled={!Object.keys(values).length} onClick={save}>{text("save")}</button><button className="button secondary" onClick={approve}>{document.review_status === "approved" ? text("approved") : text("approve")}</button></div>}<hr />
        <h2>{text("cropEvidence")}</h2><label className="field">{text("cropField")}<select aria-label={text("cropField")} value={field} onChange={(event) => setField(event.target.value)}><option value="">{text("chooseField")}</option>{fields.map(([name]) => <option value={name} key={name}>{name}</option>)}</select></label>{pages.length > 1 && <label className="field">{text("cropPage")}<select value={pageIndex} onChange={(event) => setPageIndex(Number(event.target.value))}>{pages.map((page, index) => <option value={index} key={page.page_index}>{page.page_index + 1}</option>)}</select></label>}<div className="crop-inputs">{(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key}<input type="number" min="0" value={rect[key]} onChange={(event) => setRect({ ...rect, [key]: Number(event.target.value) })} /></label>)}</div><button className="button secondary" disabled={!terminal || !field} onClick={makeCrop}>{text("createCrop")}</button>{cropUrl && <a className="button link-button" href={cropUrl} target="_blank" rel="noreferrer">{text("viewCrop")}</a>}{!!document.crop_evidence?.length && <div className="evidence-list"><b>{text("savedEvidence")}</b>{document.crop_evidence.map((evidence) => <a key={evidence.crop_image} href={evidence.crop_image} target="_blank" rel="noreferrer">{evidence.field} · {evidence.page_index + 1}</a>)}</div>}
      </div>
    </section> : <section className="panel empty">{text("noResult")}</section>}
  </main>;
}
