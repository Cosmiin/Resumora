import { useState } from "react";
import type { CvContent, Proposal } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { AcceptBody } from "./tailor-api.ts";

const BATCH = 5;
/** Same keys as the API: new skills share the id "new-skill", so they are told apart by their text. */
const keyOf = (p: Proposal) => (p.itemId === "new-skill" ? `new-skill:${p.text}` : p.itemId);

type Props = {
  proposals: Proposal[];
  /** The Base CV: a renamed skill's old name. */
  cv?: CvContent | null;
  busy: boolean;
  onAccept(body: AcceptBody): void;
  removed?: number;
};

/**
 * SkillsA2: skill changes 5 per screen. A rename or a new skill is kept unless undone;
 * a guess asks Keep / Remove and, left alone, stays kept and unreviewed (the guided review asks later).
 */
export function SkillsReview({ proposals, cv = null, busy, onAccept, removed = 0 }: Props) {
  const changes = proposals.filter((p) => p.flags.length === 0);
  // Changes: true = undone. Guesses: true = kept, false = removed, absent = undecided.
  const [undone, setUndone] = useState<Record<string, boolean>>({});
  const [guess, setGuess] = useState<Record<string, boolean>>({});
  const [batch, setBatch] = useState(0);
  const batches = Math.max(1, Math.ceil(changes.length / BATCH));
  const shown = changes.slice(batch * BATCH, (batch + 1) * BATCH);
  const last = batch >= batches - 1;
  const oldName = (p: Proposal) => [...cv?.technicalSkills ?? [], ...cv?.professionalSkills ?? []].find((skill) => skill.id === p.itemId)?.name;

  function accept() {
    const decisions = changes.filter((p) => !p.inferred).map((p) => ({ itemId: keyOf(p), keep: !undone[keyOf(p)] }));
    const inferred = changes.filter((p) => p.inferred && guess[keyOf(p)] !== undefined).map((p) => ({ itemId: keyOf(p), keep: guess[keyOf(p)]! }));
    onAccept({ decisions, inferred, flags: [] });
  }

  const row = (p: Proposal) => {
    const key = keyOf(p);
    const old = oldName(p);
    const off = p.inferred ? guess[key] === false : !!undone[key];
    return <li key={key} className={[p.inferred ? "is-inferred" : "is-changed", off ? "is-reverted" : ""].join(" ").trim()}>
      <div className="tailor-item-text">
        <p>{old !== undefined && <><span>{old}</span><span aria-hidden="true"> → </span></>}<b>{p.text}</b></p>
        {p.reason && <p className="tailor-reason">{p.reason}</p>}
      </div>
      {p.inferred ? <span className="tailor-item-actions">
        <button type="button" className="ui-btn ui-btn--sm" aria-pressed={guess[key] === true} aria-label={t("tailor.review.keepNamed", { text: p.text })}
          onClick={() => setGuess((state) => ({ ...state, [key]: true }))}>{t("tailor.review.keep")}</button>
        <button type="button" className="ui-btn ui-btn--sm" aria-pressed={guess[key] === false} aria-label={t("tailor.review.removeNamed", { text: p.text })}
          onClick={() => setGuess((state) => ({ ...state, [key]: false }))}>{t("tailor.review.remove")}</button>
      </span> : <span className="tailor-item-actions">
        <button type="button" className="ui-btn ui-btn--sm" aria-pressed={!!undone[key]} aria-label={t("tailor.skills.undoNamed", { text: p.text })}
          onClick={() => setUndone((state) => ({ ...state, [key]: !state[key] }))}>{t("tailor.skills.undo")}</button>
      </span>}
    </li>;
  };

  return <section className="ui-sheet tailor-card" aria-labelledby="tailor-skills-title">
    <h2 className="ui-heading ui-heading--lg" id="tailor-skills-title">{t("tailor.review.title", { section: t("tailor.section.skills") })}</h2>
    {changes.length === 0 ? <p>{t("tailor.review.none")}</p> : <>
      <p className="ui-label">{t("tailor.skills.batch", { n: batch + 1, total: batches })}</p>
      <ul className="tailor-items">{shown.map(row)}</ul>
    </>}
    {removed > 0 && <p className="tailor-reason">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
    <div className="tailor-foot">
      {batch > 0 && <button type="button" className="ui-btn ui-btn--quiet" onClick={() => setBatch(batch - 1)}>
        <span aria-hidden="true">← </span>{t("tailor.skills.back")}</button>}
      {last ? <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={accept}>{t(busy ? "tailor.review.saving" : "tailor.skills.save")}</button>
        : <button type="button" className="ui-btn ui-btn--primary" onClick={() => setBatch(batch + 1)}>{t("tailor.skills.next")}</button>}
    </div>
  </section>;
}
