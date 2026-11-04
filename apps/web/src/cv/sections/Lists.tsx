import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { DateField, ItemList, TextField, set } from "../fields.tsx";
import { blankItem } from "./blank.ts";

type Props<K extends keyof CvContent> = { items: CvContent[K]; onChange(next: CvContent[K]): void };
type FieldsProps<K extends "education" | "languages" | "certifications" | "projects"> = {
  value: CvContent[K][number];
  onChange(next: CvContent[K][number]): void;
};

export function EducationFields({ value: e, onChange }: FieldsProps<"education">) {
  return (
    <div className="cv-grid">
      <TextField label={t("cv.school")} value={e.school} onChange={(v) => onChange(set(e, "school", v))} />
      <TextField label={t("cv.degree")} value={e.degree} onChange={(v) => onChange(set(e, "degree", v))} />
      <TextField label={t("cv.field")} value={e.field} onChange={(v) => onChange(set(e, "field", v))} />
      <DateField label={t("cv.startDate")} value={e.startDate} onChange={(v) => onChange(set(e, "startDate", v))} />
      <DateField label={t("cv.endDate")} value={e.endDate} onChange={(v) => onChange(set(e, "endDate", v))} />
      <TextField label={t("cv.notes")} value={e.notes} onChange={(v) => onChange(set(e, "notes", v))} />
    </div>
  );
}

export function LanguageFields({ value: l, onChange }: FieldsProps<"languages">) {
  return (
    <div className="cv-grid">
      <TextField label={t("cv.language")} value={l.name} onChange={(v) => onChange(set(l, "name", v))} />
      <TextField label={t("cv.level")} value={l.level} onChange={(v) => onChange(set(l, "level", v))} />
    </div>
  );
}

export function CertificationFields({ value: c, onChange }: FieldsProps<"certifications">) {
  return (
    <div className="cv-grid">
      <TextField label={t("cv.certification")} value={c.name} onChange={(v) => onChange(set(c, "name", v))} />
      <TextField label={t("cv.issuer")} value={c.issuer} onChange={(v) => onChange(set(c, "issuer", v))} />
      <DateField label={t("cv.date")} value={c.date} onChange={(v) => onChange(set(c, "date", v))} />
    </div>
  );
}

export function ProjectFields({ value: p, onChange }: FieldsProps<"projects">) {
  return (
    <>
      <div className="cv-grid">
        <TextField label={t("cv.project")} value={p.name} onChange={(v) => onChange(set(p, "name", v))} />
        <TextField label={t("cv.url")} type="url" value={p.url} onChange={(v) => onChange(set(p, "url", v))} />
      </div>
      <TextField label={t("cv.description")} multiline maxLength={MAX_LONG_TEXT} value={p.description} onChange={(v) => onChange(set(p, "description", v))} />
    </>
  );
}

export function EducationSection({ items, onChange }: Props<"education">) {
  return (
    <ItemList
      title="cv.education"
      addLabel="cv.education.add"
      items={items}
      onChange={onChange}
      create={blankItem.education}
      renderItem={(e, update) => <EducationFields value={e} onChange={update} />}
    />
  );
}

export function LanguagesSection({ items, onChange }: Props<"languages">) {
  return (
    <ItemList
      title="cv.languages"
      addLabel="cv.languages.add"
      items={items}
      onChange={onChange}
      create={blankItem.languages}
      renderItem={(l, update) => <LanguageFields value={l} onChange={update} />}
    />
  );
}

export function CertificationsSection({ items, onChange }: Props<"certifications">) {
  return (
    <ItemList
      title="cv.certifications"
      addLabel="cv.certifications.add"
      items={items}
      onChange={onChange}
      create={blankItem.certifications}
      renderItem={(c, update) => <CertificationFields value={c} onChange={update} />}
    />
  );
}

export function ProjectsSection({ items, onChange }: Props<"projects">) {
  return (
    <ItemList
      title="cv.projects"
      addLabel="cv.projects.add"
      items={items}
      onChange={onChange}
      create={blankItem.projects}
      renderItem={(p, update) => <ProjectFields value={p} onChange={update} />}
    />
  );
}
