"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import AppShell from "../app-shell";
import { guideHelp, guideImages, guideSections, referenceGroups } from "./content";
import { useLanguage } from "../../lib/i18n";

const labels = {
  vi: { toc: "Mục lục", plain: "Hiểu đơn giản", note: "Lưu ý", meaning: "Ý nghĩa", when: "Khi cần quan tâm", values: "Giá trị và tác động", example: "Ví dụ", caution: "Cẩn trọng", reference: "Tra cứu tham số" },
  en: { toc: "Contents", plain: "In plain language", note: "Note", meaning: "Meaning", when: "When it matters", values: "Values and impact", example: "Example", caution: "Caution", reference: "Parameter reference" },
};

export function GuideFrame({ reference = false, children }: { reference?: boolean; children: ReactNode }) {
  const [locale] = useLanguage();
  const items = reference ? referenceGroups : guideSections;
  const l = labels[locale];
  const sectionIds = items.map((item) => item.id);
  const [activeId, setActiveId] = useState(sectionIds[0]);
  useEffect(() => {
    const update = () => {
      const hashTarget = document.getElementById(location.hash.slice(1));
      const hashSection = hashTarget?.closest<HTMLElement>(".guide-section")?.id;
      let current = hashSection && sectionIds.includes(hashSection) ? hashSection : sectionIds[0];
      const readingLine = Math.min(innerHeight * .35, 320);
      for (const id of sectionIds) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= readingLine) current = id;
      }
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) current = sectionIds.at(-1)!;
      setActiveId(current);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("hashchange", update);
    return () => { removeEventListener("scroll", update); removeEventListener("hashchange", update); };
  }, [reference]);
  return <AppShell>
    <header className="guide-hero">
      <p className="eyebrow">INTELLIDOC OCR</p>
      <h1>{reference ? l.reference : locale === "vi" ? "Hướng dẫn sử dụng" : "User guide"}</h1>
      <p>{reference
        ? locale === "vi" ? "Ý nghĩa, giá trị và tác động của mọi tham số người dùng cần thao tác." : "Meaning, values, and impact of every user-facing parameter."
        : locale === "vi" ? "Từ PDF đầu tiên đến khi rà soát và duyệt kết quả." : "From your first PDF to a reviewed and approved result."}</p>
      {!reference && <div className="guide-actions"><Link href="/guide/reference">{l.reference} →</Link></div>}
      {reference && <Link className="back-link" href="/guide">← {locale === "vi" ? "Quay lại hướng dẫn" : "Back to the guide"}</Link>}
      <small>{locale === "vi" ? "Dành cho người dùng nghiệp vụ; không phải hướng dẫn cài đặt hệ thống." : "For operations users; this is not a system installation guide."}</small>
    </header>
    <details className="guide-mobile-toc"><summary>{l.toc}</summary><GuideToc items={items} locale={locale} activeId={activeId} onSelect={setActiveId} /></details>
    <div className="guide-layout">
      <aside className="guide-toc"><GuideToc items={items} locale={locale} activeId={activeId} onSelect={setActiveId} /></aside>
      <article className="guide-content">{children}</article>
    </div>
  </AppShell>;
}

function GuideToc({ items, locale, activeId, onSelect }: { items: { id: string; title: Record<"vi" | "en", string> }[]; locale: "vi" | "en"; activeId: string; onSelect: (id: string) => void }) {
  return <nav aria-label={labels[locale].toc}><b>{labels[locale].toc}</b>{items.map((item) => <a className={activeId === item.id ? "active" : ""} aria-current={activeId === item.id ? "location" : undefined} key={item.id} href={`#${item.id}`} onClick={() => onSelect(item.id)}>{item.title[locale]}</a>)}</nav>;
}

export function GuideBody() {
  const [locale] = useLanguage();
  const l = labels[locale];
  const imageBySection = new Map<string, (typeof guideImages)[number]>(guideImages.map((image) => [image.section, image]));
  return <>{guideSections.map((section) => {
    const image = imageBySection.get(section.id);
    const help = guideHelp[section.id];
    return <section className="guide-section" id={section.id} tabIndex={-1} key={section.id}>
      <h2>{section.title[locale]}</h2><p>{section.summary[locale]}</p>
      <div className="guide-plain"><b>{l.plain}</b><p>{help.plain[locale]}</p></div>
      <ol>{section.steps.map((step, index) => <li key={index}>{step[locale]}</li>)}</ol>
      <div className="guide-example"><b>{l.example}</b><p>{help.example[locale]}</p></div>
      {section.note && <p className="guide-callout"><b>{l.note}:</b> {section.note[locale]}</p>}
      {image && <figure><Image src={`/guide/${image.file}`} width={1200} height={750} alt={image.alt[locale]} /><figcaption>{image.caption[locale]}</figcaption></figure>}
      {["choose-mode", "job-status", "review-approve", "results"].includes(section.id) && <Link href={`/guide/reference#${section.id === "choose-mode" ? "processing" : section.id === "job-status" ? "job" : section.id === "review-approve" ? "review" : "reports-artifacts"}`}>{l.reference} →</Link>}
    </section>;
  })}
  <details className="guide-tips"><summary>{locale === "vi" ? "Mẹo thao tác trên trình duyệt" : "Browser tips"}</summary><ul><li>{locale === "vi" ? "Dùng Ctrl+F để tìm thuật ngữ và Back để quay lại màn hình công việc." : "Use Ctrl+F to find a term and Back to return to your workflow."}</li><li>{locale === "vi" ? "Tab/Shift+Tab di chuyển focus; Enter/Space mở details và kích hoạt nút." : "Tab/Shift+Tab moves focus; Enter/Space opens details and activates buttons."}</li><li>{locale === "vi" ? "Không reload khi đang nhập correction chưa lưu." : "Do not reload while editing an unsaved correction."}</li></ul></details>
  </>;
}

export function ReferenceBody() {
  const [locale] = useLanguage();
  const l = labels[locale];
  return <>{referenceGroups.map((group) => <section className="guide-section reference-group" id={group.id} tabIndex={-1} key={group.id}>
    <h2>{group.title[locale]}</h2>
    {group.entries.map((item) => <article className="reference-entry" id={item.id} tabIndex={-1} key={item.id}><h3>{item.name[locale]}</h3><dl>
      <div><dt>{l.meaning}</dt><dd>{item.meaning[locale]}</dd></div>
      <div><dt>{l.when}</dt><dd>{item.when[locale]}</dd></div>
      <div><dt>{l.values}</dt><dd>{item.values[locale]}</dd></div>
      <div><dt>{l.example}</dt><dd>{item.example[locale]}</dd></div>
      <div className="reference-caution"><dt>{l.caution}</dt><dd>{item.caution[locale]}</dd></div>
    </dl></article>)}
  </section>)}</>;
}
