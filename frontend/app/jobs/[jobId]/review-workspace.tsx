"use client";

import { KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, crop, Document, Field, getJob, Job, saveCorrections } from "../../../lib/api";
import { language, safeError, text } from "../../../lib/i18n";

const fieldOrder = [
  "co_quan_ban_hanh", "quoc_hieu_tieu_ngu", "so_van_ban", "dia_diem_ban_hanh", "ngay_ban_hanh", "loai_van_ban", "trich_yeu",
  "quyen_han_ky_thay", "chuc_vu_nguoi_ky", "nguoi_ky", "ma_luu_tru", "co_quan_luu_tru", "nhiem_ky", "tieu_de_ho_so",
  "hop_so", "phong_so", "muc_luc_so", "bat_dau", "ho_so_dvbq", "ket_thuc", "so_tai_lieu", "thoi_han_bao_quan", "so_trang", "document_type",
] as const;
const fieldMeta: Record<string, [string, string, string, boolean?]> = {
  co_quan_ban_hanh: ["Cơ quan ban hành", "Issuing authority", "Văn bản"], quoc_hieu_tieu_ngu: ["Quốc hiệu, tiêu ngữ", "National header", "Văn bản"],
  so_van_ban: ["Số văn bản", "Document number", "Văn bản"], dia_diem_ban_hanh: ["Địa điểm ban hành", "Issue place", "Văn bản"],
  ngay_ban_hanh: ["Ngày ban hành", "Issue date", "Văn bản"], loai_van_ban: ["Loại văn bản", "Document type", "Văn bản"],
  trich_yeu: ["Trích yếu", "Summary", "Văn bản", true], quyen_han_ky_thay: ["Quyền hạn ký", "Signing authority", "Ký duyệt"],
  chuc_vu_nguoi_ky: ["Chức vụ người ký", "Signatory title", "Ký duyệt"], nguoi_ky: ["Người ký", "Signatory", "Ký duyệt"],
  ma_luu_tru: ["Mã lưu trữ", "Archive code", "Hồ sơ"], co_quan_luu_tru: ["Cơ quan lưu trữ", "Archive authority", "Hồ sơ"],
  nhiem_ky: ["Nhiệm kỳ", "Term", "Hồ sơ"], tieu_de_ho_so: ["Tiêu đề hồ sơ", "File title", "Hồ sơ", true], hop_so: ["Hộp số", "Box", "Hồ sơ"],
  phong_so: ["Phông số", "Fonds", "Hồ sơ"], muc_luc_so: ["Mục lục số", "Inventory", "Hồ sơ"], bat_dau: ["Bắt đầu", "Start", "Thời hạn"],
  ho_so_dvbq: ["Hồ sơ ĐVBQ", "Retention file", "Hồ sơ"], ket_thuc: ["Kết thúc", "End", "Thời hạn"], so_tai_lieu: ["Số tài liệu", "Documents", "Thống kê"],
  thoi_han_bao_quan: ["Thời hạn bảo quản", "Retention", "Thời hạn"], so_trang: ["Số trang", "Page count", "Thống kê"], document_type: ["Loại tài liệu", "Document type", "Văn bản"],
};
const canonical = new Set<string>(fieldOrder);
const scalar = (value: unknown): value is string | number | boolean | null => value == null || ["string", "number", "boolean"].includes(typeof value);
const display = (value: unknown) => value == null ? "" : scalar(value) ? String(value) : JSON.stringify(value, null, 2);
const fieldLabel = (name: string) => fieldMeta[name]?.[language() === "vi" ? 0 : 1] || name;
const groupLabel = (group: string) => language() === "vi" ? group : ({ "Văn bản": "Document", "Ký duyệt": "Signature", "Hồ sơ": "File", "Thời hạn": "Dates", "Thống kê": "Counts", "Khác": "Other" }[group] || group);
type Draft = { old: unknown; value: string };
type Rect = { x: number; y: number; width: number; height: number };

