import type { SectionKey } from "@resumora/shared";
import { AchievementsEdit } from "./AchievementsEdit.tsx";
import { EducationEdit } from "./EducationEdit.tsx";
import { InterestsEdit } from "./InterestsEdit.tsx";
import { OtherEdit } from "./OtherEdit.tsx";
import { RolesEdit } from "./RolesEdit.tsx";
import { SimpleListEdit, type SimpleList } from "./SimpleListEdit.tsx";
import { SkillsEdit } from "./SkillsEdit.tsx";
import { SummaryEdit } from "./SummaryEdit.tsx";
import type { SectionRenderer } from "./types.ts";

const simple = (list: SimpleList): SectionRenderer =>
  function Simple({ cv, dispatch }) {
    return <SimpleListEdit list={list} items={cv[list]} locale={cv.locale} dispatch={dispatch} />;
  };

/** Section bodies by key. Every section body has an entry; the header is drawn on its own. */
export const sectionRenderers: Partial<Record<SectionKey, SectionRenderer>> = {
  summary: SummaryEdit,
  achievements: AchievementsEdit,
  experience: function Experience({ cv, dispatch, scores }) {
    return <RolesEdit list="experience" items={cv.experience} locale={cv.locale} dispatch={dispatch} scores={scores} />;
  },
  volunteering: function Volunteering({ cv, dispatch }) {
    return <RolesEdit list="volunteering" items={cv.volunteering} locale={cv.locale} dispatch={dispatch} />;
  },
  education: function Education({ cv, dispatch }) {
    return <EducationEdit items={cv.education} locale={cv.locale} dispatch={dispatch} />;
  },
  skills: SkillsEdit,
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
    case "experience":
    case "volunteering":
      return `${key}-${id}-title`;
    case "education":
      return `education-${id}-degree`;
    case "skills":
      return "skills-technicalSkills";
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
