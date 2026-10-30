import type { TranslationLineage } from "./languages.ts";
import type { CvPhoto } from "./photo.ts";
import type {
  ImportReview,
  QuestionPlan,
  QuestionOption,
  RoleRewriteReview,
} from "../intelligence/model.ts";
// Versioned editor projection, distinct from canonical CV publications.
// IDs remain editor correlation handles; database resource IDs are separate UUIDs.
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
  acceptance?: "automatic";
  sourceClaimId?: string;
  sourceLineage?: { sourceId: string; sourceClaimId?: string }[];
  evidenceClaimIds?: string[];
  previousFactId?: string;
  confirmedAt?: string;
};
export type Source = {
  id: string;
  kind: "manual" | "fixture" | "answer" | "document";
  label: string;
  text?: string;
  locator?: string;
};
export type Prose = {
  id: string;
  text: string;
  origin: "user_authored" | "extracted" | "ai_generated";
  provenance?: Omit<Fact<string>, "value">;
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
  heading?: Fact<string>;
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
  status: "draft" | "confirmed" | "skipped" | "unknown";
  questionText: string;
  plannedQuestionId?: string;
  options?: QuestionOption[];
  selectedOptionIds?: string[];
  selectionMode?: "single" | "multiple";
  targetLabel?: string;
  sourceId?: string;
  cvFieldId?: string;
};
// Shared by the existing editor content projection and any independent tailored
// document using that projection. Choice belongs to this document/revision; it
// is never read from a global preference or the latest Base draft.
export type DocumentPresentation = {
  photo?: CvPhoto | null;
  order: string[];
  hidden: string[];
  // Immutable registry version reference; absence retains the legacy layout.
  // Unknown future references remain stored and render through a safe fallback.
  templateVersionId?: string;
  hiddenFields?: string[];
  contributionHtml?: Record<string, string>;
  approvedWording?: Record<
    string,
    {
      text: string;
      scope?: "experience";
      origin?: "user_authored" | "ai_generated";
      sources: {
        id: string;
        text: string;
        sourceId: string;
        sourceClaimId?: string;
        sourceLineage?: { sourceId: string; sourceClaimId?: string }[];
      }[];
    }
  >;
};

export type BaseDraft = {
  id: string;
  importReview?: ImportReview;
  questionPlans?: QuestionPlan[];
  roleRewriteReviews?: RoleRewriteReview[];
  language: Locale;
  documentLocale?: string;
  sourceLocale?: string;
  translation?: TranslationLineage;
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
  presentation: DocumentPresentation;
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
export function equalValues(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, i) => equalValues(value, right[i]))
    );
  if (!left || !right || typeof left !== "object" || typeof right !== "object")
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  return (
    keys.length ===
      Object.keys(b).filter((key) => b[key] !== undefined).length &&
    keys.every((key) => Object.hasOwn(b, key) && equalValues(a[key], b[key]))
  );
}
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
  if (equalValues(current.value, value)) return current;
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
    ...(current.acceptance ? { acceptance: current.acceptance } : {}),
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
export function sectionFacts(
  d: BaseDraft,
  section: string,
  includeInactive = false,
): Fact[] {
  if (section === "summary") {const f=summaryFact(d);return f?[f]:[];}
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
      ...(includeInactive || !r.ongoing.value ? [r.end] : []),
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
      ...(includeInactive || !e.ongoing?.value ? [e.end] : []),
      e.details,
      ...(e.ongoing ? [e.ongoing] : []),
    ]);
  return d.optionalSections
    .filter((s) => s.id === section)
    .flatMap((s) => [
      ...(s.heading ? [s.heading] : []),
      ...s.entries.flatMap((e) => [
        e.title,
        e.details,
        ...(e.bullets ?? []),
        e.start,
        ...(includeInactive || !e.ongoing?.value ? [e.end] : []),
        ...(e.ongoing ? [e.ongoing] : []),
        ...(e.proficiency ? [e.proficiency] : []),
      ]),
    ]);
}
export function writeSummary(d:BaseDraft,text:string,origin:Prose['origin']='user_authored'){
  if(text===d.summary.text&&origin==='user_authored')return;
  const source=summaryFact(d);
  if(origin==='user_authored'&&source){const {value,...provenance}=editFact(source,text);d.summary.provenance=provenance;}
  else delete d.summary.provenance;
  d.summary.text=text;d.summary.origin=origin;d.summary.approval='approved';
}
export function summaryFact(d: BaseDraft): Fact<string> | null {
  if(!d.summary.provenance)return null;
  const result={} as Fact<string>;
  for(const key of new Set([...Object.keys(d.summary.provenance),'value']))Object.defineProperty(result,key,{enumerable:true,configurable:true,get:()=>key==='value'?d.summary.text:(d.summary.provenance as unknown as Record<string,unknown>)[key],set:(v)=>{if(key==='value')d.summary.text=v;else (d.summary.provenance as unknown as Record<string,unknown>)[key]=v;}});
  return result;
}
export function allFacts(d: BaseDraft, includeInactive = false): Fact[] {
  return [...coreSections, ...d.optionalSections.map((s) => s.id)].flatMap(
    (s) => sectionFacts(d, s, includeInactive),
  );
}
export const isAccepted = (f: Fact) =>
  f.status === "user_confirmed" ||
  f.status === "user_authored" ||
  (f.status === "extracted_unconfirmed" && f.acceptance === "automatic");
