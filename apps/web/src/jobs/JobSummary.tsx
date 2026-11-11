import { useId, useState, type ReactNode } from "react";
import type { JobExtraction } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { JobAd } from "./JobAd.tsx";

const FIRST_DUTIES = 3;

function count(n: number, one: Parameters<typeof t>[0], many: Parameters<typeof t>[0]): string {
  return t(n === 1 ? one : many, { n });
}

/** 7A, below the requirements: duties, benefits, and what was read from the ad with the full ad behind a toggle. */
export function JobSummary({ extracted, rawText, salaryStated, keywords }: {
  extracted: JobExtraction; rawText: string | null; salaryStated: boolean;
  /** The ATS keywords, shown between the duties and the benefits. */
  keywords?: ReactNode;
}) {
  const dutiesId = useId();
  const adId = useId();
  const [allDuties, setAllDuties] = useState(false);
  const [showAd, setShowAd] = useState(false);
  const duties = extracted.responsibilities;
  const hidden = allDuties ? 0 : Math.max(0, duties.length - FIRST_DUTIES);
  return <>
    {duties.length > 0 && <section className="sec">
      <h2 id={dutiesId}>{t("job.duties.title", { n: duties.length })}</h2>
      <ul aria-labelledby={dutiesId}>{duties.slice(0, duties.length - hidden).map((text, index) => <li key={index}>{text}</li>)}</ul>
      {hidden > 0 && <button type="button" className="link" onClick={() => setAllDuties(true)}>{t("job.duties.more", { n: hidden })}</button>}
    </section>}
    {keywords}
    {extracted.benefits.length > 0 && <section className="sec">
      <h2>{t("job.benefits.title", { n: extracted.benefits.length })}</h2>
      <ul className="job-kw job-kw--plain">{extracted.benefits.map((text, index) => <li key={index}>{text}</li>)}</ul>
    </section>}
    <div className="job-read">
      <p className="jobs-note">{t("job.read.line", {
        requirements: count(extracted.requirements.length, "job.read.requirement", "job.read.requirements"),
        duties: count(duties.length, "job.read.duty", "job.read.duties"),
        benefits: count(extracted.benefits.length, "job.read.benefit", "job.read.benefits"),
        salary: t(salaryStated ? "job.read.salaryStated" : "job.read.salaryNotStated"),
      })}</p>
      <button type="button" className="link" aria-expanded={showAd} aria-controls={adId}
        onClick={() => setShowAd(!showAd)}>{t(showAd ? "job.ad.hide" : "job.ad.show")}</button>
    </div>
    {showAd && <div id={adId} className="job-ad"><JobAd rawText={rawText} requirements={extracted.requirements} /></div>}
  </>;
}
