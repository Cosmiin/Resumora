import { MAX_LONG_TEXT, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ItemList, TextField, set } from "../fields.tsx";

type Props<K extends keyof CvContent> = { items: CvContent[K]; onChange(next: CvContent[K]): void };

export function EducationSection({ items, onChange }: Props<"education">) {
  return (
    <ItemList
      title="cv.education"
      addLabel="cv.education.add"
      items={items}
      onChange={onChange}
      create={() => ({ school: "", degree: "", field: "", startDate: "", endDate: "", notes: "" })}
      renderItem={(e, update) => (
        <div className="cv-grid">
          <TextField label={t("cv.school")} value={e.school} onChange={(v) => update(set(e, "school", v))} />
          <TextField label={t("cv.degree")} value={e.degree} onChange={(v) => update(set(e, "degree", v))} />
          <TextField label={t("cv.field")} value={e.field} onChange={(v) => update(set(e, "field", v))} />
          <TextField label={t("cv.startDate")} type="month" value={e.startDate} onChange={(v) => update(set(e, "startDate", v))} />
          <TextField label={t("cv.endDate")} type="month" value={e.endDate} onChange={(v) => update(set(e, "endDate", v))} />
          <TextField label={t("cv.notes")} value={e.notes} onChange={(v) => update(set(e, "notes", v))} />
        </div>
      )}
    />
  );
}

export function SkillsSection({ items, onChange }: Props<"skills">) {
  return (
    <ItemList
      title="cv.skills"
      addLabel="cv.skills.add"
      items={items}
      onChange={onChange}
      create={() => ({ name: "", category: "" })}
      renderItem={(s, update) => (
        <div className="cv-grid">
          <TextField label={t("cv.skill")} value={s.name} onChange={(v) => update(set(s, "name", v))} />
          <TextField label={t("cv.category")} value={s.category} onChange={(v) => update(set(s, "category", v))} />
        </div>
      )}
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
      create={() => ({ name: "", level: "" })}
      renderItem={(l, update) => (
        <div className="cv-grid">
          <TextField label={t("cv.language")} value={l.name} onChange={(v) => update(set(l, "name", v))} />
          <TextField label={t("cv.level")} value={l.level} onChange={(v) => update(set(l, "level", v))} />
        </div>
      )}
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
      create={() => ({ name: "", issuer: "", date: "" })}
      renderItem={(c, update) => (
        <div className="cv-grid">
          <TextField label={t("cv.certification")} value={c.name} onChange={(v) => update(set(c, "name", v))} />
          <TextField label={t("cv.issuer")} value={c.issuer} onChange={(v) => update(set(c, "issuer", v))} />
          <TextField label={t("cv.date")} type="month" value={c.date} onChange={(v) => update(set(c, "date", v))} />
        </div>
      )}
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
      create={() => ({ name: "", description: "", url: "" })}
      renderItem={(p, update) => (
        <>
          <div className="cv-grid">
            <TextField label={t("cv.project")} value={p.name} onChange={(v) => update(set(p, "name", v))} />
            <TextField label={t("cv.url")} type="url" value={p.url} onChange={(v) => update(set(p, "url", v))} />
          </div>
          <TextField label={t("cv.description")} multiline maxLength={MAX_LONG_TEXT} value={p.description} onChange={(v) => update(set(p, "description", v))} />
        </>
      )}
    />
  );
}
