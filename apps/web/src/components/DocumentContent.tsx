import { contentDirection } from "../languages/direction";
import { contentLocale } from "@resumora/contracts/editor/content-language";
import {
  builtInDocumentLabels,
  documentLabels,
  type DocumentLabels,
} from "@resumora/contracts/editor/document-labels";
import { RichContributions } from "./RichContributions";
import { RoleText } from "./RoleText";
import { stripListMarker } from "@resumora/contracts/editor/content";
import { currentWording } from "../base/wording";
import { PhotoPreview } from "../photo/PhotoPreview";
import {
  Fragment,
  useContext,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  formatDate,
  experienceDuration,
  formatExperienceDuration,
} from "../base/dates";
import { hasValue, type BaseDraft, type Fact } from "../base/model";
import { richText, safeRichHtml } from "../base/editing";
import { sectionName } from "../base/sections";
import { LanguageContext, useCopy } from "./ui";
import { resolveTemplate } from "../templates/registry";
import { TemplateChooser } from "../templates/TemplateChooser";
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
  onTemplateChange,
  livePreview,
  documentOnly,
  renderPhoto = (photo) => <PhotoPreview photo={photo} />,
}: {
  draft: BaseDraft;
  documentOnly?: boolean;
  renderPhoto?: (photo: BaseDraft["presentation"]["photo"]) => ReactNode;
  livePreview?: boolean;
  asOf: { year: string; month: string };
  onEdit?: (id: string) => void;
  onTextEdit?: (id: string, text: string) => void;
  onTemplateChange?: (versionId: string) => void;
}) {
  const t = useCopy(),
    uiLocale = useContext(LanguageContext),
    labels = documentLabels(d),
    documentLocale = contentLocale(d);
  const template = resolveTemplate(d.presentation.templateVersionId);
  const live = livePreview ?? (!!onEdit || !!onTextEdit),
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
  function editable(
    f: Fact<string>,
    id = f.fieldId,
    listItem = false,
  ): ReactNode {
    if (hidden(f) || (!text(f) && !onTextEdit)) return null;
    if (onTextEdit)
      return (
        <PreviewText
          key={f.fieldId}
          value={listItem ? stripListMarker(f.value) : f.value}
          label={t("Text din previzualizare", "Preview text")}
          change={(value) => onTextEdit(f.fieldId, value)}
        />
      );
    return block(listItem ? stripListMarker(text(f)) : text(f), id);
  }
  function wording(target: string, field: Fact<string>): ReactNode {
    const value = currentWording(d, target);
    if (!value)
      return (
        (text(field) || onTextEdit) &&
        (onTextEdit ? (
          <p>{editable(field)}</p>
        ) : (
          <div className="document-role-wording">
            {block(<RoleText text={text(field)} />, field.fieldId)}
          </div>
        ))
      );
    return (
      <>
        <div className="document-role-wording">
          {block(<RoleText text={value} />, field.fieldId)}
        </div>
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
  const hasExperienceWording = (target: string) =>
    d.presentation.approvedWording?.[target]?.scope === "experience" &&
    !!currentWording(d, target);
  const duration = (bounds: ReturnType<typeof experienceDuration>) =>
    bounds.known
      ? formatExperienceDuration(bounds, documentLocale) ||
        labels!.durationUnavailable
      : labels!.durationUnavailable;
  const date = (f: BaseDraft["roles"][number]["start"]) =>
    hidden(f)
      ? ""
      : hasValue(f.value)
        ? formatDate(f.value, documentLocale)
        : labels!.unknownDate;
  const bounds = experienceDuration(d.roles, asOf, d.presentation.hiddenFields),
    unknown = bounds.unknown;
  function entryHeading(primary: ReactNode, secondary: ReactNode) {
    return template?.entry === "stacked" ? (
      <>
        <h4 className="document-primary">
          {primary}
          {"\u00a0"}
        </h4>
        <p className="document-secondary">
          {secondary}
          {"\u00a0"}
        </p>
      </>
    ) : (
      <h4>
        <span className="document-primary">
          {primary}
          {template ? "\u00a0" : ""}
        </span>
        {" · "}
        <span className="document-secondary">
          {secondary}
          {template ? "\u00a0" : ""}
        </span>
      </h4>
    );
  }
  function contactLink(
    kind: string,
    value: string,
    platform?: string,
  ): ReactNode {
    if (onEdit || onTextEdit) return value;
    const href =
      kind === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? `mailto:${value}`
        : kind === "phone" && /^\+?[0-9 ()-]+$/.test(value)
          ? `tel:${value.replace(/[ ()-]/g, "")}`
          : kind === "social" && /^https?:\/\/[^\s]+$/i.test(value)
            ? value
            : kind === "social" &&
                platform === "website" &&
                /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(value)
              ? `https://${value}`
              : null;
    return href ? (
      <a href={href} rel="noreferrer">
        {value}
      </a>
    ) : (
      value
    );
  }
  function content(id: string): ReactNode {
    if (id === "identity")
      return (
        <>
          {(!template || template.photoPlacement === "above") &&
            renderPhoto(d.presentation.photo)}
          <div className="document-nameband">
            {!hidden(d.name) && (
              <h2>
                {block(
                  <>
                    {text(d.name) || labels!.yourName}
                    {template ? "\u00a0" : ""}
                  </>,
                  "first-name",
                  t("Prenume", "First name"),
                )}
              </h2>
            )}
            {template?.photoPlacement === "nameband" &&
              renderPhoto(d.presentation.photo)}
          </div>
          <div className="document-titles">
            {d.titles
              .filter((f) => text(f))
              .map((f) => (
                <span className="document-positioning-title" key={f.fieldId}>
                  {block(
                    <>
                      {text(f)}
                      {template ? "\u00a0" : ""}
                    </>,
                    f.fieldId,
                  )}
                </span>
              ))}
          </div>
          <div className="document-contacts">
            {d.contacts
              .filter((c) => c.visible && text(c.value))
              .map((c, index) => (
                <Fragment key={c.id}>
                  {!!template && index > 0 && (
                    <span
                      className="document-contact-separator"
                      aria-hidden="true"
                    >
                      {" · "}
                    </span>
                  )}
                  <span className="document-contact">
                    {!!template && (
                      <>
                        {c.platform === "website"
                          ? labels!.link
                          : {
                              email: labels!.email,
                              phone: labels!.phone,
                              location: labels!.location,
                              address: labels!.address,
                              social: labels!.link,
                            }[c.kind]}
                        :{" "}
                      </>
                    )}
                    {block(
                      contactLink(c.kind, text(c.value), c.platform),
                      c.value.fieldId,
                    )}
                  </span>
                </Fragment>
              ))}
          </div>
        </>
      );
    if (id === "summary")
      return d.summary.text &&
        !d.presentation.hiddenFields?.includes("summary") ? (
        <p className="document-profile-copy">
          {block(d.summary.text, "summary", sectionName(id, uiLocale, d))}
        </p>
      ) : null;
    if (id === "professionalSkills" || id === "technicalSkills")
      return d[id].some((f) => text(f)) ? (
        <p className="document-skill-line">
          {block(
            d[id].map(text).filter(Boolean).join(" | "),
            `chip-${sectionName(id, uiLocale)}`,
            sectionName(id, uiLocale),
          )}
        </p>
      ) : null;
    if (id === "experience")
      return d.roles.length
        ? d.roles.map((r) => (
            <div key={r.id} className="document-entry">
              <div className="document-entry-head">
                {entryHeading(
                  block(text(r.title) || labels!.role, r.title.fieldId),
                  block(text(r.company) || labels!.company, r.company.fieldId),
                )}
                <p className="document-meta">
                  <span className="document-date-range">
                    {block(date(r.start), r.start.fieldId)} —{" "}
                    {r.ongoing.value
                      ? block(labels!.present, r.ongoing.fieldId)
                      : block(date(r.end), r.end.fieldId)}
                  </span>
                  {!hidden(r.start) &&
                    !(r.ongoing.value ? hidden(r.ongoing) : hidden(r.end)) && (
                      <>
                        <span className="document-meta-separator">{" · "}</span>
                        <span className="document-role-duration">
                          {duration(experienceDuration([r], asOf))}
                        </span>
                      </>
                    )}
                  {text(r.location) && (
                    <>
                      <span className="document-meta-separator">{" · "}</span>
                      <span className="document-location">
                        {block(text(r.location), r.location.fieldId)}
                      </span>
                    </>
                  )}
                </p>
              </div>
              {wording(r.id, r.context)}
              {!hasExperienceWording(r.id) &&
                r.bullets.some((b) => text(b) || onTextEdit) &&
                !d.presentation.hiddenFields?.includes(
                  `${r.id}-contributions`,
                ) &&
                (d.presentation.contributionHtml?.[r.id] &&
                !r.bullets.some(hidden) &&
                onTextEdit ? (
                  <div className="document-contributions">
                    <RichContributions
                      html={d.presentation.contributionHtml[r.id]}
                      fields={r.bullets}
                      change={onTextEdit}
                    />
                  </div>
                ) : d.presentation.contributionHtml?.[r.id] &&
                  !r.bullets.some(hidden) ? (
                  <div className="document-contributions">
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
                  <ul className="document-contributions">
                    {r.bullets
                      .filter((b) => !hidden(b) && (text(b) || onTextEdit))
                      .map((b) => (
                        <li key={b.fieldId}>
                          {editable(b, `${r.id}-contributions`, true)}
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
              <div className="document-entry-head">
                {template ? (
                  entryHeading(
                    <>
                      {[e.qualification, e.field]
                        .filter((f) => text(f))
                        .map((f) => (
                          <span key={f.fieldId}>
                            {block(text(f), f.fieldId)}{" "}
                          </span>
                        ))}
                    </>,
                    block(
                      text(e.institution) || labels!.institution,
                      e.institution.fieldId,
                    ),
                  )
                ) : (
                  <>
                    <h4>
                      {block(
                        text(e.institution) || labels!.institution,
                        e.institution.fieldId,
                      )}
                    </h4>
                    <p>
                      {[e.qualification, e.field, e.location]
                        .filter((f) => text(f))
                        .map((f) => (
                          <span key={f.fieldId}>
                            {block(text(f), f.fieldId)}{" "}
                          </span>
                        ))}
                    </p>
                  </>
                )}
                <p className="document-meta">
                  <span className="document-date-range">
                    {block(date(e.start), e.start.fieldId)} —{" "}
                    {e.ongoing?.value
                      ? block(labels!.ongoing, e.ongoing.fieldId)
                      : block(date(e.end), e.end.fieldId)}
                  </span>
                  {!!template && text(e.location) && (
                    <>
                      <span className="document-meta-separator">{" · "}</span>
                      <span className="document-location">
                        {block(text(e.location), e.location.fieldId)}
                      </span>
                    </>
                  )}
                </p>
              </div>
              {text(e.details) && (
                <p>{block(text(e.details), e.details.fieldId)}</p>
              )}
            </div>
          ))
        : null;
    const s = d.optionalSections.find((s) => s.id === id);
    return s && (s.entries.length || s.heading)
      ? s.entries.map((e) => (
          <div className="document-entry" key={e.id}>
            {!(s.heading && e.id === s.id) && (
              <h4 className="document-primary">
                {block(text(e.title), e.title.fieldId)}
                {s.kind === "languages" &&
                  e.proficiency?.value &&
                  !hidden(e.proficiency) && (
                    <>
                      {" "}
                      ·{" "}
                      {block(
                        e.proficiency.value === "Native"
                          ? labels!.native
                          : e.proficiency.value,
                        e.proficiency.fieldId,
                      )}
                    </>
                  )}
              </h4>
            )}
            {wording(e.id, e.details)}
            {!hasExperienceWording(e.id) &&
              !d.presentation.hiddenFields?.includes(`${e.id}-contributions`) &&
              e.bullets?.some((f) => text(f) || onTextEdit) && (
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
                    ? block(labels!.ongoing, e.ongoing.fieldId)
                    : block(date(e.end), e.end.fieldId)}
                </p>
              )}
          </div>
        ))
      : null;
  }
  if (!labels)
    return (
      <p role="status">
        {t(
          "Etichetele CV-ului în această limbă nu sunt disponibile. Reîncearcă detectarea limbii.",
          "Document labels for this language are unavailable. Retry language detection.",
        )}
      </p>
    );
  const document = (
    <article
      className={`document${template ? ` document-template ${template.className}` : ""}`}
      lang={documentLocale}
      dir={contentDirection(documentLocale)}
      data-template-version={d.presentation.templateVersionId}
    >
      {d.presentation.order
        .filter((id) => !d.presentation.hidden.includes(id))
        .map((id) => {
          const body = content(id);
          const optional = d.optionalSections.find(
            (section) => section.id === id,
          );
          const categoryTitle = optional?.heading;
          const authoredLabel =
            optional?.label &&
            ![
              builtInDocumentLabels("ro")?.[optional.kind],
              builtInDocumentLabels("en")?.[optional.kind],
            ].includes(optional.label)
              ? optional.label
              : undefined;
          return body ? (
            <section key={id} className={`document-section document-${id}`}>
              {id !== "identity" && (
                <h3>
                  {categoryTitle
                    ? block(text(categoryTitle), categoryTitle.fieldId)
                    : (authoredLabel ??
                      labels![(optional?.kind ?? id) as keyof DocumentLabels])}
                </h3>
              )}
              {id === "experience" && (
                <p className="document-experience-total">
                  {labels!.totalExperience}: {duration(bounds)}
                  {unknown > 0 && (
                    <small className="document-experience-incomplete">
                      {labels!.incompleteDates}
                    </small>
                  )}
                </p>
              )}
              {body}
            </section>
          ) : null;
        })}
    </article>
  );
  if (documentOnly) return document;
  return (
    <aside
      className="preview-column"
      aria-label={t("Previzualizare CV", "CV preview")}
    >
      {onTemplateChange && (
        <TemplateChooser
          value={d.presentation.templateVersionId}
          onChange={onTemplateChange}
        />
      )}
      {!!d.presentation.templateVersionId && !template && (
        <p className="template-fallback" role="status">
          {t(
            "Șablonul salvat nu este disponibil. Afișăm aspectul clasic; conținutul și alegerea salvată se păstrează.",
            "The saved template is unavailable. The classic layout is shown; your content and saved choice are preserved.",
          )}
        </p>
      )}
      <div className="preview-heading">
        <span>
          {live
            ? t("Previzualizare ciornă", "Draft preview")
            : t("Versiune salvată", "Saved version")}
        </span>
        <small>
          {documentLocale.toUpperCase()}
          {template ? ` · ${template.name}` : ""}
        </small>
      </div>
      {document}

      <details className="duration-note">
        <summary>{t("Durată cumulată", "Combined duration")}</summary>
        <p>
          {bounds.known
            ? formatExperienceDuration(bounds, uiLocale)
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
