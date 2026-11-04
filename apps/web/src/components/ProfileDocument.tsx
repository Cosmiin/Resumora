import { removeProfileSkill } from "../base/profile-skills";
import { RoleRewrite } from "./RoleRewrite";
import type { RoleRewrite as SummaryProposal } from "@resumora/contracts/intelligence/model";
import { useRef, useState, type ReactNode } from "react";
import { Check, Pencil, Plus, X, Trash2 } from "lucide-react";
import {
  clone,
  newRole,
  newEducation,
  newOptionalEntry,
  fact,
  editFact,
  writeSummary,
  type BaseDraft,
  type Fact,
} from "../base/model";
import {
  dateInput,
  parseDateInput,
  patchFact,
  updateContributionHtml,
} from "../base/editing";
import { dateError, formatDate } from "../base/dates";
import { acceptWording, currentWording } from "../base/wording";
import { sectionName } from "../base/sections";
import { AutoTextarea } from "./AutoTextarea";
import { RoleText } from "./RoleText";
import { RichContributions } from "./RichContributions";
import { ExperienceScoreHint } from "./ExperienceScoreHint";
import { PhotoPreview } from "../photo/PhotoPreview";
import { Button, Field, LanguageContext, useCopy } from "./ui";
import { useContext } from "react";

/** A reading surface over the existing editor facts, never a second CV model. */
export function ProfileDocument({
  draft: d,
  change,
  disabled = false,
  skillsImproving = false,
  summarize,
  aiReady = true,
  review = false,
  warnings = {},
  confirmations = {},
  activeFieldId,
  source,
  focus,
  enrichTarget,
  enrich,
  openEnrichment,
  closeEnrichment,
}: {
  draft: BaseDraft;
  change: (next: BaseDraft) => void;
  disabled?: boolean;
  skillsImproving?: boolean;
  summarize?: (id: string) => Promise<SummaryProposal>;
  aiReady?: boolean;
  review?: boolean;
  warnings?: Record<string, string>;
  confirmations?: Record<
    string,
    { label?: string; disabled: boolean; confirm: () => void }
  >;
  activeFieldId?: string;
  source?: (fieldId: string) => void;
  focus?: (fieldId: string) => void;
  enrichTarget?: string;
  enrich?: (id: string) => ReactNode;
  openEnrichment?: (id: string) => void;
  closeEnrichment?: () => void;
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  const optionalSections = [...d.optionalSections];
  for (const kind of ["languages", "certifications"] as const)
    if (!optionalSections.some((s) => s.kind === kind))
      optionalSections.push({ id: kind, kind, label: "", entries: [] });
  function beginField(id: string) {
    requestAnimationFrame(() => {
      const field = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-profile-fact], [data-contribution]",
        ),
      ).find(
        (el) => el.dataset.profileFact === id || el.dataset.contribution === id,
      );
      const button = field?.querySelector<HTMLButtonElement>(
        ".profile-edit-trigger",
      );
      if (button) button.click();
      else field?.focus();
    });
  }
  function emptySection(message: string) {
    return <p className="document-placeholder">{message}</p>;
  }
  const summary = (text: string) => {
    const next = clone(d);
    writeSummary(next, text);
    change(next);
  };
  function field(
    f: Fact,
    label: string,
    options: {
      multiline?: boolean;
      placeholder?: string;
      className?: string;
      disabled?: boolean;
    } = {},
  ) {
    const value =
      typeof f.value === "object" ? dateInput(f.value) : String(f.value);
    return (
      <EditableValue
        key={f.fieldId}
        factId={f.fieldId}
        label={label}
        value={value}
        display={
          typeof f.value === "object" && (f.value.year || f.value.month)
            ? formatDate(f.value, d.language)
            : undefined
        }
        boolean={typeof f.value === "boolean"}
        disabled={disabled}
        warning={warnings[f.fieldId]}
        confirmation={confirmations[f.fieldId]}
        active={activeFieldId === f.fieldId}
        source={source ? () => source(f.fieldId) : undefined}
        onEdit={() => focus?.(f.fieldId)}
        error={
          typeof f.value === "object" && dateError(f.value)
            ? t("Utilizează AAAA sau LL/AAAA.", "Use YYYY or MM/YYYY.")
            : undefined
        }
        change={(text) => {
          const next = patchFact(
            d,
            f,
            typeof f.value === "object"
              ? parseDateInput(text)
              : typeof f.value === "boolean"
                ? text === "true"
                : text,
          );
          // A full-name correction must not leave stale split-name inputs behind.
          if (f.fieldId === d.name.fieldId && text !== d.name.value)
            delete next.nameParts;
          change(next);
        }}
        {...options}
      />
    );
  }
  function period(
    entry:
      | BaseDraft["roles"][number]
      | BaseDraft["education"][number]
      | BaseDraft["optionalSections"][number]["entries"][number],
  ) {
    return (
      <div className="profile-document-period">
        {field(entry.start, t("Început", "Start"), {
          placeholder: t("Anul începerii", "Start year"),
        })}
        <span aria-hidden="true">–</span>
        {entry.ongoing?.value && !review ? (
          <span>{t("Prezent", "Present")}</span>
        ) : (
          field(entry.end, t("Sfârșit", "End"), {
            placeholder: t("Anul încheierii", "End year"),
          })
        )}
        <details className="document-date-options">
          <summary aria-label={t("Opțiuni perioadă", "Date options")}>
            <Pencil size={13} />
          </summary>
          {review && entry.ongoing ? (
            field(entry.ongoing, t("În curs", "Ongoing"))
          ) : (
            <label>
              <input
                type="checkbox"
                checked={entry.ongoing?.value ?? false}
                disabled={disabled}
                onChange={(e) => {
                  if (entry.ongoing)
                    change(patchFact(d, entry.ongoing, e.target.checked));
                  else {
                    const next = clone(d);
                    const target = [
                      ...next.roles,
                      ...next.education,
                      ...next.optionalSections.flatMap((s) => s.entries),
                    ].find((item) => item.id === entry.id);
                    if (target) target.ongoing = fact(e.target.checked);
                    change(next);
                  }
                }}
              />
              {t("În curs", "Ongoing")}
            </label>
          )}
          <p>
            {t(
              "Poți păstra doar anul dacă nu cunoști luna.",
              "Keep the year only when the month is unknown.",
            )}
          </p>
        </details>
      </div>
    );
  }
  const hidden = (id: string) =>
    d.presentation.hidden.includes(id) ? (
      <span className="document-hidden-label">
        {t("Ascuns în CV", "Hidden in CV")}
      </span>
    ) : null;
  return (
    <article
      className={`profile-document ${review ? "profile-document-review" : ""}`}
      aria-label={t("CV-ul din profil", "Profile CV")}
    >
      <section
        className="profile-document-identity"
        id="profile-personal"
        aria-label={t("Nume și contact", "Name and contact")}
      >
        {d.presentation.photo?.visible && (
          <div className="profile-header-photo">
            <PhotoPreview photo={d.presentation.photo} />
          </div>
        )}
        <h2 className="profile-document-name">
          {field(d.name, t("Nume", "Name"), {
            placeholder: t("Numele tău", "Your name"),
          })}
        </h2>
        <div className="profile-document-titles">
          {d.titles.map((title, i) =>
            title.value || i === 0
              ? field(
                  title,
                  t("Titlu profesional", "Professional title") +
                    (i ? " 2" : ""),
                  {
                    placeholder: t(
                      "Titlul tău profesional",
                      "Your professional title",
                    ),
                  },
                )
              : null,
          )}
        </div>
        <div className="profile-document-contacts">
          {d.contacts.map((c) => (
            <span key={c.id}>
              {field(
                c.value,
                c.kind === "email"
                  ? "Email"
                  : c.kind === "phone"
                    ? t("Telefon", "Phone")
                    : c.kind === "location"
                      ? t("Locație", "Location")
                      : t("Website sau profil", "Website or profile"),
                {
                  placeholder:
                    c.kind === "email"
                      ? "Email"
                      : c.kind === "phone"
                        ? t("Adaugă telefon", "Add phone")
                        : c.kind === "location"
                          ? t("Adaugă locație", "Add location")
                          : t(
                              "Adaugă un profil sau website",
                              "Add profile or website",
                            ),
                },
              )}
              {!c.visible && (
                <span className="document-hidden-label">
                  {t("Ascuns în CV", "Hidden in CV")}
                </span>
              )}
            </span>
          ))}
        </div>
        {!review && (
          <details className="document-entry-options document-name-options">
            <summary>{t("Detalii despre nume", "Name details")}</summary>
            <p>
              {t(
                "Confirmă prenumele și numele de familie pentru export.",
                "Confirm your first and last names for export.",
              )}
            </p>
            <fieldset
              className="field-grid document-name-fields"
              disabled={disabled}
            >
              {(["first", "last"] as const).map((key) => (
                <Field
                  key={key}
                  id={key === "first" ? "first-name" : "last-name"}
                  label={
                    key === "first"
                      ? t("Prenume", "First name")
                      : t("Nume de familie", "Last name")
                  }
                  value={d.nameParts?.[key] ?? ""}
                  onChange={(value) => {
                    const next = clone(d);
                    next.nameParts = {
                      first: "",
                      last: "",
                      ...next.nameParts,
                      [key]: value,
                    };
                    next.name = editFact(
                      next.name,
                      `${next.nameParts.first} ${next.nameParts.last}`.trim(),
                    );
                    change(next);
                  }}
                />
              ))}
            </fieldset>
          </details>
        )}
      </section>

      <section
        className="profile-document-section"
        id="profile-skills"
        aria-label={t("Competențe", "Skills")}
      >
        <h2>{t("Competențe", "Skills")}</h2>
        {skillsImproving && (
          <p className="small muted" role="status">
            {t(
              "Poți edita profilul după îmbunătățirea și salvarea competențelor.",
              "You can edit your profile when skills improvement and saving finish.",
            )}
          </p>
        )}
        {(["professionalSkills", "technicalSkills"] as const).map((key) => (
          <div className="profile-document-skills" key={key}>
            <span className="profile-skills-label">
              {key === "technicalSkills"
                ? t("Tehnice", "Technical")
                : t("Profesionale", "Professional")}
            </span>
            <div className="profile-skill-tags">
              {d[key].map((skill, i) => (
                <span className="profile-skill-item" key={skill.fieldId}>
                  {field(
                    skill,
                    t("Competență", "Skill") +
                      ` ${key === "technicalSkills" ? "T" : "P"}${i + 1}`,
                    { disabled: disabled || skillsImproving },
                  )}
                  {!review && (
                    <>
                      <button
                        type="button"
                        className="profile-skill-icon profile-skill-delete"
                        disabled={disabled || skillsImproving}
                        aria-label={t(
                          `Șterge competența: ${skill.value}`,
                          `Delete skill: ${skill.value}`,
                        )}
                        onClick={() => change(removeProfileSkill(d, skill.id))}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </span>
              ))}
              {!d[key].length && (
                <span className="document-placeholder">
                  {key === "technicalSkills"
                    ? t(
                        "Instrumente, tehnologii și metode pe care le folosești.",
                        "Tools, technologies and methods you use.",
                      )
                    : t(
                        "Abilități pe care le aduci în rolul tău.",
                        "Strengths you bring to your work.",
                      )}
                </span>
              )}
              {!review && (
                <Button
                  variant="ghost"
                  aria-label={
                    key === "technicalSkills"
                      ? t("Adaugă o competență tehnică", "Add technical skill")
                      : t(
                          "Adaugă o competență profesională",
                          "Add professional skill",
                        )
                  }
                  disabled={disabled || skillsImproving}
                  onClick={() => {
                    const next = clone(d),
                      skill = fact("");
                    next[key].push(skill);
                    change(next);
                    beginField(skill.fieldId);
                  }}
                >
                  <Plus size={15} />
                  {t("Adaugă", "Add")}
                </Button>
              )}
            </div>
          </div>
        ))}
        {!review &&
          (enrichTarget === "__improve_skills" && enrich
            ? enrich("__improve_skills")
            : openEnrichment && (
                <Button
                  variant="ghost"
                  disabled={disabled || !aiReady}
                  onClick={() => openEnrichment("__improve_skills")}
                >
                  {t("Îmbunătățește competențele", "Improve skills")}
                </Button>
              ))}
      </section>

      <section
        className="profile-document-section"
        id="profile-summary"
        aria-label={t("Rezumat profesional", "Professional summary")}
      >
        <h2>
          {t("Rezumat profesional", "Professional summary")}
          {hidden("summary")}
        </h2>
        <EditableValue
          label={t("Rezumat", "Summary")}
          factId={d.summary.provenance?.fieldId}
          confirmation={
            d.summary.provenance
              ? confirmations[d.summary.provenance.fieldId]
              : undefined
          }
          active={
            !!activeFieldId && activeFieldId === d.summary.provenance?.fieldId
          }
          onEdit={() =>
            d.summary.provenance && focus?.(d.summary.provenance.fieldId)
          }
          value={d.summary.text}
          change={summary}
          multiline
          disabled={disabled}
          placeholder={t(
            "Adaugă câteva cuvinte despre experiența ta.",
            "Add a few words about your experience.",
          )}
          warning={
            d.summary.provenance
              ? warnings[d.summary.provenance.fieldId]
              : undefined
          }
          source={
            d.summary.provenance && source
              ? () => source(d.summary.provenance!.fieldId)
              : undefined
          }
        />
      </section>

      <section
        className="profile-document-section"
        id="profile-experience"
        aria-label={t("Experiență profesională", "Professional experience")}
      >
        <h2>
          {t("Experiență profesională", "Professional experience")}
          {hidden("experience")}
        </h2>
        {!d.roles.length &&
          emptySection(
            t(
              "Adaugă primul rol și contribuțiile tale.",
              "Add your first role and what you contributed.",
            ),
          )}
        {d.roles.map((role) => {
          const wording = currentWording(d, role.id, true);
          const approved = d.presentation.approvedWording?.[role.id];
          const active = enrichTarget === role.id;
          return (
            <section
              id={`profile-role-${role.id}`}
              tabIndex={-1}
              className={`profile-document-role ${active ? "is-improving" : ""}`}
              key={role.id}
              aria-label={
                role.title.value || t("Experiență nouă", "New experience")
              }
            >
              <div className="profile-role-main">
                <h3>
                  {field(role.title, t("Titlu", "Title"), {
                    placeholder: t("Titlul rolului", "Role title"),
                  })}
                </h3>
                <div className="profile-document-company">
                  {field(role.company, t("Companie", "Company"), {
                    placeholder: t("Compania", "Company"),
                  })}
                  {role.location.value &&
                    field(
                      role.location,
                      t("Locația rolului", "Role location"),
                      {
                        placeholder: t("Adaugă locație", "Add location"),
                      },
                    )}
                </div>
                {period(role)}
                {wording && approved ? (
                  <div className="profile-approved-wording">
                    <EditableValue
                      label={t("Descrierea experienței", "Experience wording")}
                      value={wording}
                      multiline
                      disabled={disabled}
                      formatted={<RoleText text={wording} />}
                      change={(text) =>
                        change(
                          acceptWording(d, role.id, {
                            ...approved,
                            text,
                            origin: "user_authored",
                          }),
                        )
                      }
                    />
                  </div>
                ) : (
                  <>
                    {field(
                      role.context,
                      t("Descrierea rolului", "Role description"),
                      {
                        multiline: true,
                        placeholder: t(
                          "Descrie pe scurt rolul tău.",
                          "Describe your role briefly.",
                        ),
                      },
                    )}
                    {!review && !role.context.value.trim() && summarize && (
                      <RoleRewrite
                        draft={d}
                        targetId={role.id}
                        purpose="summary"
                        compact
                        inlineSummary
                        ready={aiReady && !disabled}
                        request={summarize}
                        change={change}
                        accept={(current, id, text) => {
                          const target = current.roles.find((r) => r.id === id);
                          if (!target || target.context.value.trim())
                            throw Error("STALE");
                          return patchFact(current, target.context, text);
                        }}
                      />
                    )}
                    {d.presentation.contributionHtml?.[role.id] ? (
                      <RichContributions
                        html={d.presentation.contributionHtml[role.id]}
                        fields={role.bullets}
                        change={(id, text) => {
                          const bullet = role.bullets.find(
                            (b) => b.fieldId === id,
                          );
                          if (bullet) change(patchFact(d, bullet, text));
                        }}
                      />
                    ) : (
                      !!role.bullets.length && (
                        <ul className="profile-document-bullets">
                          {role.bullets.map((bullet, i) => (
                            <li key={bullet.fieldId}>
                              {field(
                                bullet,
                                t("Contribuție", "Contribution") + ` ${i + 1}`,
                                { multiline: true },
                              )}
                            </li>
                          ))}
                        </ul>
                      )
                    )}
                  </>
                )}
                {!review && (
                  <details className="document-entry-options">
                    <summary>
                      {t("Opțiuni experiență", "Experience options")}
                    </summary>
                    {!role.location.value &&
                      field(
                        role.location,
                        t("Locația rolului", "Role location"),
                        { placeholder: t("Adaugă locație", "Add location") },
                      )}
                    <div className="document-entry-actions">
                      {!approved && (
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => {
                            const next = clone(d),
                              bullet = fact("");
                            next.roles
                              .find((r) => r.id === role.id)!
                              .bullets.push(bullet);
                            updateContributionHtml(
                              next,
                              role.id,
                              bullet.fieldId,
                              "",
                            );
                            change(next);
                            beginField(bullet.fieldId);
                          }}
                        >
                          <Plus size={15} />
                          {t("Adaugă contribuție", "Add contribution")}
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        disabled={disabled}
                        onClick={() => {
                          const next = clone(d);
                          next.roles = next.roles.filter(
                            (r) => r.id !== role.id,
                          );
                          change(next);
                        }}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        {t(
                          "Elimină această experiență",
                          "Remove this experience",
                        )}
                      </Button>
                    </div>
                  </details>
                )}
              </div>
              {!review && openEnrichment && (
                <aside className="profile-margin-note">
                  {active ? (
                    <Button
                      variant="ghost"
                      disabled={disabled}
                      onClick={closeEnrichment}
                      aria-label={t(
                        "Închide îmbunătățirea",
                        "Close improvement",
                      )}
                    >
                      <X size={16} />
                      {t("Închide", "Close")}
                    </Button>
                  ) : (
                    <>
                      <ExperienceScoreHint draft={d} id={role.id} />
                      <Button
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => openEnrichment(role.id)}
                        data-improve-experience
                      >
                        {t(
                          "Îmbunătățește experiența",
                          "Improve this experience",
                        )}
                      </Button>
                    </>
                  )}
                </aside>
              )}
              {active && enrich && (
                <div className="profile-document-assistant">
                  {enrich(role.id)}
                </div>
              )}
            </section>
          );
        })}
        {!review && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              const next = clone(d);
              next.roles.push(newRole());
              change(next);
              beginField(next.roles.at(-1)!.title.fieldId);
            }}
          >
            <Plus size={15} />
            {t("Adaugă experiență", "Add experience")}
          </Button>
        )}
      </section>

      <section
        className="profile-document-section"
        id="profile-education"
        aria-label={t("Educație", "Education")}
      >
        <h2>
          {t("Educație", "Education")}
          {hidden("education")}
        </h2>
        {!d.education.length &&
          emptySection(
            t(
              "Adaugă studiile, calificarea sau formarea relevantă.",
              "Add your education, qualification or relevant training.",
            ),
          )}
        {d.education.map((entry) => (
          <div className="profile-document-entry" key={entry.id}>
            <h3>
              {field(entry.qualification, t("Calificare", "Qualification"), {
                placeholder: t("Calificare", "Qualification"),
              })}
            </h3>
            <div>
              {field(entry.institution, t("Instituție", "Institution"), {
                placeholder: t("Instituție", "Institution"),
              })}
            </div>
            {field(entry.field, t("Domeniu", "Field of study"), {
              placeholder: t("Adaugă domeniul de studiu", "Add field of study"),
            })}
            {period(entry)}
            {field(entry.details, t("Detalii educație", "Education details"), {
              multiline: true,
              placeholder: t(
                "Adaugă detalii despre studii",
                "Add education details",
              ),
            })}
            {!review && (
              <details className="document-entry-options">
                <summary>{t("Opțiuni studii", "Education options")}</summary>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    const next = clone(d);
                    next.education = next.education.filter(
                      (e) => e.id !== entry.id,
                    );
                    change(next);
                  }}
                >
                  {t("Elimină aceste studii", "Remove this education")}
                </Button>
              </details>
            )}
          </div>
        ))}
        {!review && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              const next = clone(d);
              next.education.push(newEducation());
              change(next);
              beginField(next.education.at(-1)!.qualification.fieldId);
            }}
          >
            <Plus size={15} />
            {t("Adaugă studii", "Add education")}
          </Button>
        )}
      </section>

      {optionalSections.map((section) => (
        <section
          key={section.id}
          id={`profile-section-${section.id}`}
          className="profile-document-section"
          aria-label={sectionName(section.id, locale, d)}
        >
          <h2>
            {section.heading ? (
              field(section.heading, t("Categorie", "Category"))
            ) : section.kind === "custom" ? (
              <EditableValue
                label={t("Denumirea secțiunii", "Section label")}
                value={section.label}
                placeholder={t("Denumirea secțiunii", "Section label")}
                disabled={disabled}
                change={(text) => {
                  const next = clone(d);
                  next.optionalSections.find(
                    (s) => s.id === section.id,
                  )!.label = text;
                  change(next);
                }}
              />
            ) : (
              sectionName(section.id, locale, d)
            )}
            {hidden(section.id)}
          </h2>
          {!section.entries.length &&
            emptySection(
              section.kind === "languages"
                ? t(
                    "Ce limbi vorbești? Adaugă limba și nivelul tău.",
                    "Which languages do you speak? Add a language and your level.",
                  )
                : section.kind === "certifications"
                  ? t(
                      "Adaugă certificări sau acreditări relevante pentru cariera ta.",
                      "Add certifications or credentials relevant to your career.",
                    )
                  : t(
                      "Completează această secțiune cu experiența relevantă.",
                      "Complete this section with relevant experience.",
                    ),
            )}
          {section.entries.map((entry) => {
            const wording = currentWording(d, entry.id, true);
            const approved = d.presentation.approvedWording?.[entry.id];
            return (
              <div
                key={entry.id}
                id={`profile-role-${entry.id}`}
                tabIndex={-1}
                className="profile-document-entry"
              >
                <h3>
                  {field(
                    entry.title,
                    section.kind === "languages"
                      ? t("Limbă", "Language")
                      : t("Titlu", "Title"),
                    {
                      placeholder:
                        section.kind === "languages"
                          ? t("Limba vorbită", "Language spoken")
                          : t("Titlu", "Title"),
                    },
                  )}
                  {entry.proficiency && (
                    <span>
                      {" "}
                      ·{" "}
                      {field(entry.proficiency, t("Nivel", "Proficiency"), {
                        placeholder: t("Adaugă nivelul", "Add your level"),
                      })}
                    </span>
                  )}
                </h3>
                {section.kind !== "languages" && period(entry)}
                {wording && approved ? (
                  <EditableValue
                    label={t("Descrierea experienței", "Experience wording")}
                    value={wording}
                    multiline
                    disabled={disabled}
                    formatted={<RoleText text={wording} />}
                    change={(text) =>
                      change(
                        acceptWording(d, entry.id, {
                          ...approved,
                          text,
                          origin: "user_authored",
                        }),
                      )
                    }
                  />
                ) : (
                  section.kind !== "languages" &&
                  field(entry.details, t("Detalii", "Details"), {
                    multiline: true,
                  })
                )}
                {(!wording || approved?.scope !== "experience") &&
                  !!entry.bullets?.length && (
                    <ul>
                      {entry.bullets.map((bullet, i) => (
                        <li key={bullet.fieldId}>
                          {field(
                            bullet,
                            t("Contribuție", "Contribution") + ` ${i + 1}`,
                            { multiline: true },
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                {!review && section.kind !== "languages" && openEnrichment && (
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    data-improve-experience
                    onClick={() =>
                      enrichTarget === entry.id
                        ? closeEnrichment?.()
                        : openEnrichment(entry.id)
                    }
                  >
                    {enrichTarget === entry.id
                      ? t("Închide îmbunătățirea", "Close improvement")
                      : t(
                          "Îmbunătățește experiența",
                          "Improve this experience",
                        )}
                  </Button>
                )}
                {enrichTarget === entry.id && enrich && (
                  <div className="profile-document-assistant">
                    {enrich(entry.id)}
                  </div>
                )}
                {!review && (
                  <details className="document-entry-options">
                    <summary>{t("Opțiuni intrare", "Entry options")}</summary>
                    <Button
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => {
                        const next = clone(d);
                        const group = next.optionalSections.find(
                          (s) => s.id === section.id,
                        )!;
                        group.entries = group.entries.filter(
                          (e) => e.id !== entry.id,
                        );
                        change(next);
                      }}
                    >
                      {t("Elimină această intrare", "Remove this entry")}
                    </Button>
                  </details>
                )}
              </div>
            );
          })}
          {!review && (
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                const next = clone(d),
                  entry = newOptionalEntry();
                if (section.kind === "languages") entry.proficiency = fact("");
                let group = next.optionalSections.find(
                  (s) => s.id === section.id,
                );
                if (!group) {
                  group = { ...section, entries: [] };
                  next.optionalSections.push(group);
                  if (!next.presentation.order.includes(group.id))
                    next.presentation.order.push(group.id);
                }
                group.entries.push(entry);
                change(next);
                beginField(entry.title.fieldId);
              }}
            >
              <Plus size={15} />
              {section.kind === "languages"
                ? t("Adaugă limbă", "Add language")
                : section.kind === "certifications"
                  ? t("Adaugă certificare", "Add certification")
                  : t("Adaugă intrare", "Add entry")}
            </Button>
          )}
        </section>
      ))}
    </article>
  );
}

export function EditableValue({
  label,
  value,
  display,
  formatted,
  change,
  multiline,
  boolean,
  disabled,
  warning,
  error,
  source,
  onEdit,
  placeholder,
  className = "",
  factId,
  confirmation,
  active,
}: {
  label: string;
  value: string;
  display?: string;
  formatted?: ReactNode;
  change: (text: string) => void;
  multiline?: boolean;
  boolean?: boolean;
  disabled?: boolean;
  warning?: string;
  error?: string;
  source?: () => void;
  placeholder?: string;
  className?: string;
  onEdit?: () => void;
  factId?: string;
  confirmation?: { label?: string; disabled: boolean; confirm: () => void };
  active?: boolean;
}) {
  const t = useCopy(),
    [editing, setEditing] = useState(false),
    original = useRef(value),
    trigger = useRef<HTMLButtonElement>(null);
  const inputId = useRef(`profile-field-${crypto.randomUUID()}`).current;
  const finish = () => setEditing(false);
  const keyboard = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      change(original.current);
      finish();
      requestAnimationFrame(() => trigger.current?.focus());
    } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      finish();
      requestAnimationFrame(() => trigger.current?.focus());
    }
  };
  return (
    <span
      className={`profile-editable ${multiline ? "is-block" : ""} ${warning ? "needs-review" : ""} ${active ? "is-review-active" : ""} ${className}`}
      data-profile-field={inputId}
      data-profile-fact={factId}
    >
      {editing ? (
        <span className="profile-inline-editor" onKeyDown={keyboard}>
          <label htmlFor={inputId}>{label}</label>
          {boolean ? (
            <select
              autoFocus
              disabled={disabled}
              id={inputId}
              value={value}
              onChange={(e) => change(e.target.value)}
              onBlur={finish}
            >
              <option value="true">{t("Da", "Yes")}</option>
              <option value="false">{t("Nu", "No")}</option>
            </select>
          ) : multiline ? (
            <AutoTextarea
              autoFocus
              disabled={disabled}
              id={inputId}
              className="native"
              value={value}
              rows={3}
              onChange={(e) => change(e.target.value)}
              onBlur={finish}
              aria-invalid={!!error}
              aria-describedby={error ? inputId + "-error" : undefined}
            />
          ) : (
            <input
              autoFocus
              disabled={disabled}
              id={inputId}
              className="native"
              value={value}
              onChange={(e) => change(e.target.value)}
              onBlur={finish}
              aria-invalid={!!error}
              aria-describedby={error ? inputId + "-error" : undefined}
            />
          )}
          {error && (
            <small id={inputId + "-error"} role="alert">
              {error}
            </small>
          )}
        </span>
      ) : (
        <button
          ref={trigger}
          type="button"
          className={`profile-edit-trigger ${!value ? "is-empty" : ""}`}
          aria-label={`${t("Editează", "Edit")}: ${label}`}
          aria-description={display || value || placeholder}
          disabled={disabled}
          onClick={() => {
            original.current = value;
            onEdit?.();
            setEditing(true);
          }}
        >
          {formatted ?? (
            <span className="preserve-lines">
              {display ||
                value ||
                placeholder ||
                t("Adaugă detalii", "Add details")}
            </span>
          )}
          <Pencil
            size={13}
            className="profile-edit-pencil"
            aria-hidden="true"
          />
        </button>
      )}
      {!editing && error && (
        <span className="profile-inline-error" role="alert">
          {error}
        </span>
      )}
      {warning && (
        <span className="profile-field-warning">
          <details>
            <summary>{t("De verificat", "Check this detail")}</summary>
            <span>{warning}</span>
            {source && (
              <button type="button" onClick={source}>
                {t("Vezi sursa", "View source")}
              </button>
            )}
          </details>
          {confirmation && (
            <button
              type="button"
              className="profile-confirm-detail"
              disabled={disabled || confirmation.disabled || !!error}
              aria-label={
                confirmation.label ?? `${t("Confirmă", "Confirm")}: ${label}`
              }
              onClick={confirmation.confirm}
            >
              <Check size={14} aria-hidden="true" />
              {confirmation.label ?? t("Este corect", "Looks correct")}
            </button>
          )}
        </span>
      )}
    </span>
  );
}
