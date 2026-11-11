import { useState } from "react";
import { formatYearMonth, type CvContent, type Proposal } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { diffWords } from "./diff-words.ts";
import { LayoutPicture } from "./LayoutPicture.tsx";

export { movedKeys } from "./LayoutPicture.tsx";
import type { AcceptBody } from "./tailor-api.ts";

/** The final touches (FinalA): one short screen each. */
export type FinalSection = "achievements" | "courses" | "publications" | "interests" | "languages" | "layout";
export const FINAL_SECTIONS: readonly string[] = ["achievements", "courses", "publications", "interests", "languages", "layout"];
/** Awards, courses, publications and interests: lines reworded, most relevant first, unrelated items offered for hiding. */
const LISTED: readonly string[] = ["achievements", "courses", "publications", "interests"];

type Props = {
  section: FinalSection;
  proposals: Proposal[];
  cv: CvContent;
  busy: boolean;
  onAccept(body: AcceptBody): void;
  removed?: number;
};

/** The new wording with the new words in green (B1); a guess stays marigold as a whole. */
function NewText({ before, proposal }: { before: string; proposal: Proposal }) {
  if (proposal.inferred) return <mark className="tailor-guess">{proposal.text}</mark>;
  return <>{diffWords(before, proposal.text).map((segment, i) =>
    segment.changed ? <mark key={i} className="tailor-new">{segment.text}</mark> : <span key={i}>{segment.text}</span>)}</>;
}

/** Languages: each changed item as in the CV, its fields joined by " · ". */
function itemsOf(section: FinalSection, cv: CvContent): Array<{ id: string; fields: Record<string, string> }> {
  if (section === "languages") return cv.languages.map((l) => ({ id: l.id, fields: { name: l.name, level: l.level } }));
  return [];
}

type Listed = { id: string; fields: Record<string, string>; sub: string; lines: { id: string; text: string }[] };

/** Awards, courses, publications or interests as on the CV: the name (an award's description too), details, lines. */
function listedOf(section: FinalSection, cv: CvContent): Listed[] {
  const date = (value: string) => formatYearMonth(value, cv.locale);
  const sub = (parts: string[]) => parts.filter(Boolean).join(" · ");
  if (section === "achievements") {
    return cv.awards.map((a) => ({ id: a.id, fields: { name: a.name, description: a.description }, sub: sub([a.issuer, date(a.date)]), lines: a.bullets ?? [] }));
  }
  if (section === "courses") return cv.courses.map((c) => ({ id: c.id, fields: { name: c.name }, sub: sub([c.provider, date(c.date)]), lines: c.bullets ?? [] }));
  if (section === "publications") {
    return cv.publications.map((p) => ({ id: p.id, fields: { name: p.title }, sub: sub([p.publisher, date(p.date)]), lines: p.bullets ?? [] }));
  }
  if (section === "interests") return cv.interests.map((i) => ({ id: i.id, fields: { name: i.name }, sub: "", lines: i.bullets ?? [] }));
  return [];
}

/**
 * 6C: every item in the new order ("Most relevant first"), changed words highlighted, and "Hide for this job?"
 * ticked for each item the AI found unrelated (applied for you; untick to keep it on this CV).
 */
