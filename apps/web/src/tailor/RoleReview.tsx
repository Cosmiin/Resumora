import { useState } from "react";
import type { Locale, Proposal, ScoredKind } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { DiffRow, type DiffDecision } from "../ui/index.ts";
import "../styles/focus.css";
import { roleMeta, type Role } from "./RolePanel.tsx";
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
  /** "Role 1 of 2", when the flow knows it. */
  position?: string;
  /** The ad's keywords the CV shows so far (no longer shown here: the match is in the room's bar). */
  keywords?: { has: number; total: number };
};

/**
 * One role's suggested changes, one at a time: the new line, the line on the CV now, and the choice (use it, keep
 * my line, or edit it), then the next. A suggestion is used unless the person keeps their line; a guess is used
 * only when the person says it is true. Lines with no suggestion are only counted.
 */
export function RoleReview({ role, proposals, locale, busy, onAccept, onAnswers, removed = 0, kind, position }: Props) {
  const [decided, setDecided] = useState<Record<string, DiffDecision>>({});
  const [index, setIndex] = useState(0);
  const changes = proposals.filter((p) => p.flags.length === 0);
  const find = (itemId: string, field: string) => changes.find((p) => p.itemId === itemId && p.field === field);
  const description = find(role.id, "description");
  // The role's lines in CV order: its description when a change touches it, then every bullet.
  const lines = [
    ...(description ? [{ id: role.id, old: role.description, proposal: description as Proposal | undefined }] : []),
    ...role.bullets.map((bullet) => ({ id: bullet.id, old: bullet.text, proposal: find(bullet.id, "text") })),
  ];
  const open = lines.filter((line) => line.proposal);
  // What each line stands at: the person's own decision, else the suggestion, except a guess, which waits for a yes.
  const standing = (line: (typeof open)[number]): DiffDecision | null =>
    decided[line.id] ?? (line.proposal!.inferred ? null : { choice: "new", text: line.proposal!.text });
  const fits = lines.filter((line) => !line.proposal);
  const decide = (id: string, decision: DiffDecision | null) => setDecided((state) => {
    const next = { ...state };
    if (decision) next[id] = decision; else delete next[id];
    return next;
  });

  function save() {
    const decisions = open.flatMap((line) => {
      const decision = decided[line.id];
      // A guess nobody confirmed stays off the CV; any other undecided line takes the suggestion.
      if (!decision) return line.proposal!.inferred ? [{ itemId: line.id, keep: false }] : [];
      const reworded = decision.choice === "new" && decision.text !== line.proposal!.text;
      return [{ itemId: line.id, keep: decision.choice === "new", ...(reworded ? { text: decision.text } : {}) }];
    });
    onAccept({ decisions, inferred: [], flags: [] });
  }
  /** Skip this role: every line stays as it is on the CV. */
  const skip = () => onAccept({ decisions: changes.map((p) => ({ itemId: p.itemId, keep: false })), inferred: [], flags: [] });

  const name = [role.title.trim() || t("tailor.role.untitled"), role.company.trim()].filter(Boolean).join(", ");
  const at = Math.min(index, Math.max(0, open.length - 1));
  const line = open[at];
  return <section aria-label={name} className="tailor-one">
    <div className="tailor-one-head">
      <div>
        <h1 className="ui-title" lang={locale}>{name}</h1>
        <p className="ui-muted">{[position, roleMeta({ ...role, company: "" }, locale)].filter(Boolean).join(" · ")}</p>
      </div>
      {line && <div className="tailor-one-step">
        <p role="status">{t("tailor.roleReview.step", { n: at + 1, total: open.length })}</p>
        <div className="fm-steps" aria-hidden="true">{open.map((item, i) => <i key={item.id} className={i < at ? "is-done" : i === at ? "is-on" : undefined} />)}</div>
      </div>}
    </div>
    {!line ? <p className="ui-notice">{t(`tailor.roleReview.nothing${kindKey(kind)}`)}</p>
      // While the role is being saved the line is frozen: a decision made then would not be part of what was sent.
      : <fieldset className="tailor-diffs" disabled={busy}>
        <DiffRow key={line.id} oldText={line.old.trim() || t("tailor.review.empty")} newText={line.proposal!.text}
          reason={line.proposal!.reason} inferred={line.proposal!.inferred} guesses={line.proposal!.inferredParts} textLang={locale}
          decision={standing(line)} onDecide={(decision) => decide(line.id, decision)} />
      </fieldset>}
    {line && fits.length > 0 && <p className="ui-small ui-muted tailor-gap">{t(fits.length === 1 ? "tailor.roleReview.fitsOne" : "tailor.roleReview.fitsMany", { n: fits.length })}</p>}
    {removed > 0 && <p className="ui-small ui-muted tailor-gap">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
    <div className="tailor-foot">
      <div className="ui-row">
        {onAnswers && <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onAnswers}>{t("tailor.roleReview.answers")}</button>}
        {line && <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={skip}>{t(`tailor.roleReview.skip${kindKey(kind)}`)}</button>}
      </div>
      <div className="ui-row">
        {at > 0 && <button type="button" className="ui-btn" disabled={busy} onClick={() => setIndex(at - 1)}>{t("tailor.roleReview.prev")}</button>}
        {at + 1 < open.length
          ? <button type="button" className="ui-btn ui-btn--primary" onClick={() => setIndex(at + 1)}>{t("tailor.roleReview.next")}</button>
          : <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={save}>
            {t(busy ? "tailor.review.saving" : line ? "tailor.roleReview.save" : "tailor.roleReview.continue")}</button>}
      </div>
    </div>
  </section>;
}
