import { Check } from "lucide-react";
import { useId, useState } from "react";
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
  /** Language of the CV text, so screen readers pronounce it correctly. */
  textLang: string;
  decision: DiffDecision | null;
  onDecide: (decision: DiffDecision | null) => void;
};

/**
 * One bullet, side by side: the line on the CV now (the words that would go struck through) against the
 * suggestion (the new words marked). The person picks a side, or edits the suggestion. A guess says so in a
 * sentence and asks for a yes.
 */
export function DiffRow({ oldText, newText, reason, inferred = false, textLang, decision, onDecide }: Props) {
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

  function saveEdit() {
    const text = (draft ?? "").trim();
    onDecide({ choice: "new", text: text || (newText as string) });
    setDraft(null);
  }

  const side = (choice: "keep" | "new") => `ui-diff-side ui-diff-${choice === "keep" ? "old" : "new"}${decision?.choice === choice ? " is-chosen" : ""}`;
  const stamp = (choice: "keep" | "new") => decision?.choice === choice && <span className="ui-diff-chosen">{t("ui.diff.chosen")}</span>;

  return (
    <article className="ui-sheet ui-diff" data-decision={decision?.choice}>
      {reason && <CoachNote size="sm">{reason}</CoachNote>}
      <div className="ui-diff-pair">
        <div className={side("keep")}>
          <p className="ui-diff-top">
            <span className="ui-diff-label">{t("ui.diff.now")}</span>
            {stamp("keep")}
          </p>
          <p className="ui-diff-text" lang={textLang}>
            {diffWords(chosenText, oldText).map((part, i) => (part.changed ? <del key={i}>{part.text}</del> : part.text))}
          </p>
          <button type="button" className="ui-btn ui-btn--sm ui-diff-pick" aria-pressed={decision?.choice === "keep"} onClick={() => onDecide({ choice: "keep" })}>
            {t("ui.diff.keep")}
          </button>
        </div>
        <span className="ui-diff-arrow" aria-hidden="true">
          →
        </span>
        <div className={side("new")}>
          <p className="ui-diff-top">
            <span className="ui-diff-label">{t("ui.diff.suggested")}</span>
            {stamp("new")}
          </p>
          {draft === null ? (
            <>
              <p className="ui-diff-text" lang={textLang}>
                {diffWords(oldText, chosenText).map((part, i) => (part.changed ? <ins key={i}>{part.text}</ins> : part.text))}
              </p>
              <button type="button" className="ui-btn ui-btn--sm ui-diff-pick" aria-pressed={decision?.choice === "new"} onClick={() => onDecide({ choice: "new", text: chosenText })}>
                {t(inferred ? "ui.diff.useGuess" : "ui.diff.useNew")}
              </button>
            </>
          ) : (
            <>
              <label className="ui-sr" htmlFor={editId}>
                {t("ui.diff.editLabel")}
              </label>
              <textarea id={editId} className="ui-input" rows={3} lang={textLang} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
              <button type="button" className="ui-btn ui-btn--sm ui-btn--primary ui-diff-save" onClick={saveEdit}>
                {t("ui.diff.saveEdit")}
              </button>
            </>
          )}
        </div>
      </div>
      {inferred && (
        <p className="ui-diff-check">
          <b>{t("ui.diff.checkTitle")}</b>
          <span>{t("ui.diff.checkText")}</span>
        </p>
      )}
      {draft === null && (
        <p className="ui-diff-more">
          <button type="button" className="ui-diff-edit" onClick={() => setDraft(chosenText)}>
            {t("ui.diff.edit")}
          </button>
        </p>
      )}
      {/* Stays in the page so a screen reader announces the decision when it changes. */}
      <p className="ui-sr" role="status">
        {status}
      </p>
    </article>
  );
}
