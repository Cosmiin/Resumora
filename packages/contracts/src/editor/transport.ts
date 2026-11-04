import {
  canonicalContentLocale,
  isContentLanguageDecision,
} from "./content-language.ts";
import { isExperienceSessions } from "../intelligence/experience.ts";
import {
  isCanonicalDocumentLocale,
  isTranslationLineage,
} from "./languages.ts";
import { isPhoto } from "./photo.ts";
import {
  isImportReview,
  isRoleRewriteReview,
  answerEvidenceText,
  validateQuestionPlan,
} from "../intelligence/model.ts";
import type { Answer, BaseDraft, Fact } from "./model.ts";

export type EditorEnvelope = {
  schemaVersion: "resumora-editor-draft/1";
  content: Omit<BaseDraft, "answers">;
  answers: Answer[];
};
// Database JSON has envelope structure; decodeDraft validates its editor content.
export type EditorWireEnvelope = {
  schemaVersion: EditorEnvelope["schemaVersion"];
  content: Record<string, unknown>;
  answers: unknown[];
};
export type DraftSnapshot = {
  id: string;
  revision: number;
  parentId: string | null;
  restoredFrom?: string;
  createdAt: string;
  reason: "save" | "autosave" | "restore";
  payload: EditorWireEnvelope;
};
export type BaseLifecycle = {
  generation: number;
  revision: number;
  cleanupPending: boolean;
};
export type BaseRemoval = BaseLifecycle & { removed: true };
export interface CvDraftGateway {
  loadBaseState?(): Promise<BaseLifecycle & { snapshot: DraftSnapshot | null }>;
  retryBaseCleanup?(): Promise<BaseLifecycle>;
  removeBase?(input: {
    requestId: string;
    expectedRevision: number;
    expectedGeneration: number;
  }): Promise<BaseRemoval>;
  loadDraft(): Promise<DraftSnapshot | null>;
  draftHistory(input?: {
    beforeRevision?: number;
    limit?: number;
  }): Promise<DraftSnapshot[]>;
  saveDraft(input: {
    requestId: string;
    expectedRevision: number;
    mode: "autosave" | "checkpoint";
    payload: EditorEnvelope;
  }): Promise<DraftSnapshot>;
  saveReviewedImport?(input: {
    requestId: string;
    expectedRevision: number;
    payload: EditorWireEnvelope;
    importId: string;
    selected: string[];
  }): Promise<DraftSnapshot>;
  restoreDraft(input: {
    requestId: string;
    expectedRevision: number;
    snapshotId: string;
  }): Promise<DraftSnapshot>;
}
/** Drop retired per-skill references while preserving shared CV import provenance. */
function retireSkillReferences(draft: BaseDraft): BaseDraft {
  for (const category of ["technicalSkills", "professionalSkills"] as const) {
    for (const skill of [
      ...draft[category],
      ...(draft.skillReserves?.[category] ?? []),
    ]) {
      delete skill.skillEvidence;
      delete skill.skillOrigin;
    }
  }
  for (const session of Object.values(draft.experienceEnrichment ?? {})) {
    if (session.skills)
      session.skills.skills = session.skills.skills.map(
        ({ id, label, category, importance }) => ({
          id,
          label,
          category,
          ...(importance ? { importance } : {}),
        }),
      );
  }
  return draft;
}
export function encodeDraft(draft: BaseDraft): EditorEnvelope {
  const { answers, ...content } = retireSkillReferences(structuredClone(draft));
  return { schemaVersion: "resumora-editor-draft/1", content, answers };
}
export function decodeDraft(payload: EditorWireEnvelope): BaseDraft {
  if (payload.schemaVersion !== "resumora-editor-draft/1")
    throw new Error("unsupportedEditorVersion");
  const draft = { ...payload.content, answers: payload.answers };
  if (!isBaseDraft(draft)) throw new Error("invalidEditorDraft");
  const result = retireSkillReferences(structuredClone(draft));
  const legacy = result.optionalSections.find((s) => s.id === "import-summary");
  if (legacy) {
    const f = legacy.entries[0]?.details;
    if (f && !result.summary.text) {
      const { value, ...provenance } = f;
      result.summary = {
        ...result.summary,
        id: f.fieldId,
        text: value,
        origin: "extracted",
        approval:
          f.status === "user_confirmed" || f.acceptance === "automatic"
            ? "approved"
            : "pending",
        provenance,
      };
    }
    result.optionalSections = result.optionalSections.filter(
      (s) => s !== legacy,
    );
    result.presentation.order = [
      ...new Set(
        result.presentation.order.map((id) =>
          id === "import-summary" ? "summary" : id,
        ),
      ),
    ];
    result.presentation.hidden = [
      ...new Set(
        result.presentation.hidden.map((id) =>
          id === "import-summary" ? "summary" : id,
        ),
      ),
    ];
  }
  return result;
}

