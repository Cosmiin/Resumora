import { useState } from "react";
import { MAX_TEXT, findScored, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { formatRange } from "../page/blocks.ts";
import type { Via } from "./AnswerBox.tsx";
import type { HeldChange } from "./EndStep.tsx";
import { RunQuestion } from "./RoleRun.tsx";

type Props = {
  cv: CvContent;
  /** Every held line: one fact away (with an ask), with a better version (with better), or neither. */
  items: HeldChange[];
  /** A better version picked (or the person's edit of it): the parent puts it on the CV. */
  onUse(item: HeldChange, text: string): void;
  /** An answer given: the parent places it on its line in the background. */
  onAnswer(item: HeldChange, text: string, via: Via[]): void;
  /** Every item seen. Skipped lines stay off the CV. */
  onDone(): void;
};

const textOf = (h: HeldChange) => ("text" in h.change ? h.change.text : "");

/**
 * A held line's better version: the line on the CV now (for a rewrite) and the proposal, with Use this version, Edit it
 * first, and Skip. With no better version found, the held line itself, with Add anyway, Edit it first, and Skip.
 */
function BetterLine({ was, better, held, onUse, onSkip }: { was?: string; better?: string; held: string; onUse(text: string): void; onSkip(): void }) {
  const proposal = better ?? held;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(proposal);
  const ok = text.trim() !== "" && text.trim().length <= MAX_TEXT;
  return (
    <>
      <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t(better ? "enrich.path.facts.betterTitle" : "enrich.path.facts.noBetter")}</h2>
      {was && (
        <>
          <p className="rr-guess-label">{t("enrich.path.facts.now")}</p>
          <p className="rr-aboutline">“{was}”</p>
        </>
      )}
      <div className="rr-guess">
        <p className="rr-guess-label">{t("enrich.path.facts.proposal")}</p>
        {editing ? (
          <textarea className="ep-input" rows={3} maxLength={MAX_TEXT} value={text} aria-label={t("enrich.path.end.editLabel")}
            onChange={(e) => setText(e.target.value)} />
        ) : (
          <p className="rr-guess-text">{proposal}</p>
        )}
      </div>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" onClick={onSkip}>{t("enrich.focus.skip")}</button>
        {!editing && <button type="button" className="ui-btn" onClick={() => setEditing(true)}>{t("enrich.path.end.editFirst")}</button>}
        <button type="button" className="fm-btn" disabled={!ok} onClick={() => onUse(editing ? text.trim() : proposal)}>
          {t(editing ? "enrich.path.end.add" : better ? "enrich.path.facts.use" : "enrich.path.end.addAnyway")}
        </button>
      </div>
    </>
  );
}

/**
 * Before the scores (owner, 25 Nov 2026): the lines held back, one per screen, with the role on top. A line one fact
 * away shows above its question, and an answer puts it on the CV with that fact; a line with a better version shows
 * it to use or edit. Skip leaves the line for the end screen.
 */
export function FactsStep({ cv, items, onUse, onAnswer, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  if (!item) return null;
  const ask = item.ask;
  const role = findScored(cv, item.roleId)?.item;
  const change = item.change;
  const was = change.kind === "bullet" ? role?.bullets.find((b) => b.id === change.bulletId)?.text : undefined;
  const next = () => {
    if (index + 1 >= items.length) onDone();
    else setIndex(index + 1);
  };
  return (
    <>
      <div className="rr-prog">
        <p className="fm-eyebrow">{t("enrich.path.facts.title")} · {t("enrich.focus.questionOf", { n: index + 1, total: items.length })}</p>
        <div className="fm-steps" aria-hidden="true">
          {items.map((it, i) => <i key={i} className={i < index ? "is-done" : i === index ? "is-on" : undefined} />)}
        </div>
      </div>
      <p className="ep-rolecard" data-testid="ep-rolecard">
        <b>{role?.title || role?.company}</b>
        {[role?.title ? role.company : "", role ? formatRange(role.startDate, role.endDate, role.current, cv.locale) : ""].filter(Boolean).map((part) => ` · ${part}`).join("")}
      </p>
      {!ask ? (
        <BetterLine key={index} was={was} better={item.better} held={textOf(item)} onSkip={() => next()}
          onUse={(text) => {
            onUse(item, text);
            next();
          }} />
      ) : (
        <RunQuestion key={index} line={textOf(item)} why={null} initial="" locale={cv.locale} busy={false}
          item={{ key: `f${index}`, kind: "line", question: { bulletId: ask.changeId, text: ask.text, kind: "detail", options: ask.options, ...(ask.amounts ? { amounts: ask.amounts } : {}) } }}
          onSubmit={(text, via) => {
            onAnswer(item, text.trim(), via.length ? via : ["type"]);
            next();
          }}
          onSkip={() => next()} />
      )}
    </>
  );
}
