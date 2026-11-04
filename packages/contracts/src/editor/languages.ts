import { documentLabels, builtInDocumentLabels } from "./document-labels.ts";
import {
  canonicalContentLocale,
  contentLocale,
  contentLanguagePolicyVersion,
} from "./content-language.ts";
import { allFacts, clone, type BaseDraft, type Fact } from "./model.ts";
import { currentWording, isWordingFieldVisible } from "./wording.ts";
import {
  validateTranslationOutput,
  validateDocumentLocale,
  type TranslationInput,
  type TranslationItem,
  type TranslationOutput,
} from "../intelligence/translation.ts";
export type TranslationSource = {
  kind: "base";
  documentId: string;
  currentId: string;
  revision: number;
  fingerprint: string;
};
export type TranslationLineage = {
  schemaVersion: "cv-language/1";
  documentLocale: string;
  sourceLocale: string;
  source: TranslationSource;
  glossaryVersion: string;
  linguistic?: {
    promptVersion: string;
    warnings: TranslationOutput["warnings"];
    ambiguousTerms: TranslationOutput["ambiguousTerms"];
    suggestedGlossary: TranslationOutput["suggestedGlossary"];
  };
  components: Pick<
    TranslationItem,
    | "id"
    | "sectionId"
    | "fieldId"
    | "sourceFingerprint"
    | "factIds"
    | "evidenceIds"
  >[];
};
export const defaultDocumentLocale = (draft: BaseDraft) =>
  contentLocale(draft) === "ro"
    ? "ro-RO"
    : contentLocale(draft) === "en"
      ? "en-GB"
      : contentLocale(draft);
export async function componentFingerprint(value: unknown): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
/** Only visible accepted professional wording. No name, contacts, portrait,
 * evidence quotations, raw imports or saved career Q&A enter P09. */
