"use client";

import { useEffect, useState } from "react";
import { ApiError, confirmSegmentation, continueJob, getJob, Job, Segment } from "../../../lib/api";
import { language } from "../../../lib/i18n";

type Props = { job: Job; onJob: (job: Job) => void; onError: (message: string) => void };
const label = (vi: string, en: string) => language() === "vi" ? vi : en;
const segmentationError = (segments: Segment[], pageCount: number) => {
  let next = 0;
  for (const segment of segments) {
    if (segment.start_page !== next || segment.end_page < segment.start_page) return label("Phân đoạn phải phủ liên tục mọi trang.", "Segments must cover every page without gaps or overlaps.");
    next = segment.end_page + 1;
  }
  if (next !== pageCount) return label("Phân đoạn phải phủ liên tục mọi trang.", "Segments must cover every page without gaps or overlaps.");
  const types = segments.map((segment) => segment.logical_document_type);
  if (types.filter((type) => type === "dossier_cover").length !== 1) return label("Mỗi PDF cần đúng một Bìa.", "Each PDF requires exactly one cover.");
  if (!types.includes("administrative_document")) return label("Mỗi PDF cần ít nhất một văn bản.", "Each PDF requires at least one document.");
  if (types.includes("unclassified")) return label("Hãy phân loại hoặc loại trừ mọi trang.", "Classify or exclude every page.");
  return "";
};

export default function SegmentationReview({ job, onJob, onError }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Segment[]>>({});
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [conflict, setConflict] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDrafts(Object.fromEntries((job.source_pdfs || []).map((source) => [
      source.id, ((source.confirmed_segments || []).length ? source.confirmed_segments! : source.proposal || []).map((segment) => ({ ...segment })),
    ])));
    setRevisions({}); setConflict("");
  }, [job.source_pdfs]);

  const update = (sourceId: string, segments: Segment[]) => setDrafts((value) => ({ ...value, [sourceId]: segments.map((segment, index) => ({ ...segment, id: `segment-${index + 1}` })) }));
  const split = (sourceId: string, segmentIndex: number, page: number) => {
    const segments = [...(drafts[sourceId] || [])], segment = segments[segmentIndex];
    if (!segment || page <= segment.start_page || page > segment.end_page) return;
    segments.splice(segmentIndex, 1, { ...segment, end_page: page - 1 }, { ...segment, start_page: page }); update(sourceId, segments);
  };
  const merge = (sourceId: string, segmentIndex: number) => {
    const segments = [...(drafts[sourceId] || [])]; if (segmentIndex < 1) return;
    segments.splice(segmentIndex - 1, 2, { ...segments[segmentIndex - 1], end_page: segments[segmentIndex].end_page }); update(sourceId, segments);
  };
  const setType = (sourceId: string, segmentIndex: number, logical_document_type: Segment["logical_document_type"]) => {
    const segments = [...(drafts[sourceId] || [])]; segments[segmentIndex] = { ...segments[segmentIndex], logical_document_type }; update(sourceId, segments);
  };
  async function confirm(sourceId: string, revision: number) {
    setBusy(true); onError("");
    try { onJob(await confirmSegmentation(job.id, sourceId, revision, drafts[sourceId] || [])); }
    catch (reason) {
      if (reason instanceof ApiError && reason.code === "segmentation_conflict") setConflict(sourceId);
      else onError(reason instanceof Error ? reason.message : String(reason));
    }
    finally { setBusy(false); }
  }
  async function resolveConflict(sourceId: string, keepDraft: boolean) {
    setBusy(true); onError("");
    try {
      const latest = await getJob(job.id), source = latest.source_pdfs?.find((item) => item.id === sourceId);
      if (keepDraft && source && !source.confirmed) { setRevisions((value) => ({ ...value, [sourceId]: source.revision })); setConflict(""); }
      else onJob(latest);
    } catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  async function resume() {
    setBusy(true); onError("");
    try { onJob(await continueJob(job.id)); } catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  }

  return <section className="panel segmentation-review">
    <div className="section-head"><div><p className="eyebrow">PDF → {label("Bìa → Văn bản", "Cover → Documents")}</p><h2>{label("Xác nhận phân đoạn", "Confirm segmentation")}</h2></div>{job.segmentation_total_pages > 0 && <span>{job.segmentation_completed_pages}/{job.segmentation_total_pages}</span>}</div>
    {(job.source_pdfs || []).map((source) => <article key={`${source.id}-${source.revision}`}>
      <h3>{source.file_name}</h3>
      <div className="source-pages">{(source.pages || []).map((page) => <a href={page.image_url} target="_blank" rel="noreferrer" key={page.source_page_index}><img src={page.image_url} alt={`${source.file_name} · ${page.source_page_index + 1}`} /><small>{page.source_page_index + 1} · {page.classification}</small></a>)}</div>
      <div className="segment-list">{(drafts[source.id] || []).map((segment, index) => <div key={segment.id || index}>
        <b>{segment.start_page + 1}–{segment.end_page + 1}</b>
        <select aria-label={label("Loại phân đoạn", "Segment type")} value={segment.logical_document_type} disabled={busy || source.confirmed} onChange={(event) => setType(source.id, index, event.target.value as Segment["logical_document_type"])}>
          <option value="dossier_cover">{label("Bìa", "Cover")}</option><option value="administrative_document">{label("Văn bản", "Document")}</option><option value="excluded">{label("Loại trừ", "Excluded")}</option><option value="unclassified">{label("Chưa phân loại", "Unclassified")}</option>
        </select>
        {segment.start_page > 0 && <button className="text-button" disabled={busy || source.confirmed} onClick={() => merge(source.id, index)}>{label("Gộp phần trước", "Merge previous")}</button>}
        {segment.end_page > segment.start_page && <select aria-label={label("Tách trước trang", "Split before page")} value="" disabled={busy || source.confirmed} onChange={(event) => split(source.id, index, Number(event.target.value))}>
          <option value="" disabled>{label("Tách trước trang…", "Split before page…")}</option>
          {Array.from({ length: segment.end_page - segment.start_page }, (_, offset) => segment.start_page + offset + 1).map((page) => <option value={page} key={page}>{page + 1}</option>)}
        </select>}
      </div>)}</div>
      {conflict === source.id && <div className="conflict" role="alert"><p>{label("PDF đã được cập nhật ở nơi khác.", "This PDF was updated elsewhere.")}</p><button className="button secondary" disabled={busy} onClick={() => resolveConflict(source.id, true)}>{label("Giữ bản nháp", "Keep draft")}</button><button className="button secondary" disabled={busy} onClick={() => resolveConflict(source.id, false)}>{label("Tải lại và bỏ bản nháp", "Reload and discard")}</button></div>}
      {!source.confirmed && segmentationError(drafts[source.id] || [], source.page_count) && <small className="error" role="alert">{segmentationError(drafts[source.id] || [], source.page_count)}</small>}
      {!source.confirmed && <button className="button primary" disabled={busy || Boolean(segmentationError(drafts[source.id] || [], source.page_count))} onClick={() => confirm(source.id, revisions[source.id] ?? source.revision)}>{label("Xác nhận PDF này", "Confirm this PDF")}</button>}
      {source.confirmed && <span className="status completed">{label("Đã xác nhận", "Confirmed")}</span>}
    </article>)}
    {job.status === "segmentation_confirmed" && <button className="button primary" disabled={busy} onClick={resume}>{label("Tiếp tục trích xuất", "Continue extraction")}</button>}
  </section>;
}
