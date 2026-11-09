import { useState } from "react";
import { CATEGORY, type CvContent, type Proposal, type SectionKey, type TailorQuestion, type TailorSection } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { RoleHeading, roleOf } from "./RolePanel.tsx";
import type { AcceptBody } from "./tailor-api.ts";

/** Same keys as the API: new skills share the id "new-skill", so they are told apart by their text. */
export const reviewKey = (p: Proposal) => (p.itemId === "new-skill" ? `new-skill:${p.text}` : p.itemId);
/** The flag question the API wrote for a flagged proposal: by its key (older runs: by the quoted text). */
export const flagFor = (p: Proposal, flags: TailorQuestion[]) =>
  flags.find((q) => q.itemId ? q.itemId === `${reviewKey(p)}|${p.field}` : q.text.startsWith(`Please check: "${p.text}"`));

/** The layout step's order is stored as section keys; show it with the editor's section names. */
const shown = (p: Proposal) => p.itemId === "layout" && p.field === "order"
  ? p.text.split(",").map((key) => CATEGORY[key as SectionKey]?.label.en ?? key).join(" → ")
  : p.text;

/** The Base CV wording a proposal replaces, when the CV is loaded and the item has one. */
function before(cv: CvContent, section: TailorSection, p: Proposal): string | undefined {
  if (section === "skills") return [...cv.technicalSkills, ...cv.professionalSkills].find((skill) => skill.id === p.itemId)?.name;
  if (section !== "experience") return undefined;
  const role = roleOf(cv, p.itemId);
  if (!role) return undefined;
  if (role.id !== p.itemId) return role.bullets.find((bullet) => bullet.id === p.itemId)?.text;
  const value = (role as Record<string, unknown>)[p.field];
  return typeof value === "string" ? value : undefined;
}

/** "Bullet 2" or "Description": which part of the role a change rewrites. */
function partName(cv: CvContent, p: Proposal): string | undefined {
  const role = roleOf(cv, p.itemId);
  if (!role) return undefined;
  if (role.id !== p.itemId) return t("tailor.review.bullet", { n: role.bullets.findIndex((bullet) => bullet.id === p.itemId) + 1 });
  return p.field === "description" ? t("tailor.review.description") : p.field;
}

type Props = {
  section: TailorSection;
  proposals: Proposal[];
  flags: TailorQuestion[];
  confirmed: AcceptBody["flags"];
  busy: boolean;
  onAccept(body: AcceptBody): void;
  /** The Base CV the proposals were made from: roles, before texts. Null while loading or if it failed. */
  cv?: CvContent | null;
};

export function SectionReview({ section, proposals, flags, confirmed, busy, onAccept, cv = null }: Props) {
  // Changed items start kept; inferred items start undecided (kept, but listed as unreviewed at export).
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
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

  const item = (p: Proposal, i: number, label?: string) => {
    const key = reviewKey(p);
    const kept = flagged(p) ? confirmedFlag(p) : keep[key] ?? true;
    const old = cv ? before(cv, section, p) : undefined;
    return <li key={`${key}:${p.field}:${i}`} className={[p.inferred ? "is-inferred" : "is-changed", kept ? "" : "is-reverted"].join(" ").trim()}>
      <div className="tailor-item-text">
        {label && <p className="tailor-item-label">{label}</p>}
        {old === undefined ? <span>{shown(p)}</span> : <>
          <p className="tailor-before"><span className="tailor-tag">{t("tailor.review.before")}</span> <del>{old.trim() || t("tailor.review.empty")}</del></p>
          <p className="tailor-after"><span className="tailor-tag">{t("tailor.review.after")}</span> <span>{shown(p)}</span></p>
        </>}
        {p.reason && <p className="tailor-reason"><span aria-hidden="true">↳ </span>{p.reason}</p>}
      </div>
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
  };
  const group = (id: string, title: string, items: Proposal[]) => items.length > 0 && <section className="tailor-group" aria-labelledby={id}>
    <h3 id={id}>{title}</h3>
    <ul className="tailor-items">{items.map((p, i) => item(p, i))}</ul>
  </section>;

  // F4: Experience is reviewed one role at a time, in CV order; changes the CV can't place come last.
  const roles = cv && section === "experience" ? [
    ...cv.experience.map((role) => ({ role, items: proposals.filter((p) => roleOf(cv, p.itemId)?.id === role.id) })),
    { role: null, items: proposals.filter((p) => !roleOf(cv, p.itemId)) },
  ].filter((entry) => entry.items.length > 0) : [];
  const current = roles[Math.min(page, roles.length - 1)];
  const last = roles.length === 0 || page >= roles.length - 1;

  let body: React.ReactNode;
  if (proposals.length === 0) body = <p>{t("tailor.review.none")}</p>;
  else if (current) {
    body = <>
      <p className="tailor-eyebrow">{t("tailor.review.rolePage", { n: page + 1, total: roles.length })}</p>
      {current.role ? <RoleHeading role={current.role} locale={cv!.locale} /> : <h3>{t("tailor.review.otherChanges")}</h3>}
      <ul className="tailor-items">{current.items.map((p, i) => item(p, i, partName(cv!, p)))}</ul>
    </>;
  } else if (section === "skills") {
    body = <>
      <p className="tailor-explain">{t("tailor.review.skillsExplain")}</p>
      {group("tailor-reworded", t("tailor.review.reworded"), proposals.filter((p) => p.itemId !== "new-skill"))}
      {group("tailor-added", t("tailor.review.added"), proposals.filter((p) => p.itemId === "new-skill"))}
    </>;
  } else body = <ul className="tailor-items">{proposals.map((p, i) => item(p, i))}</ul>;

  return <section className="tailor-card" aria-labelledby="tailor-review-title">
    <h2 id="tailor-review-title">{t("tailor.review.title", { section: t(`tailor.section.${section}`) })}</h2>
    {body}
    <div className="tailor-actions">
      {page > 0 && current && <button type="button" className="secondary" onClick={() => setPage(page - 1)}>
        <span aria-hidden="true">← </span>{t("tailor.review.prevRole")}</button>}
      {!last && <button type="button" className="primary" onClick={() => setPage(page + 1)}>
        {t("tailor.review.nextRole")}<span aria-hidden="true"> →</span></button>}
      {last && proposals.some((p) => !flagged(p)) && <button type="button" className="secondary" onClick={revertAll}>{t("tailor.review.revertAll")}</button>}
      {last && <button type="button" className="primary" disabled={busy} onClick={accept}>{t(busy ? "tailor.review.saving" : "tailor.review.accept")}</button>}
    </div>
  </section>;
}
