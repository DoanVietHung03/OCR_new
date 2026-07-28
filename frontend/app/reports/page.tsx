"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, Documents, getDocuments, getReports, Reports } from "../../lib/api";
import { safeError, text, useLanguage } from "../../lib/i18n";
import AppShell from "../app-shell";

const errorText = (reason: unknown) => safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason));
const unavailable = () => `— · ${text("unavailable")}`;
const percent = (value: number | null | undefined) => value == null ? unavailable() : `${Math.round(value * 100)}%`;

export default function ReportsPage() {
  const [locale] = useLanguage();
  const [data, setData] = useState<Reports | null>(null);
  const [documents, setDocuments] = useState<Documents | null>(null);
  const [reportError, setReportError] = useState("");
  const [documentsError, setDocumentsError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);

  const loadReports = () => getReports().then((value) => { setData(value); setReportError(""); setUpdated(new Date()); }).catch((reason) => setReportError(errorText(reason)));
  const loadDocuments = () => getDocuments({ page_size: 1 }).then((value) => { setDocuments(value); setDocumentsError(""); setUpdated(new Date()); }).catch((reason) => setDocumentsError(errorText(reason)));
  const load = () => Promise.all([loadReports(), loadDocuments()]);
  useEffect(() => { void load(); }, []);

  const operations = data?.operations;
  const quality = data?.quality;
  const needsReview = documents?.triage_counts?.needs_review;
  const approvalRate = quality?.documents ? quality.approved_documents / quality.documents : null;
  const attention = [
    [text("documentsNeedReview"), needsReview, "/documents?triage=needs_review", text("reviewQueueCta")],
    [text("activeJobs"), operations?.active_jobs, "/?status=active", text("activeJobsCta")],
    [text("errorJobs"), operations?.error_jobs, "/logs?severity=error", text("errorsCta")],
    [text("warnings"), quality?.warning_documents, "/logs?severity=warning", text("warningsCta")],
  ] as const;
  const noAttention = data && documents && attention.every(([, value]) => value === 0);

  return <AppShell>
    <header className="page-header">
      <div><p className="eyebrow">{text("operations")}</p><h1>{text("report")}</h1><p>{text("reportsSubtitle")}</p><small className="report-scope">{text("dataScope")} · {updated ? text("lastUpdated", { date: updated.toLocaleTimeString(locale) }) : text("loading")}</small></div>
      <div className="actions"><Link className="button secondary" href="/sizing">{text("sizingCta")}</Link><button className="button secondary" onClick={() => void load()}>{text("refresh")}</button></div>
    </header>
    {reportError && <div className={data ? "notice warning" : "notice error"} role="alert"><span>{data && <b>{text("possiblyStale")}: </b>}{reportError}</span><button className="button secondary" onClick={() => void loadReports()}>{text("retry")}</button></div>}
    {documentsError && <div className={documents ? "notice warning" : "notice error"} role="alert"><span>{documents && <b>{text("possiblyStale")}: </b>}{documentsError}</span><button className="button secondary" onClick={() => void loadDocuments()}>{text("retry")}</button></div>}

    {data && operations?.total_jobs === 0 ? <section className="panel report-empty"><h2>{text("noOperationalData")}</h2><p>{text("noJobs")}</p><Link className="button primary" href="/upload">{text("newOcr")}</Link></section> : <>
      <section className="report-section" aria-labelledby="attention-title">
        <div className="section-head"><h2 id="attention-title">{text("attentionNow")}</h2></div>
        {noAttention ? <div className="notice success">{text("noAttention")}</div> : <div className="attention-grid">{attention.map(([label, value, href, action]) => <article className="panel attention-card" key={href}><span>{label}</span><strong>{value ?? "—"}</strong><Link href={href}>{action} →</Link></article>)}</div>}
      </section>

      <section className="report-grid">
        <article className="panel report-card"><h2>{text("qualityOcr")}</h2><dl>
          <div><dt>{text("approvalRate")}</dt><dd>{percent(approvalRate)}</dd></div>
          <div><dt>{text("confidenceLabel")}</dt><dd>{percent(quality?.confidence_average)}</dd></div>
          <div><dt>{text("confidenceCoverage")}</dt><dd>{percent(quality?.confidence_coverage)}</dd></div>
          <div><dt>{text("evidenceCoverage")}</dt><dd>{percent(quality?.evidence_coverage)}</dd></div>
          <div><dt>{text("corrections")}</dt><dd>{quality?.corrected_fields ?? "—"}</dd></div>
          <div><dt>{text("warnings")}</dt><dd>{quality?.warning_documents ?? "—"}</dd></div>
        </dl></article>
        <article className="panel report-card"><h2>{text("performance")}</h2><dl>
          <div><dt>{text("totalJobs")}</dt><dd>{operations?.total_jobs ?? "—"}</dd></div>
          <div><dt>{text("completedJobs")}</dt><dd>{operations?.completed_jobs ?? "—"}</dd></div>
          <div><dt>{text("documents")}</dt><dd>{operations?.documents ?? "—"}</dd></div>
          <div><dt>{text("pages")}</dt><dd>{operations?.pages ?? "—"}</dd></div>
          <div><dt>{text("duration")}</dt><dd>{operations?.duration_seconds_average == null ? unavailable() : `${Math.round(operations.duration_seconds_average)}s`}</dd></div>
          <div><dt>{text("throughput")}</dt><dd>{operations?.pages_per_minute == null ? unavailable() : `${operations.pages_per_minute} ${text("pagesPerMinute")}`}</dd></div>
        </dl></article>
      </section>

      <section className="panel data-panel provider-report"><div className="section-head"><h2>{text("provider")}</h2></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>{text("provider")}</th><th>{text("totalJobs")}</th><th>{text("pages")}</th><th>{text("throughput")}</th><th>{text("approvalRate")}</th><th>{text("evidenceCoverage")}</th></tr></thead><tbody>
          {data?.profiles.map((profile) => <tr key={profile.provider_profile_id}><td><b>{profile.provider_profile_id}</b></td><td>{profile.operations.total_jobs}</td><td>{profile.operations.pages}</td><td>{profile.operations.pages_per_minute == null ? unavailable() : `${profile.operations.pages_per_minute} ${text("pagesPerMinute")}`}</td><td>{percent(profile.quality.documents ? profile.quality.approved_documents / profile.quality.documents : null)}</td><td>{percent(profile.quality.evidence_coverage)}</td></tr>)}
        </tbody></table></div>
        {!data?.profiles.length && <p className="empty">{text("unavailable")}</p>}
      </section>
    </>}
  </AppShell>;
}
