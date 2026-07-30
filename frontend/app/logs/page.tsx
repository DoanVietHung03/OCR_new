"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, Events, getEvents } from "../../lib/api";
import { language, safeError, text, useLanguage } from "../../lib/i18n";
import AppShell from "../app-shell";

const empty: Events = { items: [], pagination: { page: 1, page_size: 50, total: 0, pages: 1 } };

export default function LogsPage() {
  const [locale] = useLanguage();
  const severityLabel = (value: string) => locale === "vi" ? ({ info: "Thông tin", warning: "Cảnh báo", error: "Lỗi" }[value] || value) : value[0].toUpperCase() + value.slice(1);
  const [data, setData] = useState(empty); const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all"); const [jobId, setJobId] = useState("");
  const [providerProfile, setProviderProfile] = useState(""); const [documentId, setDocumentId] = useState(""); const [pageIndex, setPageIndex] = useState("");
  const [page, setPage] = useState(1); const [error, setError] = useState(""); const [urlReady, setUrlReady] = useState(false);
  const load = useCallback(() => getEvents({ severity, category, job_id: jobId || undefined, provider_profile_id: providerProfile || undefined, document_id: documentId || undefined, page_index: pageIndex === "" ? undefined : Number(pageIndex), page }).then((value) => { setData(value); setError(""); }).catch((reason) => setError(safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason)))), [severity, category, jobId, providerProfile, documentId, pageIndex, page]);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(location.search);
      setSeverity(params.get("severity") || "all"); setCategory(params.get("category") || "all");
      setJobId(params.get("job_id") || ""); setProviderProfile(params.get("provider_profile_id") || "");
      setDocumentId(params.get("document_id") || ""); setPageIndex(params.get("page_index") || "");
      setPage(Math.max(1, Number(params.get("page")) || 1)); setUrlReady(true);
    };
    sync(); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => { if (urlReady) void load(); }, [load, urlReady]);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(location.search);
    ["severity", "category", "job_id", "provider_profile_id", "document_id", "page_index", "page"].forEach((key) => params.delete(key));
    if (severity !== "all") params.set("severity", severity); if (category !== "all") params.set("category", category);
    if (jobId) params.set("job_id", jobId); if (providerProfile) params.set("provider_profile_id", providerProfile);
    if (documentId) params.set("document_id", documentId); if (pageIndex !== "") params.set("page_index", pageIndex);
    if (page > 1) params.set("page", String(page));
    const next = `/logs${params.size ? `?${params}` : ""}`;
    if (`${location.pathname}${location.search}` !== next) history.pushState(null, "", next);
  }, [severity, category, jobId, providerProfile, documentId, pageIndex, page, urlReady]);
  const serialized = JSON.stringify(data.items, null, 2);
  const download = () => { const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "safe-events.json"; link.click(); URL.revokeObjectURL(url); };

  return <AppShell>
    <header className="page-header"><div><p className="eyebrow">{text("safeEvents")}</p><h1>{text("processingLogs")}</h1><p>{text("logsSubtitle")}</p></div><div className="actions"><button className="button secondary" onClick={() => navigator.clipboard.writeText(serialized)}>{text("copy")}</button><button className="button secondary" onClick={download}>{text("download")}</button></div></header>
    {error && <div className="notice error" role="alert">{error}<button className="button secondary" onClick={load}>{text("retry")}</button></div>}
    <section className="panel data-panel"><div className="filters"><input aria-label={text("job")} placeholder={text("job")} value={jobId} onChange={(event) => { setJobId(event.target.value.trim()); setPage(1); }} /><input aria-label={text("provider")} placeholder={text("provider")} value={providerProfile} onChange={(event) => { setProviderProfile(event.target.value.trim()); setPage(1); }} /><input aria-label={text("document")} placeholder={text("document")} value={documentId} onChange={(event) => { setDocumentId(event.target.value.trim()); setPage(1); }} /><input type="number" min="0" aria-label={text("pages")} placeholder={text("pages")} value={pageIndex} onChange={(event) => { setPageIndex(event.target.value); setPage(1); }} /><select aria-label={text("category")} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">{text("allCategories")}</option><option value="lifecycle">{text("lifecycle")}</option><option value="document">{text("document")}</option><option value="review">{text("review")}</option></select><select aria-label={text("status")} value={severity} onChange={(event) => { setSeverity(event.target.value); setPage(1); }}><option value="all">{text("allStatuses")}</option>{["info", "warning", "error"].map((value) => <option value={value} key={value}>{severityLabel(value)}</option>)}</select><button className="button secondary" onClick={load}>{text("refresh")}</button></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>{text("updated")}</th><th>{text("status")}</th><th>{text("actions")}</th><th>{text("job")}</th><th>{text("report")}</th></tr></thead><tbody>{data.items.map((event, index) => <tr key={`${event.job_id}-${event.timestamp}-${index}`}><td>{new Date(event.timestamp).toLocaleString(language())}</td><td><span className={`status ${event.severity === "error" ? "error" : event.severity === "warning" ? "completed_with_warnings" : "configured"}`}>{severityLabel(event.severity)}</span></td><td><b>{event.code}</b><small>{event.category}</small></td><td><Link href={`/jobs/${event.job_id}`}>{event.job_id.slice(0, 8)}</Link><small>{[event.provider_profile_id, event.document_id, event.page_index == null ? null : `p.${event.page_index + 1}`].filter(Boolean).join(" · ")}</small></td><td>{event.message}</td></tr>)}</tbody></table></div>
      {!data.items.length && <p className="empty">{text("noEvents")}</p>}
      <nav className="pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{text("previous")}</button><span>{text("pageOf", { page: data.pagination.page, pages: data.pagination.pages })}</span><button className="button secondary" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>{text("next")}</button></nav>
    </section>
  </AppShell>;
}
