"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useRef, useState } from "react";
import { ACTIVE_JOB_STATUSES, ApiError, bulkDelete, cancelJob, DELETABLE_JOB_STATUSES, deletePreview, Document, getJob, Job, rerunJob, TERMINAL_JOB_STATUSES } from "../../../lib/api";
import { language, safeError, statusText, text, useLanguage } from "../../../lib/i18n";
import LegacyShell from "../../legacy-shell";
import ReviewWorkspace from "./review-workspace";
import "./review.css";

type PendingNavigation = { href: string } | { documentId: string } | null;
type LifecycleAction = "cancel" | "rerun" | "delete" | null;
const message = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : reason instanceof Error ? reason.message : String(reason));

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  useLanguage();
  const router = useRouter();
  const [id, setId] = useState(""); const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(""); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null); const [action, setAction] = useState<LifecycleAction>(null);
  const [actionConsent, setActionConsent] = useState(false); const [deleteAllowed, setDeleteAllowed] = useState(false); const [deleteBlocked, setDeleteBlocked] = useState<{ id: string; name?: string | null }[]>([]);
  const discardDialog = useRef<HTMLDialogElement>(null); const actionDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { params.then(({ jobId }) => setId(jobId)); }, [params]);
  useEffect(() => {
    if (!id) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = () => getJob(id).then((next) => {
      setJob(next); setError("");
      if (ACTIVE_JOB_STATUSES.has(next.status) && !timer) timer = setInterval(load, 2_000);
      if (!ACTIVE_JOB_STATUSES.has(next.status) && timer) { clearInterval(timer); timer = undefined; }
    }).catch((reason) => setError(message(reason)));
    load(); return () => clearInterval(timer);
  }, [id]);
  useEffect(() => {
    if (!job?.documents?.length || job.documents.some((item) => item.id === documentId)) return;
    const preferred = job.documents.find((item) => item.error || item.errors?.length) || job.documents.find((item) => item.review_status !== "approved") || job.documents[0];
    setDocumentId(preferred.id);
  }, [job, documentId]);
  useEffect(() => {
    if (!dirty) return;
    const current = location.href;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const back = () => { const target = location.href; history.pushState(null, "", current); setPendingNavigation({ href: target }); };
    window.addEventListener("beforeunload", warn); window.addEventListener("popstate", back);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("popstate", back); };
  }, [dirty]);
  useEffect(() => { if (pendingNavigation) discardDialog.current?.showModal(); else discardDialog.current?.close(); }, [pendingNavigation]);
  useEffect(() => { if (action) actionDialog.current?.showModal(); else actionDialog.current?.close(); }, [action]);

  function guardedLink(event: MouseEvent<HTMLAnchorElement>) { if (dirty) { event.preventDefault(); setPendingNavigation({ href: event.currentTarget.href }); } }
  function goNew() { if (dirty) setPendingNavigation({ href: `${location.origin}/?upload=1` }); else router.push("/?upload=1"); }
  function selectDocument(next: string) { if (next === documentId) return; if (dirty) setPendingNavigation({ documentId: next }); else setDocumentId(next); }
  function confirmDiscard() {
    const next = pendingNavigation; setPendingNavigation(null);
    if (!next) return;
    setDirty(false);
    if ("documentId" in next) setDocumentId(next.documentId);
    else { const target = new URL(next.href, location.href); router.push(`${target.pathname}${target.search}${target.hash}`); }
  }
  async function requestDelete() {
    setBusy(true); setError("");
    try {
      const preview = await deletePreview([id]); setDeleteAllowed(preview.deletable.some((item) => item.id === id)); setDeleteBlocked(preview.skipped); setAction("delete");
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  async function confirmAction() {
    if (!action || !job) return;
    setBusy(true); setError("");
    try {
      if (action === "cancel") setJob(await cancelJob(id));
      if (action === "rerun") { const next = await rerunJob(id, Boolean(job.endpoint_external && actionConsent)); router.push(`/jobs/${next.id}`); return; }
      if (action === "delete" && deleteAllowed) {
        const result = await bulkDelete([id]);
        if (result.deleted.includes(id)) { router.push("/"); return; }
        setError(text("deleteIncomplete", { count: result.skipped.length + result.failed.length || 1 }));
      }
      setAction(null); setActionConsent(false);
    } catch (reason) { setAction(null); setError(message(reason)); } finally { setBusy(false); }
  }
  const logs = job?.logs || [];
  const logText = logs.map((item) => typeof item === "string" ? item : JSON.stringify(item, null, 2)).join("\n");
  function downloadLogs() { const url = URL.createObjectURL(new Blob([logText], { type: "text/plain;charset=utf-8" })); const link = window.document.createElement("a"); link.href = url; link.download = `${id}-logs.txt`; link.click(); URL.revokeObjectURL(url); }

  if (!job) return <LegacyShell detail onNew={() => router.push("/?upload=1")}><Link className="button secondary" href="/">← {text("back")}</Link><p className="empty">{error || text("loading")}</p></LegacyShell>;
  const documents = job.documents || []; const document = (documents.find((item) => item.id === documentId) || documents[0] || null) as Document | null;
  const active = ACTIVE_JOB_STATUSES.has(job.status), terminal = TERMINAL_JOB_STATUSES.has(job.status);
  const failures = job.failed_pages + documents.filter((item) => item.error).length;

  return <LegacyShell detail onNew={goNew} onJobs={guardedLink}>
    <Link className="back-link" href="/" onClick={guardedLink}>← {text("back")}</Link>
    <header className="job-header"><div><p className="eyebrow">{job.id}</p><h1>{job.upload_name || text("job")}</h1><p>{text("jobSummary", { pages: job.page_count, corrections: job.correction_count })}</p></div><span className={`status ${job.status}`}>{statusText(job.status)}</span></header>
    <section className="job-facts panel"><div><span>{text("provider")}</span><b>{job.provider || job.ocr_method || "—"}</b><small>{job.model || "—"} · prompt {job.prompt_version || "—"}</small></div><div><span>{text("documents")}</span><b>{documents.length}</b><small>{job.uploaded_files}/{job.expected_files} PDF</small></div><div><span>{text("pages")}</span><b>{job.page_count}</b><small>{job.failed_pages} failed</small></div><div><span>{text("updated")}</span><b>{new Date(job.updated_at).toLocaleDateString(language())}</b><small>{new Date(job.updated_at).toLocaleTimeString(language())}</small></div><div className="job-actions">{active && <button className="button danger" disabled={busy || job.status === "cancelling"} onClick={() => setAction("cancel")}>{text("cancel")}</button>}{terminal && <button className="button secondary" disabled={busy} onClick={() => setAction("rerun")}>{text("rerun")}</button>}{DELETABLE_JOB_STATUSES.has(job.status) && <button className="button danger ghost" disabled={busy} onClick={requestDelete}>{text("delete")}</button>}</div></section>
    <p className="lifecycle-note">{active ? text("activeHint") : terminal ? text("terminalHint") : statusText(job.status)}</p>
    {(error || job.error) && <p className="notice error" role="alert">{error || safeError(job.error!)}</p>}
    {!!documents.length && <nav className="document-tabs" aria-label={text("documents")}>{documents.map((item, index) => <button className={item.id === document?.id ? "active" : ""} aria-current={item.id === document?.id ? "page" : undefined} key={item.id} onClick={() => selectDocument(item.id)}><span>{index + 1}</span><b>{item.file_name}</b><small>{item.error || item.errors?.length ? statusText("error") : item.review_status === "approved" ? text("approved") : statusText(item.status)}</small></button>)}</nav>}
    {document ? <ReviewWorkspace key={document.id} jobId={id} document={document} terminal={terminal} onJob={setJob} onDirty={setDirty} onError={setError} /> : <section className="panel empty">{text("noResult")}</section>}
    <section className="panel report-section"><div className="section-head"><div><p className="eyebrow">{text("report")}</p><h2>{text("reportSummary", { documents: documents.length, pages: job.page_count, corrections: job.correction_count, failures })}</h2></div>{job.report_url && <a className="button secondary" href={job.report_url} target="_blank" rel="noreferrer">{text("openArtifact")}</a>}</div><div className="report-documents">{documents.map((item) => <div key={item.id}><b>{item.file_name}</b><span>{statusText(item.status)}</span><small>{item.pages?.length || 0} {text("pages").toLocaleLowerCase(language())} · {item.review_status === "approved" ? text("approved") : "—"}</small></div>)}</div></section>
    {!!logs.length && <details className="panel logs-section"><summary>{text("logs")} ({logs.length})</summary><div className="actions"><button className="button secondary" onClick={() => navigator.clipboard.writeText(logText)}>{text("copy")}</button><button className="button secondary" onClick={downloadLogs}>{text("download")}</button></div><pre>{logText}</pre></details>}
    <dialog ref={discardDialog} className="modal" onClose={() => setPendingNavigation(null)}>
      <div className="modal-head"><h2>{text("discardTitle")}</h2><button className="icon-button" aria-label={text("close")} onClick={() => setPendingNavigation(null)}>×</button></div>
      <p>{text("discardDraft")}</p><footer className="modal-actions"><button className="button secondary" onClick={() => setPendingNavigation(null)}>{text("close")}</button><button className="button danger" onClick={confirmDiscard}>{text("confirm")}</button></footer>
    </dialog>
    <dialog ref={actionDialog} className="modal" onClose={() => { setAction(null); setActionConsent(false); }}>
      {action && <><div className="modal-head"><h2>{text(action === "delete" ? "deleteTitle" : action === "cancel" ? "cancelTitle" : "rerunTitle")}</h2><button className="icon-button" aria-label={text("close")} onClick={() => setAction(null)}>×</button></div>
        <p>{text(action === "delete" ? "deleteSummary" : action === "cancel" ? "cancelBody" : "rerunBody", action === "delete" ? { count: deleteAllowed ? 1 : 0 } : {})}</p>
        {dirty && <p className="notice warning">{text("discardDraft")}</p>}{!!deleteBlocked.length && <><b>{text("blocked")}</b><ul>{deleteBlocked.map((item) => <li key={item.id}>{item.name || item.id}</li>)}</ul></>}
        {action === "rerun" && job.endpoint_external && <label className="consent"><input type="checkbox" checked={actionConsent} onChange={(event) => setActionConsent(event.target.checked)} />{text("consent")}</label>}
        <footer className="modal-actions"><button className="button secondary" onClick={() => setAction(null)}>{text("close")}</button><button className={action === "delete" || action === "cancel" ? "button danger" : "button primary"} disabled={busy || (action === "delete" && !deleteAllowed) || (action === "rerun" && job.endpoint_external && !actionConsent)} onClick={confirmAction}>{text(action === "delete" ? "confirmDelete" : "confirm")}</button></footer></>}
    </dialog>
  </LegacyShell>;
}