export async function translationItems(
  draft: BaseDraft,
): Promise<TranslationItem[]> {
  const result: Omit<TranslationItem, "sourceFingerprint">[] = [];
  const hidden = (id: string) => draft.presentation.hiddenFields?.includes(id);
  const add = (sectionId: string, field: Fact<string>) => {
    if (field.value.trim() && !hidden(field.fieldId))
      result.push({
        id: field.fieldId,
        sectionId,
        fieldId: field.fieldId,
        text: field.value,
        factIds: [field.id],
        evidenceIds: [field.sourceId],
        protectedTerms: [],
      });
  };
  const sectionVisible = (id: string) =>
    draft.presentation.order.includes(id) &&
    !draft.presentation.hidden.includes(id);
  if (sectionVisible("identity"))
    draft.titles.forEach((f) => add("identity", f));
  if (
    sectionVisible("summary") &&
    draft.summary.text.trim() &&
    !hidden("summary")
  )
    result.push({
      id: draft.summary.id,
      sectionId: "summary",
      fieldId: draft.summary.id,
      text: draft.summary.text,
      factIds: [...draft.summary.claimIds],
      evidenceIds: [],
      protectedTerms: [],
    });
  for (const group of ["professionalSkills", "technicalSkills"] as const)
    if (sectionVisible(group)) draft[group].forEach((f) => add(group, f));
  const entry = (
    sectionId: string,
    target: {
      id: string;
      title: Fact<string>;
      context?: Fact<string>;
      details?: Fact<string>;
      bullets?: Fact<string>[];
    },
  ) => {
    add(sectionId, target.title);
    const field = target.context ?? target.details!;
    const wording = currentWording(draft, target.id);
    if (wording && isWordingFieldVisible(draft, target.id)) {
      const sources = draft.presentation.approvedWording![target.id].sources;
      result.push({
        id: field.fieldId,
        sectionId,
        fieldId: field.fieldId,
        text: wording,
        factIds: sources.map((s) => s.id),
        evidenceIds: [...new Set(sources.map((s) => s.sourceId))],
        protectedTerms: [],
      });
    } else add(sectionId, field);
    if (
      !(
        wording &&
        draft.presentation.approvedWording?.[target.id]?.scope === "experience"
      ) &&
      !hidden(`${target.id}-contributions`)
    )
      target.bullets?.forEach((f) => add(sectionId, f));
  };
  if (sectionVisible("experience"))
    draft.roles.forEach((r) => entry("experience", r));
  if (sectionVisible("education"))
    draft.education.forEach((e) => {
      add("education", e.qualification);
      add("education", e.field);
      add("education", e.details);
    });
  for (const section of draft.optionalSections)
    if (sectionVisible(section.id)) {
      if (section.heading) add(section.id, section.heading);
      else if (section.kind === "custom" && section.label.trim())
        result.push({
          id: `section:${section.id}:label`,
          sectionId: section.id,
          fieldId: `section:${section.id}:label`,
          text: section.label,
          factIds: [],
          evidenceIds: [],
          protectedTerms: [],
        });
      section.entries.forEach((e) => {
        entry(section.id, e);
        if (e.proficiency && e.proficiency.value !== "Native")
          add(section.id, e.proficiency);
      });
    }
  const protectedTerms = [
    ...new Set(
      [
        "SQL",
        "Power Automate",
        "Python",
        "PostgreSQL",
        "Supabase",
        "REST API",
        ...draft.roles.map((r) => r.company.value),
        ...draft.education.map((e) => e.institution.value),
      ].filter(Boolean),
    ),
  ];
  const factualContext = (fieldId: string) => {
    const role = draft.roles.find((r) =>
      [r.title, r.context, ...r.bullets].some((f) => f.fieldId === fieldId),
    );
    if (role)
      return {
        company: role.company.value,
        location: role.location.value,
        start: role.start.value,
        end: role.end.value,
        ongoing: role.ongoing.value,
      };
    const education = draft.education.find((e) =>
      [e.qualification, e.field, e.details].some((f) => f.fieldId === fieldId),
    );
    if (education)
      return {
        institution: education.institution.value,
        location: education.location.value,
        start: education.start.value,
        end: education.end.value,
        ongoing: education.ongoing?.value,
      };
    const entry = draft.optionalSections
      .flatMap((s) => s.entries)
      .find((e) =>
        [e.title, e.details, ...(e.bullets ?? [])].some(
          (f) => f.fieldId === fieldId,
        ),
      );
    return entry
      ? {
          start: entry.start.value,
          end: entry.end.value,
          ongoing: entry.ongoing?.value,
        }
      : null;
  };
  return Promise.all(
    result.map(async (item) => ({
      ...item,
      protectedTerms: protectedTerms.filter((term) => item.text.includes(term)),
      sourceFingerprint: await componentFingerprint({
        fieldId: item.fieldId,
        text: item.text,
        factIds: item.factIds,
        evidenceIds: item.evidenceIds,
        factualContext: factualContext(item.fieldId),
      }),
    })),
  );
}
export async function staleTranslationComponents(
  lineage: TranslationLineage,
  currentSource: BaseDraft,
): Promise<string[]> {
  const items = await translationItems(currentSource);
  return [
    ...new Set([
      ...lineage.components
        .filter(
          (c) =>
            items.find((i) => i.id === c.id)?.sourceFingerprint !==
            c.sourceFingerprint,
        )
        .map((c) => c.id),
      ...items
        .filter((i) => !lineage.components.some((c) => c.id === i.id))
        .map((i) => i.id),
    ]),
  ];
}
/** Materialized document representation, never a write-back or new career fact.
 * The CURRENT target holds only its own accepted wording plus opaque lineage;
 * it does not retain an old source-CV snapshot in translation metadata. */
