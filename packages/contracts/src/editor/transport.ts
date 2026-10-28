import { isPhoto } from "./photo.ts";
import type { Answer, BaseDraft } from "./model.ts";

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
export interface CvDraftGateway {
  loadDraft(): Promise<DraftSnapshot | null>;
  draftHistory(input?: { beforeRevision?: number; limit?: number }): Promise<DraftSnapshot[]>;
  saveDraft(input: { requestId: string; expectedRevision: number;
    mode: "autosave" | "checkpoint"; payload: EditorEnvelope }): Promise<DraftSnapshot>;
  restoreDraft(input: { requestId: string; expectedRevision: number; snapshotId: string }): Promise<DraftSnapshot>;
}
export function encodeDraft(draft: BaseDraft): EditorEnvelope {
  const { answers, ...content } = structuredClone(draft);
  return { schemaVersion: "resumora-editor-draft/1", content, answers };
}
export function decodeDraft(payload: EditorWireEnvelope): BaseDraft {
  if (payload.schemaVersion !== "resumora-editor-draft/1") throw new Error("unsupportedEditorVersion");
  const draft = { ...payload.content, answers: payload.answers };
  if (!isBaseDraft(draft)) throw new Error("invalidEditorDraft");
  return structuredClone(draft);
}

// Structural validation permits incomplete values, including blank/partial dates.
// Checkpoint completeness is a separate rule; neither path attests imported facts.
type Check = (value: unknown) => boolean;
const str: Check = v => typeof v === "string";
const bool: Check = v => typeof v === "boolean";
const one = (...values: string[]): Check => v => typeof v === "string" && values.includes(v);
const list = (check: Check): Check => v => Array.isArray(v) && v.every(check);
const obj = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => v => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const row = v as Record<string, unknown>;
  return Object.entries(required).every(([key, check]) => Object.hasOwn(row, key) && check(row[key])) &&
    Object.entries(optional).every(([key, check]) => !(Object.hasOwn(row, key)) || check(row[key])) &&
    Object.keys(row).every(key => Object.hasOwn(required, key) || Object.hasOwn(optional, key));
};
const date = obj({ year: str, month: str });
const ref = obj({ sourceId: str }, { sourceClaimId: str });
const fact = (value: Check): Check => obj({ id: str, fieldId: str, value,
  status: one("draft", "extracted_unconfirmed", "user_confirmed", "user_authored"), sourceId: str },
  { sourceClaimId: str, sourceLineage: list(ref), evidenceClaimIds: list(str), previousFactId: str, confirmedAt: str });
const text = fact(str), partial = fact(date), flag = fact(bool);
const prose = obj({ id: str, text: str, origin: one("user_authored"), approval: one("pending", "approved"), claimIds: list(str) });
const answer = obj({ id: str, targetId: str,
  question: one("contribution", "tools", "context", "ownership", "scale", "impact", "complexity"),
  text: str, status: one("draft", "confirmed", "skipped", "unknown"), questionText: str },
  { targetLabel: str, sourceId: str, cvFieldId: str });
const entry = obj({ id: str, title: text, details: text, start: partial, end: partial },
  { bullets: list(text), proficiency: text, ongoing: flag });
const draftShape = obj({
  id: str, language: one("ro", "en"), name: text,
  titles: v => Array.isArray(v) && v.length === 2 && v.every(text),
  contacts: list(obj({ id: str, kind: one("email", "phone", "location", "address", "social"), value: text, visible: bool },
    { platform: one("linkedin", "website", "github", "other") })),
  summary: prose, professionalSkills: list(text), technicalSkills: list(text),
  roles: list(obj({ id: str, title: text, company: text, location: text, start: partial, end: partial, ongoing: flag, context: text, bullets: list(text) })),
  education: list(obj({ id: str, institution: text, qualification: text, field: text, location: text, start: partial, end: partial, details: text }, { ongoing: flag })),
  optionalSections: list(obj({ id: str, kind: one("projects", "certifications", "languages", "volunteering", "custom"), label: str, entries: list(entry) })),
  sources: list(obj({ id: str, kind: one("manual", "fixture", "answer"), label: str }, { text: str, locator: str })),
  referenceProse: list(obj({ id: str, text: str, approval: str, claimIds: list(str) })),
  answers: list(answer),
  presentation: obj({ order: list(str), hidden: list(str) }, {
    photo: isPhoto,
    // Same bounded ID grammar as canonical document.templateVersionId. Do not
    // validate against today's registry: future/historical versions must survive.
    templateVersionId: v => typeof v === "string" && /^[a-z][a-z0-9_-]{1,79}$/.test(v),
    hiddenFields: list(str),
    approvedWording: v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(obj({ text: str,
      sources: list(obj({ id: str, text: str, sourceId: str }, { sourceClaimId: str, sourceLineage: list(ref) })) })),
    contributionHtml: v => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(str) }),
}, { nameParts: obj({ first: str, last: str }) });
export function isBaseDraft(value: unknown): value is BaseDraft { return draftShape(value); }
