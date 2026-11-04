import {
  clone,
  equalValues,
  hasValue,
  localId,
  type BaseDraft,
  type Fact,
  type FactValue,
} from "./model";
import {
  confirmImported,
  importedDraft,
  importedFact,
  pendingImportedCandidates,
  chooseImportSkill,
  importSkillChoice,
  isSkillCandidate,
} from "@resumora/contracts/editor/import";
import type { ImportReview } from "@resumora/contracts/intelligence/model";

export const identityKey = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const nameKey = (value: string) =>
  identityKey(value).split(/\s+/).sort().join(" ");
// Punctuation is meaningful in skills and evidence (for example C++ versus C#).
const textKey = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
function proposedName(profile: BaseDraft, incoming: BaseDraft) {
  if (!incoming.nameParts) return { value: incoming.name.value };
  const parts = {
    first: incoming.nameParts.first || profile.nameParts?.first || "",
    last: incoming.nameParts.last || profile.nameParts?.last || "",
  };
  return {
    parts,
    value:
      parts.first && parts.last
        ? `${parts.first} ${parts.last}`
        : incoming.name.value,
  };
}
export const hasProfileInformation = (
  draft?: BaseDraft | null,
): draft is BaseDraft =>
  !!draft &&
  (!!draft.name.value.trim() ||
    !!draft.summary.text.trim() ||
    !!draft.roles.length ||
    !!draft.education.length ||
    !!draft.answers.length ||
    !!draft.presentation.photo ||
    !!draft.presentation.templateVersionId ||
    !!draft.professionalSkills.length ||
    !!draft.technicalSkills.length ||
    draft.titles.some((f) => !!f.value.trim()) ||
    draft.contacts.some((c) => !!c.value.value.trim()) ||
    draft.optionalSections.some((s) => !!s.entries.length));
