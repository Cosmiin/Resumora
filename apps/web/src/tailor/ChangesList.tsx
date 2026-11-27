import { useState } from "react";
import { CATEGORY, isSectionEmpty, scoredItems, type CvContent, type SectionKey, type TailoredCv } from "@resumora/shared";
import { useLanguage } from "../i18n/language.ts";
import { useT } from "../i18n/t.ts";
import { reviewItem } from "./tailored-api.ts";

type ItemReview = { kept?: boolean; inferred?: boolean; reviewed?: boolean; text?: string };

export type Change = {
  section: string;
  key: string;
  /**
   * text: a reworded line, name or summary. skill: a skill the tailoring added. hide: an item hidden for this job.
   * order: a section's items in a new order. sections: the CV's sections in a new order. headline: the proposed headline.
   */
  kind: "text" | "skill" | "hide" | "order" | "sections" | "headline";
  /** The person's own wording, and the tailored one. */
  before: string;
  after: string;
  /** on: the tailored version is on the CV. off: the person's own is, by their choice. open: not decided yet (a headline). */
  state: "on" | "off" | "open";
};
export type ChangeGroup = { id: string; title: string; changes: Change[] };

type Labels = { headline: string; sections: string; section(key: string): string; sectionName(key: SectionKey): string };
type Texts = Record<string, unknown>;

/** Everything with an id and text fields, by id: roles and their lines, skills, awards, languages, the lighter items' lines. */
function textItems(cv: CvContent): Map<string, Texts> {
  const roles = scoredItems(cv).map(({ item }) => item);
  const lined = [...cv.awards, ...cv.courses, ...cv.publications, ...cv.interests].flatMap((item) => item.bullets ?? []);
  return new Map([...roles, ...roles.flatMap((role) => role.bullets), ...cv.technicalSkills, ...cv.professionalSkills,
    ...cv.awards, ...cv.languages, ...lined].map((item) => [item.id, item as Texts]));
}
const WORDING = ["text", "description", "name", "title", "level"];
const str = (value: unknown) => (typeof value === "string" ? value : "");
/** "Title · Company": how a role is named in the list and on the final page. */
export const roleName = (role: { title: string; company: string }) => [role.title.trim(), role.company.trim()].filter(Boolean).join(" · ");
const LIGHT = ["achievements", "courses", "publications", "interests"] as const;
const lightList = (cv: CvContent, section: string): Array<{ id: string; hidden?: boolean } & Texts> =>
  (section === "achievements" ? cv.awards : (LIGHT as readonly string[]).includes(section) ? cv[section as "courses"] : []) as Array<{ id: string; hidden?: boolean } & Texts>;
const itemName = (item: Texts | undefined) => str(item?.name) || str(item?.title);
/** The sections a reader sees, in order, by name. */
const shownSections = (cv: CvContent, order: SectionKey[], name: Labels["sectionName"]) =>
  order.filter((key) => !cv.layout.hidden.includes(key) && !isSectionEmpty(cv, key)).map(name).join(" · ");

/**
 * What the tailoring did to a CV, from its review state: each change with the person's wording and the tailored one,
 * grouped by role or section, and whether it is on the CV. A change the CV no longer has as it was made (the line was
 * edited since) is left out: it can't be undone from here. `unchanged` names the roles and sections with no change on.
 */