export default function ReviewWorkspace({ jobId, document, terminal, onJob, onDirty, onError }: {
  jobId: string; document: Document; terminal: boolean; onJob: (job: Job) => void; onDirty: (dirty: boolean) => void; onError: (error: string) => void;
}) {
  const pages = document.pages || [];
  const [selectedPage, setSelectedPage] = useState(pages[0]?.page_index ?? 0); const [selectedField, setSelectedField] = useState("");
  const [zoom, setZoom] = useState<"fit" | "actual">("fit"); const [imageFailed, setImageFailed] = useState(false); const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [conflict, setConflict] = useState(false); const [cropOpen, setCropOpen] = useState(false); const [rect, setRect] = useState<Rect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null); const [saving, setSaving] = useState(false);
  const cropDialog = useRef<HTMLDialogElement>(null); const cropImage = useRef<HTMLImageElement>(null);
  const page = pages.find((item) => item.page_index === selectedPage); const fields = Object.entries(document.fields || {});
  const orderedFields = useMemo(() => [...fields].sort(([a], [b]) => {
    const ai = fieldOrder.indexOf(a as typeof fieldOrder[number]), bi = fieldOrder.indexOf(b as typeof fieldOrder[number]);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  }), [document.fields]);
  const groups = useMemo(() => orderedFields.reduce<Record<string, [string, Field][]>>((result, item) => {
    const group = fieldMeta[item[0]]?.[2] || "Khác"; (result[group] ||= []).push(item); return result;
  }, {}), [orderedFields]);

  useEffect(() => onDirty(Boolean(Object.keys(drafts).length)), [drafts, onDirty]);
  useEffect(() => { setImageFailed(false); }, [selectedPage]);
  useEffect(() => { if (cropOpen) cropDialog.current?.showModal(); else cropDialog.current?.close(); }, [cropOpen]);

  function select(name: string, data: Field) {
    setSelectedField(name);
    setSelectedPage(data.page_index);
  }
  function edit(name: string, data: Field, value: string) {
    const old = drafts[name]?.old ?? data.value;
    setDrafts((current) => {
      const next = { ...current };
      if (value === display(old)) delete next[name]; else next[name] = { old, value };
      return next;
    });
    setConflict(false);
  }
  async function save() {
    setSaving(true); onError("");
    try {
      const corrections = Object.entries(drafts).map(([field, draft]) => ({ field, old_value: draft.old, new_value: draft.value }));
      const result = await saveCorrections(jobId, document.id, corrections); setDrafts({}); setConflict(false); onJob(result.job);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "correction_conflict") {
        setConflict(true); try { onJob(await getJob(jobId)); } catch { /* retain the draft */ }
      } else onError(safeError(reason instanceof ApiError ? reason.code || reason.message : reason instanceof Error ? reason.message : String(reason)));
    } finally { setSaving(false); }
  }
  function keepDraft() {
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([name, draft]) => [name, { ...draft, old: document.fields?.[name]?.value }])));
    setConflict(false);
  }
  function pointer(event: PointerEvent<HTMLImageElement>, start: boolean) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
    if (start) { event.currentTarget.setPointerCapture(event.pointerId); setDragStart(point); setRect({ ...point, width: 0, height: 0 }); }
    else if (dragStart) setRect({ x: Math.min(dragStart.x, point.x), y: Math.min(dragStart.y, point.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) });
  }
  function keyMove(event: KeyboardEvent<HTMLDivElement>) {
    if (!rect || !cropImage.current || !event.key.startsWith("Arrow")) return;
    event.preventDefault(); const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0; const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const maxWidth = cropImage.current.clientWidth, maxHeight = cropImage.current.clientHeight;
    setRect(event.shiftKey
      ? { ...rect, width: Math.max(1, Math.min(maxWidth - rect.x, rect.width + dx)), height: Math.max(1, Math.min(maxHeight - rect.y, rect.height + dy)) }
      : { ...rect, x: Math.max(0, Math.min(maxWidth - rect.width, rect.x + dx)), y: Math.max(0, Math.min(maxHeight - rect.height, rect.y + dy)) });
  }
  async function saveCrop() {
    const image = cropImage.current;
    if (!image || !rect || !selectedField || !page) return;
    const payload = { x: Math.round(rect.x * image.naturalWidth / image.clientWidth), y: Math.round(rect.y * image.naturalHeight / image.clientHeight), width: Math.round(rect.width * image.naturalWidth / image.clientWidth), height: Math.round(rect.height * image.naturalHeight / image.clientHeight) };
    if (![payload.x, payload.y, payload.width, payload.height].every(Number.isFinite) || payload.width < 2 || payload.height < 2) return onError(safeError("invalid_crop_rectangle"));
    setSaving(true);
    try { await crop(jobId, document.id, page.page_index, selectedField, payload); onJob(await getJob(jobId)); setCropOpen(false); setRect(null); }
    catch (reason) { onError(safeError(reason instanceof ApiError ? reason.code || reason.message : reason instanceof Error ? reason.message : String(reason))); } finally { setSaving(false); }
  }
  const evidence = [...(document.crop_evidence || [])].filter((item) => !selectedField || item.field === selectedField).reverse();

  if (document.error || document.errors?.length || !fields.length) return <section className="panel document-error"><h2>{document.file_name}</h2><p className="error">{document.error ? safeError(document.error) : document.errors?.map(safeError).join(", ") || text("noFields")}</p><p>{text("rerunRequired")}</p></section>;
  return <>
    <section className="review-grid">
      <div className="panel viewer-panel">
        <div className="workspace-head"><div><p className="eyebrow">{text("document")}</p><h2>{document.file_name}</h2></div><div className="segmented"><button aria-pressed={zoom === "fit"} onClick={() => setZoom("fit")}>{text("fit")}</button><button aria-pressed={zoom === "actual"} onClick={() => setZoom("actual")}>{text("actualSize")}</button></div></div>
        <nav className="page-numbers" aria-label={text("pages")}>{pages.map((item) => <button aria-current={item.page_index === selectedPage ? "page" : undefined} onClick={() => { setSelectedPage(item.page_index); if ((document.fields?.[selectedField]?.page_index ?? item.page_index) !== item.page_index) setSelectedField(""); }} key={item.page_index}>{item.page_index + 1}</button>)}</nav>
        <div className={`page-stage ${zoom}`}>{page && !imageFailed ? <img className="page-image" src={page.image_url} alt={text("pageOf", { page: page.page_index + 1, pages: pages.length })} onError={() => setImageFailed(true)} /> : <div className="artifact-error"><p>{page ? text("imageFailed") : text("pageUnknown")}</p>{page && <><button className="button secondary" onClick={() => setImageFailed(false)}>{text("retry")}</button><a className="button secondary" href={page.image_url} target="_blank" rel="noreferrer">{text("openArtifact")}</a></>}</div>}</div>
      </div>
      <div className="panel editor-panel">
        <div className="workspace-head"><div><p className="eyebrow">{text("fields")}</p><h2>{fieldLabel(selectedField) || text("selectField")}</h2></div>{document.review_status === "approved" && <span className="status completed">{text("approved")}</span>}</div>
        {conflict && <div className="conflict" role="alert"><b>{text("conflict")}</b><div className="conflict-values">{Object.entries(drafts).map(([name, draft]) => <div key={name}><strong>{fieldLabel(name)}</strong><span>{text("serverValue")}: {display(document.fields?.[name]?.value) || text("emptyValue")}</span><span>{text("draftValue")}: {draft.value || text("emptyValue")}</span></div>)}</div><button className="button secondary" onClick={keepDraft}>{text("keepDraft")}</button><button className="button secondary" onClick={() => { setDrafts({}); setConflict(false); }}>{text("useServer")}</button></div>}
        <div className="field-groups">{Object.entries(groups).map(([group, items]) => <section key={group}><h3>{groupLabel(group)}</h3>{items.map(([name, data]) => {
          const editable = terminal && canonical.has(name) && scalar(data.value); const value = drafts[name]?.value ?? display(data.value); const confidence = Number.isFinite(data.confidence) && data.confidence >= 0 && data.confidence <= 1 ? text("confidence", { value: Math.round(data.confidence * 100) }) : text("noConfidence");
          return <div className={`field-card ${selectedField === name ? "selected" : ""}`} key={name} onClick={() => select(name, data)}><label><span><b>{fieldLabel(name)}</b><small>{confidence} · {editable ? "" : text("readOnly")}</small></span>{editable ? fieldMeta[name]?.[3] ? <textarea value={value} onFocus={() => select(name, data)} onChange={(event) => edit(name, data, event.target.value)} /> : <input value={value} onFocus={() => select(name, data)} onChange={(event) => edit(name, data, event.target.value)} /> : <pre>{display(data.value)}</pre>}</label>{data.ocr_value !== undefined && display(data.ocr_value) !== display(data.value) && <div className="field-diff"><small>{text("originalValue")}: {display(data.ocr_value) || text("emptyValue")}</small><small>{text("newValue")}: {display(data.value) || text("emptyValue")}</small></div>}</div>;
        })}</section>)}</div>
        {terminal && <div className="approve-bar"><span>{Object.keys(drafts).length ? text("selectedFiles", { count: Object.keys(drafts).length }) : document.review_status === "approved" && document.approved_at ? text("approvedAt", { date: new Date(document.approved_at).toLocaleString(language()) }) : ""}</span>{!(document.review_status === "approved" && !Object.keys(drafts).length) && <button className="button primary" disabled={saving} onClick={save}>{Object.keys(drafts).length ? text("saveApprove") : text("approve")}</button>}</div>}
        <section className="evidence-section"><div className="workspace-head"><div><p className="eyebrow">{text("cropEvidence")}</p><h3>{selectedField ? fieldLabel(selectedField) : text("selectField")}</h3></div><button className="button secondary" disabled={!terminal || !selectedField || !page || imageFailed} onClick={() => { setRect(null); setCropOpen(true); }}>{text("createCrop")}</button></div>
          {!!evidence.length && <div className="evidence-list">{evidence.map((item) => <a href={item.crop_image} target="_blank" rel="noreferrer" key={`${item.crop_image}-${item.created_at}`}><img src={item.crop_image} alt="" /><span>{fieldLabel(item.field)} · {item.page_index + 1}<small>{new Date(item.created_at).toLocaleString(language())}</small></span></a>)}</div>}
        </section>
      </div>
    </section>
    <dialog ref={cropDialog} className="modal crop-modal" onClose={() => { setCropOpen(false); setRect(null); setDragStart(null); }}>
      <div className="modal-head"><div><p className="eyebrow">{text("cropEvidence")}</p><h2>{fieldLabel(selectedField)}</h2></div><button className="icon-button" aria-label={text("close")} onClick={() => setCropOpen(false)}>×</button></div>
      <p>{text("cropHelp")}</p><div className="crop-canvas"><img ref={cropImage} src={page?.image_url} alt={document.file_name} draggable={false} onPointerDown={(event) => pointer(event, true)} onPointerMove={(event) => pointer(event, false)} onPointerUp={() => setDragStart(null)} />{rect && <div className="crop-rectangle" tabIndex={0} aria-label={text("cropEvidence")} onKeyDown={keyMove} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />}</div>
      <footer className="modal-actions"><button className="button secondary" onClick={() => setRect(null)}>{text("reset")}</button><button className="button secondary" onClick={() => setCropOpen(false)}>{text("close")}</button><button className="button primary" disabled={saving || !rect} onClick={saveCrop}>{text("saveCrop")}</button></footer>
    </dialog>
  </>;
}
