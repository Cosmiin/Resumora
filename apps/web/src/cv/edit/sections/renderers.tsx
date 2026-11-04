import type { SectionKey } from "@resumora/shared";
import { AchievementsEdit } from "./AchievementsEdit.tsx";
import { InterestsEdit } from "./InterestsEdit.tsx";
import { OtherEdit } from "./OtherEdit.tsx";
import { SimpleListEdit, type SimpleList } from "./SimpleListEdit.tsx";
import { SummaryEdit } from "./SummaryEdit.tsx";
import type { SectionRenderer } from "./types.ts";

const simple = (list: SimpleList): SectionRenderer =>
  function Simple({ cv, dispatch }) {
    return <SimpleListEdit list={list} items={cv[list]} dispatch={dispatch} />;
  };

/** Section bodies by key. Sections without an entry (roles, education, skills) are added later. */
export const sectionRenderers: Partial<Record<SectionKey, SectionRenderer>> = {
  summary: SummaryEdit,
  achievements: AchievementsEdit,
  languages: simple("languages"),
  certifications: simple("certifications"),
  projects: simple("projects"),
  awards: simple("awards"),
  courses: simple("courses"),
  publications: simple("publications"),
  interests: InterestsEdit,
  other: function Other({ cv, dispatch }) {
    return <OtherEdit items={cv.custom} dispatch={dispatch} />;
  },
};

/** The field that gets the cursor when a section is added; null when unknown. */
export function firstFieldKey(key: SectionKey, id: string): string | null {
  switch (key) {
    case "summary":
      return "summary";
    case "achievements":
      return `bullet-${id}`;
    case "other":
      return `custom-${id}-title`;
    case "languages":
    case "certifications":
    case "projects":
    case "awards":
    case "courses":
      return `${key}-${id}-name`;
    case "publications":
      return `publications-${id}-title`;
    case "interests":
      return "interests";
    default:
      return null;
  }
}
