import type { ReactNode } from "react";
import type { LightSection, ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";

export type RoleRow = { roleId: string; kind: ScoredKind; label: string; before: number | null; after: number | null; visited: boolean };

type Props = {
  /** The average score of every scored item (roles, projects, volunteering) when the path started, and now. */
  start: number | null;
  average: number;
  rows: RoleRow[];
  /** "Also": lines the path added under each lighter section (sections with none are left out). */
  also: { section: LightSection; n: number }[];
  achievementsAdded: number;
  skillsAdded: number;
  /** The dark skills bar (5A), on top of whichever screen shows. */
  notice: ReactNode;
  onBack(): void;
  onFindJob(): void;
  /** Below 80: the lowest scored item of any kind, and "Improve the ‹role› role" / "Finish for now". */
  lowest: RoleRow | null;
  onImprove(roleId: string): void;
  onFinish(): void;
};

export const ENRICHED_AVERAGE = 80;

/** 6B: "Your CV is enriched" (average 80 or more), or "Almost there" below it. */
export function EnrichedScreen({ start, average, rows, also, achievementsAdded, skillsAdded, notice, onBack, onFindJob, lowest, onImprove, onFinish }: Props) {
  if (average < ENRICHED_AVERAGE) {
    return (
      <div className="fm-end">
        {notice}
        <p className="fm-eyebrow">{t("enrich.end.almostEyebrow")}</p>
        <h2 className="fm-q is-big" id="fm-step-title">{t("enrich.end.almostTitle")}</h2>
        <p className="fm-done-score">
          <b>{average}</b>
          <span className="fm-eyebrow">{t("enrich.end.almostLine")}</span>
        </p>
        {lowest && lowest.after !== null && <p className="fm-hint">{t("enrich.end.lowest", { role: lowest.label, n: lowest.after })}</p>}
        <div className="fm-foot">
          <button type="button" className="fm-ghost" onClick={onFinish}>{t("enrich.end.finish")}</button>
          {lowest && (
            <button type="button" className="fm-btn" onClick={() => onImprove(lowest.roleId)}>
              {t(lowest.kind === "role" ? "enrich.end.improve" : "enrich.end.improveItem", { role: lowest.label })}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="fm-end">
      {notice}
      <h2 className="fm-q is-big" id="fm-step-title">{t("enrich.end.title")}</h2>
      <p className="fm-end-average">
        {start !== null && start !== average ? t("enrich.end.average", { from: start, to: average }) : t("enrich.end.averageOnly", { n: average })}
      </p>
      <ScoreRows rows={rows.filter((r) => r.kind === "role")} />
      {rows.some((r) => r.kind !== "role") && <p className="fm-eyebrow fm-end-group">{t("enrich.end.other")}</p>}
      <ScoreRows rows={rows.filter((r) => r.kind !== "role")} />
      {(also.length > 0 || achievementsAdded > 0 || skillsAdded > 0) && (
        <>
          <p className="fm-eyebrow fm-end-group">{t("enrich.end.also")}</p>
          <ul className="fm-end-rows">
            {also.map((a) => (
              <li key={a.section}><span>{t(a.n === 1 ? "enrich.end.lineAdded" : "enrich.end.linesAdded", { section: t(`enrich.path.section.${a.section}`), n: a.n })}</span></li>
            ))}
            {achievementsAdded > 0 && <li><span>{t("enrich.end.achievements", { n: achievementsAdded })}</span></li>}
            {skillsAdded > 0 && <li><span>{t("enrich.end.skills", { n: skillsAdded })}</span></li>}
          </ul>
        </>
      )}
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={onBack}>{t("enrich.end.back")}</button>
        <button type="button" className="fm-btn" onClick={onFindJob}>{t("enrich.end.findJob")}</button>
      </div>
    </div>
  );
}

/** One row per scored item: before → after when the path visited it and the score moved, else the score now. */
function ScoreRows({ rows }: { rows: RoleRow[] }) {
  if (!rows.length) return null;
  return (
    <ul className="fm-end-rows">
      {rows.map((r) => (
        <li key={r.roleId}>
          <span>{r.label}</span>
          <span className="fm-end-score">
            {r.visited && r.before !== null && r.after !== null && r.before !== r.after ? `${r.before} → ${r.after}` : (r.after ?? "–")}
          </span>
        </li>
      ))}
    </ul>
  );
}
