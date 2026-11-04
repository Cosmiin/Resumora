import { CATEGORY, type CategoryKey, type FlagLevel, type SectionKey } from "./categories.ts";
import type { CvContent } from "./cv.ts";
import { normalizeLayout } from "./upgrade.ts";

export type Flag = { key: CategoryKey; level: FlagLevel; field?: "fullName" | "email" };

/** True when a section has nothing worth showing. The header is not a section. */
export function isSectionEmpty(cv: CvContent, key: SectionKey): boolean {
  switch (key) {
    case "summary":
      return cv.basics.summary.trim() === "";
    case "skills":
      return (
        cv.technicalSkills.length === 0 &&
        cv.professionalSkills.length === 0 &&
        cv.unclearSkills.length === 0
      );
    case "achievements":
      return cv.achievements.every((b) => b.text.trim() === "");
    case "other":
      return cv.custom.length === 0;
    default:
      return cv[key].length === 0;
  }
}

/** Gentle flags for what the CV lacks, in page order: header first, then visible sections. */
export function missingCategories(cv: CvContent): Flag[] {
  const flags: Flag[] = [];
  if (cv.basics.fullName.trim() === "") flags.push({ key: "header", level: "missing", field: "fullName" });
  if (cv.basics.email.trim() === "") flags.push({ key: "header", level: "missing", field: "email" });
  const { order, hidden } = normalizeLayout(cv.layout);
  for (const key of order) {
    const level = CATEGORY[key].flag;
    if (level === null || hidden.includes(key) || !isSectionEmpty(cv, key)) continue;
    flags.push({ key, level });
  }
  return flags;
}
