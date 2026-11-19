import { useState } from "react";
import { MAX_TEXT, gradedItems, type Change, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { RoleChecklist } from "./Checklist.tsx";
import { averageScore, strengthWeights } from "./EnrichPath.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

export type HeldChange = { roleId: string; change: Change };

type Props = {
  cv: CvContent;
  scores: ReadonlyMap<string, RoleScoreState>;
  /** The CV's score before this round. */
  before: number | null;
  /** Each role's score before this round. */
  rolesBefore?: ReadonlyMap<string, number | null>;
  held: HeldChange[];
  failed: boolean;
  onAdd(roleId: string, change: Change): void;
  onDone(): void;
  onMore?(): void;
  /** How many questions "more" would ask. */
  more?: number;
};

const scoreOf = (s: RoleScoreState | undefined) => (s && s.state !== "none" ? (s.result?.score ?? null) : null);
const textOf = (change: Change) => ("text" in change ? change.text : "");

/** One change held back because it would lower its role's score: its line, Add anyway, or Edit it first then Add. */
function HeldRow({ name, change, onAdd }: { name: string; change: Change; onAdd(change: Change): void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(textOf(change));
  const ok = text.trim() !== "" && text.trim().length <= MAX_TEXT;
  return (
    <li className="es-held">
      <p className="es-held-why">{t("enrich.path.end.held", { role: name })}</p>
      {editing ? (
        <textarea className="ep-input" rows={2} maxLength={MAX_TEXT} value={text} aria-label={t("enrich.path.end.editLabel")}
          onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="es-held-line">{textOf(change)}</p>
      )}
      <div className="sh-actions">
        {editing ? (
          <button type="button" className="ui-btn" disabled={!ok} onClick={() => onAdd({ ...change, text: text.trim() } as Change)}>{t("enrich.path.end.add")}</button>
        ) : (
          <>
            <button type="button" className="ui-btn" onClick={() => onAdd(change)}>{t("enrich.path.end.addAnyway")}</button>
            <button type="button" className="ui-btn" onClick={() => setEditing(true)}>{t("enrich.path.end.editFirst")}</button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The end of the path (score/9): the CV's score before and after, each role's with its checklist ticks, the changes held
 * back because they would lower a role's score (Add anyway / Edit it first), and Done or another round of questions.
 */
export function EndStep({ cv, scores, before, rolesBefore, held, failed, onAdd, onDone, onMore, more }: Props) {
  const graded = gradedItems(cv);
  const average = averageScore(new Map(graded.map(({ item }) => [item.id, scoreOf(scores.get(item.id))])), strengthWeights(cv));
  const nameOf = (roleId: string) => graded.find(({ item }) => item.id === roleId)?.item.title || t("enrich.path.end.thisRole");
  return (
    <div className="rr-card">
      <p className="rr-where">{t("enrich.path.dialog")}</p>
      <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>
        {before !== null && average !== null && before !== average ? t("enrich.path.v2.moved", { from: before, to: average })
          : average === null ? t("enrich.path.v2.noScore") : t("enrich.path.v2.score", { n: average })}
      </h2>
      {failed && <p className="ui-notice ui-notice--bad" role="alert">{t("enrich.path.v2.someFailed")}</p>}
      <div className="ep-rows">
        {graded.map(({ item }) => {
          const s = scores.get(item.id);
          const now = scoreOf(s);
          const was = rolesBefore?.get(item.id) ?? null;
          const titleId = `es-role-${item.id}`;
          return (
            <section key={item.id} className="ep-row" role="group" aria-labelledby={titleId}>
              <h3 className="ep-row-title" id={titleId}>{[item.title, item.company].filter(Boolean).join(" · ")}</h3>
              {now !== null && <p className="es-score">{was !== null && was !== now ? `${was} → ${now}` : String(now)}</p>}
              {s?.state === "ready" && s.result && <RoleChecklist result={s.result} />}
            </section>
          );
        })}
      </div>
      {held.length > 0 && (
        <ul className="es-helds">
          {held.map((h) => <HeldRow key={`${h.roleId}|${h.change.id}`} name={nameOf(h.roleId)} change={h.change} onAdd={(c) => onAdd(h.roleId, c)} />)}
        </ul>
      )}
      <div className="rr-actions">
        <button type="button" className="fm-btn" onClick={onDone}>{t("enrich.path.v2.done")}</button>
        {onMore && more !== undefined && more > 0 && (
          <button type="button" className="ui-btn" onClick={onMore}>{more === 1 ? t("enrich.path.moreOne") : t("enrich.path.more", { n: more })}</button>
        )}
      </div>
    </div>
  );
}
