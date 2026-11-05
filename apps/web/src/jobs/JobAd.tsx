import type { JobExtraction } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { markRequirements } from "./marks.ts";

export function JobAd({ rawText, requirements }: { rawText: string | null; requirements: JobExtraction["requirements"] }) {
  return <>
    <p className="jobs-note legend">
      <mark className="must">{t("job.must")}</mark>{" "}
      <mark className="nice">{t("job.nice")}</mark>{" "}{t("job.ad.legend")}
    </p>
    {rawText === null ? <p className="jobs-note">{t("job.ad.missing")}</p> : (
      <p className="doc">{markRequirements(rawText, requirements).map((segment, index) => segment.kind
        ? <mark key={index} className={segment.kind} title={t(segment.kind === "must" ? "job.must" : "job.nice")}>{segment.text}</mark>
        : segment.text)}</p>
    )}
  </>;
}
