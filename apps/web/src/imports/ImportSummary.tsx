import { CATEGORY, missingCategories, SCAN_WARNING, type ImportResult, type MoveTarget } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { HeadingMap } from "./HeadingMap.tsx";

/** The details of an import: what was found, where each heading went, and what needs a look. */
export function ImportSummary(props: {
  result: ImportResult;
  onMove(customId: string, target: MoveTarget, headingIndex: number): void;
}) {
  const { result, onMove } = props;
  const { content: cv, sourceHeadings, unsourcedLines } = result;
  const warnings = result.warnings.filter((w) => w !== SCAN_WARNING);
  const flags = missingCategories(cv).filter((f, i, all) => all.findIndex((o) => o.key === f.key) === i);
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
      <dl className="import-counts">
        <div><dt>{t("import.summary.roles")}</dt><dd>{cv.experience.length}</dd></div>
        <div><dt>{t("import.summary.skills")}</dt><dd>{skills}</dd></div>
        <div><dt>{t("import.summary.sections")}</dt><dd>{sections}</dd></div>
      </dl>

      <HeadingMap headings={sourceHeadings} content={cv} onMove={onMove} />

      {flags.length > 0 && (
        <section className="import-note import-note-flags">
          <h3>{t("import.missing.title")}</h3>
          <ul>{flags.map((f) => <li key={f.key}><strong>{CATEGORY[f.key].label[cv.locale]}</strong> {CATEGORY[f.key].why}</li>)}</ul>
        </section>
      )}

      {unsourcedLines.length > 0 && (
        <section className="import-note import-note-warn">
          <h3>{t("import.unsourced.title")}</h3>
          <ul>{unsourcedLines.map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}</ul>
        </section>
      )}

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
    </aside>
  );
}
