import { MAX_ITEMS, newId, type CvContent, type Skill, type SkillGroup } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { MessageKey } from "../../i18n/en.ts";
import { TextField } from "../fields.tsx";

export type Skills = Pick<CvContent, SkillGroup>;

const groups: { key: SkillGroup; title: MessageKey; add: MessageKey }[] = [
  { key: "technicalSkills", title: "cv.skills.technical", add: "cv.skills.addTechnical" },
  { key: "professionalSkills", title: "cv.skills.professional", add: "cv.skills.addProfessional" },
  { key: "unclearSkills", title: "cv.skills.unclear", add: "cv.skills.addTechnical" },
];

/**
 * The three skill groups. "Skills to sort" only appears when it has items, and each of its
 * skills can be moved to technical or professional (keeping its id) or removed.
 */
export function SkillsSection({ cv, onChange }: { cv: Skills; onChange(next: Skills): void }) {
  const change = (next: Partial<Skills>) => onChange({ ...cv, ...next });
  const moveTo = (skill: Skill, to: SkillGroup) =>
    change({ unclearSkills: cv.unclearSkills.filter((s) => s.id !== skill.id), [to]: [...cv[to], skill] });

  return (
    <section className="cv-section">
      <h2>{t("cv.skills")}</h2>
      {groups.map(({ key, title, add }) => {
        const items = cv[key];
        const unclear = key === "unclearSkills";
        if (unclear && items.length === 0) return null;
        return (
          <div key={key} className={unclear ? "skill-group skill-group-unclear" : "skill-group"}>
            <h3>{t(title)}</h3>
            {unclear && <p className="hint">{t("cv.skills.unclearHint")}</p>}
            {items.map((skill, i) => (
              <div key={skill.id} className="skill-row">
                <TextField
                  label={t("cv.skill.n", { n: i + 1 })}
                  value={skill.name}
                  onChange={(name) => change({ [key]: items.map((s) => (s.id === skill.id ? { ...s, name } : s)) })}
                />
                {unclear && (
                  <>
                    <button type="button" className="secondary" aria-label={t("cv.skills.toTechnicalNamed", { name: skill.name })} onClick={() => moveTo(skill, "technicalSkills")}>
                      {t("cv.skills.toTechnical")}
                    </button>
                    <button type="button" className="secondary" aria-label={t("cv.skills.toProfessionalNamed", { name: skill.name })} onClick={() => moveTo(skill, "professionalSkills")}>
                      {t("cv.skills.toProfessional")}
                    </button>
                  </>
                )}
                <button type="button" className="link" onClick={() => change({ [key]: items.filter((s) => s.id !== skill.id) })}>
                  {t("cv.item.remove")}
                </button>
              </div>
            ))}
            {!unclear && (
              <button type="button" disabled={items.length >= MAX_ITEMS} onClick={() => change({ [key]: [...items, { id: newId(), name: "" }] })}>
                {t(add)}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
