import {
  allFacts,
  isAccepted,
  blankDraft,
  clone,
  localId,
  fact,
  newEducation,
  newOptionalEntry,
  newRole,
  type BaseDraft,
  type Fact,
  type FactValue,
} from "./model.ts";
import {
  isImportReview,
  hasSpecificImportWarning,
  type Candidate,
  type ImportReview,
} from "../intelligence/model.ts";

export const requiresImportReview = (candidate: Candidate): boolean =>
  candidate.confidence !== "high" || hasSpecificImportWarning(candidate);

export const importedFact = (draft: BaseDraft, candidate: Candidate) =>
  allFacts(draft, true).find(
    (f) =>
      f.sourceClaimId === candidate.id ||
      f.sourceLineage?.some((s) => s.sourceClaimId === candidate.id),
  );
export const pendingImportedCandidates = (draft: BaseDraft): Candidate[] =>
  draft.importReview?.extraction.candidates.filter((c) => {
    if (draft.importReview!.confirmedIds.includes(c.id)) return false;
    const field = importedFact(draft, c);
    return !field || field.acceptance !== "automatic" || !isAccepted(field);
  }) ?? [];

/** Maps validated extraction into a NEW unconfirmed draft; never mutates an existing Base. */
export function importedDraft(review: ImportReview): BaseDraft {
  if (!isImportReview(review) || review.admission.kind !== "cv")
    throw new Error("INVALID_IMPORT_REVIEW");
  const draft = blankDraft();
  draft.importReview = clone(review);
  draft.importReview.confirmedIds = [];
  // Arbitrary imported name order is never automatically split into first/last name.
  delete draft.nameParts;
  for (const c of review.extraction.candidates) {
    const sourceId = localId();
    draft.sources.push({
      id: sourceId,
      kind: "document",
      label: c.page
        ? `${review.format.toUpperCase()} · page ${c.page}`
        : `${review.format.toUpperCase()} · text excerpt`,
      locator: c.page
        ? `import:${review.id}:page:${c.page}`
        : `import:${review.id}:excerpt:${c.id}`,
      text: c.quote,
    });
    const field = (value: FactValue): Fact => ({
      id: localId(),
      fieldId: localId(),
      value,
      status: "extracted_unconfirmed",
      ...(!requiresImportReview(c) ? { acceptance: "automatic" as const } : {}),
      sourceId,
      sourceClaimId: c.id,
    });
    const parts = c.path.split(".");
    const index = Number(parts[1]);
    const date = () => {
      const p = c.value.split("/");
      return p.length === 1
        ? { year: p[0], month: "" }
        : { year: p[1], month: String(Number(p[0])) };
    };
    if (
      c.path === "summary" ||
      parts[0] === "certifications" ||
      parts[0] === "custom"
    ) {
      const group =
        c.path === "summary"
          ? "import-summary"
          : parts[0] === "custom"
            ? `import-custom-${index}`
            : "import-certifications";
      let section = draft.optionalSections.find((s) => s.id === group);
      if (!section) {
        section = {
          id: group,
          kind: parts[0] === "certifications" ? "certifications" : "custom",
          label:
            c.path === "summary"
              ? "Summary"
              : parts[0] === "certifications"
                ? "Certifications"
                : "",
          entries: [],
          ...(parts[0] === "custom" ? { heading: fact("") } : {}),
        };
        draft.optionalSections.push(section);
        if (c.path === "summary")
          draft.presentation.order = draft.presentation.order.map((id) =>
            id === "summary" ? group : id,
          );
        else draft.presentation.order.push(group);
      }
      const entryIndex = parts[0] === "certifications" ? index : 0;
      while (section.entries.length <= entryIndex) {
        const entry = newOptionalEntry();
        if (parts[0] === "custom") entry.id = section.id;
        section.entries.push(entry);
      }
      const entry = section.entries[entryIndex];
      if (c.path === "summary") {
        entry.details = field(c.value) as Fact<string>;
      } else if (parts[2] === "title") {
        if (parts[0] === "custom")
          section.heading = field(c.value) as Fact<string>;
        else entry.title = field(c.value) as Fact<string>;
      } else if (parts[2] === "details")
        entry.details = field(c.value) as Fact<string>;
      else if (parts[2] === "start")
        entry.start = field(date()) as Fact<ReturnType<typeof date>>;
      else if (parts[2] === "end")
        entry.end = field(date()) as Fact<ReturnType<typeof date>>;
    } else if (c.path === "name") draft.name = field(c.value) as Fact<string>;
    else if (parts[0] === "titles")
      draft.titles[index] = field(c.value) as Fact<string>;
    else if (parts[0] === "contacts") {
      const target = draft.contacts.find((x) =>
        parts[1] === "linkedin"
          ? x.platform === "linkedin"
          : x.kind === parts[1],
      );
      if (target) target.value = field(c.value) as Fact<string>;
    } else if (
      parts[0] === "professionalSkills" ||
      parts[0] === "technicalSkills"
    )
      draft[parts[0]][index] = field(c.value) as Fact<string>;
    else if (parts[0] === "roles" || parts[0] === "education") {
      const entries = parts[0] === "roles" ? draft.roles : draft.education;
      while (entries.length <= index) {
        if (parts[0] === "roles") {
          const role = newRole();
          role.ongoing.status = "draft";
          draft.roles.push(role);
        } else draft.education.push(newEducation());
      }
      const item = entries[index] as unknown as Record<string, unknown>;
      if (parts[2] === "bullets")
        (item.bullets as Fact<string>[])[Number(parts[3])] = field(
          c.value,
        ) as Fact<string>;
      else
        item[parts[2]] = field(
          ["start", "end"].includes(parts[2])
            ? date()
            : parts[2] === "ongoing"
              ? c.value === "true"
              : c.value,
        );
    } else if (parts[0] === "languages") {
      const entries = draft.optionalSections[0].entries;
      while (entries.length <= index) entries.push(newOptionalEntry());
      if (parts[2] === "title")
        entries[index].title = field(c.value) as Fact<string>;
      else entries[index].proficiency = field(c.value) as Fact<string>;
    }
  }
  draft.professionalSkills = draft.professionalSkills.filter(Boolean);
  draft.technicalSkills = draft.technicalSkills.filter(Boolean);
  for (const role of draft.roles) role.bullets = role.bullets.filter(Boolean);
  return draft;
}
/** Explicit review selects facts; snapshot persistence remains a separate backend responsibility. */
export function confirmImported(
  draft: BaseDraft,
  selectedIds: string[],
): BaseDraft {
  const review = draft.importReview;
  if (
    !review ||
    !selectedIds.length ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some(
      (id) => !review.extraction.candidates.some((c) => c.id === id),
    )
  )
    throw new Error("INVALID_REVIEW_SELECTION");
  const next = clone(draft),
    at = new Date().toISOString();
  for (const f of allFacts(next, true))
    if (
      f.sourceClaimId &&
      selectedIds.includes(f.sourceClaimId) &&
      f.status === "extracted_unconfirmed"
    ) {
      f.status = "user_confirmed";
      f.confirmedAt = at;
    }
  next.importReview!.confirmedIds = [
    ...new Set([...review.confirmedIds, ...selectedIds]),
  ];
  return next;
}
