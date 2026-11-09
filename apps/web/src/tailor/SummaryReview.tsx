import { Fragment, useState, type ReactNode } from "react";
import { placeGuesses, type GuessChoice, type Proposal } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { diffWords } from "./diff-words.ts";
import type { AcceptBody } from "./tailor-api.ts";

type Props = {
  /** The summary step's proposals: at most one, the summary. */
  proposals: Proposal[];
  /** The Base summary the new one is compared with. */
  before: string;
  busy: boolean;
  onAccept(body: AcceptBody): void;
  removed?: number;
};
type Span = ReturnType<typeof placeGuesses>[number];

/** The new summary as in the CV: new words green, each guess marigold (struck through once removed, or as edited). */
function Paragraph({ before, text, spans, choices }: { before: string; text: string; spans: Span[]; choices: Record<number, GuessChoice> }) {
  let at = 0;
  const segments = diffWords(before, text).map((segment) => ({ ...segment, start: at, end: (at += segment.text.length) }));
  const plain = (from: number, to: number) => segments.filter((s) => s.end > from && s.start < to).map((s) => {
    const piece = text.slice(Math.max(s.start, from), Math.min(s.end, to));
    return s.changed ? <mark key={`n${s.start}-${from}`} className="tailor-new">{piece}</mark> : <Fragment key={`p${s.start}-${from}`}>{piece}</Fragment>;
  });
  const out: ReactNode[] = [];
  let pos = 0;
  spans.forEach((span, i) => {
    out.push(...plain(pos, span.start));
    const choice = choices[i];
    out.push(choice && !choice.keep ? <del key={`g${i}`} className="tailor-guess">{span.text}</del>
      : <mark key={`g${i}`} className="tailor-guess">{choice?.text ?? span.text}</mark>);
    pos = span.end;
  });
  out.push(...plain(pos, text.length));
  return <p>{out}</p>;
}

/** One guess: its phrase, why the AI guessed it, and Keep / Edit / Remove. */
function GuessItem({ span, choice, onChoose }: { span: Span; choice?: GuessChoice; onChoose(choice: GuessChoice): void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(choice?.text ?? span.text);
  const named = { text: span.text };
  return <li className="tailor-guess-item">
    <p><q>{choice?.text ?? span.text}</q></p>
    <p className="tailor-reason">{t("tailor.summaryReview.guessLine", { reason: span.reason.replace(/[.\s]+$/, "") })}</p>
    {editing ? <form className="tailor-item-actions" onSubmit={(event) => {
      event.preventDefault();
      onChoose({ keep: true, text: draft.trim() });
      setEditing(false);
    }}>
      <input aria-label={t("tailor.summaryReview.editLabel", named)} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" className="secondary" disabled={!draft.trim()}>{t("tailor.summaryReview.save")}</button>
    </form> : <span className="tailor-item-actions">
      <button type="button" className="secondary" aria-pressed={choice?.keep === true && choice.text === undefined}
        aria-label={t("tailor.summaryReview.keepNamed", named)} onClick={() => onChoose({ keep: true })}>{t("tailor.review.keep")}</button>
      <button type="button" className="secondary" aria-pressed={choice?.text !== undefined}
        aria-label={t("tailor.summaryReview.editNamed", named)} onClick={() => setEditing(true)}>{t("tailor.summaryReview.edit")}</button>
      <button type="button" className="secondary" aria-pressed={choice?.keep === false}
        aria-label={t("tailor.review.removeNamed", named)} onClick={() => onChoose({ keep: false })}>{t("tailor.review.remove")}</button>
    </span>}
  </li>;
}

/**
 * SumA: the new summary in place. Each AI-guessed phrase is its own item with Keep / Edit / Remove;
 * an unanswered guess is sent as neither, so it stays kept and unreviewed. "Use my original summary" reverts it all.
 */
export function SummaryReview({ proposals, before, busy, onAccept, removed = 0 }: Props) {
  const [choices, setChoices] = useState<Record<number, GuessChoice>>({});
  const proposal = proposals.find((p) => p.itemId === "summary" && p.flags.length === 0);
  const spans = proposal ? placeGuesses(proposal.text, proposal.guesses ?? []) : [];

  function use() {
    if (!proposal) return onAccept({ decisions: [], inferred: [], flags: [] });
    const inferred = Object.entries(choices).sort(([a], [b]) => Number(a) - Number(b))
      .map(([i, choice]) => ({ itemId: `summary#${i}`, ...choice }));
    onAccept({ decisions: [{ itemId: "summary", keep: true }], inferred, flags: [] });
  }

  return <section className="tailor-card" aria-labelledby="tailor-summary-title">
    <h2 id="tailor-summary-title">{t("tailor.summaryReview.title")}</h2>
    {proposal ? <>
      <div className="tailor-doc"><Paragraph before={before} text={proposal.text} spans={spans} choices={choices} /></div>
      {spans.length > 0 && <ul className="tailor-items">
        {spans.map((span, i) => <GuessItem key={i} span={span} choice={choices[i]}
          onChoose={(choice) => setChoices((state) => ({ ...state, [i]: choice }))} />)}
      </ul>}
    </> : <p>{t("tailor.summaryReview.nothing")}</p>}
    {removed > 0 && <p className="tailor-reason">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
    <div className="fm-foot">
      {proposal && <button type="button" className="fm-ghost" disabled={busy}
        onClick={() => onAccept({ decisions: [{ itemId: "summary", keep: false }], inferred: [], flags: [] })}>{t("tailor.summaryReview.original")}</button>}
      <button type="button" className="fm-btn" disabled={busy} onClick={use}>
        {t(busy ? "tailor.review.saving" : proposal ? "tailor.summaryReview.use" : "tailor.roleReview.continue")}</button>
    </div>
  </section>;
}
