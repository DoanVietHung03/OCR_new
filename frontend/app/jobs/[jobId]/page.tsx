"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cancelJob, crop, Document, getJob, Job, rerunJob, saveCorrections } from "../../../lib/api";
import { text } from "../../../lib/i18n";

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const [id, setId] = useState(""); const [job, setJob] = useState<Job | null>(null); const [error, setError] = useState(""); const [values, setValues] = useState<Record<string, string>>({}); const [cropUrl, setCropUrl] = useState("");
  useEffect(() => { params.then(({ jobId }) => setId(jobId)); }, [params]);
  useEffect(() => { if (!id) return; const load = () => getJob(id).then(setJob).catch((e) => setError(e.message)); load(); const timer = setInterval(load, 1500); return () => clearInterval(timer); }, [id]);
  if (!job) return <main className="shell"><Link href="/">← {text("jobs")}</Link><p>{error || "Loading..."}</p></main>;
  const doc = (job.documents?.[0] || null) as Document | null;
  async function save() { if (!doc) return; const corrections = Object.entries(values).map(([field, value]) => ({ field, old_value: doc.fields?.[field]?.value || "", new_value: value })); if (corrections.length) setJob((await saveCorrections(id, doc.id, corrections)).job); }
  async function makeCrop() { if (!doc) return; const page = doc.pages?.[0]; if (!page) return; setCropUrl((await crop(id, doc.id, 0, "manual", { x: 0, y: 0, width: 100, height: 100 })).crop_image); }
  return <main className="shell"><Link href="/">← {text("jobs")}</Link><header><div><p className="eyebrow">{job.id}</p><h1>{job.upload_name || "OCR job"}</h1></div><span className={`status ${job.status}`}>{job.status}</span></header><div className="toolbar"><button onClick={() => cancelJob(id).then(setJob)}>{text("cancel")}</button><button onClick={() => rerunJob(id).then(setJob)}>{text("rerun")}</button></div>{error && <p className="error">{error}</p>}{doc ? <section className="card"><h2>{doc.file_name}</h2><p>{doc.status}</p>{doc.pages?.map((page) => <img className="page-preview" key={page.page_index} src={page.image_url} alt={`Page ${page.page_index + 1}`} />)}{Object.entries(doc.fields || {}).map(([field, data]) => <label className="field" key={field}><span>{field} <small>{Math.round(Number(data.confidence || 0) * 100)}%</small></span><input value={values[field] ?? String(data.value || "")} onChange={(e) => setValues({ ...values, [field]: e.target.value })} /></label>)}<div className="toolbar"><button onClick={save}>{text("save")}</button><button onClick={makeCrop}>Tạo crop bằng chứng</button>{cropUrl && <a href={cropUrl} target="_blank">Xem crop</a>}</div></section> : <p>Chưa có kết quả OCR.</p>}</main>;
}
