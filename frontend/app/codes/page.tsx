"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, CodeCatalog, CodeEntry, CodeInput, createCode, deleteCode, getCodes, updateCode } from "../../lib/api";
import { safeError, text, useLanguage } from "../../lib/i18n";
import AppShell from "../app-shell";

const groups = ["reserve_mode", "use_mode", "doc_type", "confidence", "language", "retention", "backup_status", "physical_status"] as const;
const blank: CodeInput = { group: "doc_type", code: "", label: "", keywords: "", order: 0, active: true };

export default function CodesPage() {
  useLanguage();
  const [catalog, setCatalog] = useState<CodeCatalog | null>(null); const [form, setForm] = useState<CodeInput | null>(null);
  const [editing, setEditing] = useState(""); const [filter, setFilter] = useState("all"); const [error, setError] = useState("");
  const load = () => getCodes().then((value) => { setCatalog(value); setError(""); }).catch(showError);
  const showError = (reason: unknown) => setError(safeError(reason instanceof ApiError ? reason.code || reason.message : String(reason)));
  useEffect(() => { void load(); }, []);
  const edit = (item: CodeEntry) => { setEditing(item.code); setForm({ group: item.group, code: item.code, label: item.label, keywords: item.keywords, order: item.order, active: item.active }); };
  async function save(event: FormEvent) { event.preventDefault(); if (!form || !catalog) return; try { const next = editing ? await updateCode(editing, { revision: catalog.revision, label: form.label, keywords: form.keywords, order: form.order, active: form.active }) : await createCode(form); setCatalog(next); setForm(null); setEditing(""); setError(""); } catch (reason) { showError(reason); } }
  async function remove(item: CodeEntry) { if (!catalog || !confirm(`${text("delete")}: ${item.code}?`)) return; try { setCatalog(await deleteCode(item.code, catalog.revision)); } catch (reason) { showError(reason); } }
  const items = (catalog?.items || []).filter((item) => filter === "all" || item.group === filter);

  return <AppShell>
    <header className="page-header"><div><p className="eyebrow">TT 05/2025/TT-BNV</p><h1>{text("codes")}</h1><p>{text("codesSubtitle")}</p></div><button className="button primary" onClick={() => { setEditing(""); setForm(blank); }}>＋ {text("addCode")}</button></header>
    {error && <div className="notice error" role="alert">{error}<button className="button secondary" onClick={load}>{text("refresh")}</button></div>}
    {form && <form className="panel code-form" onSubmit={save}><div className="section-head"><h2>{editing ? text("editCode") : text("addCode")}</h2><button className="icon-button" type="button" aria-label={text("close")} onClick={() => setForm(null)}>×</button></div><div className="form-grid">
      <label>{text("group")}<select disabled={!!editing} value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value as CodeInput["group"] })}>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
      <label>Code<input required maxLength={32} disabled={!!editing} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
      <label>{text("label")}<input required maxLength={200} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
      <label>{text("keywords")}<input maxLength={500} value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} /></label>
      <label>{text("order")}<input type="number" min="0" max="10000" value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} /></label>
      <label className="check-label"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />{text("active")}</label>
    </div><footer className="modal-actions"><button className="button secondary" type="button" onClick={() => setForm(null)}>{text("close")}</button><button className="button primary" type="submit">{text("save")}</button></footer></form>}
    <section className="panel data-panel"><div className="code-tabs"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>{text("allStatuses")}</button>{groups.map((group) => <button className={filter === group ? "active" : ""} key={group} onClick={() => setFilter(group)}>{group}</button>)}</div><div className="table-scroll"><table className="data-table"><thead><tr><th>{text("group")}</th><th>Code</th><th>{text("label")}</th><th>{text("keywords")}</th><th>{text("order")}</th><th>{text("status")}</th><th>{text("actions")}</th></tr></thead><tbody>{items.map((item) => <tr key={item.code}><td>{item.group}</td><td><b>{item.code}</b></td><td>{item.label}</td><td>{item.keywords}</td><td>{item.order}</td><td><span className={`status ${item.active ? "configured" : ""}`}>{item.active ? text("active") : text("hidden")}</span></td><td><div className="actions"><button className="button secondary" onClick={() => edit(item)}>{text("editCode")}</button><button className="button danger ghost" onClick={() => remove(item)}>{text("delete")}</button></div></td></tr>)}</tbody></table></div>{!items.length && <p className="empty">{text("noCodes")}</p>}</section>
  </AppShell>;
}
