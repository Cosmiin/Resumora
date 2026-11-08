import { useState } from "react";
import { CATEGORY, type Proposal, type SectionKey, type TailorQuestion, type TailorSection } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { AcceptBody } from "./tailor-api.ts";

/** Same keys as the API: new skills share the id "new-skill", so they are told apart by their text. */
export const reviewKey = (p: Proposal) => (p.itemId === "new-skill" ? `new-skill:${p.text}` : p.itemId);
/** The flag question the API wrote for a flagged proposal quotes its text. */
export const flagFor = (p: Proposal, flags: TailorQuestion[]) => flags.find((q) => q.text.startsWith(`Please check: "${p.text}"`));

/** The layout step's order is stored as section keys; show it with the editor's section names. */
const shown = (p: Proposal) => p.itemId === "layout" && p.field === "order"
  ? p.text.split(",").map((key) => CATEGORY[key as SectionKey]?.label.en ?? key).join(" → ")
  : p.text;

type Props = {
  section: TailorSection;
  proposals: Proposal[];
  flags: TailorQuestion[];
  confirmed: AcceptBody["flags"];
  busy: boolean;
  onAccept(body: AcceptBody): void;
};

export function SectionReview({ section, proposals, flags, confirmed, busy, onAccept }: Props) {
  // Changed items start kept; inferred items start undecided (kept, but listed as unreviewed at export).
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const flagged = (p: Proposal) => p.flags.length > 0;
  const confirmedFlag = (p: Proposal) => {
    const question = flagFor(p, flags);
    return !!question && confirmed.some((c) => c.questionId === question.id && c.confirmed);
  };
  const set = (p: Proposal, value: boolean) => setKeep((state) => ({ ...state, [reviewKey(p)]: value }));
  const revertAll = () => setKeep(Object.fromEntries(proposals.filter((p) => !flagged(p)).map((p) => [reviewKey(p), false])));

  function accept() {
    const decisions = new Map<string, boolean>();
    const inferred = new Map<string, boolean>();
    for (const p of proposals) {
      if (flagged(p)) continue;
      const key = reviewKey(p);
      if (p.inferred) { if (keep[key] !== undefined) inferred.set(key, keep[key]); }
      else decisions.set(key, keep[key] ?? true);
    }
    const list = (map: Map<string, boolean>) => [...map].map(([itemId, value]) => ({ itemId, keep: value }));
    onAccept({ decisions: list(decisions), inferred: list(inferred), flags: confirmed });
  }

  return <section className="tailor-card" aria-labelledby="tailor-review-title">
    <h2 id="tailor-review-title">{t("tailor.review.title", { section: t(`tailor.section.${section}`) })}</h2>
    {proposals.length === 0 ? <p>{t("tailor.review.none")}</p> : <ul className="tailor-items">
      {proposals.map((p, i) => {
        const key = reviewKey(p);
        const kept = flagged(p) ? confirmedFlag(p) : keep[key] ?? true;
        return <li key={`${key}:${p.field}:${i}`} className={[p.inferred ? "is-inferred" : "is-changed", kept ? "" : "is-reverted"].join(" ").trim()}>
          <span className="tailor-item-text">{shown(p)}</span>
          {p.inferred && <span className="tailor-tag">{t("tailor.review.inferred")}</span>}
          {flagged(p) ? <span className="tailor-tag">{t(kept ? "tailor.review.flagged" : "tailor.review.reverted")}</span>
            : <span className="tailor-item-actions">
              <button type="button" className="secondary" aria-pressed={p.inferred ? keep[key] === true : kept}
                aria-label={t("tailor.review.keepNamed", { text: shown(p) })} onClick={() => set(p, true)}>{t("tailor.review.keep")}</button>
              <button type="button" className="secondary" aria-pressed={p.inferred ? keep[key] === false : !kept}
                aria-label={t(p.inferred ? "tailor.review.removeNamed" : "tailor.review.revertNamed", { text: shown(p) })}
                onClick={() => set(p, false)}>{t(p.inferred ? "tailor.review.remove" : "tailor.review.revert")}</button>
            </span>}
        </li>;
      })}
    </ul>}
    <div className="tailor-actions">
      {proposals.some((p) => !flagged(p)) && <button type="button" className="secondary" onClick={revertAll}>{t("tailor.review.revertAll")}</button>}
      <button type="button" className="primary" disabled={busy} onClick={accept}>{t(busy ? "tailor.review.saving" : "tailor.review.accept")}</button>
    </div>
  </section>;
}
