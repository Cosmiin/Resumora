import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { JobExtraction, MatchScore } from "@resumora/shared";
import { unreviewedItems } from "../export/export-files.ts";
import { t } from "../i18n/t.ts";
import { nameOf } from "./role-done.ts";
import { getTailored } from "./tailored-api.ts";
import { TailorMoment } from "./TailorMoment.tsx";

type Props = { jobId: string; docId: string | null; base: MatchScore | null; final: MatchScore | null; job: JobExtraction | null };

/** The job's requirements whose label went from missing or partial to met, by `ref`. */
export function nowMet(base: MatchScore | null, final: MatchScore | null, job: JobExtraction | null): string[] {
  const was = new Map((base?.labels ?? []).map((label) => [label.ref, label.status]));
  const names: string[] = [];
  for (const label of final?.labels ?? []) {
    const before = was.get(label.ref);
    if (!/^r\d+$/.test(label.ref) || label.status !== "met" || (before !== "missing" && before !== "partial")) continue;
    const name = nameOf(label.ref, job);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The must-haves of the job not met in the final score; null when the job lists none. */
function openMusts(final: MatchScore | null, job: JobExtraction | null): { total: number; open: number } | null {
  const musts = (job?.requirements ?? []).flatMap((requirement, i) => (requirement.kind === "must" ? [`r${i}`] : []));
  if (musts.length === 0) return null;
  const status = new Map((final?.labels ?? []).map((label) => [label.ref, label.status]));
  return { total: musts.length, open: musts.filter((ref) => status.get(ref) !== "met").length };
}

/**
 * DoneA: after the last step. The score counts up from the base to the final score, what is now met,
 * the AI guesses still to check (hidden when none), and the next steps.
 */
export function DoneScreen({ jobId, docId, base, final, job }: Props) {
  const [unchecked, setUnchecked] = useState(0);
  useEffect(() => {
    if (!docId) return;
    let live = true;
    getTailored(docId).then((cv) => { if (live) setUnchecked(unreviewedItems(cv.review).length); }, () => {});
    return () => { live = false; };
  }, [docId]);

  const page = `/jobs/${encodeURIComponent(jobId)}/cv${docId ? `?cv=${encodeURIComponent(docId)}` : ""}`;
  const to = (param: string) => `${page}${docId ? "&" : "?"}${param}`;
  const met = nowMet(base, final, job);
  const musts = openMusts(final, job);

  return <TailorMoment celebrated from={base?.total ?? null} to={final?.total ?? null} title={t("tailor.done.title")}
    line={base?.total != null && final?.total != null ? t("tailor.score.change", { from: base.total, to: final.total }) : null}>
    <div className="tailor-done">
      {met.length > 0 && <>
        <h3 id="tailor-done-met">{t("tailor.done.nowMet")}</h3>
        <ul aria-labelledby="tailor-done-met">{met.map((name) => <li key={name}>✓ {name}</li>)}</ul>
      </>}
      {musts && <p>{musts.open === 0 ? t("tailor.done.allMust", { n: musts.total })
        : t(musts.open === 1 ? "tailor.done.openOne" : "tailor.done.openMany", { n: musts.open })}</p>}
      {unchecked > 0 && <div className="tailor-done-check">
        <p>{t(unchecked === 1 ? "tailor.done.checkOne" : "tailor.done.checkMany", { n: unchecked })}</p>
        <Link className="fm-btn" to={to("review=1")}>{t("tailor.done.review")}</Link>
      </div>}
      <nav aria-label={t("tailor.done.next")} className="tailor-done-next">
        <Link to={page}>{t("tailor.done.view")}</Link>
        <Link to={to("export=1")}>{t("tailor.done.export")}</Link>
        <Link to={to("tab=letter")}>{t("tailor.done.letter")}</Link>
      </nav>
    </div>
  </TailorMoment>;
}
