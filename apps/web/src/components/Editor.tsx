import { answerEvidenceText } from "@resumora/contracts/intelligence/model";
import { jobEditorFacts } from "@resumora/contracts/jobs/documents";
import {
  useContext,
  useState,
  useEffect,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Info, Plus, X } from "lucide-react";
import {
  isAuthored,
  clone,
  editFact,
  fact,
  localId,
  newRole,
  newEducation,
  newOptionalEntry,
  sectionFacts,
  type BaseDraft,
  type Fact,
  type FactValue,
  type OptionalKind,
} from "../base/model";
import {
  patchFact,
  moveItem,
  focusField,
  focusFirstField,
  languageLevels,
  setContributions,
} from "../base/editing";
import { currentWording, isWordingFieldVisible } from "../base/wording";
import { sectionName } from "../base/sections";
import type { Issue } from "../base/validation";
import { Button, Field, LanguageContext, issueText, useCopy } from "./ui";
import { ChipInput, Sortable, Visibility } from "./InlineControls";
import { Contributions } from "./Contributions";
import { MonthYearField } from "./MonthYearField";

type Props = {
  jobMode?: boolean;
  photoEditor?: ReactNode;
  draft: BaseDraft;
  issues: Issue[];
  change: (next: BaseDraft) => void;
};
export function Editor({
  draft: d,
  issues,
  change,
  photoEditor,
  jobMode = false,
}: Props) {
  const t = useCopy(),
    locale = useContext(LanguageContext);
  const [opened, setOpened] = useState<string | null>("identity");
  const [entryOpen, setEntryOpen] = useState<string | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (document.activeElement?.closest("[data-editor]")) return;
      const fields = Array.from(
        document
          .getElementById("section-identity")
          ?.querySelectorAll<HTMLInputElement>("input:not([type=checkbox])") ??
          [],
      );
      const first = fields.find((f) => !f.value) ?? fields[0];
      first?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function update(fn: (n: BaseDraft) => void) {
    const n = clone(d);
    fn(n);
    change(n);
  }
  function patch<T extends FactValue>(f: Fact<T>, value: T) {
    change(patchFact(d, f, value));
  }
  function visible(id: string) {
    return (
      !d.presentation.hiddenFields?.includes(id) &&
      (d.contacts.find((c) => c.value.fieldId === id)?.visible ?? true)
    );
  }
  function toggle(id: string) {
    update((n) => {
      const c = n.contacts.find((c) => c.value.fieldId === id);
      if (c && !jobMode) {
        c.visible = !visible(id);
        n.presentation.hiddenFields = (
          n.presentation.hiddenFields ?? []
        ).filter((x) => x !== id);
      } else {
        const hidden = n.presentation.hiddenFields ?? [];
        n.presentation.hiddenFields = hidden.includes(id)
          ? hidden.filter((x) => x !== id)
          : [...hidden, id];
      }
      if (jobMode) {
        const target = jobEditorFacts(n).find(
          (f) =>
            f.key === "bullet" &&
            f.fact.fieldId === id &&
            f.fact.sourceId === "job_local_manual",
        )?.ref.entityId;
        if (
          target &&
          n.presentation.approvedWording?.[target]?.scope === "experience"
        ) {
          delete n.presentation.approvedWording[target];
          if (!Object.keys(n.presentation.approvedWording).length)
            delete n.presentation.approvedWording;
        }
      }
    });
  }
  function field(
    f: Fact<string>,
    label: string,
    extra: {
      multiline?: boolean;
      type?: string;
      required?: boolean;
      hint?: string;
    } = {},
  ) {
    return box(
      f.fieldId,
      label,
      <Field
        id={f.fieldId}
        label={label}
        value={f.value}
        onChange={(v) => patch(f, v)}
        error={
          issues.find((i) => i.field === f.fieldId)
            ? issueText(issues.find((i) => i.field === f.fieldId)!.code, t)
            : undefined
        }
        {...extra}
      />,
    );
  }
  function box(id: string, label: string, content: ReactNode) {
    return (
      <div className="compact-field" data-visibility={id}>
        {content}
        <Visibility
          label={label}
          visible={visible(id)}
          toggle={() => toggle(id)}
        />
      </div>
    );
  }
  function date(f: Fact<{ year: string; month: string }>, label: string) {
    return box(
      f.fieldId,
      label,
      <MonthYearField
        id={f.fieldId}
        label={label}
        value={f.value}
        onChange={(v) => patch(f, v)}
        error={
          issues.some((i) => i.field === f.fieldId)
            ? issueText(issues.find((i) => i.field === f.fieldId)!.code, t)
            : undefined
        }
      />,
    );
  }
  function keyboard(e: KeyboardEvent<HTMLDivElement>) {
    if (e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    if (e.altKey && e.key.toLowerCase() === "v") {
      const id =
        target.closest<HTMLElement>("[data-visibility]")?.dataset.visibility;
      if (id) {
        e.preventDefault();
        toggle(id);
      }
    }
    if (
      e.key !== "Enter" ||
      !(target instanceof HTMLInputElement) ||
      target.type === "checkbox" ||
      target.closest(".chip-field")
    )
      return;
    e.preventDefault();
    const panel = target.closest(".section-body");
    const fields = Array.from(
      panel?.querySelectorAll<HTMLElement>(
        "input:not([type=checkbox]),textarea,select,[contenteditable=true]",
      ) ?? [],
    ).filter((el) => !el.closest("details:not([open])"));
    fields[fields.indexOf(target) + 1]?.focus();
  }
  function open(section: string) {
    setOpened(opened === section ? null : section);
    if (opened !== section) focusFirstField(`section-${section}`);
  }
  function metadata(section: string) {
    return (
      <details className="section-info">
        <summary
          aria-label={`${t("Informații sursă", "Source information")}: ${sectionName(section, locale, d)}`}
        >
          <Info size={16} />
        </summary>
        <div>
          <p>
            {t(
              "Alt+V în câmp: vizibilitate. Trage mânerul sau Alt+↑/↓ pentru ordine.",
              "Alt+V in a field: visibility. Drag a handle or Alt+↑/↓ to reorder.",
            )}
          </p>
          {sectionFacts(d, section)
            .filter((f) => typeof f.value === "string" && f.value)
            .map((f) => (
              <p key={f.fieldId}>
                {String(f.value)} · {f.sourceId} · {f.status}
              </p>
            ))}
        </div>
      </details>
    );
  }
  function identity() {
    const parts = d.nameParts ?? { first: "", last: "" };
    const namePart = (key: "first" | "last", label: string) =>
      box(
        d.name.fieldId,
        label,
        <Field
          id={key === "first" ? "first-name" : "last-name"}
          label={label}
          required
          value={parts[key]}
          onChange={(v) =>
            update((n) => {
              n.nameParts = { ...parts, [key]: v };
              n.name = editFact(
                n.name,
                `${n.nameParts.first} ${n.nameParts.last}`.trim(),
              );
            })
          }
          error={
            issues.some(
              (i) => i.field === (key === "first" ? "first-name" : "last-name"),
            )
              ? issueText("required", t)
              : undefined
          }
        />,
      );
    const contacts = d.contacts;
    const requiredContacts = contacts.filter(
      (c) =>
        ["email", "phone", "location"].includes(c.kind) ||
        c.platform === "linkedin",
    );
    function contact(c: BaseDraft["contacts"][number], index: number) {
      const label =
        c.platform === "linkedin"
          ? "LinkedIn"
          : c.platform === "website"
            ? "Website"
            : c.platform === "github"
              ? "GitHub"
              : c.kind === "email"
                ? "Email"
                : c.kind === "phone"
                  ? t("Telefon", "Phone")
                  : c.kind === "location"
                    ? t("Localitate", "City")
                    : c.kind === "address"
                      ? t("Adresă completă", "Full address")
                      : t("Profil social", "Social profile");
      return (
        <Sortable
          key={c.id}
          group="contacts"
          index={d.contacts.indexOf(c)}
          label={label}
          move={(from, to) =>
            update((n) => {
              n.contacts = moveItem(n.contacts, from, to);
            })
          }
        >
          <div className="contact-control">
            {field(c.value, label, {
              required: requiredContacts.includes(c),
              type:
                c.kind === "email"
                  ? "email"
                  : c.kind === "phone"
                    ? "tel"
                    : "text",
            })}
            {!requiredContacts.includes(c) && (
              <button
                type="button"
                className="icon-button"
                aria-label={`${t("Elimină", "Remove")}: ${label}`}
                onClick={() =>
                  update((n) => {
                    n.contacts.splice(index, 1);
                  })
                }
              >
                <X size={14} />
              </button>
            )}
          </div>
        </Sortable>
      );
    }
    function addContact(platform: "website" | "github" | "other" | "address") {
      const c = {
        id: localId(),
        kind:
          platform === "address" ? ("address" as const) : ("social" as const),
        ...(platform !== "address" ? { platform } : {}),
        value: fact(""),
        visible: true,
      };
      update((n) => {
        n.contacts.push(c);
      });
      focusField(c.value.fieldId);
    }
    return (
      <>
        <div className="identity-grid">
          {namePart("first", t("Prenume", "First name"))}
          {namePart("last", t("Nume de familie", "Last name"))}
          {field(d.titles[0], t("Titlu profesional", "Professional title"), {
            required: true,
            hint: t(
              "Eticheta profesională de sub numele tău.",
              "The professional label below your name.",
            ),
          })}
          {contacts.map((c) => contact(c, d.contacts.indexOf(c)))}
          {(secondTitle || d.titles[1].value) &&
            field(d.titles[1], t("Al doilea titlu", "Second title"))}
        </div>
        {photoEditor}
        {!d.nameParts && (
          <p className="small muted">
            {t(
              "Numele original se păstrează în sursă:",
              "Original name remains in the source:",
            )}{" "}
            {d.name.value}
          </p>
        )}
        <div className="optional-contacts">
          {!d.titles[1].value && (
            <button
              type="button"
              onClick={() => {
                const id = d.titles[1].fieldId;
                const node = document.getElementById(id);
                if (node) focusField(id);
                else {
                  setSecondTitle(true);
                  focusField(id);
                }
              }}
            >
              + {t("Al doilea titlu", "Second title")}
            </button>
          )}
          {(["website", "github", "other", "address"] as const)
            .filter(
              (p) =>
                !d.contacts.some((c) =>
                  p === "address" ? c.kind === "address" : c.platform === p,
                ),
            )
            .map((p) => (
              <button type="button" key={p} onClick={() => addContact(p)}>
                +{" "}
                {p === "website"
                  ? "Website"
                  : p === "github"
                    ? "GitHub"
                    : p === "address"
                      ? t("Adresă", "Address")
                      : t("Profil social", "Social profile")}
              </button>
            ))}
        </div>
      </>
    );
  }
  const [secondTitle, setSecondTitle] = useState(false);
  function contributions(role: BaseDraft["roles"][number]) {
    const node = document.createElement("div");
    for (const b of role.bullets) {
      const p = document.createElement("p");
      p.dataset.contribution = b.fieldId;
      p.textContent = b.value;
      node.append(p);
    }
    const html = d.presentation.contributionHtml?.[role.id] ?? node.innerHTML;
    return box(
      `${role.id}-contributions`,
      t("Contribuții", "Contributions"),
      <Contributions
        id={`${role.id}-contributions`}
        html={html}
        fieldIds={role.bullets.map((f) => f.fieldId)}
        error={
          issues.some((i) => i.field === `${role.id}-contributions`)
            ? issueText("required", t)
            : undefined
        }
        onChange={(value) => change(setContributions(d, role.id, value))}
      />,
    );
  }
  function roleEntries() {
    return (
      <>
        <Button
          onClick={() => {
            const r = newRole();
            update((n) => {
              n.roles.push(r);
            });
            setEntryOpen(r.id);
            focusField(r.title.fieldId);
          }}
        >
          <Plus size={16} />
          {t("Adaugă experiență", "Add experience")}
        </Button>
        {d.roles.map((r, i) => (
          <Sortable
            key={r.id}
            group="roles"
            index={i}
            label={r.title.value || t("Experiență", "Experience")}
            move={(from, to) =>
              update((n) => {
                n.roles = moveItem(n.roles, from, to);
              })
            }
          >
            <details
              id={`entry-${r.id}`}
              className="inline-entry"
              open={entryOpen === r.id || d.roles.length === 1}
              onToggle={(e) => {
                if (e.currentTarget.open) {
                  setEntryOpen(r.id);
                  if (
                    document.activeElement ===
                    e.currentTarget.querySelector("summary")
                  )
                    focusFirstField(`entry-${r.id}`);
                }
              }}
            >
              <summary>
                {r.title.value || t("Experiență nouă", "New experience")} ·{" "}
                {r.company.value}
              </summary>
              <div className="field-grid">
                {field(r.title, t("Rol", "Role"), { required: true })}
                {field(r.company, t("Companie", "Company"), { required: true })}
                {date(r.start, t("Când ai început?", "Start date"))}
                <div>
                  {!r.ongoing.value &&
                    date(r.end, t("Când s-a terminat?", "End date"))}
                  <label className="current-job">
                    <input
                      id={r.ongoing.fieldId}
                      type="checkbox"
                      checked={r.ongoing.value}
                      onChange={(e) => patch(r.ongoing, e.target.checked)}
                    />
                    {t("Prezent / În curs", "Present / Ongoing")}
                  </label>
                </div>
                {field(r.location, t("Localitate", "City"))}
                {field(
                  r.context,
                  t("Context și responsabilități", "Role summary"),
                  {
                    hint: t(
                      "Echipa, activitatea și responsabilitatea ta.",
                      "Your team, work and responsibility.",
                    ),
                  },
                )}
                <div className="span-all">{contributions(r)}</div>
              </div>
              <button
                type="button"
                className="text-remove"
                onClick={() =>
                  update((n) => {
                    n.roles.splice(i, 1);
                    for (const a of n.answers)
                      if (a.targetId === r.id) delete a.cvFieldId;
                    delete n.presentation.contributionHtml?.[r.id];
                  })
                }
              >
                {t("Elimină experiența", "Remove experience")}
              </button>
            </details>
          </Sortable>
        ))}
      </>
    );
  }
  function educationEntries() {
    return (
      <>
        <Button
          onClick={() => {
            const e = newEducation();
            update((n) => {
              n.education.push(e);
            });
            setEntryOpen(e.id);
            focusField(e.institution.fieldId);
          }}
        >
          <Plus size={16} />
          {t("Adaugă studii", "Add education")}
        </Button>
        {d.education.map((e, i) => (
          <Sortable
            key={e.id}
            group="education"
            index={i}
            label={e.institution.value || t("Studii", "Education")}
            move={(from, to) =>
              update((n) => {
                n.education = moveItem(n.education, from, to);
              })
            }
          >
            <details
              id={`entry-${e.id}`}
              className="inline-entry"
              open={entryOpen === e.id || d.education.length === 1}
              onToggle={(ev) => {
                if (ev.currentTarget.open) {
                  setEntryOpen(e.id);
                  if (
                    document.activeElement ===
                    ev.currentTarget.querySelector("summary")
                  )
                    focusFirstField(`entry-${e.id}`);
                }
              }}
            >
              <summary>
                {e.institution.value || t("Studii noi", "New education")}
              </summary>
              <div className="field-grid">
                {field(e.institution, t("Instituție", "Institution"), {
                  required: true,
                })}
                {field(
                  e.qualification,
                  t("Diplomă sau calificare", "Degree or qualification"),
                )}
                {date(e.start, t("Început studii", "Education start"))}
                <div>
                  {!e.ongoing?.value &&
                    date(e.end, t("Sfârșit studii", "Education end"))}
                  <label className="current-job">
                    <input
                      id={e.ongoing?.fieldId ?? `${e.id}-ongoing`}
                      type="checkbox"
                      checked={!!e.ongoing?.value}
                      onChange={(ev) =>
                        update((n) => {
                          n.education[i].ongoing = editFact(
                            n.education[i].ongoing ?? fact(false),
                            ev.target.checked,
                          );
                        })
                      }
                    />
                    {t("În curs", "Ongoing")}
                  </label>
                </div>
                {field(e.field, t("Specializare", "Field of study"))}
                {field(e.location, t("Localitate", "City"))}
                {field(e.details, t("Detalii", "Details"), { multiline: true })}
              </div>
              <button
                type="button"
                className="text-remove"
                onClick={() =>
                  update((n) => {
                    n.education.splice(i, 1);
                  })
                }
              >
                {t("Elimină studiile", "Remove education")}
              </button>
            </details>
          </Sortable>
        ))}
      </>
    );
  }
  function optional(section: string) {
    const s = d.optionalSections.find((s) => s.id === section);
    if (!s) return null;
    const isLanguage = s.kind === "languages";
    return (
      <>
        {!isLanguage && (
          <Field
            label={t("Denumirea secțiunii", "Section label")}
            value={s.label}
            onChange={(label) =>
              update((n) => {
                n.optionalSections.find((x) => x.id === s.id)!.label = label;
              })
            }
          />
        )}
        <Button
          onClick={() => {
            const e = newOptionalEntry();
            if (isLanguage) e.proficiency = fact("");
            update((n) => {
              n.optionalSections.find((x) => x.id === s.id)!.entries.push(e);
            });
            focusField(e.title.fieldId);
          }}
        >
          <Plus size={16} />
          {isLanguage
            ? t("Adaugă limbă", "Add language")
            : t("Adaugă intrare", "Add entry")}
        </Button>
        {isLanguage && issues.some((i) => i.field === `section-${s.id}`) && (
          <p className="field-error" role="alert">
            {t(
              "Adaugă cel puțin o limbă și alege nivelul autoevaluat.",
              "Add at least one language and choose its self-assessed level.",
            )}
          </p>
        )}
        {s.entries.map((e, i) => (
          <Sortable
            key={e.id}
            group={s.id}
            index={i}
            label={e.title.value || t("Intrare", "Entry")}
            move={(from, to) =>
              update((n) => {
                const group = n.optionalSections.find((x) => x.id === s.id)!;
                group.entries = moveItem(group.entries, from, to);
              })
            }
          >
            <div className="optional-entry">
              <div className="field-grid">
                {field(
                  e.title,
                  isLanguage ? t("Limbă", "Language") : t("Denumire", "Title"),
                  { required: true },
                )}
                {isLanguage ? (
                  box(
                    e.proficiency?.fieldId ?? `${e.id}-level`,
                    t("Nivel autoevaluat", "Self-assessed level"),
                    <div className="field">
                      <label
                        htmlFor={e.proficiency?.fieldId ?? `${e.id}-level`}
                      >
                        {t("Nivel autoevaluat", "Self-assessed level")}
                      </label>
                      <select
                        id={e.proficiency?.fieldId ?? `${e.id}-level`}
                        value={e.proficiency?.value ?? ""}
                        aria-required="true"
                        aria-invalid={issues.some(
                          (i) =>
                            i.field ===
                            (e.proficiency?.fieldId ?? `${e.id}-level`),
                        )}
                        aria-describedby={`${e.id}-cefr${issues.some((i) => i.field === (e.proficiency?.fieldId ?? `${e.id}-level`)) ? ` ${e.id}-level-error` : ""}`}
                        onChange={(ev) =>
                          update((n) => {
                            n.optionalSections.find(
                              (x) => x.id === s.id,
                            )!.entries[i].proficiency = {
                              ...editFact(
                                e.proficiency ?? fact(""),
                                ev.target.value,
                              ),
                              fieldId:
                                e.proficiency?.fieldId ?? `${e.id}-level`,
                            };
                          })
                        }
                      >
                        {languageLevels.map((level) => (
                          <option key={level} value={level}>
                            {level === ""
                              ? t("Alege nivelul", "Choose a level")
                              : level === "Native"
                                ? t("Nativ", "Native")
                                : t(
                                    (
                                      {
                                        A1: "A1 · Începător",
                                        A2: "A2 · Elementar",
                                        B1: "B1 · Intermediar",
                                        B2: "B2 · Independent",
                                        C1: "C1 · Avansat",
                                        C2: "C2 · Stăpânire",
                                      } as Record<string, string>
                                    )[level] ?? level,
                                    (
                                      {
                                        A1: "A1 · Beginner",
                                        A2: "A2 · Elementary",
                                        B1: "B1 · Intermediate",
                                        B2: "B2 · Independent",
                                        C1: "C1 · Advanced",
                                        C2: "C2 · Proficient",
                                      } as Record<string, string>
                                    )[level] ?? level,
                                  )}
                          </option>
                        ))}
                      </select>
                      <p className="field-hint" id={`${e.id}-cefr`}>
                        {t(
                          "CEFR: nivel european autoevaluat; Nativ separat, fără certificare.",
                          "CEFR: self-assessed European level; Native separate, no certification.",
                        )}
                      </p>
                      {issues.some(
                        (i) =>
                          i.field ===
                          (e.proficiency?.fieldId ?? `${e.id}-level`),
                      ) && (
                        <p className="field-error" id={`${e.id}-level-error`}>
                          {t(
                            "Alege un nivel autoevaluat: Nativ sau A1–C2.",
                            "Choose a self-assessed level: Native or A1–C2.",
                          )}
                        </p>
                      )}
                    </div>,
                  )
                ) : (
                  <>
                    {field(e.details, t("Detalii", "Details"), {
                      multiline: true,
                    })}
                    {e.bullets?.map((f) => (
                      <div key={f.fieldId}>
                        {field(
                          f,
                          t("Răspuns de îmbunătățire", "Enrichment answer"),
                          { multiline: true },
                        )}
                      </div>
                    ))}
                    {date(e.start, t("Început", "Start"))}
                    <div>
                      {!e.ongoing?.value && date(e.end, t("Sfârșit", "End"))}
                      <label className="current-job">
                        <input
                          id={e.ongoing?.fieldId ?? `${e.id}-ongoing`}
                          type="checkbox"
                          checked={!!e.ongoing?.value}
                          onChange={(ev) =>
                            update((n) => {
                              const entry = n.optionalSections.find(
                                (x) => x.id === s.id,
                              )!.entries[i];
                              entry.ongoing = editFact(
                                entry.ongoing ?? fact(false),
                                ev.target.checked,
                              );
                            })
                          }
                        />
                        {t("Prezent / În curs", "Present / Ongoing")}
                      </label>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="text-remove"
                onClick={() =>
                  update((n) => {
                    n.optionalSections
                      .find((x) => x.id === s.id)!
                      .entries.splice(i, 1);
                    for (const a of n.answers)
                      if (a.targetId === e.id) delete a.cvFieldId;
                  })
                }
              >
                {t("Elimină intrarea", "Remove entry")}
              </button>
            </div>
          </Sortable>
        ))}
        {!isLanguage && (
          <button
            type="button"
            className="text-remove"
            onClick={() =>
              update((n) => {
                for (const a of n.answers)
                  if (s.entries.some((e) => e.id === a.targetId))
                    delete a.cvFieldId;
                n.optionalSections = n.optionalSections.filter(
                  (x) => x.id !== s.id,
                );
                n.presentation.order = n.presentation.order.filter(
                  (x) => x !== s.id,
                );
                n.presentation.hidden = n.presentation.hidden.filter(
                  (x) => x !== s.id,
                );
              })
            }
          >
            {t("Elimină secțiunea", "Remove section")}
          </button>
        )}
      </>
    );
  }
  function content(section: string) {
    if (
      jobMode &&
      !["summary", "professionalSkills", "technicalSkills"].includes(section)
    ) {
      const targets =
        section === "experience"
          ? d.roles
          : (d.optionalSections.find(
              (s) => s.id === section && s.kind !== "languages",
            )?.entries ?? []);
      return (
        <>
          <p>
            {t(
              "Faptele provin din versiunea fixată a CV-ului de bază. Aici poți schimba formularea fără a inventa experiență.",
              "Facts come from the pinned Base CV. Change wording here without inventing experience.",
            )}
          </p>
          {section === "identity" && photoEditor}
          {sectionFacts(d, section)
            .filter((f) => typeof f.value === "string" && f.value)
            .map((f) => (
              <div key={f.fieldId}>
                {box(f.fieldId, String(f.value), <p>{String(f.value)}</p>)}
              </div>
            ))}
          {targets.map((target) => {
            const fields = jobEditorFacts(d).filter(
              (f) =>
                f.ref.entityId === target.id &&
                ["context", "details", "bullet"].includes(f.key) &&
                isAuthored(f.fact) &&
                isWordingFieldVisible(d, target.id, f.fact.fieldId) &&
                d.sources.some((s) => s.id === f.fact.sourceId),
            );
            const answers = d.answers.filter(
              (a) =>
                a.targetId === target.id &&
                a.status === "confirmed" &&
                isWordingFieldVisible(d, target.id, a.cvFieldId) &&
                a.sourceId &&
                d.sources.some((s) => s.id === a.sourceId),
            );
            const sources = [
              ...fields
                .filter((f) => f.fact.sourceId !== "job_local_manual")
                .map((f) => ({
                  id: f.fact.id,
                  text: String(f.fact.value),
                  sourceId: f.fact.sourceId,
                  ...(f.fact.sourceClaimId
                    ? { sourceClaimId: f.fact.sourceClaimId }
                    : {}),
                  ...(f.fact.sourceLineage
                    ? { sourceLineage: f.fact.sourceLineage }
                    : {}),
                })),
              ...answers.map((a) => ({
                id: a.id,
                text: answerEvidenceText(a),
                sourceId: a.sourceId!,
              })),
            ];
            const accepted = currentWording(d, target.id);
            const text =
              accepted !== null &&
              d.presentation.approvedWording?.[target.id]?.scope ===
                "experience"
                ? accepted
                : [
                    accepted ??
                      fields.find((f) => f.key !== "bullet")?.fact.value,
                    ...fields
                      .filter((f) => f.key === "bullet")
                      .map((f) => f.fact.value),
                    ...answers.map(answerEvidenceText),
                  ]
                    .filter(Boolean)
                    .join("\n");
            return (
              <div key={target.id} className="stack">
                <strong>{target.title.value}</strong>
                {sources.length ? (
                  <Field
                    id={`job-wording-${target.id}`}
                    label={t(
                      "Formulare pentru acest job",
                      "Wording for this job",
                    )}
                    multiline
                    value={text}
                    hint={t(
                      "Salvarea acceptă formularea ta. Pentru a ascunde conținutul folosește vizibilitatea.",
                      "Saving accepts your wording. Use visibility to hide content.",
                    )}
                    onChange={(text) =>
                      update((n) => {
                        (n.presentation.approvedWording ??= {})[target.id] = {
                          text,
                          sources,
                          scope: "experience",
                          origin: "user_authored",
                        };
                        delete n.presentation.contributionHtml?.[target.id];
                      })
                    }
                  />
                ) : (
                  <p>
                    {t(
                      "Adaugă mai întâi context confirmat în CV-ul de bază.",
                      "Add confirmed context in Base CV first.",
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </>
      );
    }
    if (section === "identity") return identity();
    if (section === "summary")
      return box(
        "summary",
        t("Rezumat profesional", "Professional summary"),
        <Field
          id="summary"
          label={t(
            "Rezumat profesional în cuvintele tale",
            "Professional summary in your words",
          )}
          multiline
          value={d.summary.text}
          hint={t(
            "Direcția ta, punctele forte și contribuția relevantă.",
            "Your direction, strengths and relevant contribution.",
          )}
          onChange={(v) =>
            update((n) => {
              n.summary = {
                ...n.summary,
                id: localId(),
                text: v,
                approval: "approved",
              };
            })
          }
        />,
      );
    if (section === "professionalSkills" || section === "technicalSkills")
      return (
        <ChipInput
          label={sectionName(section, locale)}
          items={d[section]}
          change={(items) =>
            update((n) => {
              n[section] = items;
            })
          }
        />
      );
    if (section === "experience") return roleEntries();
    if (section === "education") return educationEntries();
    return optional(section);
  }
  return (
    <div className="inline-editor" data-editor onKeyDown={keyboard}>
      {d.presentation.order.map((section) => (
        <details
          key={section}
          id={`section-${section}`}
          className="editor-section"
          open={opened === section}
          onToggle={(e) => {
            if (e.currentTarget.open && opened !== section) setOpened(section);
          }}
        >
          <summary
            onClick={(e) => {
              e.preventDefault();
              open(section);
            }}
          >
            {sectionName(section, locale, d)}
          </summary>
          <div className="section-body">
            {metadata(section)}
            {content(section)}
          </div>
        </details>
      ))}
      <details className="structure-panel">
        <summary>{t("Structura CV-ului", "CV structure")}</summary>
        {d.presentation.order.map((section, i) => (
          <Sortable
            key={section}
            group="sections"
            index={i}
            label={sectionName(section, locale, d)}
            move={(from, to) =>
              update((n) => {
                n.presentation.order = moveItem(n.presentation.order, from, to);
              })
            }
          >
            <span>{sectionName(section, locale, d)}</span>
            <Visibility
              keyboardReachable
              label={sectionName(section, locale, d)}
              visible={!d.presentation.hidden.includes(section)}
              toggle={() =>
                update((n) => {
                  n.presentation.hidden = n.presentation.hidden.includes(
                    section,
                  )
                    ? n.presentation.hidden.filter((x) => x !== section)
                    : [...n.presentation.hidden, section];
                })
              }
            />
          </Sortable>
        ))}
      </details>
      {!jobMode && (
        <details className="add-section">
          <summary>{t("Adaugă secțiune", "Add section")}</summary>
          <div className="optional-contacts">
            {(
              [
                "projects",
                "certifications",
                "volunteering",
                "custom",
              ] as OptionalKind[]
            ).map((kind) => (
              <button
                type="button"
                key={kind}
                onClick={() => {
                  const id = localId();
                  update((n) => {
                    n.optionalSections.push({
                      id,
                      kind,
                      label: "",
                      entries: [],
                    });
                    n.presentation.order.push(id);
                  });
                  setOpened(id);
                  focusFirstField(`section-${id}`);
                }}
              >
                {sectionName(kind, locale)}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
