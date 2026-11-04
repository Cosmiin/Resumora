import { canonicalContentLocale, contentLanguagePolicyVersion, type ContentLocale } from "./content-language.ts";
import {
  allFacts,
  isAccepted,
  editFact,
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

export const importedFact = (draft: BaseDraft, candidate: Candidate) => {
  // Candidate IDs are only unique within one extraction. An updated CV may
  // reuse them; match the source as well so old facts cannot be reconfirmed.
  const sources = new Set(
    draft.sources
      .filter((s) => s.locator?.startsWith(`import:${draft.importReview?.id}:`))
      .map((s) => s.id),
  );
  return allFacts(draft, true).find(
    (f) =>
      (f.sourceClaimId === candidate.id && sources.has(f.sourceId)) ||
      f.sourceLineage?.some(
        (s) => s.sourceClaimId === candidate.id && sources.has(s.sourceId),
      ),
  );
};
export const pendingImportedCandidates = (draft: BaseDraft): Candidate[] =>
  draft.importReview?.extraction.candidates.filter((c) => {
    const field = importedFact(draft, c);
    return (
      !!field &&
      !draft.importReview!.confirmedIds.includes(c.id) &&
      (field.acceptance !== "automatic" || !isAccepted(field))
    );
  }) ?? [];

/** Maps validated extraction into a NEW draft; never mutates an existing Base. */
export function importedDraft(review: ImportReview, fallbackLocale: ContentLocale = "ro"): BaseDraft {
  if (!isImportReview(review) || review.admission.kind !== "cv")
    throw new Error("INVALID_IMPORT_REVIEW");
  const fallback = canonicalContentLocale(fallbackLocale);
  if (!fallback) throw new Error("CONTENT_LOCALE_INVALID");
  const draft = blankDraft();
  draft.language = fallback;
  if (review.extraction.detectedLanguage) {
    draft.language = review.extraction.detectedLanguage;
    draft.documentLocale = draft.language === "ro" ? "ro-RO" : draft.language === "en" ? "en-GB" : draft.language;
    if (review.extraction.languageConfidence) draft.contentLanguage = {
      locale: draft.language,
      confidence: review.extraction.languageConfidence,
      source: "import",
      policyVersion: contentLanguagePolicyVersion,
      ...(review.extraction.documentLabels ? { labels: clone(review.extraction.documentLabels) } : {}),
    };
  }
  draft.importReview = clone(review);
  draft.importReview.confirmedIds = [];
  // Arbitrary imported name order is never automatically split into first/last name.
  delete draft.nameParts;
  const nameFields = new Map<string, Fact<string>>();
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
    if (c.path === "summary") {
      const { value, ...provenance } = field(c.value) as Fact<string>;
      draft.summary = {
        ...draft.summary,
        id: provenance.fieldId,
        text: value,
        origin: "extracted",
        approval: requiresImportReview(c) ? "pending" : "approved",
        claimIds: [],
        provenance,
      };
    } else if (parts[0] === "certifications" || parts[0] === "custom") {
      const group =
        parts[0] === "custom"
          ? `import-custom-${index}`
          : "import-certifications";
      let section = draft.optionalSections.find((s) => s.id === group);
      if (!section) {
        section = {
          id: group,
          kind: parts[0] === "certifications" ? "certifications" : "custom",
          label: parts[0] === "certifications" ? "Certifications" : "",
          entries: [],
          ...(parts[0] === "custom" ? { heading: fact("") } : {}),
        };
        draft.optionalSections.push(section);
        draft.presentation.order.push(group);
      }
      const entryIndex = parts[0] === "certifications" ? index : 0;
      while (section.entries.length <= entryIndex) {
        const entry = newOptionalEntry();
        if (parts[0] === "custom") entry.id = section.id;
        section.entries.push(entry);
      }
      const entry = section.entries[entryIndex];
      if (parts[2] === "title") {
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
    else if (c.path === "nameParts.first" || c.path === "nameParts.last")
      nameFields.set(c.path, field(c.value) as Fact<string>);
    else if (parts[0] === "titles")
      draft.titles[index] = field(c.value) as Fact<string>;
    else if (parts[0] === "contacts") {
      const platform =
        parts[1] === "linkedin" || parts[1] === "website" ? parts[1] : null;
      const target = draft.contacts.find((x) =>
        platform
          ? x.kind === "social" && x.platform === platform
          : x.kind === parts[1],
      );
      if (target) target.value = field(c.value) as Fact<string>;
      else if (platform)
        draft.contacts.push({
          id: localId(),
          kind: "social",
          platform,
          visible: true,
          value: field(c.value) as Fact<string>,
        });
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
  const first = nameFields.get("nameParts.first"),
    last = nameFields.get("nameParts.last");
  if (first || last) {
    draft.nameParts = { first: first?.value ?? "", last: last?.value ?? "" };
    const parts = [first, last].filter((f): f is Fact<string> => !!f);
    // A complete explicit pair owns the display name. Keep an unsplit source
    // name when only one part is known; never infer the missing part.
    const fields =
      first && last
        ? parts
        : [...(draft.name.value ? [draft.name] : []), ...parts];
    const owner = fields[0];
    draft.name = {
      ...owner,
      value:
        first && last
          ? `${first.value} ${last.value}`
          : draft.name.value || owner.value,
      sourceLineage: fields
        .slice(1)
        .map((f) => ({ sourceId: f.sourceId, sourceClaimId: f.sourceClaimId })),
    };
    if (fields.some((f) => f.acceptance !== "automatic"))
      delete draft.name.acceptance;
  }
  draft.professionalSkills = draft.professionalSkills.filter(Boolean);
  draft.technicalSkills = draft.technicalSkills.filter(Boolean);
  for (const role of draft.roles) role.bullets = role.bullets.filter(Boolean);
  return draft;
}
/** User edits one identified name part without clearing its counterpart or source history. */
export function editImportedNamePart(
  draft: BaseDraft,
  part: "first" | "last",
  value: string,
): BaseDraft {
  const next = clone(draft);
  next.nameParts = {
    first: draft.nameParts?.first ?? "",
    last: draft.nameParts?.last ?? "",
    [part]: value,
  };
  next.name = editFact(
    next.name,
    `${next.nameParts.first} ${next.nameParts.last}`.trim(),
  );
  return next;
}
/** Explicit review selects facts; snapshot persistence remains a separate backend responsibility. */
export function confirmImported(
  draft: BaseDraft,
  selectedIds: string[],
  options: { allowPendingSkills?: boolean } = {},
): BaseDraft {
  const review = draft.importReview;
  if (!options.allowPendingSkills && pendingImportSkills(draft).length)
    throw new Error("UNCLASSIFIED_IMPORT_SKILLS");
  if (
    !review ||
    !selectedIds.length ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some((id) => {
      const candidate = review.extraction.candidates.find((c) => c.id === id);
      return (
        !candidate ||
        (!review.confirmedIds.includes(id) && !importedFact(draft, candidate))
      );
    })
  )
    throw new Error("INVALID_REVIEW_SELECTION");
  const next = clone(draft),
    at = new Date().toISOString();
  const selectedFields = new Set(
    selectedIds.map(
      (id) =>
        importedFact(
          next,
          review.extraction.candidates.find((c) => c.id === id)!,
        )?.fieldId,
    ),
  );
  for (const f of allFacts(next, true))
    if (
      selectedFields.has(f.fieldId) &&
      f.sourceClaimId &&
      (selectedIds.includes(f.sourceClaimId) ||
        (f === next.name &&
          f.sourceLineage?.some(
            (ref) =>
              ref.sourceClaimId && selectedIds.includes(ref.sourceClaimId),
          ))) &&
      f.status === "extracted_unconfirmed"
    ) {
      const identityIds =
        f === next.name
          ? [
              f.sourceClaimId,
              ...(f.sourceLineage ?? []).map((ref) => ref.sourceClaimId),
            ].filter((id): id is string => !!id)
          : [f.sourceClaimId];
      // Confirming one part must not attest the other, still-unreviewed part.
      if (
        !identityIds.every(
          (id) => selectedIds.includes(id) || review.confirmedIds.includes(id),
        )
      )
        continue;
      f.status = "user_confirmed";
      f.confirmedAt = at;
    }
  if (
    next.summary.provenance &&
    [
      next.summary.provenance.sourceClaimId,
      ...(next.summary.provenance.sourceLineage ?? []).map(
        (s) => s.sourceClaimId,
      ),
    ].some((id) => id && selectedIds.includes(id))
  )
    next.summary.approval = "approved";
  next.importReview!.confirmedIds = [
    ...new Set([...review.confirmedIds, ...selectedIds]),
  ];
  return next;
}

export type ImportSkillChoice =
  "professionalSkills" | "technicalSkills" | "omit";
export const isSkillCandidate = (c: Candidate) =>
  /^(professionalSkills|technicalSkills|unclearSkills)\.\d+$/.test(c.path);
/** Unknown categories stay visible; only an explicit choice may remove a skill. */
export function pendingImportSkills(draft: BaseDraft): Candidate[] {
  return (
    draft.importReview?.extraction.candidates.filter(
      (c) => isSkillCandidate(c) && importSkillChoice(draft, c) === "review",
    ) ?? []
  );
}
export function importSkillChoice(
  draft: BaseDraft,
  candidate: Candidate,
): ImportSkillChoice | "review" {
  return (
    (draft.importSkillChoices &&
    Object.hasOwn(draft.importSkillChoices, candidate.id)
      ? draft.importSkillChoices[candidate.id]
      : undefined) ??
    (candidate.path.startsWith("professionalSkills.")
      ? "professionalSkills"
      : candidate.path.startsWith("technicalSkills.")
        ? "technicalSkills"
        : "review")
  );
}
/** Move the original fact, never rewrite the extraction or attest a proposed category. */
export function chooseImportSkill(
  draft: BaseDraft,
  candidateId: string,
  choice: ImportSkillChoice | "review",
): BaseDraft {
  const c = draft.importReview?.extraction.candidates.find(
    (c) => c.id === candidateId && isSkillCandidate(c),
  );
  if (
    !c ||
    !["professionalSkills", "technicalSkills", "omit", "review"].includes(
      choice,
    ) ||
    (choice === "review" && !c.path.startsWith("unclearSkills."))
  )
    throw Error("INVALID_SKILL_CHOICE");
  const next = clone(draft);
  let field = importedFact(next, c) as Fact<string> | undefined;
  next.professionalSkills = next.professionalSkills.filter((f) => f !== field);
  next.technicalSkills = next.technicalSkills.filter((f) => f !== field);
  if (choice !== "omit" && choice !== "review") {
    if (!field) {
      const source = next.sources.find(
        (s) =>
          s.locator ===
            (c.page
              ? `import:${next.importReview!.id}:page:${c.page}`
              : `import:${next.importReview!.id}:excerpt:${c.id}`) &&
          s.text === c.quote,
      );
      if (!source) throw Error("INVALID_SKILL_SOURCE");
      field = {
        ...fact(c.value),
        status: "extracted_unconfirmed",
        sourceId: source.id,
        sourceClaimId: c.id,
      };
    }
    next[choice].push(field);
  }
  next.importSkillChoices = { ...next.importSkillChoices };
  if (choice === "review") delete next.importSkillChoices[c.id];
  else next.importSkillChoices[c.id] = choice;
  return next;
}
