import "./import-review-navigation.css";
import { ImportSkills } from "./ImportSkills";
import { ProfileDocument } from "./ProfileDocument";
import { isSkillCandidate } from "@resumora/contracts/editor/import";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  importedFact,
  confirmImported,
  editImportedNamePart,
  pendingImportedCandidates,
  pendingImportSkills,
} from "@resumora/contracts/editor/import";
import {
  hasSpecificImportWarning,
  type Candidate,
} from "@resumora/contracts/intelligence/model";
import { type BaseDraft, type FactValue } from "../base/model";
import {
  dateError,
  reversedDates,
  formatDate,
  currentMonth,
  durationBounds,
  formatExperienceDuration,
} from "../base/dates";
import { patchFact } from "../base/editing";
import type { IntelligenceClient } from "../base/intelligence";
import {
  ImportComparison,
  ImportSourceAction,
  type ImportView,
} from "./ImportComparison";
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
  first: ["Prenume", "First name"],
  last: ["Nume de familie", "Last name"],
  titles: ["Titlu profesional", "Professional title"],
  email: ["Email", "Email"],
  phone: ["Telefon", "Phone"],
  location: ["Locație", "Location"],
  linkedin: ["LinkedIn", "LinkedIn"],
  website: ["Website personal", "Personal website"],
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
  forceOverview = false,
  onCancel,
  draftStatus,
  primaryLabel,
  cancelLabel,
}: {
  draft: BaseDraft;
  confirm: (ids: string[]) => void;
  disabled: boolean;
  change?: (draft: BaseDraft) => void;
  client?: IntelligenceClient;
  forceOverview?: boolean;
  onCancel?: () => void;
  draftStatus?: ReactNode;
  primaryLabel?: string;
  cancelLabel?: string;
}) {
  const t = useCopy(),
    review = draft.importReview!;
  const candidates = review.extraction.candidates.filter((c) =>
    importedFact(draft, c),
  );
  const pending = pendingImportedCandidates(draft);
  const unresolvedSkills = pendingImportSkills(draft);
  const groups = [
    ...new Set(
      candidates
        .filter((c) => !forceOverview || !isSkillCandidate(c))
        .map((c) => importSection(c.path)),
    ),
  ];
  const groupOrder = (key: string) =>
    key === "identity"
      ? 0
      : key === "summary"
        ? 1
        : key.startsWith("roles.")
          ? 2
          : key === "professionalSkills"
            ? 3
            : key === "technicalSkills"
              ? 4
              : key.startsWith("education.")
                ? 5
                : 6;
  groups.sort((a, b) => groupOrder(a) - groupOrder(b));
  const [editing, setEditing] = useState<string>(),
    [focused, setFocused] = useState<string>(),
    [view, setView] = useState<ImportView>("information"),
    [showAllIssues, setShowAllIssues] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    [asOf] = useState(currentMonth);
  useEffect(() => {
    heading.current?.focus();
  }, [review.id]);
  if (!forceOverview && !pending.length) return null;
  const fieldLabel = (c: Candidate) => {
    if (forceOverview && isSkillCandidate(c))
      return String(importedFact(draft, c)?.value ?? c.value);
    const key = c.path
      .split(".")
      .filter((p) => !/^\d+$/.test(p))
      .at(-1)!;
    return t(...(labels[key] ?? labels[c.path.split(".")[0]] ?? [key, key]));
  };
  const value = (c: Candidate): FactValue =>
    c.path === "nameParts.first"
      ? (draft.nameParts?.first ?? "")
      : c.path === "nameParts.last"
        ? (draft.nameParts?.last ?? "")
        : importedFact(draft, c)!.value;
  const reviewDate = (date: { year: string; month: string }) =>
    t(formatDate(date, "ro"), formatDate(date, "en"));
  const display = (c: Candidate) => {
    const v = value(c);
    return typeof v === "object"
      ? reviewDate(v)
      : typeof v === "boolean"
        ? v
          ? t("În curs", "Ongoing")
          : t("Încheiat", "Completed")
        : String(v);
  };
  function issue(c: Candidate) {
    const v = value(c);
    if (typeof v === "object" && dateError(v))
      return t(
        `${fieldLabel(c)}: corectează data.`,
        `${fieldLabel(c)}: correct this date.`,
      );
    if (typeof v === "object" && candidateHasInvalidDates(c))
      return t(
        "Sfârșitul perioadei este înaintea începutului. Corectează datele.",
        "The end date is before the start. Correct these dates.",
      );
    if (
      review.confirmedIds.includes(c.id) ||
      importedFact(draft, c)?.status === "user_authored"
    )
      return "";
    if (hasSpecificImportWarning(c)) return c.warning!;
    if (c.path === "contacts.website")
      return t(
        "Acesta este website-ul tău personal?",
        "Is this your personal website?",
      );
    if (pending.some((p) => p.id === c.id))
      return t(
        `${fieldLabel(c)}: compară informația cu originalul.`,
        `${fieldLabel(c)}: compare this information with the original.`,
      );
    return "";
  }
  const issueGroups = new Map<
    string,
    { candidate: Candidate; candidates: Candidate[]; message: string }
  >();
  for (const c of candidates) {
    const message = issue(c);
    if (!message) continue;
    const v = value(c),
      group = importSection(c.path);
    const partialDate =
      typeof v === "object" &&
      v.year &&
      !v.month &&
      !dateError(v) &&
      !candidateHasInvalidDates(c) &&
      !hasSpecificImportWarning(c);
    const key = partialDate ? group + ":date-precision" : c.id;
    if (!issueGroups.has(key))
      issueGroups.set(key, {
        candidate: c,
        candidates: [c],
        message: partialDate
          ? t(
              `${title(group)}: lunile nu sunt precizate. Poți păstra doar anii.`,
              `${title(group)}: months are not specified. You can keep the years only.`,
            )
          : group.startsWith("roles.")
            ? `${title(group)} · ${message}`
            : message,
      });
    else issueGroups.get(key)!.candidates.push(c);
  }
  const issues = [...issueGroups.values()];
  const invalidDate = candidates.some(
    (c) =>
      typeof value(c) === "object" &&
      dateError(value(c) as { year: string; month: string }),
  );
  const reversed =
    draft.roles.some(
      (r) => !r.ongoing.value && reversedDates(r.start.value, r.end.value),
    ) ||
    draft.education.some((e) => reversedDates(e.start.value, e.end.value)) ||
    draft.optionalSections.some((s) =>
      s.entries.some(
        (e) => !e.ongoing?.value && reversedDates(e.start.value, e.end.value),
      ),
    );
  const current =
    candidates.find((c) => c.id === focused) ??
    issues[0]?.candidate ??
    candidates[0];
  function focusDocumentCandidate(c: Candidate) {
    setFocused(c.id);
    setView("information");
    requestAnimationFrame(() => {
      const fieldId = importedFact(draft, c)?.fieldId;
      const field = Array.from(
        documentRef.current?.querySelectorAll<HTMLElement>(
          "[data-profile-fact]",
        ) ?? [],
      ).find((element) => element.dataset.profileFact === fieldId);
      if (!field) return;
      let parent = field.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      field.querySelectorAll("details").forEach((details) => {
        details.open = true;
      });
      field.scrollIntoView?.({
        block: "center",
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "instant"
          : "smooth",
      });
      (
        field.querySelector<HTMLElement>(
          ".profile-edit-trigger, input, button",
        ) ?? field
      ).focus({ preventScroll: true });
    });
  }
  function candidateHasInvalidDates(c: Candidate) {
    const v = value(c);
    if (typeof v === "object" && dateError(v)) return true;
    const fieldId = importedFact(draft, c)?.fieldId;
    const entry = [
      ...draft.roles,
      ...draft.education,
      ...draft.optionalSections.flatMap((s) => s.entries),
    ].find(
      (entry) =>
        entry.start.fieldId === fieldId ||
        entry.end.fieldId === fieldId ||
        entry.ongoing?.fieldId === fieldId,
    );
    return (
      !!entry &&
      !entry.ongoing?.value &&
      reversedDates(entry.start.value, entry.end.value)
    );
  }
  function focusCandidate(c: Candidate, edit = false) {
    setFocused(c.id);
    setView("information");
    if (edit) setEditing(importSection(c.path));
    requestAnimationFrame(() => {
      const card = document.getElementById(
        `import-group-${review.id}-${importSection(c.path)}`,
      );
      card?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (edit) document.getElementById(`review-${c.id}`)?.focus();
      else card?.focus();
    });
  }
  function update(c: Candidate, text: string) {
    if (!change) return;
    if (c.path === "nameParts.first" || c.path === "nameParts.last") {
      change(
        editImportedNamePart(
          draft,
          c.path.endsWith("first") ? "first" : "last",
          text,
        ),
      );
      return;
    }
    const previous = value(c);
    let next: FactValue = text;
    if (typeof previous === "boolean") next = text === "true";
    else if (typeof previous === "object") {
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
    change(patchFact(draft, importedFact(draft, c)!, next));
  }
  function title(group: string) {
    const index = Number(group.split(".")[1]);
    if (group.startsWith("roles."))
      return (
        draft.roles[index]?.title.value || t("Rol fără titlu", "Untitled role")
      );
    if (group.startsWith("education."))
      return (
        draft.education[index]?.qualification.value ||
        t("Educație", "Education")
      );
    return t(...(labels[group.split(".")[0]] ?? labels.optional));
  }
  if (change && forceOverview) {
    const fieldWarnings: Record<string, string> = {};
    const fieldConfirmations: Record<
      string,
      { label?: string; disabled: boolean; confirm: () => void }
    > = {};
    for (const group of issues) {
      for (const candidate of group.candidates) {
        const fact = importedFact(draft, candidate);
        if (!fact) continue;
        fieldWarnings[fact.fieldId] = group.message;
        // Split names share one rendered fact: confirming that value attests both parts.
        const selected = candidates.filter(
          (c) =>
            group.candidates.includes(c) ||
            importedFact(draft, c)?.fieldId === fact.fieldId,
        );
        const blocked = selected.some(candidateHasInvalidDates);
        fieldConfirmations[fact.fieldId] = {
          disabled: blocked,
          label:
            group.candidates.length > 1
              ? t("Confirmă anii", "Confirm years")
              : undefined,
          confirm: () => {
            if (disabled || blocked) return;
            change(
              confirmImported(
                draft,
                selected.map((c) => c.id),
                { allowPendingSkills: true },
              ),
            );
            const nextIssue = issues.find(
              (issue) => !selected.includes(issue.candidate),
            );
            if (nextIssue) focusDocumentCandidate(nextIssue.candidate);
            else requestAnimationFrame(() => heading.current?.focus());
          },
        };
      }
    }
    return (
      <section
        className="document-import-review"
        aria-label={t("Verifică CV-ul de bază", "Review Base CV")}
      >
        <header className="document-review-ribbon">
          <div>
            <h2 ref={heading} tabIndex={-1}>
              {t("Verifică informațiile din CV", "Check your imported CV")}
            </h2>
            {issues.length ? (
              <Button
                variant="ghost"
                className="document-review-count"
                onClick={() => focusDocumentCandidate(issues[0].candidate)}
              >
                {t(
                  `${issues.length} ${issues.length === 1 ? "detaliu" : "detalii"} de verificat`,
                  `${issues.length} ${issues.length === 1 ? "detail" : "details"} to check`,
                )}
                <span aria-hidden="true"> →</span>
              </Button>
            ) : (
              <p role="status">
                {t(
                  "CV-ul tău este gata de verificare.",
                  "Your CV is ready to review.",
                )}
              </p>
            )}
            {draftStatus}
          </div>
          <div className="document-review-actions">
            <Button variant="ghost" onClick={() => setView("source")}>
              {t("Vezi CV-ul original", "View original CV")}
            </Button>
            <Button
              variant="primary"
              disabled={
                disabled ||
                invalidDate ||
                reversed ||
                !candidates.length ||
                !!unresolvedSkills.length
              }
              aria-describedby={`review-note-${review.id}`}
              onClick={() => confirm(candidates.map((c) => c.id))}
            >
              {primaryLabel ?? t("Finalizează verificarea", "Finish review")}
            </Button>
          </div>
        </header>
        {!!issues.length && (
          <nav
            className="document-review-navigation"
            aria-label={t("Informații de verificat", "Information to check")}
          >
            <ul>
              {issues.map(({ candidate, message }) => (
                <li key={candidate.id}>
                  <Button
                    variant="ghost"
                    aria-label={`${t("Verifică", "Review")}: ${fieldLabel(candidate)}${issues.filter((item) => fieldLabel(item.candidate) === fieldLabel(candidate)).length > 1 ? ` · ${title(importSection(candidate.path))}` : ""}`}
                    onClick={() => focusDocumentCandidate(candidate)}
                  >
                    {message}
                    <span aria-hidden="true"> →</span>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {!!unresolvedSkills.length && (
          <div role="status" className="notice">
            <p>
              {t(
                "Alege categoria competențelor marcate sau elimină-le explicit pentru a finaliza verificarea.",
                "Choose categories for the highlighted skills or explicitly remove them to finish review.",
              )}
            </p>
            <Button
              variant="ghost"
              aria-controls={`import-skills-${review.id}`}
              onClick={() => {
                const panel = document.getElementById(
                  `import-skills-${review.id}`,
                );
                if (panel instanceof HTMLDetailsElement) panel.open = true;
                panel?.scrollIntoView({ block: "start" });
              }}
            >
              {t("Verifică aceste competențe", "Review these skills")}
            </Button>
          </div>
        )}
        {(invalidDate || reversed) && (
          <p className="notice notice-error" role="alert">
            {t(
              "Corectează datele marcate înainte de confirmare. Ciorna este păstrată.",
              "Correct the marked dates before confirming. Your draft is retained.",
            )}
          </p>
        )}
        <p className="sr-only" id={`review-note-${review.id}`}>
          {t(
            "Corectează orice informație direct în CV. Confirmarea aprobă informațiile afișate; profilul se actualizează doar atunci.",
            "Correct any information directly in the CV. Confirmation approves the information shown; your profile updates only then.",
          )}
        </p>
        <ImportComparison
          originalAction={false}
          review={review}
          client={client}
          candidate={current}
          view={view}
          onViewChange={setView}
        >
          <div ref={documentRef}>
            <ProfileDocument
              draft={draft}
              change={change}
              disabled={disabled}
              review
              warnings={fieldWarnings}
              confirmations={fieldConfirmations}
              activeFieldId={
                focused
                  ? importedFact(
                      draft,
                      candidates.find((c) => c.id === focused) ?? current,
                    )?.fieldId
                  : undefined
              }
              focus={(id) => {
                const c = candidates.find(
                  (c) => importedFact(draft, c)?.fieldId === id,
                );
                if (c) setFocused(c.id);
              }}
              source={(id) => {
                const c = candidates.find(
                  (c) => importedFact(draft, c)?.fieldId === id,
                );
                if (c) setFocused(c.id);
                setView("source");
              }}
            />
          </div>
        </ImportComparison>
        <details
          id={`import-skills-${review.id}`}
          className="document-import-details"
          open={unresolvedSkills.length > 0}
        >
          <summary>
            {t("Detalii import și competențe", "Import details and skills")}
          </summary>
          {!!review.extraction.omittedPages.length && (
            <p role="alert">
              {t("Pagini neprocesate: ", "Unprocessed pages: ")}
              {review.extraction.omittedPages.join(", ")}
            </p>
          )}
          {!!review.extraction.warnings.length && (
            <p>{review.extraction.warnings.join(" · ")}</p>
          )}
          <ImportSkills
            draft={draft}
            change={change}
            disabled={disabled}
          />
          {onCancel && (
            <Button variant="ghost" disabled={disabled} onClick={onCancel}>
              {cancelLabel ?? t("Înapoi la importuri", "Back to imports")}
            </Button>
          )}
        </details>
      </section>
    );
  }
  return (
    <section
      className="import-review import-overview"
      aria-label={t("Verifică CV-ul de bază", "Review Base CV")}
    >
      <header className="import-overview-heading">
        {onCancel && (
          <Button variant="ghost" disabled={disabled} onClick={onCancel}>
            {cancelLabel ?? t("Înapoi la importuri", "Back to imports")}
          </Button>
        )}
        <h2 ref={heading} tabIndex={-1}>
          {t("Verifică informațiile din CV", "Check your imported CV")}
        </h2>
        <p>
          {t(
            `Am extras datele tale și ${draft.roles.length} roluri. Verifică profilul de mai jos înainte de confirmare.`,
            `We extracted your details and ${draft.roles.length} roles. Check the profile below before confirming.`,
          )}
        </p>
      </header>
      {draftStatus}
      {!!issues.length && (
        <section
          className="import-attention"
          aria-label={t("Informații de verificat", "Information to check")}
        >
          <h3>
            {t(
              `${issues.length} ${issues.length === 1 ? "detaliu" : "detalii"} de verificat`,
              `${issues.length} ${issues.length === 1 ? "detail" : "details"} to check`,
            )}
          </h3>
          <ul>
            {(showAllIssues ? issues : issues.slice(0, 3)).map(
              ({ candidate: c, message }) => (
                <li key={c.id}>
                  <Button
                    variant="ghost"
                    onClick={() => focusCandidate(c, true)}
                  >
                    {message}
                    <span aria-hidden="true"> →</span>
                  </Button>
                </li>
              ),
            )}
          </ul>
          {issues.length > 3 && (
            <Button
              variant="ghost"
              aria-expanded={showAllIssues}
              onClick={() => setShowAllIssues((v) => !v)}
            >
              {showAllIssues
                ? t("Arată mai puțin", "Show less")
                : t("Vezi toate detaliile", "See all details")}
            </Button>
          )}
        </section>
      )}
      {!!review.extraction.omittedPages.length && (
        <p role="alert" className="notice">
          {t(
            "Nu am procesat toate paginile. Verifică originalul; pagini neprocesate: ",
            "Not every page was processed. Check the original; unprocessed pages: ",
          )}
          {review.extraction.omittedPages.join(", ")}
        </p>
      )}
      {!!review.extraction.warnings.length && (
        <details className="import-notes">
          <summary>{t("Observații despre import", "Import notes")}</summary>
          <p>{review.extraction.warnings.join(" · ")}</p>
        </details>
      )}
      {forceOverview && change && (
        <ImportSkills
          draft={draft}
          change={change}
          disabled={disabled}
        />
      )}
      <ImportComparison
        review={review}
        client={client}
        candidate={current}
        view={view}
        onViewChange={setView}
      >
        <div className="stack">
          {groups.map((group) => {
            const rows = candidates.filter(
                (c) => importSection(c.path) === group,
              ),
              isEditing = editing === group,
              index = Number(group.split(".")[1]),
              role = group.startsWith("roles.")
                ? draft.roles[index]
                : undefined;
            const source =
              rows.find((c) => c.id === focused) ??
              rows.find((c) => issue(c)) ??
              rows[0];
            return (
              <section
                id={`import-group-${review.id}-${group}`}
                tabIndex={-1}
                data-import-group={group}
                className={`card import-overview-card ${rows.some((c) => c.id === focused) ? "is-active" : ""}`}
                key={group}
                aria-label={title(group)}
              >
                <div className="section-heading">
                  <div>
                    <h3>{title(group)}</h3>
                    {role?.company.value && (
                      <p className="muted">{role.company.value}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    aria-expanded={isEditing}
                    disabled={disabled || !change}
                    onClick={() => {
                      setEditing(isEditing ? undefined : group);
                      if (!isEditing) focusCandidate(source, true);
                    }}
                  >
                    {isEditing
                      ? t("Închide editarea", "Close editing")
                      : t("Editează", "Edit")}
                  </Button>
                </div>
                {!isEditing && role && (
                  <p className="import-role-period">
                    {reviewDate(role.start.value)} —{" "}
                    {role.ongoing.value
                      ? t("Prezent", "Present")
                      : reviewDate(role.end.value)}
                  </p>
                )}
                {isEditing ? (
                  <div className="stack">
                    {rows.map((c) => {
                      const v = value(c),
                        date = typeof v === "object",
                        text = date
                          ? (v.month ? v.month.padStart(2, "0") + "/" : "") +
                            v.year
                          : String(v),
                        long =
                          typeof v === "string" &&
                          (v.length > 100 ||
                            /\.(context|details|bullets\.\d+)$/.test(c.path));
                      return (
                        <div
                          className={`review-source-field ${current?.id === c.id ? "is-active" : ""}`}
                          key={c.id}
                          onFocus={() => setFocused(c.id)}
                        >
                          <label htmlFor={`review-${c.id}`}>
                            {fieldLabel(c)}
                          </label>
                          {typeof v === "boolean" ? (
                            <select
                              className="native"
                              id={`review-${c.id}`}
                              value={String(v)}
                              disabled={disabled}
                              onChange={(e) => update(c, e.target.value)}
                            >
                              <option value="true">{t("Da", "Yes")}</option>
                              <option value="false">{t("Nu", "No")}</option>
                            </select>
                          ) : long ? (
                            <textarea
                              className="native"
                              id={`review-${c.id}`}
                              rows={4}
                              value={text}
                              disabled={disabled}
                              onChange={(e) => update(c, e.target.value)}
                            />
                          ) : (
                            <input
                              className="native"
                              id={`review-${c.id}`}
                              value={text}
                              disabled={disabled}
                              onChange={(e) => update(c, e.target.value)}
                            />
                          )}
                          {date && (
                            <small>
                              {t(
                                "AAAA sau LL/AAAA. Nu este necesar să inventezi o lună.",
                                "YYYY or MM/YYYY. You do not need to invent a month.",
                              )}
                            </small>
                          )}
                          {hasSpecificImportWarning(c) && (
                            <small>{c.warning}</small>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className={
                      group.endsWith("Skills")
                        ? "import-skill-list"
                        : "import-readable-fields"
                    }
                  >
                    {rows
                      .filter(
                        (c) =>
                          !role ||
                          ![
                            "title",
                            "company",
                            "start",
                            "ongoing",
                            ...(!role.ongoing.value ? ["end"] : []),
                          ].includes(c.path.split(".").at(-1)!),
                      )
                      .map((c) => (
                        <div className="import-readable-value" key={c.id}>
                          {!group.endsWith("Skills") && !role && (
                            <span className="small muted">{fieldLabel(c)}</span>
                          )}
                          <p className="preserve-lines">
                            {display(c) ||
                              t("Nu este precizat", "Not provided")}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
                {role && (
                  <p className="small muted">
                    {t(
                      formatExperienceDuration(
                        durationBounds([role], asOf),
                        "ro",
                      ),
                      formatExperienceDuration(
                        durationBounds([role], asOf),
                        "en",
                      ),
                    )}
                  </p>
                )}
                <div className="actions">
                  <ImportSourceAction onSelect={() => setFocused(source.id)} />
                  {rows.some((c) => issue(c)) && (
                    <span className="import-check-chip">
                      {t("De verificat", "Needs a check")}
                    </span>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </ImportComparison>
      {(invalidDate || reversed) && (
        <p role="alert" className="notice notice-error">
          {invalidDate
            ? t(
                "Corectează datele: AAAA sau LL/AAAA (1900–2100).",
                "Correct the dates: YYYY or MM/YYYY (1900–2100).",
              )
            : t(
                "Sfârșitul unei perioade este înaintea începutului. Corectează perioada înainte de confirmare.",
                "A period ends before it starts. Correct the dates before confirming.",
              )}
        </p>
      )}
      <footer className="import-review-actions">
        <p className="small muted">
          {forceOverview
            ? t(
                "Nimic nu este adăugat profilului până când confirmi.",
                "Nothing is added to your profile until you confirm.",
              )
            : t(
                "Confirmarea aprobă informațiile afișate.",
                "Confirmation approves the information shown.",
              )}
        </p>
        <Button
          variant="primary"
          disabled={
            disabled ||
            invalidDate ||
            reversed ||
            !candidates.length ||
            !!unresolvedSkills.length
          }
          onClick={() => confirm(candidates.map((c) => c.id))}
        >
          {primaryLabel ??
            t(
              "Confirmă și folosește informațiile",
              "Confirm and use this information",
            )}
        </Button>
      </footer>
    </section>
  );
}
