import type { ComponentType } from "react";
import type { CvContent } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import type { BlockRef, SectionKey } from "./page/blocks.ts";
import type { ListSection } from "./sections/blank.ts";
import { BasicsFields, SummaryField } from "./sections/Basics.tsx";
import { ExperienceFields } from "./sections/Experience.tsx";
import { CertificationFields, EducationFields, LanguageFields, ProjectFields } from "./sections/Lists.tsx";
import { CustomFields } from "./sections/Custom.tsx";
import { SkillsSection } from "./sections/Skills.tsx";

export type ListItem = { id: string };

export const LIST_SECTIONS: readonly SectionKey[] = ["experience", "education", "languages", "certifications", "projects", "custom"];
export const isListSection = (section: SectionKey): section is ListSection => LIST_SECTIONS.includes(section);

export const sectionLabel: Record<SectionKey, MessageKey> = {
  basics: "cv.basics",
  summary: "cv.summary",
  experience: "cv.experience",
  education: "cv.education",
  skills: "cv.skills",
  languages: "cv.languages",
  certifications: "cv.certifications",
  projects: "cv.projects",
  custom: "cv.custom",
};

type FieldsOf<K extends ListSection> = ComponentType<{ value: CvContent[K][number]; onChange(next: CvContent[K][number]): void }>;

const listFields: { [K in ListSection]: FieldsOf<K> } = {
  experience: ExperienceFields,
  education: EducationFields,
  languages: LanguageFields,
  certifications: CertificationFields,
  projects: ProjectFields,
  custom: CustomFields,
};

export function listItems(cv: CvContent, section: ListSection): ListItem[] {
  return cv[section];
}

export function withListItems(cv: CvContent, section: ListSection, items: ListItem[]): CvContent {
  return { ...cv, [section]: items };
}

/** The display title of the open block: the item's own name, or a fallback. */
export function panelTitle(cv: CvContent, ref: BlockRef): string {
  if (ref.section === "basics") return cv.basics.fullName || t("panel.title.basics");
  if (ref.section === "summary") return t("panel.title.summary");
  if (ref.section === "skills") return t("cv.skills");
  const id = ref.itemId;
  const name = (() => {
    switch (ref.section) {
      case "experience": {
        const e = cv.experience.find((x) => x.id === id);
        return e && (e.title || e.company);
      }
      case "education": {
        const e = cv.education.find((x) => x.id === id);
        return e && (e.school || e.degree);
      }
      case "languages":
        return cv.languages.find((x) => x.id === id)?.name;
      case "certifications":
        return cv.certifications.find((x) => x.id === id)?.name;
      case "projects":
        return cv.projects.find((x) => x.id === id)?.name;
      case "custom":
        return cv.custom.find((x) => x.id === id)?.title;
    }
  })();
  return name || t("panel.title.untitled");
}

/** The fields for the open block. */
export function PanelBody({ cv, selected, onChange }: { cv: CvContent; selected: BlockRef; onChange(next: CvContent): void }) {
  const { section } = selected;
  if (section === "basics") return <BasicsFields value={cv.basics} onChange={(basics) => onChange({ ...cv, basics })} />;
  if (section === "summary") {
    return <SummaryField value={cv.basics.summary} onChange={(summary) => onChange({ ...cv, basics: { ...cv.basics, summary } })} />;
  }
  if (section === "skills") return <SkillsSection cv={cv} onChange={(skills) => onChange({ ...cv, ...skills })} />;

  const items = listItems(cv, section);
  const item = items.find((x) => x.id === selected.itemId);
  if (!item) return null;
  const Fields = listFields[section] as unknown as ComponentType<{ value: ListItem; onChange(next: ListItem): void }>;
  return (
    <Fields
      key={item.id}
      value={item}
      onChange={(next) => onChange(withListItems(cv, section, items.map((x) => (x.id === next.id ? next : x))))}
    />
  );
}
