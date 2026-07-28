"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "../../lib/api";
import { useLanguage } from "../../lib/i18n";

const safeReturnTo = (value: string | null) => {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try { return new URL(value, location.origin).origin === location.origin ? value : "/"; }
  catch { return "/"; }
};
const requestedReturnTo = () => {
  if (!location.search.startsWith("?returnTo=")) return null;
  try { return decodeURIComponent(location.search.slice("?returnTo=".length)); }
  catch { return null; }
};

export default function LoginPage() {
  const router = useRouter();
  const [locale, changeLanguage] = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const vi = locale === "vi";
  const caps = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await login(username, password);
      router.replace(safeReturnTo(requestedReturnTo()));
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 429
        ? (vi ? "Bạn đã thử quá nhiều lần. Vui lòng đợi một phút." : "Too many attempts. Please wait one minute.")
        : (vi ? "Tên đăng nhập hoặc mật khẩu không đúng." : "Incorrect username or password."));
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page" data-locale={locale}>
    <section className="login-card">
      <header><span className="brand-mark">ID</span><div><strong>IntelliDoc</strong><small>OCR</small></div></header>
      <div className="login-language language-switch" aria-label="Language">
        <button aria-pressed={vi} onClick={() => changeLanguage("vi")}>VI</button>
        <button aria-pressed={!vi} onClick={() => changeLanguage("en")}>EN</button>
      </div>
      <h1>{vi ? "Đăng nhập" : "Sign in"}</h1>
      <form onSubmit={submit}>
        <label>{vi ? "Tên đăng nhập" : "Username"}<input autoComplete="username" autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>{vi ? "Mật khẩu" : "Password"}<span className="password-input"><input type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={caps} onKeyUp={caps} onBlur={() => setCapsLock(false)} /><button type="button" aria-label={vi ? "Hiện hoặc ẩn mật khẩu" : "Show or hide password"} onClick={() => setVisible((value) => !value)}>{visible
          ? <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          : <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4l18 16M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.2 3M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.7 0 3.2-.4 4.5-1" /></svg>
        }</button></span></label>
        {capsLock && <small className="warning" role="status">{vi ? "Caps Lock đang bật." : "Caps Lock is on."}</small>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy}>{busy ? (vi ? "Đang đăng nhập…" : "Signing in…") : (vi ? "Đăng nhập" : "Sign in")}</button>
      </form>
    </section>
  </main>;
}
