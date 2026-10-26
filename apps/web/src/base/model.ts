// Application-owned editor projection, NOT a database payload or canonical CV serializer.
// IDs are local correlation handles. A future API adapter must explicitly encode canonical IDs.
export type Locale = "ro" | "en";
export type PartialDate = { year: string; month: string };
export type FactValue = string | PartialDate | boolean;
export type Fact<T extends FactValue = FactValue> = {
  id: string;
  fieldId: string;
  value: T;
  status:
    "draft" | "extracted_unconfirmed" | "user_confirmed" | "user_authored";
  sourceId: string;
  sourceClaimId?: string;
  sourceLineage?: { sourceId: string; sourceClaimId?: string }[];
  evidenceClaimIds?: string[];
  previousFactId?: string;
  confirmedAt?: string;
};
export type Source = {
  id: string;
  kind: "manual" | "fixture" | "answer";
  label: string;
  text?: string;
  locator?: string;
};
export type Prose = {
  id: string;
  text: string;
  origin: "user_authored";
  approval: "pending" | "approved";
  claimIds: string[];
};
export type Contact = {
  id: string;
  kind: "email" | "phone" | "location" | "address" | "social";
  value: Fact<string>;
  visible: boolean;
  platform?: "linkedin" | "website" | "github" | "other";
};
export type Role = {
  id: string;
  title: Fact<string>;
  company: Fact<string>;
  location: Fact<string>;
  start: Fact<PartialDate>;
  end: Fact<PartialDate>;
  ongoing: Fact<boolean>;
  context: Fact<string>;
  bullets: Fact<string>[];
};
export type Education = {
  id: string;
  institution: Fact<string>;
  qualification: Fact<string>;
  field: Fact<string>;
  location: Fact<string>;
  start: Fact<PartialDate>;
  end: Fact<PartialDate>;
  details: Fact<string>;
  ongoing?: Fact<boolean>;
};
export type OptionalKind =
  "projects" | "certifications" | "languages" | "volunteering" | "custom";
export type OptionalEntry = {
  id: string;
  title: Fact<string>;
  details: Fact<string>;
  bullets?: Fact<string>[];
  start: Fact<PartialDate>;
  end: Fact<PartialDate>;
  proficiency?: Fact<string>;
  ongoing?: Fact<boolean>;
};
export type OptionalSection = {
  id: string;
  kind: OptionalKind;
  label: string;
  entries: OptionalEntry[];
};
export type Answer = {
  id: string;
  targetId: string;
  question:
    | "contribution"
    | "tools"
    | "context"
    | "ownership"
    | "scale"
    | "impact"
    | "complexity";
  text: string;
  status: "draft" | "review" | "confirmed" | "skipped" | "unknown";
  mode: "append" | "replace";
  sourceId?: string;
  factId?: string;
};
export type BaseDraft = {
  id: string;
  language: Locale;
  name: Fact<string>;
  nameParts?: { first: string; last: string };
  titles: [Fact<string>, Fact<string>];
  contacts: Contact[];
  summary: Prose;
  professionalSkills: Fact<string>[];
  technicalSkills: Fact<string>[];
  roles: Role[];
  education: Education[];
  optionalSections: OptionalSection[];
  sources: Source[];
  referenceProse: {
    id: string;
    text: string;
    approval: string;
    claimIds: string[];
  }[];
  answers: Answer[];
  presentation: {
    order: string[];
    hidden: string[];
    hiddenFields?: string[];
    contributionHtml?: Record<string, string>;
  };
};
export const coreSections = [
  "identity",
  "summary",
  "professionalSkills",
  "technicalSkills",
  "experience",
  "education",
] as const;
export const localId = () => `dev_${crypto.randomUUID()}`;
export const clone = <T>(value: T): T => structuredClone(value);
export const manualSourceId = "local_manual";
export const fact = <T extends FactValue>(value: T): Fact<T> => {
  const id = localId();
  return {
    id,
    fieldId: id,
    value,
    status: "user_authored",
    sourceId: manualSourceId,
  };
};
export const emptyDate = (): PartialDate => ({ year: "", month: "" });
export const hasValue = (value: FactValue) =>
  typeof value === "string"
    ? !!value.trim()
    : typeof value === "boolean"
      ? true
      : !!(value.year || value.month);
