import { MAX_BULLETS, MAX_LONG_TEXT, newId, type Experience } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { DateField, ItemList, TextField, set } from "../fields.tsx";

const blank = (): Omit<Experience, "id"> => ({
  company: "",
  title: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  description: "",
  bullets: [],
});

export function ExperienceSection({ items, onChange }: { items: Experience[]; onChange(next: Experience[]): void }) {
  return (
    <ItemList
      title="cv.experience"
      addLabel="cv.experience.add"
      items={items}
      onChange={onChange}
      create={blank}
      renderItem={(exp, update) => (
        <>
          <div className="cv-grid">
            <TextField label={t("cv.company")} value={exp.company} onChange={(v) => update(set(exp, "company", v))} />
            <TextField label={t("cv.title")} value={exp.title} onChange={(v) => update(set(exp, "title", v))} />
            <TextField label={t("cv.location")} value={exp.location} onChange={(v) => update(set(exp, "location", v))} />
            <DateField label={t("cv.startDate")} value={exp.startDate} onChange={(v) => update(set(exp, "startDate", v))} />
            {!exp.current && (
              <DateField label={t("cv.endDate")} value={exp.endDate} onChange={(v) => update(set(exp, "endDate", v))} />
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={exp.current}
                onChange={(e) => update({ ...exp, current: e.target.checked, endDate: e.target.checked ? "" : exp.endDate })}
              />
              {t("cv.current")}
            </label>
          </div>
          <TextField
            label={t("cv.roleDescription")}
            multiline
            maxLength={MAX_LONG_TEXT}
            value={exp.description}
            onChange={(v) => update(set(exp, "description", v))}
          />
          <ol className="cv-bullets">
            {exp.bullets.map((bullet, i) => (
              <li key={bullet.id}>
                <TextField
                  label={t("cv.bullet", { n: i + 1 })}
                  multiline
                  value={bullet.text}
                  onChange={(v) => update(set(exp, "bullets", exp.bullets.map((b) => (b.id === bullet.id ? { ...b, text: v } : b))))}
                />
                <button
                  type="button"
                  className="link"
                  aria-label={t("cv.bullet.remove", { n: i + 1 })}
                  onClick={() => update(set(exp, "bullets", exp.bullets.filter((b) => b.id !== bullet.id)))}
                >
                  {t("cv.item.remove")}
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="secondary"
            disabled={exp.bullets.length >= MAX_BULLETS}
            onClick={() => update(set(exp, "bullets", [...exp.bullets, { id: newId(), text: "" }]))}
          >
            {t("cv.bullet.add")}
          </button>
        </>
      )}
    />
  );
}
