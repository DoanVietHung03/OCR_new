"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, Documents, getDocuments } from "../../lib/api";
import { language, safeError, statusText, text, useLanguage } from "../../lib/i18n";
import LegacyShell from "../legacy-shell";

const empty: Documents = { items: [], pagination: { page: 1, page_size: 25, total: 0, pages: 1 } };
const errorText = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason));

export default function DocumentsPage() {
  useLanguage();
  const [data, setData] = useState(empty); const [query, setQuery] = useState("");
  const [review, setReview] = useState("all"); const [sort, setSort] = useState("updated_desc"); const [page, setPage] = useState(1); const [urlReady, setUrlReady] = useState(false);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); getDocuments({ query, review_status: review, sort, page }).then((value) => { setData(value); setError(""); }).catch((reason) => setError(errorText(reason))).finally(() => setLoading(false)); }, [query, review, sort, page]);
  useEffect(() => { const params = new URLSearchParams(location.search); setQuery(params.get("q") || ""); setReview(params.get("review") || "all"); setSort(params.get("sort") || "updated_desc"); setPage(Math.max(1, Number(params.get("page")) || 1)); setUrlReady(true); }, []);
  useEffect(() => { if (urlReady) void load(); }, [load, urlReady]);
  useEffect(() => { if (!urlReady) return; const params = new URLSearchParams(); if (query) params.set("q", query); if (review !== "all") params.set("review", review); if (sort !== "updated_desc") params.set("sort", sort); if (page > 1) params.set("page", String(page)); history.replaceState(null, "", `/documents${params.size ? `?${params}` : ""}`); }, [query, review, sort, page, urlReady]);

  return <LegacyShell>
    <header className="page-header"><div><p className="eyebrow">{text("documents")}</p><h1>{text("manage")}</h1><p>{text("documentsSubtitle")}</p></div><Link className="button primary" href="/upload">＋ {text("newOcr")}</Link></header>
    {error && <div className="notice error" role="alert">{error}<button className="button secondary" onClick={load}>{text("retry")}</button></div>}
    <section className="panel data-panel">
      <div className="section-head"><div><h2>{text("documents")}</h2><p>{data.pagination.total} {text("documents").toLocaleLowerCase(language())}</p></div><button className="button secondary" onClick={load}>{text("refresh")}</button></div>
      <div className="filters"><input aria-label={text("search")} placeholder={text("search")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><select aria-label={text("status")} value={review} onChange={(event) => { setReview(event.target.value); setPage(1); }}><option value="all">{text("allStatuses")}</option><option value="approved">{text("approved")}</option><option value="unreviewed">{text("unreviewed")}</option></select><select aria-label={text("sort")} value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="updated_desc">{text("newest")}</option><option value="updated_asc">{text("oldest")}</option><option value="name_asc">{text("nameAz")}</option><option value="name_desc">{text("nameZa")}</option></select></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>{text("document")}</th><th>{text("job")}</th><th>{text("documentType")}</th><th>{text("status")}</th><th>{text("confidenceLabel")}</th><th>{text("warnings")}</th><th>{text("updated")}</th><th>{text("actions")}</th></tr></thead><tbody>
        {data.items.map((item) => <tr key={`${item.job_id}-${item.id}`}><td><b>{item.file_name || item.id}</b><small>{item.page_count} {text("pages").toLocaleLowerCase(language())}</small></td><td><code>{item.job_id.slice(0, 8)}</code></td><td>{item.document_type || "—"}</td><td><span className={`status ${item.status}`}>{item.review_status === "approved" ? text("approved") : statusText(item.status || item.job_status)}</span></td><td>{item.confidence_average == null ? "—" : `${Math.round(item.confidence_average * 100)}%`}</td><td>{item.warning_count}</td><td>{new Date(item.updated_at).toLocaleString(language())}</td><td><Link className="button secondary" href={item.deep_link}>{text("open")}</Link></td></tr>)}
      </tbody></table></div>
      {!data.items.length && <p className="empty">{loading ? text("loading") : text("noDocuments")}</p>}
      <nav className="pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{text("previous")}</button><span>{text("pageOf", { page: data.pagination.page, pages: data.pagination.pages })}</span><button className="button secondary" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>{text("next")}</button></nav>
    </section>
  </LegacyShell>;
}
