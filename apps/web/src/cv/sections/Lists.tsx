import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { DateField, TextField, set } from "../fields.tsx";

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
