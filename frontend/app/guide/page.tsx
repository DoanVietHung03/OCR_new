"use client";

import Link from "next/link";
import { GuideBody, GuideFrame } from "./guide-layout";
import { quickSteps } from "./content";
import { useLanguage } from "../../lib/i18n";

export default function GuidePage() {
  const [locale] = useLanguage();
  return <GuideFrame>
    <section className="guide-quick" aria-labelledby="quick-start-title"><h2 id="quick-start-title">{locale === "vi" ? "Bắt đầu nhanh" : "Quick start"}</h2><div>{quickSteps.map((step, index) => <a href={`#${step.target}`} key={step.target}><strong>{index + 1}</strong><span>{step.label[locale]}</span></a>)}</div></section>
    <div className="guide-cta-row"><Link href="/documents?triage=needs_review">{locale === "vi" ? "Mở hàng đợi rà soát" : "Open review queue"} →</Link><Link href="/?status=active">{locale === "vi" ? "Xem job đang xử lý" : "View active jobs"} →</Link></div>
    <GuideBody />
  </GuideFrame>;
}
