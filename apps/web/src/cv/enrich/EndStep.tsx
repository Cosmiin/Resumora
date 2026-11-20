import { useState } from "react";
import { MAX_TEXT, gradedItems, type Change, type CvContent, type HeldAsk } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { AnswerBox, withoutOpenBlanks, type Via } from "./AnswerBox.tsx";
import { averageScore, roleMeta, strengthWeights } from "./EnrichPath.tsx";
import { ScoreRows, scoreChange } from "./ScoreRows.tsx";
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
 * The end of the path (score/9): the CV's score before and after with its gain, each role as a score row with its
 * change and a before/after bar (owner's pick B, 20 Nov 2026), the changes held
 * back because they would lower a role's score (Add anyway / Edit it first), and Done or another round of questions.
 */
export function EndStep({ cv, scores, before, rolesBefore, held, failed, onAdd, onAddWithFact, onDone, onMore, more }: Props) {
  const graded = gradedItems(cv);
  const average = averageScore(new Map(graded.map(({ item }) => [item.id, scoreOf(scores.get(item.id))])), strengthWeights(cv));
  const moved = before !== null && average !== null && before !== average ? { from: before, to: average } : null;
  const nameOf = (roleId: string) => graded.find(({ item }) => item.id === roleId)?.item.title || t("enrich.path.end.thisRole");
  return (
    <div className="rr-card">
      <p className="rr-where">{t("enrich.path.dialog")}</p>
      <div className="rr-scoreline">
        <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>
          {moved ? t("enrich.path.v2.moved", moved)
            : average === null ? t("enrich.path.v2.noScore") : t("enrich.path.v2.score", { n: average })}
        </h2>
        {moved && <span className={`rr-gain ${moved.to > moved.from ? "is-up" : "is-down"}`}>{scoreChange(moved.from, moved.to)}</span>}
      </div>
      {failed && <p className="ui-notice ui-notice--bad" role="alert">{t("enrich.path.v2.someFailed")}</p>}
      <ScoreRows idPrefix="es-role" rows={graded.map(({ item }) => ({
        id: item.id, title: item.title, meta: roleMeta(item, cv.locale), now: scoreOf(scores.get(item.id)), was: rolesBefore?.get(item.id) ?? null,
      }))} />
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
