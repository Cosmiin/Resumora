import { useState } from "react";
import { MAX_LONG_TEXT, MAX_TEXT, type Locale } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { Change } from "./prepare.ts";

export type Pick = { use: boolean; text: string };

/**
 * Approve once: the role as it will read, every changed piece highlighted and used unless the person says otherwise.
 * "Keep mine" leaves one piece as it was, "Edit" changes its wording; "Looks good" applies the rest.
 */
export function Approve({ name, meta, description, bullets, changes, locale, busy, onApply }: {
  name: string; meta: string; description: string; bullets: readonly { id: string; text: string }[]; changes: Change[]; locale: Locale; busy: boolean;
  onApply(decisions: { id: string; text: string }[]): void;
}) {
  const [picks, setPicks] = useState<Record<string, Pick>>(() => Object.fromEntries(changes.map((c) => [c.id, { use: true, text: c.after }])));
  const [was, setWas] = useState(false);
  const set = (id: string, pick: Pick) => setPicks((p) => ({ ...p, [id]: pick }));
  const piece = (change: Change) => (
    <Piece change={change} pick={picks[change.id] ?? { use: true, text: change.after }} was={was} locale={locale} busy={busy} onPick={(pick) => set(change.id, pick)} />
  );
  const describing = changes.find((c) => c.kind === "description");
  const byBullet = new Map(changes.flatMap((c) => (c.kind === "bullet" ? [[c.bulletId, c] as const] : [])));
  const added = changes.filter((c) => c.kind === "new");
  const anyBefore = changes.some((c) => c.before.trim() !== "");
  return (
    <>
      <p className="fm-eyebrow">{t("enrich.run.approve.eyebrow")}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.run.approve.title")}</h2>
      <p className="rr-lead">{t("enrich.run.approve.line")}</p>
      <div className="rr-sheet" lang={locale}>
        <p className="rr-sheet-title">{name}</p>
        {meta && <p className="rr-sheet-meta">{meta}</p>}
        {describing ? <div className="rr-piece">{piece(describing)}</div> : description.trim() !== "" && <p>{description}</p>}
        <ul>
          {bullets.filter((b) => b.text.trim() !== "").map((b) => {
            const change = byBullet.get(b.id);
            return <li key={b.id}>{change ? piece(change) : b.text}</li>;
          })}
          {added.map((change) => <li key={change.id}>{piece(change)}</li>)}
        </ul>
      </div>
      <div className="rr-actions">
        <button type="button" className="fm-btn" disabled={busy}
          onClick={() => onApply(changes.flatMap((c) => (picks[c.id]?.use ? [{ id: c.id, text: picks[c.id]!.text }] : [])))}>
          {t("enrich.run.approve.apply")}
        </button>
        {anyBefore && (
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm rr-link" onClick={() => setWas((v) => !v)}>
            {t(was ? "enrich.run.approve.hideWas" : "enrich.run.approve.was")}
          </button>
        )}
      </div>
    </>
  );
}

/** One changed piece on the approval sheet. */
export function Piece({ change, pick, was, locale, busy, onPick, tidied = false }: {
  change: Change; pick: Pick; was: boolean; locale: Locale; busy: boolean; onPick(pick: Pick): void;
  /** Rewritten with no new facts (the short path's review sheet): labelled so. */
  tidied?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const fresh = change.kind === "new";
  if (draft !== null) {
    return (
      <span className="rr-edit">
        <textarea lang={locale} aria-label={t("enrich.run.approve.editLabel")} value={draft} rows={change.kind === "description" ? 5 : 3}
          maxLength={change.kind === "description" ? MAX_LONG_TEXT : MAX_TEXT} onChange={(e) => setDraft(e.target.value)} />
        <span className="rr-chips">
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={draft.trim() === ""} onClick={() => {
            onPick({ use: true, text: draft.trim() });
            setDraft(null);
          }}>{t("enrich.focus.describe.save")}</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setDraft(null)}>{t("enrich.run.approve.cancel")}</button>
        </span>
      </span>
    );
  }
  return (
    <>
      {pick.use ? <span className="rr-new">{pick.text}</span> : <span className={fresh || change.before.trim() === "" ? "rr-out" : undefined}>{change.before.trim() || pick.text}</span>}
      {" "}
      <span className="rr-chips">
        <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => onPick({ ...pick, use: !pick.use })}>
          {t(pick.use ? (fresh ? "enrich.run.approve.leaveOut" : "enrich.focus.proposal.keep") : fresh ? "enrich.run.approve.add" : "enrich.run.approve.useNew")}
        </button>
        {pick.use && <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => setDraft(pick.text)}>{t("enrich.focus.describe.edit")}</button>}
      </span>
      {tidied && pick.use && <span className="rr-tidied">{t("enrich.path.review.tidied")}</span>}
      {was && pick.use && change.before.trim() !== "" && (
        <span className="rr-was"><span className="visually-hidden">{t("enrich.focus.proposal.was")}: </span><s>{change.before}</s></span>
      )}
    </>
  );
}