export async function materializeTranslation(
  source: BaseDraft,
  input: TranslationInput,
  output: TranslationOutput,
): Promise<BaseDraft> {
  const sourceItems = await translationItems(source);
  if (
    input.items.some(
      (item) =>
        !sourceItems.some(
          (i) =>
            i.id === item.id &&
            i.fieldId === item.fieldId &&
            i.text === item.text &&
            i.sourceFingerprint === item.sourceFingerprint &&
            JSON.stringify(i.factIds) === JSON.stringify(item.factIds) &&
            JSON.stringify(i.evidenceIds) === JSON.stringify(item.evidenceIds),
        ),
    )
  )
    throw new Error("TRANSLATION_STALE_SOURCE");
  const accepted = validateTranslationOutput(output, input),
    target = clone(source);
  validateDocumentLocale(input.targetLocale);
  target.language = new Intl.Locale(input.targetLocale).language;
  const labels =
    input.targetLabels ??
    accepted.documentLabels ??
    builtInDocumentLabels(input.targetLocale);
  target.contentLanguage = {
    locale: input.targetLocale,
    confidence: "high",
    source: "translation",
    policyVersion: contentLanguagePolicyVersion,
    ...(labels ? { labels } : {}),
  };
  target.documentLocale = input.targetLocale;
  target.sourceLocale = input.sourceLocale;
  for (const role of [
    ...target.roles,
    ...target.optionalSections.flatMap((s) => s.entries),
  ]) {
    const wording = currentWording(source, role.id);
    if (wording) {
      ("context" in role ? role.context : role.details).value = wording;
      if (
        source.presentation.approvedWording?.[role.id]?.scope === "experience"
      )
        role.bullets = [];
    }
  }
  const fields = allFacts(target);
  for (const item of accepted.items) {
    const sourceItem = input.items.find((i) => i.id === item.id)!;
    if (sourceItem.fieldId === target.summary.id) {
      target.summary.text = item.text;
      continue;
    }
    const label = target.optionalSections.find(
      (s) => `section:${s.id}:label` === sourceItem.fieldId,
    );
    if (label) {
      label.label = item.text;
      continue;
    }
    const matches = fields.filter(
      (f) => f.fieldId === sourceItem.fieldId && typeof f.value === "string",
    );
    if (matches.length !== 1) throw new Error("TRANSLATION_FIELD_MISSING");
    matches[0].value = item.text;
  }
  delete target.presentation.approvedWording;
  delete target.presentation.contributionHtml;
  return target;
}

