import type { JobExtraction } from "@resumora/shared";
import { t } from "../i18n/t.ts";

export function JobSummary({ extracted }: { extracted: JobExtraction }) {
  return <>
    <section className="sec">
      <h3>{t("job.summary")}</h3><p>{extracted.summary}</p>
    </section>
    <section className="sec">
      <h3>{t("job.requirements")}</h3>
      <div className="reqs">
        {(["must", "nice"] as const).map((kind) => {
          const items = extracted.requirements.filter((requirement) => requirement.kind === kind);
          return <div className={`req-group ${kind}`} key={kind}>
            <h4>{t(kind === "must" ? "job.mustCount" : "job.niceCount", { n: items.length })}</h4>
            {items.length ? <ul>{items.map((requirement, index) => <li key={index}>
              {requirement.text}<small className="cat">{t(`job.category.${requirement.category}`)}</small>
            </li>)}</ul> : <p className="jobs-note">{t("job.none")}</p>}
          </div>;
        })}
      </div>
    </section>
    <section className="sec">
      <h3>{t("job.responsibilities")}</h3>
      <ul>{extracted.responsibilities.map((text, index) => <li key={index}>{text}</li>)}</ul>
    </section>
    {extracted.benefits.length > 0 && <section className="sec">
      <h3>{t("job.benefits")}</h3>
      <ul>{extracted.benefits.map((text, index) => <li key={index}>{text}</li>)}</ul>
    </section>}
  </>;
}
