import type { ReactNode } from "react";
import { formatDate, durationBounds } from "../base/dates";
import { hasValue, type BaseDraft, type Fact } from "../base/model";
import { sectionName } from "../base/sections";
import { Pill, useCopy } from "./ui";
export function DocumentPreview({
  draft: d,
  asOf,
}: {
  draft: BaseDraft;
  asOf: { year: string; month: string };
}) {
  const t = useCopy(),
    cv = (ro: string, en: string) => (d.language === "ro" ? ro : en);
  const text = (f: Fact<string>) =>
    f.status === "user_confirmed" ? f.value : "";
  const date = (f: BaseDraft["roles"][number]["start"]) =>
    f.status === "user_confirmed" && hasValue(f.value)
      ? formatDate(f.value, d.language)
      : cv("Dată necunoscută", "Date unknown");
  const eligible = d.roles.filter(
    (r) =>
      r.start.status === "user_confirmed" &&
      r.ongoing.status === "user_confirmed" &&
      (r.ongoing.value || r.end.status === "user_confirmed"),
  );
  const bounds = durationBounds(eligible, asOf);
  const unknown = bounds.unknown + d.roles.length - eligible.length;
  function content(id: string): ReactNode {
    if (id === "identity")
      return (
        <>
          <h2>{text(d.name) || cv("Numele tău", "Your name")}</h2>
          <p className="document-titles">
            {d.titles.map(text).filter(Boolean).join(" · ")}
          </p>
          <p className="document-contacts">
            {d.contacts
              .filter((c) => c.visible)
              .map((c) => text(c.value))
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      );
    if (id === "summary")
      return d.summary.approval === "approved" && d.summary.text ? (
        <p>{d.summary.text}</p>
      ) : null;
    if (id === "professionalSkills" || id === "technicalSkills") {
      const skills = d[id].map(text).filter(Boolean);
      return skills.length ? <p>{skills.join(" · ")}</p> : null;
    }
    if (id === "experience")
      return d.roles.length
        ? d.roles.map((r) => (
            <div key={r.id} className="document-entry">
              <h4>
                {[text(r.title), text(r.company)].filter(Boolean).join(" — ")}
              </h4>
              <p className="document-meta">
                {date(r.start)} —{" "}
                {r.ongoing.value && r.ongoing.status === "user_confirmed"
                  ? cv("Prezent", "Present")
                  : date(r.end)}{" "}
                · {text(r.location)}
              </p>
              {text(r.context) && <p>{text(r.context)}</p>}
              {r.bullets.some((b) => text(b)) && (
                <ul>
                  {r.bullets
                    .filter((b) => text(b))
                    .map((b) => (
                      <li key={b.id}>{text(b)}</li>
                    ))}
                </ul>
              )}
            </div>
          ))
        : null;
    if (id === "education")
      return d.education.length
        ? d.education.map((e) => (
            <div key={e.id} className="document-entry">
              <h4>{text(e.institution)}</h4>
              <p>
                {[text(e.qualification), text(e.field), text(e.location)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="document-meta">
                {date(e.start)} — {date(e.end)}
              </p>
              {text(e.details) && <p>{text(e.details)}</p>}
            </div>
          ))
        : null;
    const entries = d.optionalSections.find((s) => s.id === id)?.entries;
    return entries?.length
      ? entries.map((e) => (
          <div className="document-entry" key={e.id}>
            <h4>{text(e.title)}</h4>
            <p>{text(e.details)}</p>
            {(hasValue(e.start.value) || hasValue(e.end.value)) && (
              <p className="document-meta">
                {date(e.start)} — {date(e.end)}
              </p>
            )}
          </div>
        ))
      : null;
  }
  return (
    <aside
      className="preview-column"
      aria-label={t("Previzualizare CV", "CV preview")}
    >
      <div className="preview-heading">
        <span>{t("Previzualizare", "Preview")}</span>
        <Pill>{d.language.toUpperCase()}</Pill>
      </div>
      <p className="small muted">
        {t(
          "Doar informațiile confirmate și textul aprobat apar aici. Aceasta este o previzualizare HTML, fără PDF.",
          "Only confirmed facts and approved wording appear here. This is an HTML preview; PDF is unavailable.",
        )}
      </p>
      <article className="document" lang={d.language}>
        {d.presentation.order
          .filter((id) => !d.presentation.hidden.includes(id))
          .map((id) => {
            const body = content(id);
            return body ? (
              <section key={id} className={`document-section document-${id}`}>
                {id !== "identity" && <h3>{sectionName(id, d.language, d)}</h3>}
                {body}
              </section>
            ) : null;
          })}
      </article>
      <div className="duration-note">
        <b>
          {t(
            "Durată cumulată, fără suprapuneri",
            "Combined duration, without overlaps",
          )}
        </b>
        <p>
          {bounds.known
            ? `${bounds.min}–${bounds.max} ${t("luni", "months")}`
            : t("Nedeterminată", "Unknown")}
          {bounds.unknown
            ? ` · ${unknown} ${t("roluri cu date incomplete sau neconfirmate", "roles with incomplete or unconfirmed dates")}`
            : ""}
        </p>
        <small>
          {t("La", "As of")} {formatDate(asOf, d.language)} ·{" "}
          {t(
            "limite lunare; intervalele cu an necunoscut nu sunt incluse",
            "month bounds; intervals with unknown years are excluded",
          )}
        </small>
      </div>
    </aside>
  );
}