export function isCanonicalDocumentLocale(value: unknown): value is string {
  return typeof value === "string" && canonicalContentLocale(value) === value;
}
export function isTranslationLineage(
  value: unknown,
): value is TranslationLineage {
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const keys = (
    v: Record<string, unknown>,
    required: string[],
    optional: string[] = [],
  ) =>
    required.every((k) => Object.hasOwn(v, k)) &&
    Object.keys(v).every((k) => [...required, ...optional].includes(k));
  const handle = (v: unknown): v is string =>
    typeof v === "string" && v.length > 0 && v.length <= 256;
  const ids = (v: unknown): v is string[] =>
    Array.isArray(v) &&
    v.length <= 500 &&
    v.every(handle) &&
    new Set(v).size === v.length;
  const hash = (v: unknown) =>
    typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  if (
    !object(value) ||
    !keys(
      value,
      [
        "schemaVersion",
        "documentLocale",
        "sourceLocale",
        "source",
        "glossaryVersion",
        "components",
      ],
      ["linguistic"],
    ) ||
    value.schemaVersion !== "cv-language/1" ||
    !isCanonicalDocumentLocale(value.documentLocale) ||
    !isCanonicalDocumentLocale(value.sourceLocale) ||
    !handle(value.glossaryVersion) ||
    !object(value.source) ||
    !keys(
      value.source,
      ["kind", "documentId", "currentId", "revision", "fingerprint"],
      [],
    )
  )
    return false;
  if (value.linguistic !== undefined) {
    const m = value.linguistic;
    if (
      !object(m) ||
      !keys(m, [
        "promptVersion",
        "warnings",
        "ambiguousTerms",
        "suggestedGlossary",
      ]) ||
      !handle(m.promptVersion) ||
      JSON.stringify(m).length > 16000 ||
      !Array.isArray(m.warnings) ||
      !Array.isArray(m.ambiguousTerms) ||
      !Array.isArray(m.suggestedGlossary)
    )
      return false;
    if (
      m.warnings.some(
        (w) =>
          !object(w) ||
          !keys(w, ["itemId", "code", "message"]) ||
          !handle(w.itemId) ||
          ![
            "qualification_equivalence",
            "title_uncertain",
            "term_preserved",
            "untranslated",
          ].includes(String(w.code)) ||
          typeof w.message !== "string" ||
          w.message.length > 2000,
      )
    )
      return false;
    if (
      m.ambiguousTerms.some(
        (w) =>
          !object(w) ||
          !keys(w, ["itemId", "term"]) ||
          !handle(w.itemId) ||
          !handle(w.term),
      )
    )
      return false;
    if (
      m.suggestedGlossary.some(
        (w) =>
          !object(w) ||
          !keys(w, ["originalTerm", "preferredTranslation", "context"]) ||
          !handle(w.originalTerm) ||
          !handle(w.preferredTranslation) ||
          typeof w.context !== "string" ||
          w.context.length > 2000,
      )
    )
      return false;
  }
  const source = value.source;
  if (
    source.kind !== "base" ||
    !handle(source.documentId) ||
    !handle(source.currentId) ||
    !Number.isSafeInteger(source.revision) ||
    Number(source.revision) < 1 ||
    !hash(source.fingerprint) ||
    !keys(source, [
      "kind",
      "documentId",
      "currentId",
      "revision",
      "fingerprint",
    ])
  )
    return false;
  if (
    !Array.isArray(value.components) ||
    !value.components.length ||
    value.components.length > 2000
  )
    return false;
  const seen = new Set<string>();
  for (const c of value.components) {
    if (
      !object(c) ||
      !keys(c, [
        "id",
        "fieldId",
        "sectionId",
        "sourceFingerprint",
        "factIds",
        "evidenceIds",
      ]) ||
      !handle(c.id) ||
      c.id !== c.fieldId ||
      !handle(c.sectionId) ||
      !hash(c.sourceFingerprint) ||
      !ids(c.factIds) ||
      !ids(c.evidenceIds) ||
      seen.has(c.id)
    )
      return false;
    seen.add(c.id);
  }
  return true;
}

/** Shared proposed/accepted projection; scoped refresh never replaces untouched
 * accepted target sections or their presentation/manual wording. */
export async function composeTranslation(
  source: BaseDraft,
  input: TranslationInput,
  output: TranslationOutput,
  existing?: BaseDraft,
): Promise<BaseDraft> {
  const existingLabels =
    existing && contentLocale(existing) === input.targetLocale
      ? documentLabels(existing)
      : null;
  const target = await materializeTranslation(
    source,
    existingLabels ? { ...input, targetLabels: existingLabels } : input,
    output,
  );
  if (!existing) return target;
  const sections = new Set(input.items.map((i) => i.sectionId));
  if (!sections.has("identity")) target.titles = clone(existing.titles);
  target.name = clone(existing.name);
  target.contacts = clone(existing.contacts);
  if (existing.nameParts) target.nameParts = clone(existing.nameParts);
  if (!sections.has("summary")) target.summary = clone(existing.summary);
  for (const group of ["professionalSkills", "technicalSkills"] as const)
    if (!sections.has(group)) target[group] = clone(existing[group]);
  if (!sections.has("experience")) target.roles = clone(existing.roles);
  if (!sections.has("education")) target.education = clone(existing.education);
  for (const section of existing.optionalSections)
    if (!sections.has(section.id)) {
      const index = target.optionalSections.findIndex(
        (s) => s.id === section.id,
      );
      if (index < 0) target.optionalSections.push(clone(section));
      else target.optionalSections[index] = clone(section);
    }
  target.presentation = clone(existing.presentation);
  return target;
}
