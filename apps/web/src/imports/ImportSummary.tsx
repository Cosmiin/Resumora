import type { ImportResult } from "@resumora/shared";
import { t } from "../i18n/t.ts";

/** The right-hand panel of the import review: what was found, what needs a look, and the "use it" button. */
export function ImportSummary(props: { result: ImportResult; canApply: boolean; applying: boolean; onApply(): void }) {
  const { result, canApply, applying, onApply } = props;
  const { content: cv, warnings } = result;
  const unsorted = cv.unclearSkills;
  const skills = cv.technicalSkills.length + cv.professionalSkills.length + unsorted.length;
  // Every section that shows on the page; each filled custom entry is its own section.
  const sections = [
    !!cv.basics.summary.trim(),
    cv.experience.length > 0,
    cv.education.length > 0,
    skills > 0,
    cv.languages.length > 0,
    cv.certifications.length > 0,
    cv.projects.length > 0,
    ...cv.custom.map((c) => !!(c.title || c.details)),
  ].filter(Boolean).length;

  return (
    <aside className="import-summary" aria-label={t("import.summary.title")}>
      <h2 className="import-summary-title">{t("import.summary.title")}</h2>
      <dl className="import-counts">
        <div><dt>{t("import.summary.roles")}</dt><dd>{cv.experience.length}</dd></div>
        <div><dt>{t("import.summary.skills")}</dt><dd>{skills}</dd></div>
        <div><dt>{t("import.summary.sections")}</dt><dd>{sections}</dd></div>
      </dl>

      {unsorted.length > 0 && (
        <section className="import-note import-note-sort">
          <h3>{t(unsorted.length === 1 ? "import.summary.sortOne" : "import.summary.sortMany", { n: unsorted.length })}</h3>
          <ul className="import-chips">{unsorted.map((s) => <li key={s.id}>{s.name}</li>)}</ul>
          <p>{t("import.summary.sortHint")}</p>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="import-note import-note-warn">
          <h3>{t(warnings.length === 1 ? "import.summary.confirmOne" : "import.summary.confirmMany", { n: warnings.length })}</h3>
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      )}

      <p className="import-summary-kept">{t("import.summary.kept")}</p>
      <button type="button" className="import-apply" disabled={!canApply || applying} onClick={onApply}>{t("import.apply")}</button>
    </aside>
  );
}
