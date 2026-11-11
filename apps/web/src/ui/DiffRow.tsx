import { Check } from "lucide-react";
import { useId, useState } from "react";
import { placeGuesses } from "@resumora/shared";
import { useT } from "../i18n/t.ts";
import { diffWords } from "../tailor/diff-words.ts";
import { CoachNote } from "./Card.tsx";

export type DiffDecision = { choice: "keep" } | { choice: "new"; text: string };

type Props = {
  /** The bullet as it is on the CV now. */
  oldText: string;
  /** The suggested bullet. `null` means there is no real improvement: the row only says so. */
  newText: string | null;
  /** One line on why the suggestion helps, in the interface language. */
  reason?: string;
  /** The suggestion contains a fact that is not written on the CV; the person must confirm it. */
  inferred?: boolean;
  /** The guessed phrases of the suggestion, each with what was assumed and why. Without them the row says only that part is a guess. */
  guesses?: { text: string; reason: string }[];
  /** Language of the CV text, so screen readers pronounce it correctly. */
  textLang: string;
  decision: DiffDecision | null;
  onDecide: (decision: DiffDecision | null) => void;
};

/** The new line in pieces: which words are new, and which belong to a guess. */
function pieces(oldText: string, text: string, guesses: { text: string; reason: string }[]) {
  const spans = placeGuesses(text, guesses);
  const out: { text: string; changed: boolean; guess: boolean }[] = [];
  let at = 0;
  for (const part of diffWords(oldText, text)) {
    const end = at + part.text.length;
    // Cut the part wherever a guess starts or ends inside it.
    const cuts = [at, ...spans.flatMap((span) => [span.start, span.end]).filter((cut) => cut > at && cut < end), end].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const from = cuts[i]!, to = cuts[i + 1]!;
      out.push({ text: text.slice(from, to), changed: part.changed, guess: spans.some((span) => from >= span.start && to <= span.end) });
    }
    at = end;
  }
  return out;
}

/**
 * One suggested line on its own: the new line large (new words marked, guessed words underlined), the line on
 * the CV now small under it, and the choice. A guess says in two short sentences what was written and why, and
 * asks whether it is true.
 */
export function DiffRow({ oldText, newText, reason, inferred = false, guesses = [], textLang, decision, onDecide }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const editId = useId();

  if (newText === null) {
    return (
      <article className="ui-diff ui-diff--nochange">
        <Check size={16} strokeWidth={2.6} aria-hidden="true" />
        <p className="ui-diff-text" lang={textLang}>
          {oldText}
        </p>
        <span className="ui-sr">{t("ui.diff.noChange")}</span>
      </article>
    );
  }

  const chosenText = decision?.choice === "new" ? decision.text : newText;
  const edited = decision?.choice === "new" && decision.text !== newText;
  const status =
    decision?.choice === "keep" ? t("ui.diff.kept") : decision?.choice === "new" ? t(edited ? "ui.diff.usingEdit" : "ui.diff.usingNew") : "";
  const shown = placeGuesses(chosenText, guesses);

  function saveEdit() {
    const text = (draft ?? "").trim();
    onDecide({ choice: "new", text: text || (newText as string) });
    setDraft(null);
  }

  return (
    <article className="ui-sheet ui-diff" data-decision={decision?.choice}>
      <p className="ui-diff-label">{t("ui.diff.suggested")}</p>
      {draft === null ? (
        <p className="ui-diff-text ui-diff-new" lang={textLang}>
          {pieces(oldText, chosenText, guesses).map((piece, i) => {
            const words = piece.guess ? <span className="ui-diff-guess">{piece.text}</span> : piece.text;
            return piece.changed ? <ins key={i}>{words}</ins> : <span key={i}>{words}</span>;
          })}
        </p>
      ) : (
        <>
          <label className="ui-sr" htmlFor={editId}>
            {t("ui.diff.editLabel")}
          </label>
          <textarea id={editId} className="ui-input" rows={3} lang={textLang} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
        </>
      )}
      <p className="ui-diff-was">
        <b>{t("ui.diff.now")}</b> <span lang={textLang}>{oldText}</span>
      </p>
      {reason && <CoachNote size="sm">{reason}</CoachNote>}
      {inferred && draft === null && (
        <div className="ui-diff-check">
          <b>{t("ui.diff.checkTitle")}</b>
          {shown.length === 0 ? (
            <span>{t("ui.diff.checkText")}</span>
          ) : (
            shown.map((guess) => (
              <p key={guess.text}>
                {t("ui.diff.guess")} <q className="ui-diff-guess" lang={textLang}>{guess.text}</q>. {guess.reason}
              </p>
            ))
          )}
          <b>{t("ui.diff.checkAsk")}</b>
        </div>
      )}
      <div className="ui-diff-actions">
        {draft === null ? (
          <>
            <button type="button" className="ui-btn ui-diff-pick" aria-pressed={decision?.choice === "new"} onClick={() => onDecide({ choice: "new", text: chosenText })}>
              {t(inferred ? "ui.diff.useGuess" : "ui.diff.useNew")}
            </button>
            <button type="button" className="ui-btn ui-diff-pick" aria-pressed={decision?.choice === "keep"} onClick={() => onDecide({ choice: "keep" })}>
              {t("ui.diff.keep")}
            </button>
            <button type="button" className="ui-diff-edit" onClick={() => setDraft(chosenText)}>
              {t("ui.diff.edit")}
            </button>
          </>
        ) : (
          <button type="button" className="ui-btn ui-btn--primary" onClick={saveEdit}>
            {t("ui.diff.saveEdit")}
          </button>
        )}
      </div>
      {/* Stays in the page so a screen reader announces the decision when it changes. */}
      <p className="ui-sr" role="status">
        {status}
      </p>
    </article>
  );
}
