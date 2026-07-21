"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, Events, getEvents } from "../../lib/api";
import { language, safeError, text, useLanguage } from "../../lib/i18n";
import LegacyShell from "../legacy-shell";

const empty: Events = { items: [], pagination: { page: 1, page_size: 50, total: 0, pages: 1 } };

export default function LogsPage() {
  useLanguage();
  const [data, setData] = useState(empty); const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all"); const [jobId, setJobId] = useState("");
  const [providerProfile, setProviderProfile] = useState(""); const [documentId, setDocumentId] = useState(""); const [pageIndex, setPageIndex] = useState("");
  const [page, setPage] = useState(1); const [error, setError] = useState("");
  const load = useCallback(() => getEvents({ severity, category, job_id: jobId || undefined, provider_profile_id: providerProfile || undefined, document_id: documentId || undefined, page_index: pageIndex === "" ? undefined : Number(pageIndex), page }).then((value) => { setData(value); setError(""); }).catch((reason) => setError(safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason)))), [severity, category, jobId, providerProfile, documentId, pageIndex, page]);
  useEffect(() => { void load(); }, [load]);
  const serialized = JSON.stringify(data.items, null, 2);
  const download = () => { const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "safe-events.json"; link.click(); URL.revokeObjectURL(url); };

  return <LegacyShell>
    <header className="page-header"><div><p className="eyebrow">{text("safeEvents")}</p><h1>{text("processingLogs")}</h1><p>{text("logsSubtitle")}</p></div><div className="actions"><button className="button secondary" onClick={() => navigator.clipboard.writeText(serialized)}>{text("copy")}</button><button className="button secondary" onClick={download}>{text("download")}</button></div></header>
    {error && <div className="notice error" role="alert">{error}<button className="button secondary" onClick={load}>{text("retry")}</button></div>}
    <section className="panel data-panel"><div className="filters"><input aria-label={text("job")} placeholder={text("job")} value={jobId} onChange={(event) => { setJobId(event.target.value.trim()); setPage(1); }} /><input aria-label={text("provider")} placeholder={text("provider")} value={providerProfile} onChange={(event) => { setProviderProfile(event.target.value.trim()); setPage(1); }} /><input aria-label={text("document")} placeholder={text("document")} value={documentId} onChange={(event) => { setDocumentId(event.target.value.trim()); setPage(1); }} /><input type="number" min="0" aria-label={text("pages")} placeholder={text("pages")} value={pageIndex} onChange={(event) => { setPageIndex(event.target.value); setPage(1); }} /><select aria-label={text("category")} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">{text("allCategories")}</option><option value="lifecycle">{text("lifecycle")}</option><option value="document">{text("document")}</option><option value="review">{text("review")}</option></select><select aria-label={text("status")} value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}><option value="all">{text("allStatuses")}</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option></select><button className="button secondary" onClick={load}>{text("refresh")}</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>{text("updated")}</th><th>{text("status")}</th><th>{text("actions")}</th><th>{text("job")}</th><th>{text("report")}</th></tr></thead><tbody>{data.items.map((event, index) => <tr key={`${event.job_id}-${event.timestamp}-${index}`}><td>{new Date(event.timestamp).toLocaleString(language())}</td><td><span className={`status ${event.severity === "error" ? "error" : event.severity === "warning" ? "completed_with_warnings" : "configured"}`}>{event.severity}</span></td><td><b>{event.code}</b><small>{event.category}</small></td><td><Link href={`/jobs/${event.job_id}`}>{event.job_id.slice(0, 8)}</Link><small>{[event.provider_profile_id, event.document_id, event.page_index == null ? null : `p.${event.page_index + 1}`].filter(Boolean).join(" · ")}</small></td><td>{event.message}</td></tr>)}</tbody></table></div>
      {!data.items.length && <p className="empty">{text("noEvents")}</p>}
      <nav className="pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{text("previous")}</button><span>{text("pageOf", { page: data.pagination.page, pages: data.pagination.pages })}</span><button className="button secondary" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>{text("next")}</button></nav>
    </section>
  </LegacyShell>;
}
