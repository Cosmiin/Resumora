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
  kind: "base" | "job";
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
  draft.language === "ro" ? "ro-RO" : "en-GB";
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
      if (section.kind === "custom" && section.label.trim())
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
  return Promise.all(
    result.map(async (item) => ({
      ...item,
      protectedTerms: protectedTerms.filter((term) => item.text.includes(term)),
      sourceFingerprint: await componentFingerprint({
        fieldId: item.fieldId,
        text: item.text,
        factIds: item.factIds,
        evidenceIds: item.evidenceIds,
      }),
    })),
  );
}
export async function staleTranslationComponents(
  lineage: TranslationLineage,
  currentSource: BaseDraft,
): Promise<string[]> {
  const items = await translationItems(currentSource);
  return lineage.components
    .filter(
      (c) =>
        items.find((i) => i.id === c.id)?.sourceFingerprint !==
        c.sourceFingerprint,
    )
    .map((c) => c.id);
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
  target.language = input.targetLocale.split("-")[0] as BaseDraft["language"];
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
  // Accepted whole-experience prose already includes its visible bullets. The
  // target must not resurrect untranslated inherited bullets or rich HTML.
  for (const role of [
    ...target.roles,
    ...target.optionalSections.flatMap((s) => s.entries),
  ]) {
    if (
      target.presentation.approvedWording?.[role.id]?.scope === "experience" &&
      input.items.some(
        (i) =>
          i.fieldId ===
          ("context" in role ? role.context.fieldId : role.details.fieldId),
      )
    )
      role.bullets = [];
  }
  delete target.presentation.approvedWording;
  delete target.presentation.contributionHtml;
  return target;
}
