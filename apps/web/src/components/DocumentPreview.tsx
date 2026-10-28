import { currentWording } from "../base/wording";
import { useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { formatDate, durationBounds } from "../base/dates";
import { hasValue, isAuthored, type BaseDraft, type Fact } from "../base/model";
import { richText, safeRichHtml } from "../base/editing";
import { sectionName } from "../base/sections";
import { LanguageContext, useCopy } from "./ui";
export function PreviewText({
  value,
  label,
  change,
}: {
  value: string;
  label: string;
  change: (text: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && richText(el.innerHTML) !== value) el.textContent = value;
  }, [value]);
  return (
    <span
      ref={ref}
      role="textbox"
      aria-label={label}
      contentEditable="plaintext-only"
      tabIndex={0}
      style={{ whiteSpace: "pre-wrap" }}
      suppressContentEditableWarning
      onInput={(e) => {
        const text = richText(e.currentTarget.innerHTML);
        if (text !== value) change(text);
      }}
    />
  );
}
export function DocumentPreview({
  draft: d,
  asOf,
  onEdit,
  onTextEdit,
}: {
  draft: BaseDraft;
  asOf: { year: string; month: string };
  onEdit?: (id: string) => void;
  onTextEdit?: (id: string, text: string) => void;
}) {
  const t = useCopy(),
    uiLocale = useContext(LanguageContext),
    cv = (ro: string, en: string) => (d.language === "ro" ? ro : en);
  const live = !!onEdit || !!onTextEdit,
    hidden = (f: Fact) => d.presentation.hiddenFields?.includes(f.fieldId);
  const text = (f: Fact<string>) => (!hidden(f) ? f.value : "");
  function block(value: ReactNode, id: string, label?: string): ReactNode {
    return onEdit ? (
      <button
        type="button"
        className="preview-edit"
        aria-label={label ? `${t("Editează", "Edit")}: ${label}` : undefined}
        onClick={() => onEdit(id)}
      >
        {value}
      </button>
    ) : (
      value
    );
  }
  function editable(f: Fact<string>, id = f.fieldId): ReactNode {
    if (hidden(f) || (!text(f) && !onTextEdit)) return null;
    if (onTextEdit)
      return (
        <PreviewText
          key={f.fieldId}
          value={f.value}
          label={t("Text din previzualizare", "Preview text")}
          change={(value) => onTextEdit(f.fieldId, value)}
        />
      );
    return block(text(f), id);
  }
  function wording(target: string, field: Fact<string>): ReactNode {
    const value = currentWording(d, target);
    if (!value) return (text(field) || onTextEdit) && <p>{editable(field)}</p>;
    return (
      <>
        <p>{block(value, field.fieldId)}</p>
        {onTextEdit && (
          <details>
            <summary>
              {t("Editează textul original", "Edit original text")}
            </summary>
            {editable(field)}
          </details>
        )}
      </>
    );
  }
  const date = (f: BaseDraft["roles"][number]["start"]) =>
    hidden(f)
      ? ""
      : hasValue(f.value)
        ? formatDate(f.value, d.language)
        : cv("Dată necunoscută", "Date unknown");
  const eligible = d.roles.filter(
    (r) =>
      isAuthored(r.start) &&
      isAuthored(r.ongoing) &&
      (r.ongoing.value || isAuthored(r.end)),
  );
  const bounds = durationBounds(eligible, asOf),
    unknown = bounds.unknown + d.roles.length - eligible.length;
  function content(id: string): ReactNode {
    if (id === "identity")
      return (
        <>
          {!hidden(d.name) && (
            <h2>
              {block(
                text(d.name) || cv("Numele tău", "Your name"),
                "first-name",
                t("Prenume", "First name"),
              )}
            </h2>
          )}
          <div className="document-titles">
            {d.titles
              .filter((f) => text(f))
              .map((f) => (
                <span key={f.fieldId}>{block(text(f), f.fieldId)}</span>
              ))}
          </div>
          <div className="document-contacts">
            {d.contacts
              .filter((c) => c.visible && text(c.value))
              .map((c) => (
                <span key={c.id}>{block(text(c.value), c.value.fieldId)}</span>
              ))}
          </div>
        </>
      );
    if (id === "summary")
      return d.summary.text &&
        !d.presentation.hiddenFields?.includes("summary") ? (
        <p>{block(d.summary.text, "summary", sectionName(id, uiLocale, d))}</p>
      ) : null;
    if (id === "professionalSkills" || id === "technicalSkills")
      return d[id].some((f) => text(f)) ? (
        <p>
          {block(
            d[id].map(text).filter(Boolean).join(" · "),
            `chip-${sectionName(id, uiLocale)}`,
            sectionName(id, uiLocale),
          )}
        </p>
      ) : null;
    if (id === "experience")
      return d.roles.length
        ? d.roles.map((r) => (
            <div key={r.id} className="document-entry">
              <h4>
                {block(text(r.title) || cv("Rol", "Role"), r.title.fieldId)} ·{" "}
                {block(
                  text(r.company) || cv("Companie", "Company"),
                  r.company.fieldId,
                )}
              </h4>
              <p className="document-meta">
                {block(date(r.start), r.start.fieldId)} —{" "}
                {r.ongoing.value
                  ? block(cv("Prezent", "Present"), r.ongoing.fieldId)
                  : block(date(r.end), r.end.fieldId)}
                {text(r.location) && (
                  <> · {block(text(r.location), r.location.fieldId)}</>
                )}
              </p>
              {wording(r.id, r.context)}
              {r.bullets.some((b) => text(b) || onTextEdit) &&
                !d.presentation.hiddenFields?.includes(
                  `${r.id}-contributions`,
                ) &&
                (d.presentation.contributionHtml?.[r.id] &&
                !r.bullets.some(hidden) &&
                !onTextEdit ? (
                  <div>
                    {block(
                      <div
                        dangerouslySetInnerHTML={{
                          __html: safeRichHtml(
                            d.presentation.contributionHtml[r.id],
                          ),
                        }}
                      />,
                      `${r.id}-contributions`,
                    )}
                  </div>
                ) : (
                  <ul>
                    {r.bullets
                      .filter((b) => !hidden(b) && (text(b) || onTextEdit))
                      .map((b) => (
                        <li key={b.fieldId}>
                          {editable(b, `${r.id}-contributions`)}
                        </li>
                      ))}
                  </ul>
                ))}
            </div>
          ))
        : null;
    if (id === "education")
      return d.education.length
        ? d.education.map((e) => (
            <div key={e.id} className="document-entry">
              <h4>
                {block(
                  text(e.institution) || cv("Instituție", "Institution"),
                  e.institution.fieldId,
                )}
              </h4>
              <p>
                {[e.qualification, e.field, e.location]
                  .filter((f) => text(f))
                  .map((f) => (
                    <span key={f.fieldId}>{block(text(f), f.fieldId)} </span>
                  ))}
              </p>
              <p className="document-meta">
                {block(date(e.start), e.start.fieldId)} —{" "}
                {e.ongoing?.value
                  ? block(cv("În curs", "Ongoing"), e.ongoing.fieldId)
                  : block(date(e.end), e.end.fieldId)}
              </p>
              {text(e.details) && (
                <p>{block(text(e.details), e.details.fieldId)}</p>
              )}
            </div>
          ))
        : null;
    const s = d.optionalSections.find((s) => s.id === id);
    return s?.entries.length
      ? s.entries.map((e) => (
          <div className="document-entry" key={e.id}>
            <h4>
              {block(text(e.title), e.title.fieldId)}
              {s.kind === "languages" &&
                e.proficiency?.value &&
                !hidden(e.proficiency) && (
                  <>
                    {" "}
                    ·{" "}
                    {block(
                      e.proficiency.value === "Native"
                        ? cv("Nativ", "Native")
                        : e.proficiency.value,
                      e.proficiency.fieldId,
                    )}
                  </>
                )}
            </h4>
            {wording(e.id, e.details)}
            {e.bullets?.some((f) => text(f) || onTextEdit) && (
              <ul>
                {e.bullets
                  .filter((f) => !hidden(f) && (text(f) || onTextEdit))
                  .map((f) => (
                    <li key={f.fieldId}>{editable(f)}</li>
                  ))}
              </ul>
            )}
            {s.kind !== "languages" &&
              (hasValue(e.start.value) ||
                hasValue(e.end.value) ||
                e.ongoing?.value) && (
                <p className="document-meta">
                  {block(date(e.start), e.start.fieldId)} —{" "}
                  {e.ongoing?.value
                    ? block(cv("În curs", "Ongoing"), e.ongoing.fieldId)
                    : block(date(e.end), e.end.fieldId)}
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
        <span>
          {live
            ? t("Previzualizare ciornă", "Draft preview")
            : t("Versiune salvată", "Saved version")}
        </span>
        <small>{d.language.toUpperCase()}</small>
      </div>
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
      <details className="duration-note">
        <summary>{t("Durată cumulată", "Combined duration")}</summary>
        <p>
          {bounds.known
            ? `${bounds.min}–${bounds.max} ${t("luni", "months")}`
            : t("Nedeterminată", "Unknown")}
          {unknown
            ? ` · ${unknown} ${t("roluri cu date incomplete sau neverificate", "roles with incomplete or unreviewed dates")}`
            : ""}
        </p>
        <small>
          {t("La", "As of")} {formatDate(asOf, d.language)} ·{" "}
          {t(
            "fără suprapuneri, fără date inventate",
            "without overlaps or invented dates",
          )}
        </small>
      </details>
    </aside>
  );
}
