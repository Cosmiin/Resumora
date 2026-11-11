import { useState } from "react";
import { CONDITIONAL_PARAMETERS, CORE_PARAMETERS, band, type Experience, type RoleResult, type ScoredKind } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { SCORED_LIST, type RoleList } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { useOpenFocus } from "./focus-context.ts";
import { RUN_MAX, buildRun, questionKey } from "./run.ts";
import { ScoreExplain } from "./ScoreExplain.tsx";
import { issueTip } from "./tips.ts";
import { ScorePillBadge } from "./ScorePill.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  /** Every scored item in CV order: roles, then projects, then volunteering. */
  items: readonly { item: Experience; kind: ScoredKind }[];
  scores: ReadonlyMap<string, RoleScoreState>;
  /** Put the cursor in the item's title, so the panel switches to that item's tools. */
  onOpen(itemId: string, list: RoleList): void;
  /** Contents column: a row opens the role's number, its one next step with a button, and "Understand the score". */
  expandable?: boolean;
  onRetry?(roleId: string): void;
};

function labelOf(s: RoleScoreState): string {
  if (s.state === "none") return t("enrich.pill.noBullets");
  if (s.state === "unavailable" && !s.result) return t("enrich.card.unavailable");
  const n = s.result?.score ?? null;
  return n === null ? "" : t(`enrich.band.${band(n)}`);
}

function nameOf(name: string, s: RoleScoreState): string {
  const n = s.result?.score ?? null;
  if (n !== null && s.state !== "none" && s.state !== "unavailable") return t("enrich.roles.rowLabel", { name, n, band: t(`enrich.band.${band(n)}`) });
  return `${name}, ${labelOf(s) || t("enrich.pill.scoring")}`;
}

/**
 * The one next step of a role: the first thing a recruiter looks for that the page does not show, then one that may
 * apply, then the score's own tip. Null when there is nothing to add.
 */
export function nextStepOf(result: RoleResult): string | null {
  const marks = result.coverage?.marks;
  const missing = marks && (CORE_PARAMETERS.find((p) => marks[p] !== "shown") ?? CONDITIONAL_PARAMETERS.find((p) => marks[p] === "applies" || marks[p] === "unknown"));
  if (missing) return t(`enrich.next.${missing}`);
  return result.nextStep ? issueTip(result.nextStep.issue, result.nextStep.tip) : null;
}

/** A role's score, clicked: the number, one next step with its button, and the way to the score's explanation. */
function RoleNext({ role, name, state, onAnswer, onRetry }: { role: Experience; name: string; state: RoleScoreState; onAnswer(): void; onRetry(): void }) {
  const [explain, setExplain] = useState(false);
  const result = state.result;
  const n = result?.score ?? null;
  if (state.state === "unavailable" && (!result || n === null)) {
    return (
      <p className="role-next">
        {t("enrich.card.unavailable")} <button type="button" className="ui-btn ui-btn--sm" onClick={onRetry}>{t("enrich.card.tryAgain")}</button>
      </p>
    );
  }
  if (state.state === "none" || !result || n === null) {
    return (
      <>
        <p className="role-next">{t(state.state === "none" ? "enrich.pill.noBullets" : "enrich.card.scoring")}</p>
        {state.state === "none" && <button type="button" className="ui-btn ui-btn--primary ui-btn--sm role-answer" onClick={onAnswer}>{t("enrich.card.improve")}</button>}
      </>
    );
  }
  const next = nextStepOf(result);
  const answered = new Set(role.notes.map((note) => questionKey(note.question)));
  const questions = Math.min(RUN_MAX, buildRun(result, { thin: role.bullets.length <= 1 || result.thin, answered }).length);
  return (
    <>
      <p className="role-num"><b>{n}</b> <span>{name}</span></p>
      {state.state !== "ready" && <p className="fine">{t("enrich.card.previous")}</p>}
      {state.state === "unavailable" && <button type="button" className="ui-btn ui-btn--sm role-answer" onClick={onRetry}>{t("enrich.card.tryAgain")}</button>}
      <p className="role-next">{next !== null ? t("enrich.next.line", { step: next }) : t(n < 100 ? "enrich.next.more" : "enrich.next.none")}</p>
      <div className="role-acts">
        {(questions > 0 || next !== null || n < 100) && (
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={onAnswer}>
            {questions === 0 ? t("enrich.card.improve") : t(questions === 1 ? "enrich.next.answerOne" : "enrich.next.answer", { n: questions })}
          </button>
        )}
        <button type="button" className="role-goto" onClick={() => setExplain(true)}>{t("enrich.explain.open")}</button>
      </div>
      <ScoreExplain open={explain} onClose={() => setExplain(false)} name={name} role={role} result={result} />
    </>
  );
}

function Rows({ items, scores, onOpen, expandable, onRetry }: Props) {
  const openFocus = useOpenFocus();
  const [openId, setOpenId] = useState<string | null>(null);
  // Without focus mode (a tailored CV) there is nothing to act on: the row moves the cursor, as before.
  const inline = expandable === true && openFocus !== null;
  return (
    <ul className="role-scores">
      {items.map(({ item, kind }) => {
        const state = scores.get(item.id) ?? { state: "scoring" as const };
        const list = SCORED_LIST[kind];
        const name = roleName(item, list);
        const open = inline && openId === item.id;
        return (
          <li key={item.id}>
            <button type="button" className="role-open" aria-label={nameOf(name, state)} aria-expanded={inline ? open : undefined}
              onClick={() => (inline ? setOpenId(open ? null : item.id) : onOpen(item.id, list))}>
              <ScorePillBadge state={state} />
              <span className="rname">{name}</span>
              <span className="rband">{labelOf(state)}</span>
            </button>
            {open && openFocus && (
              <div className="role-why">
                <RoleNext role={item} name={name} state={state} onAnswer={() => openFocus({ roleId: item.id, mode: "improve" })} onRetry={() => onRetry?.(item.id)} />
                <button type="button" className="role-goto" onClick={() => onOpen(item.id, list)}>{t("cv.roles.goTo")}</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Your roles", then "Projects and volunteering", in the panel overview: one row per item, in CV order. */
export function RoleScoreList({ items, scores, onOpen, expandable, onRetry }: Props) {
  if (items.length === 0) return null;
  const roles = items.filter((i) => i.kind === "role");
  const others = items.filter((i) => i.kind !== "role");
  const explain = <p className="role-explain">{t("cv.roles.explain")}</p>;
  return (
    <div>
      {roles.length > 0 && <p className="p-sub">{t("enrich.roles.title")}</p>}
      {roles.length > 0 && explain}
      {roles.length > 0 && <Rows items={roles} scores={scores} onOpen={onOpen} expandable={expandable} onRetry={onRetry} />}
      {others.length > 0 && <p className="p-sub">{t("enrich.roles.other")}</p>}
      {roles.length === 0 && explain}
      {others.length > 0 && <Rows items={others} scores={scores} onOpen={onOpen} expandable={expandable} onRetry={onRetry} />}
    </div>
  );
}
