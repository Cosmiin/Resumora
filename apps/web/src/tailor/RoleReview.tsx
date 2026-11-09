import { useId, useState } from "react";
import type { Locale, Proposal, ScoredKind } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { diffWords } from "./diff-words.ts";
import { RoleHeading, type Role } from "./RolePanel.tsx";
import { kindKey } from "./role-done.ts";
import type { AcceptBody } from "./tailor-api.ts";

type Props = {
  role: Role;
  /** This role's proposals (flagged ones never reach the review). */
  proposals: Proposal[];
  locale: Locale;
  busy: boolean;
  onAccept(body: AcceptBody): void;
  /** Opens this role's answers (going back); absent where there is nowhere to go back to. */
  onAnswers?(): void;
  /** The item's kind (a project or volunteering role says so); absent = a role. */
  kind?: ScoredKind;
  /** Proposals the API dropped because the CV, notes and answers don't back them up. */
  removed?: number;
};

/** A guess: the whole new wording in marigold, with an "AI guess" tag whose reason shows on hover or focus. */
function Guess({ text, reason }: { text: string; reason?: string }) {
  const id = useId();
  return <>
    <mark className="tailor-guess">{text}</mark>{" "}
    <span className="tailor-guess-tag" tabIndex={0} aria-describedby={reason ? id : undefined}>{t("tailor.roleReview.guess")}</span>
    {reason && <span role="tooltip" id={id} className="tailor-tip">{reason}</span>}
  </>;
}

/** The new wording with the changed words in green, or the guess marked. */
function NewText({ before, proposal }: { before: string; proposal: Proposal }) {
  if (proposal.inferred) return <Guess text={proposal.text} reason={proposal.reason} />;
  return <>{diffWords(before, proposal.text).map((segment, i) =>
    segment.changed ? <mark key={i} className="tailor-new">{segment.text}</mark> : <span key={i}>{segment.text}</span>)}</>;
}

/**
 * RevC: one role as it will look in the CV, with an Original / New switch for the whole role.
 * Keep the original reverts every change; Use the new version keeps them all and leaves guesses for the guided review.
 */
export function RoleReview({ role, proposals, locale, busy, onAccept, onAnswers, removed = 0, kind }: Props) {
  const [view, setView] = useState<"new" | "original">("new");
  const changes = proposals.filter((p) => p.flags.length === 0);
  const find = (itemId: string, field: string) => changes.find((p) => p.itemId === itemId && p.field === field);

  const text = (before: string, proposal: Proposal | undefined) =>
    view === "new" && proposal ? <NewText before={before} proposal={proposal} /> : before;
  const description = find(role.id, "description");

  function decide(keep: boolean) {
    const pick = (inferred: boolean) => changes.filter((p) => p.inferred === inferred).map((p) => ({ itemId: p.itemId, keep }));
    onAccept({ decisions: pick(false), inferred: keep ? [] : pick(true), flags: [] });
  }

  return <section className="tailor-card" aria-label={role.title.trim() || t("tailor.role.untitled")}>
    <RoleHeading role={role} locale={locale} />
    {changes.length > 0 && <div className="tailor-switch" role="group" aria-label={t("tailor.roleReview.switch")}>
      <button type="button" aria-pressed={view === "original"} onClick={() => setView("original")}>{t("tailor.roleReview.original")}</button>
      <button type="button" aria-pressed={view === "new"} onClick={() => setView("new")}>{t("tailor.roleReview.new")}</button>
    </div>}
    <div className="tailor-doc">
      {(role.description.trim() || description) && <p>{text(role.description, description)}</p>}
      {role.bullets.length > 0 && <ul>
        {role.bullets.map((bullet) => <li key={bullet.id}>{text(bullet.text, find(bullet.id, "text"))}</li>)}
      </ul>}
    </div>
    {changes.length === 0 && <p>{t(`tailor.roleReview.nothing${kindKey(kind)}`)}</p>}
    {removed > 0 && <p className="tailor-reason">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
    <div className="fm-foot">
      {onAnswers && <button type="button" className="fm-ghost" onClick={onAnswers}><span aria-hidden="true">← </span>{t("tailor.roleReview.answers")}</button>}
      {changes.length > 0 && <button type="button" className="fm-ghost" disabled={busy} onClick={() => decide(false)}>{t("tailor.roleReview.keepOriginal")}</button>}
      <button type="button" className="fm-btn" disabled={busy} onClick={() => decide(true)}>
        {t(busy ? "tailor.review.saving" : changes.length > 0 ? "tailor.roleReview.useNew" : "tailor.roleReview.continue")}</button>
    </div>
  </section>;
}
