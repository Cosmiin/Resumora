import { SKILL_GROUPS as GROUP_KEYS, type CvContent, type Locale, type TailorQuestion } from "@resumora/shared";
import { SKILL_GROUPS } from "../cv/page/blocks.ts";
import { t } from "../i18n/t.ts";
import "../styles/focus.css";

/** The sections a question outside the roles can be about, and so can show beside it. */
export const hasSectionPanel = (section: string): section is "skills" | "summary" => section === "skills" || section === "summary";

/**
 * What a question outside the roles will change, on a sheet beside it: the CV's skills, with the skill in
 * question as a lit place among them, or the CV's summary, lit as a whole.
 */
export function SectionPanel({ cv, question, locale }: { cv: CvContent; question: TailorQuestion; locale: Locale }) {
  if (question.section === "summary") {
    const summary = cv.basics.summary.trim();
    return <aside className="fm-left tailor-sec" aria-label={t("tailor.what.summary.title")}>
      <p className="ui-label">{t("tailor.what.summary.eyebrow")}</p>
      <p className="fm-role">{t("tailor.what.summary.title")}</p>
      {summary ? <p className="tailor-sec-lit" lang={locale}>{summary}</p> : <p className="ui-muted">{t("tailor.what.summary.empty")}</p>}
      <p className="fm-ptr">{t("tailor.what.summary.pointer")}</p>
    </aside>;
  }
  const names = { technicalSkills: SKILL_GROUPS[locale].technical, professionalSkills: SKILL_GROUPS[locale].professional, unclearSkills: t("tailor.what.skills.other") };
  const groups = GROUP_KEYS.map((key) => ({ key, skills: cv[key] })).filter((group) => group.skills.length > 0);
  const skill = question.skill?.trim();
  return <aside className="fm-left tailor-sec" aria-label={t("tailor.what.skills.title")}>
    <p className="ui-label">{t("tailor.what.skills.eyebrow")}</p>
    <p className="fm-role">{t("tailor.what.skills.title")}</p>
    {groups.map((group) => <div key={group.key} className="tailor-sec-group">
      <p className="ui-label">{names[group.key]}</p>
      <ul className={skill ? "tailor-kw has-new" : "tailor-kw"} lang={locale}>{group.skills.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
    </div>)}
    {skill && <ul className="tailor-kw" lang={locale}><li className="is-new">{skill} ?</li></ul>}
    <p className="fm-ptr">{t(skill ? "tailor.what.skills.pointer" : "tailor.what.skills.whole")}</p>
  </aside>;
}
