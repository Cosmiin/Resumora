import { Fragment, useState } from "react";
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
  const skills = [...cv?.technicalSkills ?? [], ...cv?.professionalSkills ?? []];
  const oldName = (p: Proposal) => skills.find((skill) => skill.id === p.itemId)?.name;
  const kept = shown.filter((p) => p.inferred ? guess[keyOf(p)] !== false : !undone[keyOf(p)]);
  const pageSkills = [
    ...skills.map((skill) => ({ key: skill.id, before: skill.name, proposal: kept.find((p) => p.itemId === skill.id) })),
    ...kept.filter((p) => !cv || p.itemId === "new-skill").map((p) => ({ key: keyOf(p), before: undefined, proposal: p })),
  ];

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
        <button type="button" className="secondary" aria-pressed={guess[key] === true} aria-label={t("tailor.review.keepNamed", { text: p.text })}
          onClick={() => setGuess((state) => ({ ...state, [key]: true }))}>{t("tailor.review.keep")}</button>
        <button type="button" className="secondary" aria-pressed={guess[key] === false} aria-label={t("tailor.review.removeNamed", { text: p.text })}
          onClick={() => setGuess((state) => ({ ...state, [key]: false }))}>{t("tailor.review.remove")}</button>
      </span> : <span className="tailor-item-actions">
        <button type="button" className="secondary" aria-pressed={!!undone[key]} aria-label={t("tailor.skills.undoNamed", { text: p.text })}
          onClick={() => setUndone((state) => ({ ...state, [key]: !state[key] }))}>{t("tailor.skills.undo")}</button>
      </span>}
    </li>;
  };

  return <section className="tailor-split" aria-labelledby="tailor-skills-title">
    <div className="page-sheet tailor-role-block">
      <h2>{t("tailor.section.skills")}</h2>
      <div className="tailor-doc"><p>{pageSkills.map(({ key, before, proposal }, i) => <Fragment key={key}>
        {i > 0 && ", "}
        {proposal && proposal.text.trim() !== before?.trim() ? <>
          {before !== undefined && <><span className="page-del">{before}</span>{" "}</>}
          <span className="page-ins">{proposal.text}</span>
        </> : before}
      </Fragment>)}</p></div>
    </div>
    <div className="tailor-card page-note">
      <h2 id="tailor-skills-title">{t("tailor.review.title", { section: t("tailor.section.skills") })}</h2>
      {changes.length === 0 ? <p>{t("tailor.review.none")}</p> : <>
        <p className="tailor-eyebrow">{t("tailor.skills.batch", { n: batch + 1, total: batches })}</p>
        <ul className="tailor-items">{shown.map(row)}</ul>
      </>}
      {removed > 0 && <p className="tailor-reason">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
      <div className="fm-foot">
        {batch > 0 && <button type="button" className="fm-ghost" onClick={() => setBatch(batch - 1)}>
          <span aria-hidden="true">← </span>{t("tailor.skills.back")}</button>}
        {last ? <button type="button" className="fm-btn" disabled={busy} onClick={accept}>{t(busy ? "tailor.review.saving" : "tailor.skills.save")}</button>
          : <button type="button" className="fm-btn" onClick={() => setBatch(batch + 1)}>{t("tailor.skills.next")}</button>}
      </div>
    </div>
  </section>;
}
