import { useState } from "react";
import type { Locale, Proposal, ScoredKind } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { DiffRow, Progress, type DiffDecision } from "../ui/index.ts";
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
  /** The ad's keywords the CV shows so far. */
  keywords?: { has: number; total: number };
};

/**
 * One role's suggested changes as a list: each line as it is now against the suggestion, decided one by one
 * (Keep, Use new, or Edit). A line with no suggestion says so. Undecided suggestions are used.
 */
export function RoleReview({ role, proposals, locale, busy, onAccept, onAnswers, removed = 0, kind, position, keywords }: Props) {
  const [decided, setDecided] = useState<Record<string, DiffDecision>>({});
  const changes = proposals.filter((p) => p.flags.length === 0);
  const find = (itemId: string, field: string) => changes.find((p) => p.itemId === itemId && p.field === field);
  const description = find(role.id, "description");
  // The role's lines in CV order: its description when a change touches it, then every bullet.
  const lines = [
    ...(description ? [{ id: role.id, old: role.description, proposal: description as Proposal | undefined }] : []),
    ...role.bullets.map((bullet) => ({ id: bullet.id, old: bullet.text, proposal: find(bullet.id, "text") })),
  ];
  const open = lines.filter((line) => line.proposal);
  const count = open.filter((line) => decided[line.id]).length;
  const decide = (id: string, decision: DiffDecision | null) => setDecided((state) => {
    const next = { ...state };
    if (decision) next[id] = decision; else delete next[id];
    return next;
  });

  function save() {
    const decisions = open.flatMap((line) => {
      const decision = decided[line.id];
      if (!decision) return [];
      const reworded = decision.choice === "new" && decision.text !== line.proposal!.text;
      return [{ itemId: line.id, keep: decision.choice === "new", ...(reworded ? { text: decision.text } : {}) }];
    });
    onAccept({ decisions, inferred: [], flags: [] });
  }
  /** Skip this role: every line stays as it is on the CV. */
  const skip = () => onAccept({ decisions: changes.map((p) => ({ itemId: p.itemId, keep: false })), inferred: [], flags: [] });

  const name = [role.title.trim() || t("tailor.role.untitled"), role.company.trim()].filter(Boolean).join(", ");
  return <section aria-label={name}>
    <div className="tailor-page-head">
      <div>
        <h1 className="ui-title" lang={locale}>{name}</h1>
        <p className="ui-muted">{[position, roleMeta({ ...role, company: "" }, locale)].filter(Boolean).join(" · ")}</p>
      </div>
      {keywords && keywords.total > 0 && <Progress tone="good" label={t("tailor.kw.bar")}
        valueText={t("tailor.kw.count", { n: keywords.has, total: keywords.total })} value={keywords.has} max={keywords.total} />}
    </div>
    <div className="tailor-review">
      <div className="tailor-review-head">
        <h2 className="ui-heading">{t(`tailor.roleReview.lines${kindKey(kind)}`)}</h2>
        {open.length > 0 && <button type="button" className="ui-btn ui-btn--sm" disabled={busy}
          onClick={() => setDecided(Object.fromEntries(open.map((line) => [line.id, decided[line.id] ?? { choice: "new", text: line.proposal!.text }])))}>
          {t(`tailor.roleReview.acceptAll${kindKey(kind)}`)}</button>}
      </div>
      {lines.length === 0 ? <p className="ui-notice">{t(`tailor.roleReview.nothing${kindKey(kind)}`)}</p>
        : <div className="ui-sheet tailor-diffs">
          {lines.map((line) => <DiffRow key={line.id} oldText={line.old.trim() || t("tailor.review.empty")} newText={line.proposal?.text ?? null}
            reason={line.proposal?.reason} inferred={line.proposal?.inferred} textLang={locale}
            decision={decided[line.id] ?? null} onDecide={(decision) => decide(line.id, decision)} />)}
        </div>}
      {open.length === 0 && lines.length > 0 && <p className="ui-notice tailor-gap">{t(`tailor.roleReview.nothing${kindKey(kind)}`)}</p>}
      {removed > 0 && <p className="ui-small ui-muted tailor-gap">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
      <div className="tailor-foot">
        <span role="status">{open.length > 0 && <><b>{t("tailor.roleReview.decided", { n: count, total: open.length })}</b>
          {count < open.length && <span className="ui-small ui-muted"> {t("tailor.roleReview.undecided")}</span>}</>}</span>
        <div className="ui-row">
          {onAnswers && <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onAnswers}>{t("tailor.roleReview.answers")}</button>}
          {open.length > 0 && <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={skip}>{t(`tailor.roleReview.skip${kindKey(kind)}`)}</button>}
          <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={save}>
            {t(busy ? "tailor.review.saving" : open.length > 0 ? "tailor.roleReview.save" : "tailor.roleReview.continue")}</button>
        </div>
      </div>
    </div>
  </section>;
}
