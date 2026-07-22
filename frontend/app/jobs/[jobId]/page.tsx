"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useRef, useState } from "react";
import { ACTIVE_JOB_STATUSES, ApiError, Artifacts, bulkDelete, cancelJob, DELETABLE_JOB_STATUSES, deletePreview, Document, getArtifacts, getJob, Job, rerunJob, TERMINAL_JOB_STATUSES } from "../../../lib/api";
import { language, safeError, statusText, text, useLanguage } from "../../../lib/i18n";
import LegacyShell from "../../legacy-shell";
import ReviewWorkspace from "./review-workspace";
import "./review.css";

type PendingNavigation = { href: string } | { documentId: string } | null;
type LifecycleAction = "cancel" | "rerun" | "delete" | null;
type JobView = "overview" | "review" | "artifacts" | "report" | "logs";
const message = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : reason instanceof Error ? reason.message : String(reason));
const processedPageCount = (pages: NonNullable<Document["pages"]>, fallback = pages.length) =>
  pages.some((page) => page.ocr_scope || page.status === "skipped")
    ? pages.filter((page) => page.ocr_scope !== "none" && page.status !== "skipped").length
    : fallback;

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  useLanguage();
  const router = useRouter();
  const [id, setId] = useState(""); const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState("");
  const [documentId, setDocumentId] = useState(""); const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [view, setView] = useState<JobView>("review");
  const [artifactManifest, setArtifactManifest] = useState<Artifacts | null>(null); const [artifactError, setArtifactError] = useState("");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null); const [action, setAction] = useState<LifecycleAction>(null);
  const [actionConsent, setActionConsent] = useState(false); const [deleteAllowed, setDeleteAllowed] = useState(false); const [deleteBlocked, setDeleteBlocked] = useState<{ id: string; name?: string | null }[]>([]);
  const discardDialog = useRef<HTMLDialogElement>(null); const actionDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { params.then(({ jobId }) => setId(jobId)); }, [params]);
  useEffect(() => { if (!id) return; const query = new URLSearchParams(location.search); const requested = query.get("view") as JobView | null; if (requested && ["overview", "review", "artifacts", "report", "logs"].includes(requested)) setView(requested); if (query.get("document")) setDocumentId(query.get("document")!); }, [id]);
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
  useEffect(() => { if (!id) return; const query = new URLSearchParams(location.search); query.set("view", view); if (documentId) query.set("document", documentId); history.replaceState(null, "", `${location.pathname}?${query}`); }, [id, view, documentId]);
  useEffect(() => {
    if (!id || view !== "artifacts") return;
    let current = true;
    getArtifacts(id).then((value) => { if (current) { setArtifactManifest(value); setArtifactError(""); } }).catch((reason) => { if (current) setArtifactError(message(reason)); });
    return () => { current = false; };
  }, [id, view]);

  function guardedLink(event: MouseEvent<HTMLAnchorElement>) { if (dirty) { event.preventDefault(); setPendingNavigation({ href: event.currentTarget.href }); } }
  function goNew() { if (dirty) setPendingNavigation({ href: `${location.origin}/upload` }); else router.push("/upload"); }
  function selectDocument(next: string) { if (next === documentId) return; if (dirty) setPendingNavigation({ documentId: next }); else setDocumentId(next); }
  function selectView(next: JobView) { if (next === view) return; if (dirty) return setPendingNavigation({ href: `${location.pathname}?view=${next}&document=${documentId}` }); setView(next); }
  function confirmDiscard() {
    const next = pendingNavigation; setPendingNavigation(null);
    if (!next) return;
    setDirty(false);
    if ("documentId" in next) setDocumentId(next.documentId);
    else { const target = new URL(next.href, location.href); const nextView = target.searchParams.get("view") as JobView | null; if (target.pathname === location.pathname && nextView) setView(nextView); else router.push(`${target.pathname}${target.search}${target.hash}`); }
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

  if (!job) return <LegacyShell detail onNew={() => router.push("/upload")}><Link className="button secondary" href="/">← {text("back")}</Link><p className="empty">{error || text("loading")}</p></LegacyShell>;
  const documents = job.documents || []; const document = (documents.find((item) => item.id === documentId) || documents[0] || null) as Document | null;
  const active = ACTIVE_JOB_STATUSES.has(job.status), terminal = TERMINAL_JOB_STATUSES.has(job.status);
  const failures = job.failed_pages + documents.filter((item) => item.error).length;
  const allPages = documents.flatMap((item) => item.pages || []);
  const processedPages = processedPageCount(allPages, job.page_count);
  const scopeSummary = text(job.vlm_task === "metadata" ? "metadataPageSummary" : "fullOcrPageSummary", { processed: processedPages, total: job.page_count });
  const knownArtifacts = Array.from(new Set(documents.flatMap((item) => [
    ...(item.pages || []).flatMap((page) => [page.image_url, ...Object.values(page.images || {}), ...Object.values(page.links || {})]),
    ...(item.crop_evidence || []).map((evidence) => evidence.crop_image),
  ]).filter(Boolean)));
  const listedArtifacts = artifactManifest?.items || [];
  const listedUrls = new Set(listedArtifacts.map((item) => item.download_url));
  const artifactItems = [...listedArtifacts, ...knownArtifacts.filter((url) => !listedUrls.has(url)).map((url) => ({
    name: decodeURIComponent(url.split("/").pop() || url), kind: "other" as const,
    status: artifactManifest ? "missing" as const : "unknown" as const,
    size_bytes: 0, updated_at: "", document_id: null, page_index: null, download_url: url,
  }))];

  return <LegacyShell detail onNew={goNew} onJobs={guardedLink}>
    <Link className="back-link" href="/" onClick={guardedLink}>← {text("back")}</Link>
    <header className="job-header"><div><p className="eyebrow">{job.id}</p><h1>{job.upload_name || text("job")}</h1><p>{text("jobSummary", { pages: job.page_count, corrections: job.correction_count })} · {scopeSummary}</p></div><span className={`status ${job.status}`}>{statusText(job.status)}</span></header>
    <section className="job-facts panel"><div><span>{text("provider")}</span><b>{job.provider_profile_id || job.provider || job.ocr_method || "—"}</b><small>{job.model || "—"} · prompt {job.prompt_version || "—"}</small></div><div><span>{text("documents")}</span><b>{documents.length}</b><small>{job.uploaded_files}/{job.expected_files} PDF</small></div><div><span>{text("pdfPages")}</span><b>{job.page_count}</b><small>{scopeSummary} · {job.failed_pages} failed</small></div><div><span>{text("updated")}</span><b>{new Date(job.updated_at).toLocaleDateString(language())}</b><small>{text("created")}: {new Date(job.created_at).toLocaleString(language())}<br />{job.started_at ? `${statusText("starting")}: ${new Date(job.started_at).toLocaleString(language())}` : ""}{job.completed_at ? <><br />{statusText("completed")}: {new Date(job.completed_at).toLocaleString(language())}</> : null}</small></div><div className="job-actions">{active && <button className="button danger" disabled={busy || job.status === "cancelling"} onClick={() => setAction("cancel")}>{text("cancel")}</button>}{terminal && <button className="button secondary" disabled={busy} onClick={() => setAction("rerun")}>{text("rerun")}</button>}{DELETABLE_JOB_STATUSES.has(job.status) && <button className="button danger ghost" disabled={busy} onClick={requestDelete}>{text("delete")}</button>}</div></section>
    <p className="lifecycle-note">{active ? text("activeHint") : terminal ? text("terminalHint") : statusText(job.status)}</p>
    {(error || job.error) && <p className="notice error" role="alert">{error || safeError(job.error!)}</p>}
    <nav className="detail-tabs" aria-label={text("job")}>{(["overview", "review", "artifacts", "report", "logs"] as JobView[]).map((item) => <button className={view === item ? "active" : ""} aria-current={view === item ? "page" : undefined} onClick={() => selectView(item)} key={item}>{text(item)}</button>)}</nav>
    {view === "review" && <>{!!documents.length && <nav className="document-tabs" aria-label={text("documents")}>{documents.map((item, index) => <button className={item.id === document?.id ? "active" : ""} aria-current={item.id === document?.id ? "page" : undefined} key={item.id} onClick={() => selectDocument(item.id)}><span>{index + 1}</span><b>{item.file_name}</b><small>{item.error || item.errors?.length ? statusText("error") : item.review_status === "approved" ? text("approved") : statusText(item.status)}</small></button>)}</nav>}{document ? <ReviewWorkspace key={document.id} jobId={id} document={document} terminal={terminal} onJob={setJob} onDirty={setDirty} onError={setError} /> : <section className="panel empty">{text("noResult")}</section>}</>}
    {view === "overview" && <section className="panel report-section"><div className="section-head"><div><p className="eyebrow">{text("overview")}</p><h2>{text("reportSummary", { documents: documents.length, pages: job.page_count, corrections: job.correction_count, failures })}</h2><small>{scopeSummary}</small></div></div><div className="report-documents">{documents.map((item) => <div key={item.id}><b>{item.file_name}</b><span>{statusText(item.status)}</span><small>{item.pages?.length || 0} {text("pdfPages").toLocaleLowerCase(language())} · {text("processedPages", { count: processedPageCount(item.pages || []) })} · {item.review_status === "approved" ? text("approved") : "—"}</small></div>)}</div></section>}
    {view === "artifacts" && <section className="panel artifact-section"><div className="section-head"><h2>{text("artifacts")}</h2><span>{artifactItems.length}</span></div>{artifactError && <p className="notice warning">{artifactError}</p>}<div className="artifact-list">{artifactItems.map((item) => <a href={item.download_url} target="_blank" rel="noreferrer" key={item.download_url}><b>{item.name}</b><small>{item.kind} · {item.status}{item.size_bytes ? ` · ${item.size_bytes.toLocaleString(language())} B` : ""}{item.updated_at ? ` · ${new Date(item.updated_at).toLocaleString(language())}` : ""}</small></a>)}</div>{!artifactItems.length && <p className="empty">{text("unavailable")}</p>}</section>}
    {view === "report" && <section className="panel report-section"><div className="section-head"><div><p className="eyebrow">{text("report")}</p><h2>{text("reportSummary", { documents: documents.length, pages: job.page_count, corrections: job.correction_count, failures })}</h2><small>{scopeSummary}</small></div>{job.report_url && <a className="button secondary" href={job.report_url} target="_blank" rel="noreferrer">{text("openArtifact")}</a>}</div><div className="report-documents">{documents.map((item) => <div key={item.id}><b>{item.file_name}</b><span>{statusText(item.status)}</span><small>{item.pages?.length || 0} {text("pdfPages").toLocaleLowerCase(language())} · {text("processedPages", { count: processedPageCount(item.pages || []) })} · {item.review_status === "approved" ? text("approved") : "—"}</small></div>)}</div></section>}
    {view === "logs" && <details className="panel logs-section" open><summary>{text("processingLogs")} ({logs.length})</summary><div className="actions"><button className="button secondary" onClick={() => navigator.clipboard.writeText(logText)}>{text("copy")}</button><button className="button secondary" onClick={downloadLogs}>{text("download")}</button></div><pre>{logText}</pre>{!logs.length && <p className="empty">{text("noEvents")}</p>}</details>}
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
