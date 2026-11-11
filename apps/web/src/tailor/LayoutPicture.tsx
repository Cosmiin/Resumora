import { useState } from "react";
import { CATEGORY, isSectionEmpty, type CvContent, type Proposal, type SectionKey } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { diffWords } from "./diff-words.ts";
import type { AcceptBody } from "./tailor-api.ts";

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

type Props = { proposals: Proposal[]; cv: CvContent; busy: boolean; onAccept(body: AcceptBody): void };

/**
 * Order and headline as a picture: on the left one card per change (the headline; the sections that move), each
 * kept or used on its own; on the right the CV in small, with the headline and the sections as blocks in the
 * order the choices give. A section that moved is lit and numbered, and a dashed line shows where it was.
 * Only sections the CV has are shown.
 */
export function LayoutPicture({ proposals, cv, busy, onAccept }: Props) {
  const order = proposals.find((p) => p.itemId === "layout");
  const headline = proposals.find((p) => p.itemId === "headline");
  const [use, setUse] = useState<Record<string, boolean>>({});
  const on = (itemId: string) => use[itemId] !== false;

  const filled = (keys: readonly string[]) => keys.filter((key) => !isSectionEmpty(cv, key as SectionKey));
  const old = filled(cv.layout.order);
  const next = order ? filled(order.text.split(",")) : old;
  const moved = [...movedKeys(old, next)];
  const first = headline ? 2 : 1;
  const oldTitle = cv.basics.titles[0]?.trim() ?? "";

  // The picture: the order the choice gives; with the new order, a ghost where each moved section was.
  const newOrder = !!order && on("layout") && moved.length > 0;
  const blocks: Array<{ key: string; ghost?: boolean }> = (newOrder ? next : old).map((key) => ({ key }));
  if (newOrder) {
    for (const key of moved) {
      const after = old[old.indexOf(key) + 1];
      const at = after ? blocks.findIndex((block) => block.key === after && !block.ghost) : blocks.length;
      blocks.splice(at < 0 ? blocks.length : at, 0, { key, ghost: true });
    }
  }

  const choice = (itemId: string, yes: string) => <div className="ui-row" role="group">
    <button type="button" className="ui-btn ui-btn--sm" aria-pressed={!on(itemId)} disabled={busy} onClick={() => setUse({ ...use, [itemId]: false })}>
      {t("tailor.final.keepMine")}</button>
    <button type="button" className="ui-btn ui-btn--sm" aria-pressed={on(itemId)} disabled={busy} onClick={() => setUse({ ...use, [itemId]: true })}>{yes}</button>
  </div>;

  return <section className="tailor-pic" aria-labelledby="tailor-final-title">
    <div className="tailor-pic-changes">
      <div>
        <h2 className="ui-title" id="tailor-final-title">{t("tailor.final.title")}</h2>
        <p className="ui-muted">{t("tailor.final.lead")}</p>
      </div>
      {headline && <article className="ui-sheet tailor-pic-card" aria-label={t("tailor.final.headline")}>
        <h3 className="ui-heading"><span className="tailor-pic-n">1</span>{t("tailor.final.headline")}</h3>
        <p lang={cv.locale}>{oldTitle && <><del>{oldTitle}</del>{" → "}</>}
          <b>{diffWords(oldTitle, headline.text).map((part, i) => part.changed ? <ins key={i}>{part.text}</ins> : part.text)}</b></p>
        {choice("headline", t("tailor.final.useHeadline"))}
      </article>}
      {order && moved.length > 0 && <article className="ui-sheet tailor-pic-card" aria-label={t("tailor.final.order")}>
        <h3 className="ui-heading">{t("tailor.final.order")}</h3>
        <ul className="tailor-pic-moves" aria-label={t("tailor.final.order")}>
          {moved.map((key, i) => {
            const from = old.indexOf(key) + 1, to = next.indexOf(key) + 1, below = next[to];
            return <li key={key}>
              <span className="tailor-pic-n">{first + i}</span>
              <span><b>{t(to < from ? "tailor.final.movesUp" : "tailor.final.movesDown", { name: sectionName(key) })}</b>{" "}
                {below ? t("tailor.final.place", { from, to, next: sectionName(below) }) : t("tailor.final.placeLast", { from, to })}</span>
            </li>;
          })}
        </ul>
        {choice("layout", t("tailor.final.useOrder"))}
      </article>}
      <div className="tailor-foot">
        <span />
        <button type="button" className="ui-btn ui-btn--primary" disabled={busy}
          onClick={() => onAccept({ decisions: proposals.map((p) => ({ itemId: p.itemId, keep: on(p.itemId) })), inferred: [], flags: [] })}>
          {t(busy ? "tailor.review.saving" : "tailor.roleReview.save")}</button>
      </div>
    </div>
    <div className="ui-sheet tailor-pic-page" role="img" aria-label={t("tailor.final.picture")}>
      <p className="ui-label">{t("tailor.final.picture")}</p>
      {cv.basics.fullName.trim() && <p className="tailor-pic-name">{cv.basics.fullName}</p>}
      <p className="tailor-pic-head" lang={cv.locale}>{headline && <span className="tailor-pic-n">1</span>}
        {headline && on("headline") ? diffWords(oldTitle, headline.text).map((part, i) => part.changed ? <ins key={i}>{part.text}</ins> : part.text) : oldTitle}</p>
      {blocks.map(({ key, ghost }) => ghost
        ? <p key={`was-${key}`} className="tailor-pic-ghost">{t("tailor.final.wasHere", { name: sectionName(key) })}</p>
        : <div key={key} className={newOrder && moved.includes(key) ? "tailor-pic-blk is-moved" : "tailor-pic-blk"}>
          <b>{sectionName(key)}</b><span><i /><i /></span>
          {newOrder && moved.includes(key) && <span className="tailor-pic-tag">{first + moved.indexOf(key)} · {t(next.indexOf(key) < old.indexOf(key) ? "tailor.final.movedUp" : "tailor.final.movedDown")}</span>}
        </div>)}
    </div>
  </section>;
}
