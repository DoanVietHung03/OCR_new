"use client";

import { useEffect, useState } from "react";
import { ApiError, getReports, Reports } from "../../lib/api";
import { safeError, text, useLanguage } from "../../lib/i18n";
import LegacyShell from "../legacy-shell";

export default function ReportsPage() {
  useLanguage();
  const [data, setData] = useState<Reports | null>(null); const [error, setError] = useState("");
  const load = () => getReports().then((value) => { setData(value); setError(""); }).catch((reason) => setError(safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason))));
  useEffect(() => { void load(); }, []);
  const operations = data?.operations; const quality = data?.quality;
  return <LegacyShell>
    <header className="page-header"><div><p className="eyebrow">{text("operations")}</p><h1>{text("report")}</h1><p>{text("reportsSubtitle")}</p></div><button className="button secondary" onClick={load}>{text("refresh")}</button></header>
    {error && <div className="notice error" role="alert">{error}</div>}
    <section className="metrics report-metrics">{[
      [text("totalJobs"), operations?.total_jobs], [text("activeJobs"), operations?.active_jobs],
      [text("documents"), operations?.documents], [text("pages"), operations?.pages],
      [text("duration"), operations?.duration_seconds_average == null ? null : `${Math.round(operations.duration_seconds_average)}s`],
      [text("throughput"), operations?.pages_per_minute == null ? null : `${operations.pages_per_minute} pages/min`],
    ].map(([label, value]) => <article className="panel metric" key={String(label)}><span>{label}</span><strong>{value ?? "—"}</strong><small>{text("operations")}</small></article>)}</section>
    <section className="report-grid"><article className="panel report-card"><h2>{text("quality")}</h2><dl><div><dt>{text("documents")}</dt><dd>{quality?.documents ?? "—"}</dd></div><div><dt>{text("approved")}</dt><dd>{quality?.approved_documents ?? "—"}</dd></div><div><dt>{text("corrections")}</dt><dd>{quality?.corrected_fields ?? "—"}</dd></div><div><dt>{text("confidenceLabel")}</dt><dd>{quality?.confidence_average == null ? "—" : `${Math.round(quality.confidence_average * 100)}%`}</dd></div><div><dt>{text("confidenceCoverage")}</dt><dd>{quality?.confidence_coverage == null ? "—" : `${Math.round(quality.confidence_coverage * 100)}%`}</dd></div><div><dt>{text("evidenceCoverage")}</dt><dd>{quality?.evidence_coverage == null ? "—" : `${Math.round(quality.evidence_coverage * 100)}%`}</dd></div><div><dt>{text("warnings")}</dt><dd>{quality?.warning_documents ?? "—"}</dd></div></dl></article>
      <article className="panel report-card"><h2>{text("benchmark")}</h2>{data?.benchmark_samples.length ? <pre>{JSON.stringify(data.benchmark_samples, null, 2)}</pre> : <p className="empty">{text("noBenchmark")}</p>}<h3>{text("failureCodes")}</h3>{operations?.failure_codes && Object.keys(operations.failure_codes).length ? <dl>{Object.entries(operations.failure_codes).map(([code, count]) => <div key={code}><dt>{code}</dt><dd>{count}</dd></div>)}</dl> : <p className="empty">{text("unavailable")}</p>}</article></section>
  </LegacyShell>;
}