export function editFact<T extends FactValue>(
  current: Fact<T>,
  value: T,
): Fact<T> {
  if (JSON.stringify(current.value) === JSON.stringify(value)) return current;
  const lineage = [...(current.sourceLineage ?? [])];
  if (
    !lineage.some(
      (ref) =>
        ref.sourceId === current.sourceId &&
        ref.sourceClaimId === current.sourceClaimId,
    )
  ) {
    lineage.push({
      sourceId: current.sourceId,
      ...(current.sourceClaimId
        ? { sourceClaimId: current.sourceClaimId }
        : {}),
    });
  }
  return {
    ...fact(value),
    fieldId: current.fieldId,
    previousFactId:
      current.status === "user_confirmed"
        ? current.id
        : (current.previousFactId ?? current.id),
    sourceLineage: lineage,
  };
}
export function newRole(): Role {
  return {
    id: localId(),
    title: fact(""),
    company: fact(""),
    location: fact(""),
    context: fact(""),
    start: fact(emptyDate()),
    end: fact(emptyDate()),
    ongoing: fact(false),
    bullets: [],
  };
}
export function newEducation(): Education {
  return {
    id: localId(),
    institution: fact(""),
    qualification: fact(""),
    field: fact(""),
    location: fact(""),
    details: fact(""),
    start: fact(emptyDate()),
    end: fact(emptyDate()),
  };
}
export function newOptionalEntry(): OptionalEntry {
  return {
    id: localId(),
    title: fact(""),
    details: fact(""),
    start: fact(emptyDate()),
    end: fact(emptyDate()),
  };
}
export function blankDraft(): BaseDraft {
  return {
    id: localId(),
    language: "ro",
    name: fact(""),
    nameParts: { first: "", last: "" },
    titles: [fact(""), fact("")],
    contacts: ["email", "phone", "location", "social"].map((kind) => ({
      id: localId(),
      kind: kind as Contact["kind"],
      value: fact(""),
      visible: true,
      ...(kind === "social" ? { platform: "linkedin" as const } : {}),
    })),
    summary: {
      id: localId(),
      text: "",
      origin: "user_authored",
      approval: "pending",
      claimIds: [],
    },
    professionalSkills: [],
    technicalSkills: [],
    roles: [],
    education: [],
    optionalSections: [
      { id: "languages", kind: "languages", label: "", entries: [] },
    ],
    sources: [{ id: manualSourceId, kind: "manual", label: "manual" }],
    referenceProse: [],
    answers: [],
    presentation: { order: [...coreSections, "languages"], hidden: [] },
  };
}
export function sectionFacts(d: BaseDraft, section: string): Fact[] {
  if (section === "identity")
    return [d.name, ...d.titles, ...d.contacts.map((c) => c.value)];
  if (section === "professionalSkills" || section === "technicalSkills")
    return d[section];
  if (section === "experience")
    return d.roles.flatMap((r) => [
      r.title,
      r.company,
      r.location,
      r.start,
      r.ongoing,
      ...(!r.ongoing.value ? [r.end] : []),
      r.context,
      ...r.bullets,
    ]);
  if (section === "education")
    return d.education.flatMap((e) => [
      e.institution,
      e.qualification,
      e.field,
      e.location,
      e.start,
      ...(!e.ongoing?.value ? [e.end] : []),
      e.details,
      ...(e.ongoing ? [e.ongoing] : []),
    ]);
  return (
    d.optionalSections
      .find((s) => s.id === section)
      ?.entries.flatMap((e) => [
        e.title,
        e.details,
        ...(e.bullets ?? []),
        e.start,
        ...(!e.ongoing?.value ? [e.end] : []),
        ...(e.ongoing ? [e.ongoing] : []),
        ...(e.proficiency ? [e.proficiency] : []),
      ]) ?? []
  );
}
export function allFacts(d: BaseDraft): Fact[] {
  return [...coreSections, ...d.optionalSections.map((s) => s.id)].flatMap(
    (s) => sectionFacts(d, s),
  );
}
export const isAuthored = (f: Fact) =>
  f.status === "user_confirmed" || f.status === "user_authored";
