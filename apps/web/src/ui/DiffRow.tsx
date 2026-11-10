import { Check } from "lucide-react";
import { useId, useState } from "react";
import { useT } from "../i18n/t.ts";
import { Button } from "./Button.tsx";
import { CoachNote } from "./Card.tsx";
import { Tag } from "./Chip.tsx";

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

/** One bullet, old against new: Keep, Use new, or Edit the suggestion. The replaced text stays visible. */
export function DiffRow({ oldText, newText, reason, inferred = false, textLang, decision, onDecide }: Props) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const editId = useId();

  if (newText === null) {
    return (
      <article className="ui-diff ui-diff--nochange">
        <div className="ui-diff-line ui-diff-old">
          <span className="ui-diff-label">{t("ui.diff.now")}</span>
          <p className="ui-diff-text" lang={textLang}>
            {oldText}
          </p>
        </div>
        <div className="ui-diff-body">
          <CoachNote size="sm">{t("ui.diff.noChange")}</CoachNote>
        </div>
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

  return (
    <article className="ui-diff" data-decision={decision?.choice}>
      <div className="ui-diff-line ui-diff-old">
        <span className="ui-diff-label">{t("ui.diff.now")}</span>
        <p className="ui-diff-text" lang={textLang}>
          {oldText}
        </p>
      </div>
      <div className="ui-diff-line ui-diff-new">
        <span className="ui-diff-label">{t("ui.diff.suggested")}</span>
        {inferred && <Tag>{t("ui.diff.inferred")}</Tag>}
        {draft === null ? (
          <p className="ui-diff-text" lang={textLang}>
            {chosenText}
          </p>
        ) : (
          <>
            <label className="ui-sr" htmlFor={editId}>
              {t("ui.diff.editLabel")}
            </label>
            <textarea id={editId} className="ui-input" rows={3} lang={textLang} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
          </>
        )}
      </div>
      <div className="ui-diff-body">
        {reason && <CoachNote size="sm">{reason}</CoachNote>}
        <div className="ui-diff-actions">
          {draft === null ? (
            <>
              <Button aria-pressed={decision?.choice === "keep"} onClick={() => onDecide(decision?.choice === "keep" ? null : { choice: "keep" })}>
                {t("ui.diff.keep")}
              </Button>
              <Button aria-pressed={decision?.choice === "new"} onClick={() => onDecide(decision?.choice === "new" ? null : { choice: "new", text: newText })}>
                {t("ui.diff.useNew")}
              </Button>
              <Button variant="quiet" onClick={() => setDraft(chosenText)}>
                {t("ui.diff.edit")}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={saveEdit}>
              {t("ui.diff.saveEdit")}
            </Button>
          )}
        </div>
        {/* Stays in the page so a screen reader announces the decision when it changes. */}
        <p className="ui-diff-status" role="status">
          {status && (
            <>
              <Check size={16} strokeWidth={2.6} aria-hidden="true" />
              {status}
            </>
          )}
        </p>
      </div>
    </article>
  );
}
