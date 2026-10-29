import { useEffect, useRef, useState } from "react";
import {
  importedFact,
  pendingImportedCandidates,
} from "@resumora/contracts/editor/import";
import { hasSpecificImportWarning } from "@resumora/contracts/intelligence/model";
import { type BaseDraft, type FactValue } from "../base/model";
import { dateError } from "../base/dates";
import { patchFact } from "../base/editing";
import type { IntelligenceClient } from "../base/intelligence";
import { OriginalSource } from "./OriginalSource";
import { Button, useCopy } from "./ui";
export function importSection(path: string): string {
  if (/^(name|titles\.|contacts\.)/.test(path)) return "identity";
  if (/^(roles|education|optional|custom|certifications)\./.test(path))
    return path.split(".").slice(0, 2).join(".");
  return path.split(".")[0];
}
const labels: Record<string, [string, string]> = {
  identity: ["Nume și contact", "Name and contact"],
  summary: ["Rezumat", "Summary"],
  roles: ["Experiență", "Experience"],
  education: ["Educație", "Education"],
  professionalSkills: ["Competențe profesionale", "Professional skills"],
  technicalSkills: ["Competențe tehnice", "Technical skills"],
  certifications: ["Certificări", "Certifications"],
  custom: ["Alte categorii", "Other categories"],
  languages: ["Limbi", "Languages"],
  optional: ["Alte categorii", "Other categories"],
  name: ["Nume", "Name"],
  titles: ["Titlu profesional", "Professional title"],
  email: ["Email", "Email"],
  phone: ["Telefon", "Phone"],
  location: ["Locație", "Location"],
  linkedin: ["LinkedIn", "LinkedIn"],
  title: ["Titlu", "Title"],
  company: ["Companie", "Company"],
  institution: ["Instituție", "Institution"],
  qualification: ["Calificare", "Qualification"],
  field: ["Domeniu", "Field"],
  start: ["Început", "Start"],
  end: ["Sfârșit", "End"],
  ongoing: ["În curs", "Ongoing"],
  context: ["Context", "Context"],
  bullets: ["Contribuție", "Contribution"],
  details: ["Detalii", "Details"],
  proficiency: ["Nivel", "Level"],
  label: ["Categorie", "Category"],
};
export function ImportReview({
  draft,
  confirm,
  disabled,
  change,
  client,
}: {
  draft: BaseDraft;
  confirm: (ids: string[]) => void;
  disabled: boolean;
  change?: (draft: BaseDraft) => void;
  client?: IntelligenceClient;
}) {
  const t = useCopy(),
    review = draft.importReview!;
  const reviewCandidates = pendingImportedCandidates(draft);
  const groups = [
    ...new Set(review.extraction.candidates.map((c) => importSection(c.path))),
  ];
  groups.sort((a, b) => {
    const order = (s: string) =>
      s === "identity"
        ? 0
        : s === "summary"
          ? 1
          : s.startsWith("roles.")
            ? 2
            : s.startsWith("education.")
              ? 3
              : 4;
    return order(a) - order(b);
  });
  const pendingGroups = groups.filter((g) =>
    reviewCandidates.some((c) => importSection(c.path) === g),
  );
  const section = pendingGroups[0];
  const candidates = reviewCandidates.filter(
    (c) => importSection(c.path) === section,
  );
  const [focused, setFocused] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setFocused(undefined);
    heading.current?.focus();
  }, [section]);
  if (!section) return null;
  const invalidDate = candidates.some((c) => {
    const value = importedFact(draft, c)?.value;
    return typeof value === "object" && dateError(value);
  });
  const current = candidates.find((c) => c.id === focused) ?? candidates[0];
  const label = labels[section.split(".")[0]] ?? labels.optional;
  const title = t(...label);
  return (
    <section
      className="import-review"
      aria-label={t("Verifică CV-ul de bază", "Review Base CV")}
    >
      <div className="card import-review-fields">
        <p className="eyebrow">
          {t("CV de bază", "Base CV")} ·{" "}
          {groups.length - pendingGroups.length + 1} / {groups.length}
        </p>
        <h2 tabIndex={-1} ref={heading}>
          {title}
        </h2>
        <p>
          {t(
            "Verifică această secțiune. Selectează un câmp pentru a vedea sursa în dreapta, apoi confirmă și continuă.",
            "Check this section. Select a field to see its source on the right, then confirm and continue.",
          )}
        </p>
        {!!review.extraction.warnings.length && (
          <details>
            <summary>{t("Observații despre import", "Import notes")}</summary>
            <p>{review.extraction.warnings.join(" · ")}</p>
          </details>
        )}
        {!!review.extraction.omittedPages.length && (
          <p role="alert">
            {t("Pagini neprocesate: ", "Unprocessed pages: ")}
            {review.extraction.omittedPages.join(", ")}
          </p>
        )}
        {candidates.map((c) => {
          const field = importedFact(draft, c);
          const key = c.path
            .split(".")
            .filter((p) => !/^\d+$/.test(p))
            .at(-1)!;
          const label = labels[key] ??
            labels[c.path.split(".")[0]] ?? [key, key];
          const value = field?.value ?? c.value;
          const display =
            typeof value === "object"
              ? (value.month ? value.month.padStart(2, "0") + "/" : "") +
                value.year
              : String(value);
          const specificWarning = hasSpecificImportWarning(c);
          function update(text: string) {
            if (!field || !change) return;
            let next: FactValue = text;
            if (typeof value === "boolean") next = text === "true";
            else if (typeof value === "object") {
              const parts = text.split("/");
              next =
                parts.length === 2
                  ? {
                      month: /^\d{1,2}$/.test(parts[0])
                        ? String(Number(parts[0]))
                        : parts[0],
                      year: parts[1],
                    }
                  : { month: "", year: text };
            }
            change(patchFact(draft, field, next));
          }
          return (
            <div
              key={c.id}
              className={`review-source-field ${current?.id === c.id ? "is-active" : ""}`}
              onFocus={() => setFocused(c.id)}
            >
              <label htmlFor={`review-${c.id}`}>
                {t(...label)}
                <small> · {t("De verificat", "Please check")}</small>
              </label>
              {typeof value === "boolean" ? (
                <select
                  id={`review-${c.id}`}
                  value={String(value)}
                  disabled={disabled || !change}
                  onChange={(e) => update(e.target.value)}
                >
                  <option value="true">{t("Da", "Yes")}</option>
                  <option value="false">{t("Nu", "No")}</option>
                </select>
              ) : (
                <textarea
                  id={`review-${c.id}`}
                  rows={display.length > 100 ? 4 : 1}
                  value={display}
                  disabled={disabled || !change}
                  onChange={(e) => update(e.target.value)}
                />
              )}
              {typeof value === "object" && (
                <small>{t("AAAA sau LL/AAAA", "YYYY or MM/YYYY")}</small>
              )}
              {specificWarning && <small>{c.warning}</small>}
              <Button onClick={() => setFocused(c.id)}>
                {t("Vezi sursa", "View source")}
              </Button>
            </div>
          );
        })}
        {invalidDate && (
          <p role="alert">
            {t(
              "Corectează data: AAAA sau LL/AAAA (1900–2100).",
              "Correct the date: YYYY or MM/YYYY (1900–2100).",
            )}
          </p>
        )}
        <p className="small muted">
          {t(
            "Confirmarea aprobă datele vizibile. Citatul original și istoricul editărilor rămân păstrate.",
            "Confirmation approves the visible data. The original quote and edit history are retained.",
          )}
        </p>
        <Button
          variant="primary"
          disabled={disabled || invalidDate}
          onClick={() => confirm(candidates.map((c) => c.id))}
        >
          {pendingGroups.length === 1
            ? t("Confirmă și deschide editorul", "Confirm and open editor")
            : t("Confirmă și continuă", "Confirm and continue")}
        </Button>
      </div>
      <OriginalSource review={review} candidate={current} client={client} />
    </section>
  );
}