function ListedBody({ section, changes, cv, hide, onHide }: {
  section: FinalSection; changes: Proposal[]; cv: CvContent; hide: Record<string, boolean>; onHide(itemId: string, hidden: boolean): void;
}) {
  const items = listedOf(section, cv);
  const order = changes.find((p) => p.itemId === "order");
  const ids = order?.text.split(",").map((id) => id.trim()) ?? [];
  const valid = ids.length === items.length && new Set(ids).size === ids.length && ids.every((id) => items.some((item) => item.id === id));
  const shown = valid ? ids.map((id) => items.find((item) => item.id === id)!) : items;
  const find = (itemId: string, field: string) => changes.find((p) => p.itemId === itemId && p.field === field);
  const text = (itemId: string, field: string, before: string) => {
    const proposal = find(itemId, field);
    return proposal ? <NewText before={before} proposal={proposal} /> : before;
  };
  return <>
    {valid && <p className="tailor-item-label">{t("tailor.final.relevant")}</p>}
    <ul className="tailor-doc" aria-label={t(`tailor.section.${section}`)}>
      {/* A blank item (an empty interest left by the editor) shows nothing on the CV, so nothing here either. */}
      {shown.filter((item) => item.fields.name?.trim() || item.lines.length > 0).map((item) => {
        const offer = find(`hide:${item.id}`, "hidden");
        const hidden = !!offer && hide[offer.itemId] !== false;
        return <li key={item.id} data-item={item.id} className={hidden ? "is-hidden" : undefined}>
          <strong>{text(item.id, "name", item.fields.name ?? "")}</strong>{item.sub && <> · {item.sub}</>}
          {(item.fields.description?.trim() || find(item.id, "description")) && <> · {text(item.id, "description", item.fields.description ?? "")}</>}
          {item.lines.length > 0 && <ul>{item.lines.map((line) => <li key={line.id}>{text(line.id, "text", line.text)}</li>)}</ul>}
          {offer && <label className="tailor-hide">
            <input type="checkbox" checked={hidden} aria-label={t("tailor.final.hideNamed", { name: item.fields.name || t("tailor.role.untitled") })}
              onChange={(event) => onHide(offer.itemId, event.target.checked)} />
            {" "}{t("tailor.final.hide")} <span className="tailor-reason">{offer.text}</span>
          </label>}
        </li>;
      })}
    </ul>
  </>;
}

/**
 * FinalA: Achievements or Languages on one short screen with the same highlights; Order and headline as a picture.
 * Using the new version keeps every change and leaves guesses for the guided review; the other button reverts them all.
 */
export function LayoutReview({ section, proposals, cv, busy, onAccept, removed = 0 }: Props) {
  const changes = proposals.filter((p) => p.flags.length === 0);
  const items = itemsOf(section, cv).filter((item) => changes.some((p) => p.itemId === item.id));
  // "Hide for this job?" starts ticked (Q4 b): only an untick is stored.
  const [hide, setHide] = useState<Record<string, boolean>>({});

  function decide(keep: boolean) {
    // Keep the original undoes everything; the new version keeps every change, except a hide that was unticked.
    const kept = (p: Proposal) => keep && (!p.itemId.startsWith("hide:") || hide[p.itemId] !== false);
    const pick = (inferred: boolean) => changes.filter((p) => p.inferred === inferred).map((p) => ({ itemId: p.itemId, keep: kept(p) }));
    onAccept({ decisions: pick(false), inferred: keep ? [] : pick(true), flags: [] });
  }

  if (section === "layout") return <LayoutPicture proposals={changes} cv={cv} busy={busy} onAccept={onAccept} />;

  return <section className="ui-sheet tailor-card" aria-labelledby="tailor-final-title">
    <h2 className="ui-heading ui-heading--lg" id="tailor-final-title">{t(`tailor.section.${section}`)}</h2>
    {LISTED.includes(section) ? <ListedBody section={section} changes={changes} cv={cv} hide={hide}
        onHide={(itemId, hidden) => setHide((state) => ({ ...state, [itemId]: hidden }))} />
      : <ul className="tailor-doc">
      {items.map((item) => <li key={item.id}>{Object.entries(item.fields).filter(([field, text]) =>
        text.trim() || changes.some((p) => p.itemId === item.id && p.field === field)).map(([field, text], i) => {
        const proposal = changes.find((p) => p.itemId === item.id && p.field === field);
        return <span key={field}>{i > 0 && " · "}{proposal ? <NewText before={text} proposal={proposal} /> : <span>{text}</span>}</span>;
      })}</li>)}
    </ul>}
    {removed > 0 && <p className="tailor-reason">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
    <div className="tailor-foot">
      <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={() => decide(false)}>
        {t("tailor.roleReview.keepOriginal")}</button>
      <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => decide(true)}>
        {t(busy ? "tailor.review.saving" : "tailor.roleReview.useNew")}</button>
    </div>
  </section>;
}
