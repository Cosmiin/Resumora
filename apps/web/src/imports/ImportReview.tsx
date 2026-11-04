import type { ImportResult } from "@resumora/shared";
import { t } from "../i18n/t.ts";
import { SkillsSection } from "../cv/sections/Skills.tsx";

const range = (start: string, end: string, current: boolean) =>
  [start, current ? t("import.present") : end].filter(Boolean).join(" – ");

/** Read-only view of what the import found. Details are edited later in the normal editor. */
export function ImportReview({ result }: { result: ImportResult }) {
  const { content: cv, warnings } = result;
  return (
    <div className="import-review">
      {warnings.length > 0 && (
        <section className="import-warnings" aria-labelledby="import-warnings-title">
          <h3 id="import-warnings-title">{t("import.warnings")}</h3>
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      )}

      <section>
        <p className="import-name">{cv.basics.fullName || "—"}</p>
        {cv.basics.titles.map((title) => <p key={title}>{title}</p>)}
      </section>

      {cv.experience.length > 0 && (
        <section>
          <h3>{t("cv.experience")}</h3>
          {cv.experience.map((e) => (
            <article key={e.id} className="import-entry">
              <p><strong>{[e.title, e.company].filter(Boolean).join(" · ")}</strong> <span className="hint">{range(e.startDate, e.endDate, e.current)}</span></p>
              {e.description && <p>{e.description}</p>}
              {e.bullets.length > 0 && <ul>{e.bullets.map((b) => <li key={b.id}>{b.text}</li>)}</ul>}
            </article>
          ))}
        </section>
      )}

      {cv.education.length > 0 && (
        <section>
          <h3>{t("cv.education")}</h3>
          <ul>
            {cv.education.map((e) => (
              <li key={e.id}>{[e.degree, e.field, e.school].filter(Boolean).join(", ")} <span className="hint">{range(e.startDate, e.endDate, false)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <SkillsSection cv={cv} readOnly />

      {cv.custom.map((c) => (
        <section key={c.id}>
          <h3>{c.title}</h3>
          <p className="preserve-lines">{c.details}</p>
        </section>
      ))}
    </div>
  );
}
