import { z } from "zod";
import { SECTION_KEYS, type SectionKey } from "./categories.ts";
import { CvContentSchema, CvContentV1Schema, defaultLayout, type CvContent, type CvContentV1, type Layout } from "./cv.ts";

export { defaultLayout };

/** Turns a v1 CV into v2: every v1 field kept as is, new lists empty, default layout. */
export function upgradeCv(v1: CvContentV1): CvContent {
  return {
    ...v1,
    schemaVersion: 2,
    achievements: [],
    volunteering: [],
    awards: [],
    courses: [],
    publications: [],
    interests: [],
    layout: defaultLayout(),
    enrichedAt: null,
  };
}

/** Repairs a stored layout so it always lists every section exactly once. */
export function normalizeLayout(layout: Layout): Layout {
  const known = new Set<SectionKey>(SECTION_KEYS);
  const order: SectionKey[] = [];
  for (const key of layout.order) {
    if (known.has(key) && !order.includes(key)) order.push(key);
  }
  for (const key of SECTION_KEYS) {
    if (!order.includes(key)) order.push(key);
  }
  const hidden = layout.hidden.filter((key, i) => order.includes(key) && layout.hidden.indexOf(key) === i);
  const titles: Layout["titles"] = {};
  for (const key of order) {
    const title = layout.titles[key];
    if (title !== undefined && title.trim() !== "") titles[key] = title;
  }
  return { order, hidden, titles };
}

/** What the database holds: v2 as is (layout repaired), v1 upgraded. */
export const StoredCvSchema = z
  .union([CvContentSchema, CvContentV1Schema])
  .transform((c): CvContent => (c.schemaVersion === 1 ? upgradeCv(c) : { ...c, layout: normalizeLayout(c.layout) }));
