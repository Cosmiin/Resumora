import { useState } from "react";
import { MAX_TEXT, gradedItems, type Change, type CvContent, type HeldAsk } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { AnswerBox, withoutOpenBlanks, type Via } from "./AnswerBox.tsx";
import { RoleChecklist } from "./Checklist.tsx";
import { averageScore, strengthWeights } from "./EnrichPath.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

/** A held change and, when the grading had one, the question that would bring its line to the top grade (score/12). */
export type HeldChange = { roleId: string; change: Change; ask?: HeldAsk };

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
  /** Saves the answer to the held line's question, then adds the line with that fact. Rejects when it could not. */
  onAddWithFact?(roleId: string, change: Change, ask: HeldAsk, answer: string, via: Via[]): Promise<void>;
  onDone(): void;
  onMore?(): void;
  /** How many questions "more" would ask. */
  more?: number;
};

const scoreOf = (s: RoleScoreState | undefined) => (s && s.state !== "none" ? (s.result?.score ?? null) : null);
const textOf = (change: Change) => ("text" in change ? change.text : "");

/**
 * One change held back because it would lower its role's score: its line, Add anyway, or Edit it first then Add. With a
 * question (score/12) it is one fact away: the question and its options, Add with this fact, Add as it is, Edit it first.
 */
function HeldRow({ name, change, ask, onAdd, onAddWithFact }: {
  name: string; change: Change; ask?: HeldAsk; onAdd(change: Change): void; onAddWithFact?(ask: HeldAsk, answer: string, via: Via[]): Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(textOf(change));
  const [answer, setAnswer] = useState("");
  const [via, setVia] = useState<Via[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState(false);
  const ok = text.trim() !== "" && text.trim().length <= MAX_TEXT;
  const asking = !!ask && !!onAddWithFact && !editing;
  const fact = ask ? withoutOpenBlanks(answer, ask.options) : "";
  const addWithFact = async () => {
    if (!ask || !onAddWithFact || fact === "") return;
    setBusy(true);
    setError(false);
    try {
      await onAddWithFact(ask, fact, via);
    } catch {
      setError(true);
      setBusy(false);
    }
  };
  return (
    <li className="es-held">
      <p className="es-held-why">{t(asking ? "enrich.path.end.oneFact" : "enrich.path.end.held", { role: name })}</p>
      {editing ? (
        <textarea className="ep-input" rows={2} maxLength={MAX_TEXT} value={text} aria-label={t("enrich.path.end.editLabel")}
          onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="es-held-line">{textOf(change)}</p>
      )}
      {asking && (
        <div className="es-held-ask">
          <p className="es-held-q">{ask.text}</p>
          <AnswerBox question={{ bulletId: ask.changeId, text: ask.text, kind: "detail", options: ask.options, ...(ask.amounts ? { amounts: ask.amounts } : {}) }}
            value={answer} via={via} readOnly={busy} onBusyChange={setVoiceBusy} label={ask.text}
            onChange={(v, how) => { setAnswer(v); setVia(how); }} />
          {error && <p className="ui-notice ui-notice--bad" role="alert">{t("enrich.path.end.addFailed")}</p>}
        </div>
      )}
      <div className="sh-actions">
        {asking && (
          <button type="button" className="ui-btn ui-btn--primary" disabled={busy || voiceBusy || fact === ""} onClick={() => void addWithFact()}>
            {t("enrich.path.end.addWithFact")}
          </button>
        )}
        {editing ? (
          <button type="button" className="ui-btn" disabled={!ok} onClick={() => onAdd({ ...change, text: text.trim() } as Change)}>{t("enrich.path.end.add")}</button>
        ) : (
          <>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => onAdd(change)}>{t(asking ? "enrich.path.end.addAsIs" : "enrich.path.end.addAnyway")}</button>
            <button type="button" className="ui-btn" disabled={busy} onClick={() => setEditing(true)}>{t("enrich.path.end.editFirst")}</button>
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
export function EndStep({ cv, scores, before, rolesBefore, held, failed, onAdd, onAddWithFact, onDone, onMore, more }: Props) {
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
          {held.map((h) => <HeldRow key={`${h.roleId}|${h.change.id}`} name={nameOf(h.roleId)} change={h.change} ask={h.ask} onAdd={(c) => onAdd(h.roleId, c)}
            onAddWithFact={onAddWithFact && ((ask, answer, via) => onAddWithFact(h.roleId, h.change, ask, answer, via))} />)}
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