export function changesOf(cv: TailoredCv, labels: Labels): { groups: ChangeGroup[]; unchanged: string[] } {
  const now = textItems(cv.content);
  const own = textItems(cv.baseSnapshot);
  const roles = scoredItems(cv.content).map(({ item }) => item);
  const roleOf = new Map(roles.flatMap((role) => [role.id, ...role.bullets.map((line) => line.id)].map((id) => [id, role] as const)));
  const groups = new Map<string, ChangeGroup>();
  const add = (id: string, title: string, change: Change) => {
    if (!groups.has(id)) groups.set(id, { id, title, changes: [] });
    groups.get(id)!.changes.push(change);
  };
  const review = (cv.review ?? {}) as Record<string, unknown>;
  const entries = (section: string) => Object.entries((review[section] && typeof review[section] === "object" ? review[section] : {}) as Record<string, ItemReview>)
    .filter(([, item]) => item && typeof item === "object" && (item.kept || item.reviewed));
  const state = (item: ItemReview): Change["state"] => (item.kept ? "on" : "off");

  const headline = (review.layout as Record<string, ItemReview> | undefined)?.headline;
  if (headline?.text) {
    add("headline", labels.headline, { section: "layout", key: "headline", kind: "headline", before: cv.baseSnapshot.basics.titles[0] ?? "",
      after: headline.text, state: headline.kept ? "on" : headline.reviewed ? "off" : "open" });
  }
  for (const section of Object.keys(review).filter((key) => key !== "layout")) {
    for (const [key, item] of entries(section)) {
      // A guessed phrase of the summary has its own review (the notice under the list).
      if (key.includes("#")) continue;
      const text = item.text ?? "";
      const role = roleOf.get(key);
      const group: [string, string] = role ? [role.id, roleName(role)] : [section, labels.section(section)];
      if (key === "summary") {
        const before = cv.baseSnapshot.basics.summary;
        if (item.kept && cv.content.basics.summary === before) continue;
        add(...group, { section, key, kind: "text", before, after: item.kept ? cv.content.basics.summary : text, state: state(item) });
      } else if (key.startsWith("new-skill:")) {
        const name = text.trim().toLowerCase();
        const there = [...cv.content.technicalSkills, ...cv.content.professionalSkills].some((skill) => skill.name.trim().toLowerCase() === name);
        if (item.kept && !there) continue;
        add(...group, { section, key, kind: "skill", before: "", after: text, state: state(item) });
      } else if (key.startsWith("hide:")) {
        const target = lightList(cv.content, section).find((entry) => entry.id === key.slice("hide:".length));
        if (!target || (item.kept && !target.hidden)) continue;
        add(...group, { section, key, kind: "hide", before: "", after: itemName(target), state: state(item) });
      } else if (key === "order") {
        const names = (list: CvContent) => lightList(list, section).map(itemName).join(" · ");
        if (item.kept && names(cv.content) === names(cv.baseSnapshot)) continue;
        add(...group, { section, key, kind: "order", before: names(cv.baseSnapshot), after: names(cv.content), state: state(item) });
      } else {
        const target = now.get(key);
        const base = own.get(key);
        if (!target) continue;
        // On the CV: the field that holds the tailored wording. Undone: the person's own wording is back.
        const field = item.kept ? Object.keys(target).find((name) => name !== "id" && target[name] === text)
          : WORDING.find((name) => str(target[name]));
        if (!field) continue;
        const before = str(base?.[field]);
        if (item.kept && before === text) continue;
        add(...group, { section, key, kind: "text", before: item.kept ? before : str(target[field]), after: text, state: state(item) });
      }
    }
  }
  const sections = (review.layout as Record<string, ItemReview> | undefined)?.layout;
  if (sections && (sections.kept || sections.reviewed)) {
    add("sections", labels.sections, { section: "layout", key: "layout", kind: "sections", state: state(sections),
      before: shownSections(cv.content, cv.baseSnapshot.layout.order, labels.sectionName),
      after: shownSections(cv.content, (sections.text ?? "").split(",") as SectionKey[], labels.sectionName) });
  }

  // Headline first (a choice to make), then the roles in CV order, the sections, and the section order last.
  const on = (id: string) => groups.get(id)?.changes.some((change) => change.state === "on") ?? false;
  const rest = [...groups.keys()].filter((id) => id !== "headline" && id !== "sections" && !roles.some((role) => role.id === id));
  const order = ["headline", ...roles.map((role) => role.id), ...rest, "sections"];
  const unchanged = [
    ...roles.filter((role) => !on(role.id)).map(roleName),
    ...(["skills", "summary"] as const).filter((key) => !isSectionEmpty(cv.content, key) && !on(key)).map((key) => labels.section(key)),
  ].filter(Boolean);
  return { groups: order.flatMap((id) => (groups.has(id) ? [groups.get(id)!] : [])), unchanged };
}

/**
 * The tailored CV's changes, each already on the CV and each with its way back: Undo for a reworded line (the
 * person's wording returns, for good), Remove for an added skill, and a choice of two for the section order and for
 * the headline, which is never applied until the person picks it.
 */
