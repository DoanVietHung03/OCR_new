"use client";

import Link from "next/link";
import { MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { getSystemMetrics, SystemMetrics } from "../lib/api";
import { text, useLanguage } from "../lib/i18n";

const percent = (value: number) => `${Math.round(value)}%`;
const bytes = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GB`;

export default function LegacyShell({ children, detail = false, onNew, onJobs }: { children: ReactNode; detail?: boolean; onNew?: () => void; onJobs?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const [locale, changeLanguage] = useLanguage();
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [metricsError, setMetricsError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (monitorOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [monitorOpen]);
  useEffect(() => {
    if (!monitorOpen) return;
    const refresh = () => {
      if (document.hidden) return;
      getSystemMetrics().then((value) => { setMetrics(value); setMetricsError(""); setUpdated(new Date()); }).catch(() => setMetricsError(text("unknownError")));
    };
    refresh();
    const timer = setInterval(refresh, 2_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [monitorOpen, refreshToken]);

  const meter = (label: string, value: number | null | undefined) => <article className="monitor-card">
    <div><span>{label}</span><strong>{value == null ? "—" : percent(value)}</strong></div>
    <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>
  </article>;

  return <div className="app-shell" data-locale={locale}>
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label={text("title")} onClick={onJobs}><span className="brand-mark">ID</span><span>IntelliDoc<small>OCR</small></span></Link>
      <nav aria-label={text("jobs")}>
        <Link className={!detail ? "nav-link active" : "nav-link"} href="/" onClick={onJobs}>▦ <span>{text("jobs")}</span></Link>
        <button className="nav-link" aria-label={text("newOcr")} onClick={onNew || (() => { location.href = "/?upload=1"; })}>＋ <span>{text("newOcr")}</span></button>
      </nav>
      <div className="sidebar-tools">
        <button className="nav-link" aria-label={text("systemMonitor")} onClick={() => setMonitorOpen(true)}>◫ <span>{text("systemMonitor")}</span></button>
        <div className="language-switch" aria-label="Language">
          <button aria-pressed={locale === "vi"} onClick={() => changeLanguage("vi")}>VI</button>
          <button aria-pressed={locale === "en"} onClick={() => changeLanguage("en")}>EN</button>
        </div>
      </div>
    </aside>
    <main className="main-content">{children}</main>
    <dialog ref={dialog} className="modal monitor-modal" onClose={() => setMonitorOpen(false)}>
      <div className="modal-head"><div><p className="eyebrow">IntelliDoc</p><h2>{text("systemMonitor")}</h2></div><button className="icon-button" aria-label={text("close")} onClick={() => setMonitorOpen(false)}>×</button></div>
      {metricsError && <p className="error" role="alert">{metricsError}</p>}
      <div className="monitor-grid">
        {meter(text("cpu"), metrics?.cpu_percent)}
        {meter(text("memory"), metrics?.memory_percent)}
        <article className="monitor-card disk-card"><div><span>{text("disk")}</span><strong>{metrics?.disk ? percent(metrics.disk.percent) : "—"}</strong></div>
          {metrics?.disk && <><div className="meter"><i style={{ width: percent(metrics.disk.percent) }} /></div><small>{text("used")}: {bytes(metrics.disk.used_bytes)} · {text("free")}: {bytes(metrics.disk.free_bytes)}</small></>}
        </article>
        <article className="monitor-card gpu-card"><div><span>{text("gpu")}</span><strong>{metrics?.gpu?.status === "available" ? (metrics.gpu.devices?.length || 0) : metrics?.gpu?.status === "error" ? text("telemetryError") : text("unavailable")}</strong></div>
          {metrics?.gpu?.devices?.map((gpu) => <div className="gpu-device" key={gpu.index}><b>{gpu.index}: {gpu.name}</b><small>{gpu.utilization_percent == null ? "—" : percent(gpu.utilization_percent)} · {gpu.memory_used_mb ?? "—"}/{gpu.memory_total_mb ?? "—"} MB · {gpu.temperature_c ?? "—"}°C</small></div>)}
        </article>
      </div>
      <footer className="modal-actions"><small>{updated ? text("lastUpdated", { date: updated.toLocaleTimeString(locale) }) : text("loading")}</small><button className="button secondary" onClick={() => setRefreshToken((value) => value + 1)}>{text("refresh")}</button></footer>
    </dialog>
  </div>;
}
