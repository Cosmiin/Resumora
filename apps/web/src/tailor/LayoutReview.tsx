import { CATEGORY, type CvContent, type Proposal, type SectionKey } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { diffWords } from "./diff-words.ts";
import type { AcceptBody } from "./tailor-api.ts";

/** The final touches (FinalA): one short screen each. */
export type FinalSection = "achievements" | "languages" | "layout";
export const FINAL_SECTIONS: readonly string[] = ["achievements", "languages", "layout"];

type Props = {
  section: FinalSection;
  proposals: Proposal[];
  cv: CvContent;
  busy: boolean;
  onAccept(body: AcceptBody): void;
  removed?: number;
};

const sectionName = (key: string) => CATEGORY[key as SectionKey]?.label.en ?? key;

/** The sections that moved: those outside the longest run kept in the same relative order, so one jump marks one section. */
export function movedKeys(old: string[], next: string[]): Set<string> {
  const lcs = old.map(() => new Array<number>(next.length + 1).fill(0));
  lcs.push(new Array<number>(next.length + 1).fill(0));
  for (let i = old.length - 1; i >= 0; i--) {
    for (let j = next.length - 1; j >= 0; j--) {
      lcs[i]![j] = old[i] === next[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const stayed = new Set<string>();
  for (let i = 0, j = 0; i < old.length && j < next.length;) {
    if (old[i] === next[j]) { stayed.add(next[j]!); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  return new Set(next.filter((key) => !stayed.has(key)));
}

/** The new wording with the new words in green (B1); a guess stays marigold as a whole. */
function NewText({ before, proposal }: { before: string; proposal: Proposal }) {
  if (proposal.inferred) return <mark className="tailor-guess">{proposal.text}</mark>;
  return <>{diffWords(before, proposal.text).map((segment, i) =>
    segment.changed ? <mark key={i} className="tailor-new">{segment.text}</mark> : <span key={i}>{segment.text}</span>)}</>;
}

/** Achievements and Languages: each changed item as in the CV, its fields joined by " · ". */
function itemsOf(section: FinalSection, cv: CvContent): Array<{ id: string; fields: Record<string, string> }> {
  if (section === "achievements") return cv.awards.map((a) => ({ id: a.id, fields: { name: a.name, description: a.description } }));
  if (section === "languages") return cv.languages.map((l) => ({ id: l.id, fields: { name: l.name, level: l.level } }));
  return [];
}

/** Order and headline: the old headline struck through next to the new one, the new order with moved sections marked. */
function LayoutBody({ proposals, cv }: { proposals: Proposal[]; cv: CvContent }) {
  const order = proposals.find((p) => p.itemId === "layout");
  const headline = proposals.find((p) => p.itemId === "headline");
  const old = cv.layout.order as string[];
  const next = order ? order.text.split(",") : [];
  const moved = movedKeys(old, next);
  return <div className="tailor-doc">
    {headline && <p><span className="tailor-item-label">{t("tailor.final.headline")}</span>{" "}
      {cv.basics.titles[0]?.trim() && <><del>{cv.basics.titles[0]}</del>{" → "}</>}<mark className="tailor-new">{headline.text}</mark></p>}
    {order && <>
      <p className="tailor-item-label">{t("tailor.final.order")}</p>
      <ol aria-label={t("tailor.final.order")}>{next.map((key) => <li key={key} className={moved.has(key) ? "is-moved" : undefined}>{sectionName(key)}
        {moved.has(key) && <> <span className="tailor-tag">{t("tailor.final.moved")}</span></>}</li>)}</ol>
    </>}
  </div>;
}

/**
 * FinalA: Achievements, Languages, or Order and headline on one short screen with the same highlights.
 * Using the new version keeps every change and leaves guesses for the guided review; the other button reverts them all.
 */
export function LayoutReview({ section, proposals, cv, busy, onAccept, removed = 0 }: Props) {
  const changes = proposals.filter((p) => p.flags.length === 0);
  const items = itemsOf(section, cv).filter((item) => changes.some((p) => p.itemId === item.id));
  const both = section === "layout" && changes.length === 2;

  function decide(keep: boolean) {
    const pick = (inferred: boolean) => changes.filter((p) => p.inferred === inferred).map((p) => ({ itemId: p.itemId, keep }));
    onAccept({ decisions: pick(false), inferred: keep ? [] : pick(true), flags: [] });
  }

  return <section className="tailor-card" aria-labelledby="tailor-final-title">
    <h2 id="tailor-final-title">{t(`tailor.section.${section}`)}</h2>
    {section === "layout" ? <LayoutBody proposals={changes} cv={cv} /> : <ul className="tailor-doc">
      {items.map((item) => <li key={item.id}>{Object.entries(item.fields).filter(([field, text]) =>
        text.trim() || changes.some((p) => p.itemId === item.id && p.field === field)).map(([field, text], i) => {
        const proposal = changes.find((p) => p.itemId === item.id && p.field === field);
        return <span key={field}>{i > 0 && " · "}{proposal ? <NewText before={text} proposal={proposal} /> : <span>{text}</span>}</span>;
      })}</li>)}
    </ul>}
    {removed > 0 && <p className="tailor-reason">{t(removed === 1 ? "tailor.review.removedOne" : "tailor.review.removedMany", { n: removed })}</p>}
    <div className="fm-foot">
      <button type="button" className="fm-ghost" disabled={busy} onClick={() => decide(false)}>
        {t(both ? "tailor.final.undoBoth" : "tailor.roleReview.keepOriginal")}</button>
      <button type="button" className="fm-btn" disabled={busy} onClick={() => decide(true)}>
        {t(busy ? "tailor.review.saving" : "tailor.roleReview.useNew")}</button>
    </div>
  </section>;
}
