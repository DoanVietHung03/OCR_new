"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { getSession, getSystemMetrics, login, logout, SystemMetrics } from "../lib/api";
import { text, useLanguage } from "../lib/i18n";

const percent = (value: number) => `${Math.round(value)}%`;
const bytes = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GB`;
const icon = (children: ReactNode) => <svg className="nav-icon" aria-hidden="true" viewBox="0 0 24 24">{children}</svg>;

export default function AppShell({ children, onNew, onJobs }: { children: ReactNode; detail?: boolean; onNew?: () => void; onJobs?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const pathname = usePathname();
  const [locale, changeLanguage] = useLanguage();
  const [monitorOpen, setMonitorOpen] = useState(false);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [metricsError, setMetricsError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [username, setUsername] = useState("");
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const authDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => { const sync = () => setMonitorOpen(new URLSearchParams(location.search).get("monitor") === "1"); sync(); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
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
  useEffect(() => {
    getSession().then((value) => { setAuthEnabled(value.authenticated); setUsername(value.username); }).catch(() => {});
    const expired = () => setAuthOpen(true);
    window.addEventListener("ocr:auth-expired", expired);
    return () => window.removeEventListener("ocr:auth-expired", expired);
  }, []);
  useEffect(() => { if (authOpen) authDialog.current?.showModal(); else authDialog.current?.close(); }, [authOpen]);

  const meter = (label: string, value: number | null | undefined) => <article className="monitor-card">
    <div><span>{label}</span><strong>{value == null ? "—" : percent(value)}</strong></div>
    <div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>
  </article>;
  const active = (href: string) => href === "/" ? pathname === "/" || pathname.startsWith("/jobs/") : pathname.startsWith(href);
  const nav: [string, ReactNode, string][] = [
    ["/", icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>), text("jobs")],
    ["/upload", icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 18v-6m-3 3 3-3 3 3" /></>), text("newOcr")],
    ["/reports", icon(<><path d="M3 3v18h18" /><path d="m7 16 4-4 3 3 5-7" /></>), text("report")],
    ["/sizing", icon(<><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" /></>), text("sizing")],
    ["/guide", icon(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H12V5H6.5A2.5 2.5 0 0 0 4 7.5Z" /><path d="M20 19.5a2.5 2.5 0 0 0-2.5-2.5H12V5h5.5A2.5 2.5 0 0 1 20 7.5Z" /></>), text("guide")],
  ];
  const tools: [string, ReactNode, string][] = [
    ["/logs", icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>), text("processingLogs")],
    ["/codes", icon(<><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>), text("codes")],
  ];
  const operationStates = metrics?.operations?.states || {};
  const updateMonitor = (open: boolean) => { const query = new URLSearchParams(location.search); if (open) query.set("monitor", "1"); else query.delete("monitor"); history[open ? "pushState" : "replaceState"](null, "", `${location.pathname}${query.size ? `?${query}` : ""}`); setMonitorOpen(open); };
  const sidebarLabel = sidebarCollapsed ? (locale === "vi" ? "Mở rộng thanh bên" : "Expand sidebar") : (locale === "vi" ? "Thu gọn thanh bên" : "Collapse sidebar");

  return <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-locale={locale}>
    <aside className="sidebar">
      <Link className="brand" href="/" aria-label={text("title")} onClick={onJobs}><span className="brand-mark">ID</span><span>IntelliDoc<small>OCR</small></span></Link>
      <button className="sidebar-collapse" aria-label={sidebarLabel} aria-pressed={sidebarCollapsed} title={sidebarLabel} onClick={() => setSidebarCollapsed((value) => !value)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d={sidebarCollapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"} /></svg></button>
      <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((value) => !value)}>☰</button>
      <nav id="primary-navigation" className={menuOpen ? "open" : ""} aria-label={text("jobs")}>
        {nav.map(([href, icon, label]) => <Link className={active(href) ? "nav-link active" : "nav-link"} href={href} key={href} aria-label={label} title={sidebarCollapsed ? label : undefined} onClick={(event) => { setMenuOpen(false); if (href === "/upload" && onNew) { event.preventDefault(); onNew(); } else onJobs?.(event); }}>{icon} <span>{label}</span></Link>)}
        <div className="system-tools">
          <button className={pathname.startsWith("/logs") || pathname.startsWith("/codes") ? "nav-link active" : "nav-link"} aria-expanded={toolsOpen} aria-controls="system-tools-menu" title={sidebarCollapsed ? text("systemTools") : undefined} onClick={() => setToolsOpen((value) => !value)}>{icon(<><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h6M14 18h6" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="12" cy="18" r="2" /></>)}<span>{text("systemTools")}</span><svg className={toolsOpen ? "disclosure-chevron open" : "disclosure-chevron"} aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></button>
          {toolsOpen && <div id="system-tools-menu" className="system-tools-menu">
            {tools.map(([href, icon, label]) => <Link className={active(href) ? "nav-link active" : "nav-link"} href={href} key={href} aria-label={label} title={sidebarCollapsed ? label : undefined} onClick={(event) => { setMenuOpen(false); setToolsOpen(false); onJobs?.(event); }}>{icon} <span>{label}</span></Link>)}
            <button className="nav-link" aria-label={text("systemMonitor")} title={sidebarCollapsed ? text("systemMonitor") : undefined} onClick={() => { setMenuOpen(false); setToolsOpen(false); updateMonitor(true); }}>{icon(<><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>)}<span>{text("systemMonitor")}</span></button>
          </div>}
        </div>
      </nav>
      <div className="sidebar-tools">
        {authEnabled && <div className="shared-user" title={`${locale === "vi" ? "Tài khoản dùng chung" : "Shared account"}: ${username}`}><i aria-hidden="true">●</i><span><strong>{username}</strong><small>{locale === "vi" ? "Tài khoản dùng chung" : "Shared account"}</small></span></div>}
        <div className="language-switch" aria-label="Language">
          <button aria-pressed={locale === "vi"} onClick={() => changeLanguage("vi")}>VI</button>
          <button aria-pressed={locale === "en"} onClick={() => changeLanguage("en")}>EN</button>
        </div>
        {authEnabled && <button className="logout-button" aria-label={locale === "vi" ? "Đăng xuất" : "Sign out"} title={sidebarCollapsed ? (locale === "vi" ? "Đăng xuất" : "Sign out") : undefined} onClick={() => logout().finally(() => location.assign("/login"))}>{icon(<><path d="M10 17l5-5-5-5M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></>)}<span>{locale === "vi" ? "Đăng xuất" : "Sign out"}</span></button>}
      </div>
    </aside>
    <main className="main-content">{children}</main>
    <dialog ref={dialog} className="modal monitor-modal" onClose={() => updateMonitor(false)}>
      <div className="modal-head"><div><p className="eyebrow">IntelliDoc</p><h2>{text("systemMonitor")}</h2></div><button className="icon-button" aria-label={text("close")} onClick={() => updateMonitor(false)}>×</button></div>
      {metricsError && <p className="error" role="alert">{metricsError}</p>}
      <div className="monitor-grid">
        {meter(text("cpu"), metrics?.cpu_percent)}
        {meter(text("memory"), metrics?.memory_percent)}
        {metrics?.cpu && <article className="monitor-card"><div><span>CPU</span><strong>{metrics.cpu.logical_cores ?? "—"}</strong></div><small>{metrics.cpu.model || text("unavailable")} · {metrics.cpu.physical_cores ?? "—"} {text("physicalCores")} · {locale === "vi" ? "tải" : "load"} {metrics.cpu.load_1m ?? "—"}/{metrics.cpu.load_5m ?? "—"}/{metrics.cpu.load_15m ?? "—"}</small></article>}
        {metrics?.runtime && <article className="monitor-card"><div><span>{text("runtime")}</span><strong>{metrics.runtime.os_family}</strong></div><small>{metrics.runtime.architecture} · Python {metrics.runtime.python_version}</small></article>}
        <article className="monitor-card disk-card"><div><span>{text("disk")}</span><strong>{metrics?.disk ? percent(metrics.disk.percent) : "—"}</strong></div>
          {metrics?.disk && <><div className="meter"><i style={{ width: percent(metrics.disk.percent) }} /></div><small>{text("used")}: {bytes(metrics.disk.used_bytes)} · {text("free")}: {bytes(metrics.disk.free_bytes)}</small></>}
        </article>
        <article className="monitor-card gpu-card"><div><span>{text("gpu")}</span><strong>{metrics?.gpu?.status === "available" ? (metrics.gpu.devices?.length || 0) : metrics?.gpu?.status === "error" ? text("telemetryError") : text("unavailable")}</strong></div>
          {metrics?.gpu?.devices?.map((gpu) => <div className="gpu-device" key={gpu.index}><b>{gpu.index}: {gpu.name}</b><small>{gpu.utilization_percent == null ? "—" : percent(gpu.utilization_percent)} · {gpu.memory_used_mb ?? "—"}/{gpu.memory_total_mb ?? "—"} MB · {gpu.temperature_c ?? "—"}°C · {gpu.power_w ?? "—"} W</small></div>)}
        </article>
        {metrics?.operations && <article className="monitor-card gpu-card"><div><span>{text("ocrOperations")}</span><strong>{Object.values(operationStates).reduce((sum, value) => sum + value, 0)}</strong></div><small>{Object.entries(operationStates).map(([state, count]) => `${state}: ${count}`).join(" · ") || text("unavailable")}</small></article>}
      </div>
      <footer className="modal-actions"><small>{updated ? text("lastUpdated", { date: updated.toLocaleTimeString(locale) }) : text("loading")}</small><button className="button secondary" onClick={() => setRefreshToken((value) => value + 1)}>{text("refresh")}</button></footer>
    </dialog>
    <dialog ref={authDialog} className="modal auth-modal" onCancel={(event) => { event.preventDefault(); setAuthOpen(false); }}>
      <div className="modal-head"><div><p className="eyebrow">IntelliDoc</p><h2>{locale === "vi" ? "Phiên đăng nhập đã hết" : "Session expired"}</h2></div><button className="icon-button" aria-label={text("close")} onClick={() => setAuthOpen(false)}>×</button></div>
      <p>{locale === "vi" ? "Bản đang sửa vẫn được giữ. Đăng nhập lại rồi bấm lại thao tác chưa hoàn tất." : "Your draft is preserved. Sign in again, then retry the unfinished action."}</p>
      <form onSubmit={async (event) => {
        event.preventDefault(); setAuthBusy(true); setAuthError("");
        try { const value = await login(username, authPassword); setAuthEnabled(true); setUsername(value.username); setAuthPassword(""); setAuthOpen(false); }
        catch { setAuthError(locale === "vi" ? "Tên đăng nhập hoặc mật khẩu không đúng." : "Incorrect username or password."); }
        finally { setAuthBusy(false); }
      }}>
        <label>{locale === "vi" ? "Tên đăng nhập" : "Username"}<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>{locale === "vi" ? "Mật khẩu" : "Password"}<input type="password" autoComplete="current-password" required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
        {authError && <p className="error" role="alert">{authError}</p>}
        <footer className="modal-actions"><button type="button" className="button secondary" onClick={() => setAuthOpen(false)}>{text("close")}</button><button className="button primary" disabled={authBusy}>{authBusy ? text("loading") : (locale === "vi" ? "Đăng nhập lại" : "Sign in again")}</button></footer>
      </form>
    </dialog>
  </div>;
}
