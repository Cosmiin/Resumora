import type { ReactNode } from "react";
import type { LightSection, ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { PathSteps } from "./PathStart.tsx";

/** visited: the path worked on it. offered: it was on the focus step's list (below 80 when the path started). */
export type RoleRow = { roleId: string; kind: ScoredKind; label: string; before: number | null; after: number | null; visited: boolean; offered: boolean };

type Props = {
  /** CV strength: the average score of every scored item (roles, projects, volunteering) when the path started, and now. */
  start: number | null;
  average: number;
  rows: RoleRow[];
  /** Lines the path added under each lighter section (sections with none are left out). */
  also: { section: LightSection; n: number }[];
  achievementsAdded: number;
  skillsAdded: number;
  /** The skills bar (with Undo), on top of the screen. */
  notice: ReactNode;
  /** The lowest scored item of any kind, and the one thing that would help it most (when its score names one). */
  lowest: (RoleRow & { tip?: { line: string; text: string } }) | null;
  onImprove(roleId: string): void;
  onFinish(): void;
  onFindJob(): void;
};

export const ENRICHED_AVERAGE = 80;

/** The result of the path: CV strength before and after, what moved it, and what would help most next. */
export function EnrichedScreen({ start, average, rows, also, achievementsAdded, skillsAdded, notice, lowest, onImprove, onFinish, onFindJob }: Props) {
  const moved = start !== null && start !== average;
  const more = lowest && lowest.after !== null && lowest.after < 100 ? lowest : null;
  const extras = [
    ...also.map((a) => t(a.n === 1 ? "enrich.end.lineAdded" : "enrich.end.linesAdded", { section: t(`enrich.path.section.${a.section}`), n: a.n })),
    ...(achievementsAdded > 0 ? [t("enrich.end.achievements", { n: achievementsAdded })] : []),
    ...(skillsAdded > 0 ? [t("enrich.end.skills", { n: skillsAdded })] : []),
  ];
  return (
    <div className="fm-end">
      <PathSteps current={3} />
      {notice}
      <h2 className="fm-q is-big" id="fm-step-title" tabIndex={-1}>{t(start !== null && average > start ? "enrich.end.title" : "enrich.end.titleSame")}</h2>
      <p className="fm-lead">{t("enrich.end.line")}</p>
      <div className="fm-result">
        <div>
          <p className="fm-eyebrow">{t("enrich.end.strength")}</p>
          <p className="fm-strength" aria-hidden="true">
            {moved && <><span className="was">{start}</span><span>→</span></>}
            <span>{average}</span>
            <small>{t("enrich.end.of100")}</small>
          </p>
          <p className="visually-hidden">{moved ? t("enrich.end.average", { from: start, to: average }) : t("enrich.end.averageOnly", { n: average })}</p>
        </div>
        <hr />
        <h3>{t("enrich.end.why")}</h3>
        <ul className="fm-reasons">
          {rows.map((r) => <Reason key={r.roleId} row={r} />)}
          {extras.map((text) => <li key={text}><b aria-hidden="true">+</b><span>{text}</span></li>)}
        </ul>
        <hr />
        <h3>{t("enrich.end.next")}</h3>
        {more?.tip ? (
          <p className="fm-next-tip">{t("enrich.end.nextTip", { line: more.tip.line, tip: more.tip.text })}</p>
        ) : more && average < ENRICHED_AVERAGE ? (
          <p className="fm-next-tip">{t("enrich.end.lowest", { role: more.label, n: more.after! })}</p>
        ) : (
          <p className="fm-next-tip">{t("enrich.end.ready")}</p>
        )}
      </div>
      <div className="fm-foot">
        {more && (
          <button type="button" className="ui-btn fm-back" onClick={() => onImprove(more.roleId)}>{t("enrich.end.more")}</button>
        )}
        {average >= ENRICHED_AVERAGE && <button type="button" className="fm-ghost" onClick={onFindJob}>{t("enrich.end.findJob")}</button>}
        <button type="button" className="fm-btn" onClick={onFinish}>{t("enrich.end.back")}</button>
      </div>
    </div>
  );
}

/** One row of "What moved the score": how far the item's score moved, or why it didn't. */
function Reason({ row }: { row: RoleRow }) {
  const delta = row.visited && row.before !== null && row.after !== null ? row.after - row.before : 0;
  if (delta > 0) {
    return (
      <li>
        <b>+{delta}</b>
        <span>{row.label}<small>{t("enrich.end.fromTo", { from: row.before!, to: row.after! })}</small></span>
      </li>
    );
  }
  return (
    <li>
      <b className="is-flat">0</b>
      <span>
        {t(row.visited ? "enrich.end.same" : row.offered ? "enrich.end.notChosen" : "enrich.end.notOffered", { role: row.label })}
        {row.after !== null && <small>{t("enrich.end.at", { n: row.after })}</small>}
      </span>
    </li>
  );
}