// Structural validation permits incomplete values, including blank/partial dates.
// Checkpoint completeness is a separate rule; neither path attests imported facts.
type Check = (value: unknown) => boolean;
const str: Check = (v) => typeof v === "string";
const bool: Check = (v) => typeof v === "boolean";
const one =
  (...values: string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v);
const list =
  (check: Check): Check =>
  (v) =>
    Array.isArray(v) && v.every(check);
const obj =
  (
    required: Record<string, Check>,
    optional: Record<string, Check> = {},
  ): Check =>
  (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const row = v as Record<string, unknown>;
    return (
      Object.entries(required).every(
        ([key, check]) => Object.hasOwn(row, key) && check(row[key]),
      ) &&
      Object.entries(optional).every(
        ([key, check]) => !Object.hasOwn(row, key) || check(row[key]),
      ) &&
      Object.keys(row).every(
        (key) => Object.hasOwn(required, key) || Object.hasOwn(optional, key),
      )
    );
  };
const date = obj({ year: str, month: str });
const ref = obj({ sourceId: str }, { sourceClaimId: str });
const fact = (value: Check): Check =>
  obj(
    {
      id: str,
      fieldId: str,
      value,
      status: one(
        "draft",
        "extracted_unconfirmed",
        "user_confirmed",
        "user_authored",
      ),
      sourceId: str,
    },
    {
      acceptance: one("automatic"),
      sourceClaimId: str,
      sourceLineage: list(ref),
      skillEvidence: () => true, // Retired metadata is accepted and discarded.
      skillOrigin: () => true,
      evidenceClaimIds: list(str),
      previousFactId: str,
      confirmedAt: str,
    },
  );
const text = fact(str),
  partial = fact(date),
  flag = fact(bool);
export const isTextFact = (value: unknown): value is Fact<string> =>
  text(value);