export function identityComparison(profile: BaseDraft, incoming: BaseDraft) {
  const rows = [
    { key: "name", current: profile.name.value, incoming: incoming.name.value },
  ];
  for (const kind of ["email", "phone"] as const) {
    rows.push({
      key: kind,
      current: profile.contacts.find((c) => c.kind === kind)?.value.value ?? "",
      incoming:
        incoming.contacts.find((c) => c.kind === kind)?.value.value ?? "",
    });
  }
  return rows.map((row) => {
    const normalize =
      row.key === "name"
        ? nameKey
        : row.key === "phone"
          ? (s: string) => s.replace(/\D/g, "")
          : (s: string) => s.trim().toLocaleLowerCase("en");
    return {
      ...row,
      differs:
        !!row.current.trim() &&
        !!row.incoming.trim() &&
        normalize(row.current) !== normalize(row.incoming),
    };
  });
}
export type ImportUpdate = {
  key: string;
  kind: "name" | "summary" | "fact" | "role" | "education" | "section";
  path: string;
  candidateIds: string[];
  incoming: string;
  current: string;
  index?: number;
};
export function displayImportValue(value: FactValue): string {
  return typeof value === "object"
    ? [value.month, value.year].filter(Boolean).join("/")
    : String(value);
}
function describeFacts(facts: Fact[]) {
  return facts
    .filter((f) => hasValue(f.value) && typeof f.value !== "boolean")
    .map((f) => displayImportValue(f.value))
    .join(" · ");
}
function targetFact(profile: BaseDraft, path: string): Fact | undefined {
  if (path.startsWith("titles."))
    return profile.titles[Number(path.split(".")[1])];
  if (path.startsWith("contacts.")) {
    const kind = path.split(".")[1];
    return profile.contacts.find((c) =>
      kind === "linkedin" || kind === "website"
        ? c.kind === "social" && c.platform === kind
        : c.kind === kind,
    )?.value;
  }
}
/** Builds an unselected change list. Collection positions are never treated as identity. */
export function profileImportUpdates(
  profile: BaseDraft,
  incoming: BaseDraft,
): ImportUpdate[] {
  const groups = new Map<string, ImportUpdate>();
  for (const candidate of incoming.importReview!.extraction.candidates) {
    const field = importedFact(incoming, candidate);
    if (!field || !hasValue(field.value)) continue;
    const path = isSkillCandidate(candidate)
      ? `${importSkillChoice(incoming, candidate)}.${candidate.path.split(".")[1]}`
      : candidate.path;
    const parts = path.split(".");
    const kind: ImportUpdate["kind"] = /^(name$|nameParts\.)/.test(
      candidate.path,
    )
      ? "name"
      : parts[0] === "summary"
        ? "summary"
        : parts[0] === "roles"
          ? "role"
          : parts[0] === "education"
            ? "education"
            : ["certifications", "custom", "languages"].includes(parts[0])
              ? "section"
              : "fact";
    const key =
      kind === "name"
        ? "name"
        : ["role", "education", "section"].includes(kind)
          ? parts.slice(0, 2).join(".")
          : candidate.path;
    const current =
      kind === "name"
        ? profile.name.value
        : kind === "summary"
          ? profile.summary.text
          : targetFact(profile, candidate.path)?.value;
    if (
      (kind === "name" &&
        equalValues(
          profile.name.value,
          proposedName(profile, incoming).value,
        )) ||
      (kind === "summary" && profile.summary.text === incoming.summary.text) ||
      (kind === "fact" &&
        current !== undefined &&
        equalValues(current, field.value))
    )
      continue;
    if (
      (parts[0] === "professionalSkills" || parts[0] === "technicalSkills") &&
      profile[parts[0]].some(
        (f) => textKey(f.value) === textKey(String(field.value)),
      )
    )
      continue;
    const group = groups.get(key) ?? {
      key,
      kind,
      path,
      candidateIds: [],
      incoming: "",
      current: current === undefined ? "" : displayImportValue(current),
      index: Number(parts[1]),
    };
    group.candidateIds.push(candidate.id);
    group.incoming =
      kind === "name"
        ? proposedName(profile, incoming).value
        : [
            ...new Set(
              [group.incoming, displayImportValue(field.value)].filter(Boolean),
            ),
          ].join(" · ");
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function currentUpdateText(
  profile: BaseDraft,
  update: ImportUpdate,
  target?: string,
) {
  if (update.kind === "role") {
    const role = profile.roles.find((r) => r.id === target);
    return role
      ? describeFacts([
          role.title,
          role.company,
          role.location,
          role.start,
          role.end,
          role.context,
          ...role.bullets,
        ])
      : "";
  }
  if (update.kind === "education") {
    const entry = profile.education.find((e) => e.id === target);
    return entry
      ? describeFacts([
          entry.institution,
          entry.qualification,
          entry.field,
          entry.start,
          entry.end,
          entry.details,
        ])
      : "";
  }
  return update.current;
}
function reviewedReplacement(previous: Fact, incoming: Fact): Fact {
  return {
    ...clone(incoming),
    fieldId: previous.fieldId,
    previousFactId: previous.id,
    sourceLineage: [
      ...(incoming.sourceLineage ?? []),
      ...(previous.sourceLineage ?? []),
      {
        sourceId: previous.sourceId,
        ...(previous.sourceClaimId
          ? { sourceClaimId: previous.sourceClaimId }
          : {}),
      },
    ],
  };
}
/** Deterministic, explicit selection only. Retains profile identity, Q&A and absent fields. */
export function applyProfileImport(
  profile: BaseDraft,
  review: ImportReview,
  selected: string[],
  targets: Record<string, string>,
  skillChoices?: BaseDraft["importSkillChoices"],
): BaseDraft {
  if (pendingImportedCandidates(profile).length)
    throw new Error("PENDING_PROFILE_REVIEW");
  let incoming = importedDraft(review);
  for (const [id, choice] of Object.entries(skillChoices ?? {}))
    incoming = chooseImportSkill(incoming, id, choice);
  const updates = profileImportUpdates(profile, incoming);
  if (
    !selected.length ||
    new Set(selected).size !== selected.length ||
    selected.some((k) => !updates.some((u) => u.key === k))
  )
    throw new Error("INVALID_IMPORT_SELECTION");
  const chosen = updates.filter((u) => selected.includes(u.key));
  const usedTargets = new Set<string>();
  for (const update of chosen.filter(
    (u) => u.kind === "role" || u.kind === "education",
  )) {
    const target = targets[update.key];
    if (
      !target ||
      (target !== "new" &&
        (!(update.kind === "role" ? profile.roles : profile.education).some(
          (r) => r.id === target,
        ) ||
          usedTargets.has(target)))
    )
      throw new Error("INVALID_IMPORT_TARGET");
    if (target !== "new") usedTargets.add(target);
  }
  const ids = chosen.flatMap((u) => u.candidateIds);
  const confirmed = confirmImported(incoming, ids),
    next = clone(profile);
  next.importReview = clone(confirmed.importReview);
  if (confirmed.importSkillChoices)
    next.importSkillChoices = clone(confirmed.importSkillChoices);
  else delete next.importSkillChoices;
  if (profile.importReview?.id === review.id) {
    next.importReview!.confirmedIds = [
      ...new Set([...profile.importReview.confirmedIds, ...ids]),
    ];
  }
  for (const source of confirmed.sources)
    if (!next.sources.some((s) => s.id === source.id))
      next.sources.push(clone(source));
  for (const update of chosen) {
    const candidate = review.extraction.candidates.find(
      (c) => c.id === update.candidateIds[0],
    )!;
    if (update.kind === "name") {
      next.name = reviewedReplacement(
        next.name,
        confirmed.name,
      ) as BaseDraft["name"];
      const name = proposedName(profile, confirmed);
      next.name.value = name.value;
      if (name.parts) next.nameParts = name.parts;
      else delete next.nameParts;
    } else if (update.kind === "summary") {
      next.summary = { ...clone(confirmed.summary), id: profile.summary.id };
      if (next.summary.provenance) {
        next.summary.provenance.fieldId =
          profile.summary.provenance?.fieldId ?? profile.summary.id;
        if (profile.summary.provenance)
          next.summary.provenance.previousFactId =
            profile.summary.provenance.id;
      }
    } else if (update.kind === "role" || update.kind === "education") {
      const source =
        update.kind === "role"
          ? confirmed.roles[update.index!]
          : confirmed.education[update.index!];
      const entries = update.kind === "role" ? next.roles : next.education;
      const target = entries.find((r) => r.id === targets[update.key]);
      if (!target) {
        // The selected entity is new, so its generated ID cannot retarget old answers.
        (entries as (typeof source)[]).push(clone(source));
      } else {
        // Imported facts invalidate a role's old presentation override. Keep its
        // Q&A and fact IDs, so the updated evidence can be enriched again.
        if (update.kind === "role") {
          delete next.presentation.approvedWording?.[target.id];
          delete next.presentation.contributionHtml?.[target.id];
        }
        for (const id of update.candidateIds) {
          const c = review.extraction.candidates.find((c) => c.id === id)!;
          const property = c.path.split(".")[2];
          const incomingFact = importedFact(confirmed, c)!;
          if (property === "bullets" && "bullets" in target) {
            if (
              !target.bullets.some(
                (f) => textKey(f.value) === textKey(String(incomingFact.value)),
              )
            )
              target.bullets.push(
                clone(
                  incomingFact,
                ) as BaseDraft["roles"][number]["bullets"][number],
              );
          } else {
            const object = target as unknown as Record<string, Fact>;
            object[property] = object[property]
              ? reviewedReplacement(object[property], incomingFact)
              : clone(incomingFact);
          }
        }
      }
    } else if (update.kind === "section") {
      const first = importedFact(confirmed, candidate)!;
      const section = confirmed.optionalSections.find(
        (s) =>
          s.heading?.fieldId === first.fieldId ||
          s.entries.some((e) =>
            [e.title, e.details, e.start, e.end, e.proficiency].some(
              (f) => f?.fieldId === first.fieldId,
            ),
          ),
      )!;
      const entry =
        section.entries.find((e) =>
          [e.title, e.details, e.start, e.end, e.proficiency].some(
            (f) => f?.fieldId === first.fieldId,
          ),
        ) ?? section.entries[0];
      let target = next.optionalSections.find(
        (s) => s.kind === section.kind && section.kind !== "custom",
      );
      if (!target) {
        target = { ...clone(section), id: localId(), entries: [] };
        next.optionalSections.push(target);
        next.presentation.order.push(target.id);
      }
      if (
        !target.entries.some(
          (e) =>
            textKey(e.title.value) === textKey(entry.title.value) &&
            equalValues(e.details.value, entry.details.value) &&
            equalValues(e.proficiency?.value, entry.proficiency?.value) &&
            equalValues(e.start.value, entry.start.value) &&
            equalValues(e.end.value, entry.end.value) &&
            equalValues(e.ongoing?.value, entry.ongoing?.value),
        )
      )
        target.entries.push({
          ...clone(entry),
          ...(target.kind === "custom" ? { id: target.id } : {}),
        });
    } else {
      const field = importedFact(confirmed, candidate)!;
      const parts = update.path.split(".");
      if (parts[0] === "professionalSkills" || parts[0] === "technicalSkills") {
        if (
          !next[parts[0]].some(
            (f) => textKey(f.value) === textKey(String(field.value)),
          )
        )
          next[parts[0]].push(
            clone(field) as BaseDraft["professionalSkills"][number],
          );
      } else {
        const target = targetFact(next, update.path);
        if (target) Object.assign(target, reviewedReplacement(target, field));
        else if (parts[0] === "contacts") {
          const contact = confirmed.contacts.find(
            (c) => c.value.fieldId === field.fieldId,
          );
          if (contact) next.contacts.push(clone(contact));
        }
      }
    }
  }
  // No imported presentation settings, photos, question plans or answers are copied.
  return next;
}
