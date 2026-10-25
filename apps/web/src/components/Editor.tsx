import { useContext, useState, type ReactNode } from "react";
import { Plus, Check, Eye, EyeOff } from "lucide-react";
import {
  allFacts,
  clone,
  confirmSection,
  editFact,
  fact,
  hasValue,
  localId,
  newEducation,
  newOptionalEntry,
  newRole,
  reorder,
  sectionFacts,
  type BaseDraft,
  type Contact,
  type Fact,
  type FactValue,
  type OptionalKind,
} from "../base/model";
import type { Issue } from "../base/validation";
import { sectionName } from "../base/sections";
import {
  Button,
  DateField,
  EntryActions,
  FactField,
  Field,
  LanguageContext,
  Pill,
  useCopy,
} from "./ui";
type Props = {
  draft: BaseDraft;
  issues: Issue[];
  change: (next: BaseDraft) => void;
};
export function Editor({ draft: d, issues, change }: Props) {
  const t = useCopy(),
    locale = useContext(LanguageContext),
    [contactKind, setContactKind] = useState<Contact["kind"]>("email"),
    [optionalKind, setOptionalKind] = useState<OptionalKind>("projects");
  function update(fn: (next: BaseDraft) => void) {
    const next = clone(d);
    fn(next);
    change(next);
  }
  function patch<T extends FactValue>(field: Fact<T>, value: T) {
    update((next) => {
      const current = allFacts(next).find((f) => f.fieldId === field.fieldId);
      if (current) {
        delete current.confirmedAt;
        delete current.sourceClaimId;
        delete current.evidenceClaimIds;
        Object.assign(current, editFact(field, value));
      }
    });
  }
  const facts = (
    f: Fact<string>,
    label: string,
    extra: {
      multiline?: boolean;
      type?: string;
      required?: boolean;
      hint?: string;
    } = {},
  ) => (
    <FactField
      value={f}
      label={label}
      onChange={(v) => patch(f, v)}
      issues={issues}
      {...extra}
    />
  );
  const dates = (
    f: Parameters<typeof DateField>[0]["value"],
    label: string,
  ) => (
    <DateField
      value={f}
      label={label}
      onChange={(v) => patch(f, v)}
      issues={issues}
    />
  );
  function skills(group: "professionalSkills" | "technicalSkills") {
    return (
      <>
        <p className="muted">
          {t(
            "Introdu doar competențe pe care le poți susține. Categoriile rămân separate.",
            "Add only skills you can support. The two categories stay separate.",
          )}
        </p>
        {d[group].map((s, i) => (
          <div className="skill-row" key={s.fieldId}>
            {facts(s, `${sectionName(group, locale)} ${i + 1}`)}
            <EntryActions
              label={s.value || `${i + 1}`}
              index={i}
              count={d[group].length}
              move={(dir) =>
                update((n) => {
                  n[group] = reorder(n[group], i, dir);
                })
              }
              remove={() =>
                update((n) => {
                  n[group].splice(i, 1);
                })
              }
            />
          </div>
        ))}
        <Button
          onClick={() =>
            update((n) => {
              n[group].push(fact(""));
            })
          }
        >
          <Plus size={16} />
          {t("Adaugă o competență", "Add a skill")}
        </Button>
      </>
    );
  }
  function content(section: string): ReactNode {
    if (section === "identity")
      return (
        <>
          <div className="field-grid">
            {facts(d.name, t("Nume complet", "Full name"), { required: true })}
            {facts(
              d.titles[0],
              t("Titlu de poziționare", "Positioning title"),
              {
                hint: t(
                  "Opțional. Descrie direcția ta, fără senioritate inventată.",
                  "Optional. Describe your direction without inventing seniority.",
                ),
              },
            )}
            {facts(
              d.titles[1],
              t("Al doilea titlu de poziționare", "Second positioning title"),
              { hint: t("Poate rămâne gol.", "May stay empty.") },
            )}
          </div>
          <h3>
            {t(
              "Contact și profiluri · opțional",
              "Contact and profiles · optional",
            )}
          </h3>
          {d.contacts.map((c, i) => (
            <div className="entry" key={c.id}>
              <div className="field-grid">
                {facts(c.value, contactLabel(c.kind), {
                  type:
                    c.kind === "email"
                      ? "email"
                      : c.kind === "phone"
                        ? "tel"
                        : "text",
                  hint:
                    c.kind === "address"
                      ? t(
                          "Adresa completă nu este necesară.",
                          "A full address is not required.",
                        )
                      : undefined,
                })}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={c.visible}
                    onChange={(e) =>
                      update((n) => {
                        n.contacts[i].visible = e.target.checked;
                      })
                    }
                  />
                  {t("Vizibil în previzualizare", "Visible in preview")}
                </label>
              </div>
              <EntryActions
                label={contactLabel(c.kind)}
                index={i}
                count={d.contacts.length}
                move={(dir) =>
                  update((n) => {
                    n.contacts = reorder(n.contacts, i, dir);
                  })
                }
                remove={() =>
                  update((n) => {
                    n.contacts.splice(i, 1);
                  })
                }
              />
            </div>
          ))}
          <div className="add-row">
            <label>
              {t("Tip de contact", "Contact type")}
              <select
                value={contactKind}
                onChange={(e) =>
                  setContactKind(e.target.value as Contact["kind"])
                }
              >
                {(
                  ["email", "phone", "location", "address", "social"] as const
                ).map((k) => (
                  <option key={k} value={k}>
                    {contactLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() =>
                update((n) => {
                  n.contacts.push({
                    id: localId(),
                    kind: contactKind,
                    value: fact(""),
                    visible: contactKind !== "address",
                  });
                })
              }
            >
              <Plus size={16} />
              {t("Adaugă un contact", "Add contact")}
            </Button>
          </div>
        </>
      );
    if (section === "summary")
      return (
        <>
          <Field
            id="summary"
            label={t("Profil în cuvintele tale", "Summary in your own words")}
            multiline
            value={d.summary.text}
            onChange={(v) =>
              update((n) => {
                n.summary = {
                  ...n.summary,
                  id: localId(),
                  text: v,
                  approval: "pending",
                };
              })
            }
            hint={t(
              "Scrie doar ce poți susține. Nu generăm sau traducem text cu AI.",
              "Write only what you can support. AI generation and translation are unavailable.",
            )}
          />
          {d.summary.text.trim() && (
            <label className="check">
              <input
                type="checkbox"
                checked={d.summary.approval === "approved"}
                onChange={(e) =>
                  update((n) => {
                    n.summary.approval = e.target.checked
                      ? "approved"
                      : "pending";
                  })
                }
              />
              {t(
                "Aprob acest text propriu pentru CV.",
                "I approve this wording for my CV.",
              )}
            </label>
          )}
        </>
      );
    if (section === "professionalSkills" || section === "technicalSkills")
      return skills(section);
    if (section === "experience")
      return (
        <>
          {!d.roles.length && (
            <p className="muted">
              {t(
                "Adaugă un rol când ai informații. Datele necunoscute pot rămâne goale.",
                "Add a role when you have information. Unknown dates may stay empty.",
              )}
            </p>
          )}
          {d.roles.map((r, i) => (
            <div className="entry" key={r.id}>
              <div className="entry-heading">
                <h3>{r.title.value || t("Rol nou", "New role")}</h3>
                <EntryActions
                  label={r.title.value || t("Rol nou", "New role")}
                  index={i}
                  count={d.roles.length}
                  move={(dir) =>
                    update((n) => {
                      n.roles = reorder(n.roles, i, dir);
                    })
                  }
                  remove={() =>
                    update((n) => {
                      n.roles.splice(i, 1);
                    })
                  }
                />
              </div>
              <div className="field-grid">
                {facts(r.title, t("Funcție", "Job title"), { required: true })}
                {facts(r.company, t("Angajator", "Employer"), {
                  required: true,
                })}
                {facts(r.location, t("Locația rolului", "Role location"))}
              </div>
              <div className="field-grid">
                {dates(r.start, t("Început rol", "Role start"))}
                {!r.ongoing.value && dates(r.end, t("Sfârșit rol", "Role end"))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  id={r.ongoing.fieldId}
                  checked={r.ongoing.value}
                  onChange={(e) => patch(r.ongoing, e.target.checked)}
                />
                {t("Lucrez aici în prezent", "I currently work here")}
              </label>
              {facts(
                r.context,
                t(
                  "Context și responsabilități",
                  "Context and responsibilities",
                ),
                { multiline: true },
              )}
              {r.bullets.map((b, j) => (
                <div className="bullet-row" key={b.fieldId}>
                  {facts(b, `${t("Contribuție", "Contribution")} ${j + 1}`, {
                    multiline: true,
                  })}
                  <EntryActions
                    label={`${t("Contribuție", "Contribution")} ${j + 1}`}
                    index={j}
                    count={r.bullets.length}
                    move={(dir) =>
                      update((n) => {
                        n.roles[i].bullets = reorder(
                          n.roles[i].bullets,
                          j,
                          dir,
                        );
                      })
                    }
                    remove={() =>
                      update((n) => {
                        n.roles[i].bullets.splice(j, 1);
                      })
                    }
                  />
                </div>
              ))}
              <Button
                onClick={() =>
                  update((n) => {
                    n.roles[i].bullets.push(fact(""));
                  })
                }
              >
                <Plus size={16} />
                {t("Adaugă o contribuție", "Add a contribution")}
              </Button>
            </div>
          ))}
          <Button
            onClick={() =>
              update((n) => {
                n.roles.push(newRole());
              })
            }
          >
            <Plus size={16} />
            {t("Adaugă un rol", "Add a role")}
          </Button>
        </>
      );
    if (section === "education")
      return (
        <>
          {!d.education.length && (
            <p className="muted">
              {t(
                "Educația poate fi adăugată mai târziu.",
                "Education can be added later.",
              )}
            </p>
          )}
          {d.education.map((e, i) => (
            <div className="entry" key={e.id}>
              <div className="entry-heading">
                <h3>
                  {e.institution.value || t("Studii noi", "New education")}
                </h3>
                <EntryActions
                  label={
                    e.institution.value || t("Studii noi", "New education")
                  }
                  index={i}
                  count={d.education.length}
                  move={(dir) =>
                    update((n) => {
                      n.education = reorder(n.education, i, dir);
                    })
                  }
                  remove={() =>
                    update((n) => {
                      n.education.splice(i, 1);
                    })
                  }
                />
              </div>
              <div className="field-grid">
                {facts(e.institution, t("Instituție", "Institution"), {
                  required: true,
                })}
                {facts(e.qualification, t("Calificare", "Qualification"))}
                {facts(e.field, t("Domeniu", "Field of study"))}
                {facts(
                  e.location,
                  t("Locația instituției", "Institution location"),
                )}
                {dates(e.start, t("Început studii", "Education start"))}
                {dates(e.end, t("Sfârșit studii", "Education end"))}
              </div>
              {facts(e.details, t("Detalii studii", "Education details"), {
                multiline: true,
              })}
            </div>
          ))}
          <Button
            onClick={() =>
              update((n) => {
                n.education.push(newEducation());
              })
            }
          >
            <Plus size={16} />
            {t("Adaugă studii", "Add education")}
          </Button>
        </>
      );
    const s = d.optionalSections.find((s) => s.id === section);
    if (!s) return null;
    const si = d.optionalSections.indexOf(s);
    return (
      <>
        <Field
          label={t("Denumirea secțiunii", "Section label")}
          value={s.label}
          onChange={(v) =>
            update((n) => {
              n.optionalSections[si].label = v;
            })
          }
          hint={t(
            "Opțional. Textul propriu nu se traduce automat.",
            "Optional. Your text is not translated automatically.",
          )}
        />
        {s.entries.map((e, i) => (
          <div className="entry" key={e.id}>
            <div className="entry-heading">
              <h3>{e.title.value || t("Intrare nouă", "New entry")}</h3>
              <EntryActions
                label={e.title.value || t("Intrare nouă", "New entry")}
                index={i}
                count={s.entries.length}
                move={(dir) =>
                  update((n) => {
                    n.optionalSections[si].entries = reorder(
                      n.optionalSections[si].entries,
                      i,
                      dir,
                    );
                  })
                }
                remove={() =>
                  update((n) => {
                    n.optionalSections[si].entries.splice(i, 1);
                  })
                }
              />
            </div>
            {facts(e.title, t("Denumire", "Name"), { required: true })}
            {facts(e.details, t("Detalii", "Details"), { multiline: true })}
            <div className="field-grid">
              {dates(e.start, t("Început intrare", "Entry start"))}
              {dates(e.end, t("Sfârșit intrare", "Entry end"))}
            </div>
          </div>
        ))}
        <Button
          onClick={() =>
            update((n) => {
              n.optionalSections[si].entries.push(newOptionalEntry());
            })
          }
        >
          <Plus size={16} />
          {t("Adaugă o intrare", "Add entry")}
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            update((n) => {
              n.optionalSections.splice(si, 1);
              n.presentation.order = n.presentation.order.filter(
                (id) => id !== section,
              );
              n.presentation.hidden = n.presentation.hidden.filter(
                (id) => id !== section,
              );
            })
          }
        >
          {t("Elimină secțiunea opțională", "Remove optional section")}
        </Button>
      </>
    );
  }
  function contactLabel(k: Contact["kind"]) {
    return {
      email: t("Email", "Email"),
      phone: t("Telefon", "Phone"),
      location: t("Localitate", "City / location"),
      address: t("Adresă", "Address"),
      social: t("Profil social / website", "Social profile / website"),
    }[k];
  }
  return (
    <div className="editor-stack">
      <section className="card section-order">
        <h2>{t("Structura CV-ului", "CV structure")}</h2>
        <p className="muted">
          {t(
            "Ordinea și vizibilitatea schimbă doar prezentarea. Informațiile ascunse rămân în baza ta.",
            "Order and visibility change only presentation. Hidden facts stay in your Base.",
          )}
        </p>
        {d.presentation.order.map((s, i) => (
          <div className="order-row" key={s}>
            <a
              href={`#base`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`section-${s}`)
                  ?.scrollIntoView({ block: "start" });
                document.getElementById(`section-${s}`)?.focus();
              }}
            >
              {sectionName(s, locale, d)}
            </a>
            <div className="entry-actions">
              <Button
                aria-label={`${t("Mută secțiunea în sus", "Move section up")}: ${sectionName(s, locale, d)}`}
                disabled={i === 0}
                onClick={() =>
                  update((n) => {
                    n.presentation.order = reorder(n.presentation.order, i, -1);
                  })
                }
              >
                ↑
              </Button>
              <Button
                aria-label={`${t("Mută secțiunea în jos", "Move section down")}: ${sectionName(s, locale, d)}`}
                disabled={i === d.presentation.order.length - 1}
                onClick={() =>
                  update((n) => {
                    n.presentation.order = reorder(n.presentation.order, i, 1);
                  })
                }
              >
                ↓
              </Button>
              {s !== "identity" && (
                <Button
                  aria-pressed={!d.presentation.hidden.includes(s)}
                  aria-label={`${t("Vizibilitate", "Visibility")}: ${sectionName(s, locale, d)}`}
                  onClick={() =>
                    update((n) => {
                      n.presentation.hidden = n.presentation.hidden.includes(s)
                        ? n.presentation.hidden.filter((id) => id !== s)
                        : [...n.presentation.hidden, s];
                    })
                  }
                >
                  {d.presentation.hidden.includes(s) ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </section>
      {d.presentation.order.map((section) => {
        const fs = sectionFacts(d, section).filter((f) => hasValue(f.value)),
          pending = fs.filter((f) => f.status !== "user_confirmed").length;
        return (
          <section
            className="card editor-section"
            key={section}
            id={`section-${section}`}
            tabIndex={-1}
            aria-labelledby={`heading-${section}`}
          >
            <div className="section-heading">
              <h2 id={`heading-${section}`}>
                {sectionName(section, locale, d)}
              </h2>
              {section !== "summary" && (
                <Pill tone={pending ? "warn" : "neutral"}>
                  {pending
                    ? `${pending} ${t("de confirmat", "to confirm")}`
                    : fs.length
                      ? t("Confirmat", "Confirmed")
                      : t("Opțional / gol", "Optional / empty")}
                </Pill>
              )}
            </div>
            <div className="stack">{content(section)}</div>
            {section !== "summary" && fs.length > 0 && (
              <div className="confirm-row">
                <p>
                  {t(
                    "Confirmă numai după ce ai verificat câmpurile de mai sus. Confirmarea este o auto-declarație.",
                    "Confirm only after reviewing the fields above. Confirmation is self-reported.",
                  )}
                </p>
                <Button
                  disabled={!pending}
                  onClick={() => change(confirmSection(d, section))}
                >
                  <Check size={16} />
                  {t(
                    "Confirmă informațiile din secțiune",
                    "Confirm section facts",
                  )}
                </Button>
              </div>
            )}
          </section>
        );
      })}
      <section className="card">
        <h2>{t("Secțiuni opționale", "Optional sections")}</h2>
        <p className="muted">
          {t(
            "Adaugă doar ce este relevant. Nu trebuie să completezi toate secțiunile.",
            "Add only what is relevant. You do not need every section.",
          )}
        </p>
        <div className="add-row">
          <label>
            {t("Tip de secțiune", "Section type")}
            <select
              value={optionalKind}
              onChange={(e) => setOptionalKind(e.target.value as OptionalKind)}
            >
              {(
                [
                  "projects",
                  "certifications",
                  "languages",
                  "volunteering",
                  "custom",
                ] as const
              ).map((k) => (
                <option key={k} value={k}>
                  {sectionName(k, locale)}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() =>
              update((n) => {
                const id = localId();
                n.optionalSections.push({
                  id,
                  kind: optionalKind,
                  label: "",
                  entries: [],
                });
                n.presentation.order.push(id);
              })
            }
          >
            <Plus size={16} />
            {t("Adaugă o secțiune", "Add section")}
          </Button>
        </div>
      </section>
    </div>
  );
}