const prose = obj(
  {
    id: str,
    text: str,
    origin: one("user_authored", "extracted", "ai_generated"),
    approval: one("pending", "approved"),
    claimIds: list(str),
  },
  {
    provenance: (v) =>
      !!v &&
      typeof v === "object" &&
      !Object.hasOwn(v, "value") &&
      text({ ...v, value: "" }),
  },
);
const answer = obj(
  {
    id: str,
    targetId: str,
    question: one(
      "contribution",
      "tools",
      "context",
      "ownership",
      "scale",
      "impact",
      "complexity",
    ),
    text: str,
    status: one("draft", "confirmed", "skipped", "unknown"),
    questionText: str,
  },
  {
    targetLabel: str,
    sourceId: str,
    cvFieldId: str,
    plannedQuestionId: str,
    options: list(obj({ id: str, label: str })),
    selectedOptionIds: list(str),
    selectionMode: one("single", "multiple"),
  },
);
const entry = obj(
  { id: str, title: text, details: text, start: partial, end: partial },
  { bullets: list(text), proficiency: text, ongoing: flag },
);
const draftShape = obj(
  {
    id: str,
    language: (v) => typeof v === "string" && canonicalContentLocale(v) === v,
    name: text,
    titles: (v) => Array.isArray(v) && v.length === 2 && v.every(text),
    contacts: list(
      obj(
        {
          id: str,
          kind: one("email", "phone", "location", "address", "social"),
          value: text,
          visible: bool,
        },
        { platform: one("linkedin", "website", "github", "other") },
      ),
    ),
    summary: prose,
    professionalSkills: list(text),
    technicalSkills: list(text),
    roles: list(
      obj({
        id: str,
        title: text,
        company: text,
        location: text,
        start: partial,
        end: partial,
        ongoing: flag,
        context: text,
        bullets: list(text),
      }),
    ),
    education: list(
      obj(
        {
          id: str,
          institution: text,
          qualification: text,
          field: text,
          location: text,
          start: partial,
          end: partial,
          details: text,
        },
        { ongoing: flag },
      ),
    ),
    optionalSections: list(
      obj(
        {
          id: str,
          kind: one(
            "projects",
            "certifications",
            "languages",
            "volunteering",
            "custom",
          ),
          label: str,
          entries: list(entry),
        },
        { heading: text },
      ),
    ),
    sources: list(
      obj(
        {
          id: str,
          kind: one("manual", "fixture", "answer", "document"),
          label: str,
        },
        { text: str, locator: str },
      ),
    ),
    referenceProse: list(
      obj({ id: str, text: str, approval: str, claimIds: list(str) }),
    ),
    answers: list(answer),
    presentation: obj(
      { order: list(str), hidden: list(str) },
      {
        photo: isPhoto,
        // Preserve well-formed unknown template references across historical snapshots.
        templateVersionId: (v) =>
          typeof v === "string" && /^[a-z][a-z0-9_-]{1,79}$/.test(v),
        hiddenFields: list(str),
        approvedWording: (v) =>
          !!v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          Object.values(v).every(
            obj(
              {
                text: str,
                sources: list(
                  obj(
                    { id: str, text: str, sourceId: str },
                    { sourceClaimId: str, sourceLineage: list(ref) },
                  ),
                ),
              },
              {
                scope: one("experience"),
                origin: one("user_authored", "ai_generated"),
              },
            ),
          ),
        contributionHtml: (v) =>
          !!v &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          Object.values(v).every(str),
      },
    ),
  },
  {
    contentLanguage: isContentLanguageDecision,
    documentLocale: isCanonicalDocumentLocale,
    sourceLocale: isCanonicalDocumentLocale,
    translation: isTranslationLineage,
    nameParts: obj({ first: str, last: str }),
    importReview: isImportReview,
    importSkillChoices: (v) =>
      !!v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v).length <= 250 &&
      Object.values(v).every(
        one("professionalSkills", "technicalSkills", "omit"),
      ),
    experienceEnrichment: isExperienceSessions,
    skillExclusions: (v) =>
      Array.isArray(v) &&
      v.length <= 4000 &&
      v.every((x) => typeof x === "string" && x.length <= 2000),
    skillReserves: obj({
      technicalSkills: list(text),
      professionalSkills: list(text),
    }),
    skillReview: obj({
      operationId: str,
      fingerprint: str,
      snapshotId: str,
      revision: (v) => Number.isSafeInteger(v) && Number(v) > 0,
    }),
    roleRewriteReviews: list(isRoleRewriteReview),
    questionPlans: list((v) => {
      try {
        return (
          !!v &&
          typeof v === "object" &&
          !!validateQuestionPlan(v, (v as { targetId: string }).targetId)
        );
      } catch {
        return false;
      }
    }),
  },
);
export function isBaseDraft(value: unknown): value is BaseDraft {
  if (!draftShape(value)) return false;
  try {
    const d = value as BaseDraft;
    if (
      d.importSkillChoices &&
      (!d.importReview ||
        Object.keys(d.importSkillChoices).some(
          (id) =>
            !d.importReview!.extraction.candidates.some(
              (c) =>
                c.id === id &&
                /^(professionalSkills|technicalSkills|unclearSkills)\.\d+$/.test(
                  c.path,
                ),
            ),
        ))
    )
      return false;
    return (value as BaseDraft).answers.every((a) => {
      const evidence = answerEvidenceText(a);
      return a.status !== "confirmed" || !!evidence.trim();
    });
  } catch {
    return false;
  }
}