export function ChangesList({ cv, onChange }: { cv: TailoredCv; onChange(cv: TailoredCv): void }) {
  const t = useT();
  const language = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { groups, unchanged } = changesOf(cv, {
    headline: t("tailor.final.headline"), sections: t("tailor.final.order"),
    section: (key) => t(`tailor.section.${key}` as Parameters<typeof t>[0]),
    sectionName: (key) => CATEGORY[key]?.label[language] ?? key,
  });
  const id = (change: Change) => `${change.section}/${change.key}`;

  async function act(change: Change, action: "keep" | "remove") {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      onChange(await reviewItem(cv.id, { section: change.section, key: change.key, action, version: cv.version }));
    } catch { setFailed(id(change)); } finally { setBusy(false); }
  }
  const undo = (change: Change, label: string) => change.state === "on"
    && <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => void act(change, "remove")}>{label}</button>;
  const pick = (change: Change, use: string) => <>
    <button type="button" className="ui-btn ui-btn--sm" aria-pressed={change.state === "on"} disabled={busy}
      onClick={() => { if (change.state !== "on") void act(change, "keep"); }}>{use}</button>
    <button type="button" className="ui-btn ui-btn--sm" aria-pressed={change.state === "off"} disabled={busy}
      onClick={() => { if (change.state !== "off") void act(change, "remove"); }}>{t("tailor.final.keepMine")}</button>
  </>;
  const body = (change: Change) => {
    const off = change.state === "off";
    switch (change.kind) {
      case "headline": return <><div className="tailor-change-text">
        <p><b>{change.after}</b></p>
        {change.before && <p className="ui-small ui-muted">{t("tailor.changes.yours", { text: change.before })}</p>}
      </div><div className="tailor-change-acts">{pick(change, t("tailor.changes.useHeadline"))}</div></>;
      case "sections": return <><div className="tailor-change-text">
        <p>{change.after}</p>
        <p className="ui-small ui-muted">{t("tailor.changes.yours", { text: change.before })}</p>
      </div><div className="tailor-change-acts">{pick(change, t("tailor.changes.useOrder"))}</div></>;
      case "skill": return <><div className="tailor-change-text"><p>{t(off ? "tailor.changes.skillRemoved" : "tailor.changes.skillAdded", { name: change.after })}</p></div>
        <div className="tailor-change-acts">{undo(change, t("tailor.changes.remove"))}</div></>;
      case "hide": return <><div className="tailor-change-text"><p>{t(off ? "tailor.changes.shownAgain" : "tailor.changes.hidden", { name: change.after })}</p></div>
        <div className="tailor-change-acts">{undo(change, t("tailor.changes.show"))}</div></>;
      case "order": return <><div className="tailor-change-text">
        <p>{off ? t("tailor.changes.orderKept") : t("tailor.changes.reordered", { list: change.after })}</p></div>
        <div className="tailor-change-acts">{undo(change, t("tailor.changes.undo"))}</div></>;
      default: return off
        ? <div className="tailor-change-text"><p>{change.before}</p><p className="ui-small ui-muted">{t("tailor.changes.undone")}</p></div>
        : <><div className="tailor-change-text">
          {change.before && <p className="tailor-change-before"><s>{change.before}</s></p>}
          <p>{change.after}</p>
        </div><div className="tailor-change-acts">{undo(change, t("tailor.changes.undo"))}</div></>;
    }
  };

  return <section className="ui-sheet ui-stack tailor-changes" aria-labelledby="tailor-changes-title">
    <h2 className="ui-heading" id="tailor-changes-title">{t("tailor.changes.title")}</h2>
    {groups.length === 0 ? <p>{t("tailor.changes.none")}</p> : <p className="ui-small ui-muted">{t("tailor.changes.lead")}</p>}
    {groups.map((group) => <div key={group.id} role="group" aria-label={group.title} className="tailor-change-group">
      <h3 className="ui-label">{group.title}</h3>
      <ul>{group.changes.map((change) => <li key={id(change)} className="tailor-change">
        {body(change)}
        {failed === id(change) && <p role="alert" className="ui-notice ui-notice--bad">{t("tailor.changes.failed")}</p>}
      </li>)}</ul>
    </div>)}
    {groups.length > 0 && unchanged.length > 0 && <p className="ui-small ui-muted">{t("tailor.changes.unchanged", { list: unchanged.join(", ") })}</p>}
  </section>;
}
