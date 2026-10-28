/** Provisional operation schemas; prompt quality/tone remains an owner workshop. */
export const documentLimits = Object.freeze({
  bytes: 10_000_000,
  pages: 10,
  characters: 40_000,
  candidates: 250,
});
export type DocumentFormat = "pdf" | "docx" | "doc";
export type DocumentPage = {
  number: number;
  text: string;
  method: "text" | "scan" | "visual";
  warnings: string[];
};
export type ProcessedDocument = {
  schemaVersion: "document-pages/1";
  format: DocumentFormat;
  sha256: string;
  parserVersion: string;
  pages: DocumentPage[];
  fileBase64: string;
  warnings: string[];
};
export type Admission = {
  kind: "cv" | "not_cv" | "uncertain";
  reason: string;
  pages: number[];
};
export type Candidate = {
  id: string;
  path: string;
  value: string;
  page: number | null;
  quote: string;
  confidence: "low" | "medium" | "high";
  warning?: string;
};
export type Extraction = {
  schemaVersion: "cv-extraction/1";
  candidates: Candidate[];
  warnings: string[];
  omittedPages: number[];
};
export type ImportReview = {
  id: string;
  sourceHash: string;
  format: DocumentFormat;
  parserVersion: string;
  pages: number | null;
  admission: Admission;
  extraction: Extraction;
  confirmedIds: string[];
};
export type QuestionOption = { id: string; label: string };
export type PlannedQuestion = {
  id: string;
  dimension:
    | "context"
    | "ownership"
    | "tools"
    | "scale"
    | "contribution"
    | "impact"
    | "complexity";
  text: string;
  why: string;
  selectionMode: "single" | "multiple";
  options: QuestionOption[];
};
export type QuestionPlan = {
  schemaVersion: "career-question-plan/1";
  goal?: string;
  targetId: string;
  questions: PlannedQuestion[];
};
export type RoleRewrite = {
  schemaVersion: "career-role-rewrite/1";
  targetId: string;
  text: string;
  factIds: string[];
  warnings: string[];
};
export class IntelligenceError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number, empty = false): v is string =>
  typeof v === "string" && v.length <= max && (empty || !!v.trim());
const exact = (
  v: Record<string, unknown>,
  keys: string[],
  optional: string[] = [],
) =>
  keys.every((k) => Object.hasOwn(v, k)) &&
  Object.keys(v).every((k) => keys.includes(k) || optional.includes(k));
export function documentFormat(
  name: string,
  bytes: Uint8Array,
): DocumentFormat {
  if (!bytes.length || bytes.length > documentLimits.bytes)
    throw new IntelligenceError("DOCUMENT_SIZE");
  const ext = name.split(".").at(-1)?.toLowerCase();
  const pdf =
    bytes[0] === 37 &&
    bytes[1] === 80 &&
    bytes[2] === 68 &&
    bytes[3] === 70 &&
    bytes[4] === 45;
  const zip =
    bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
  const ole = [208, 207, 17, 224, 161, 177, 26, 225].every(
    (v, i) => bytes[i] === v,
  );
  if (
    (ext === "pdf" && pdf) ||
    (ext === "docx" && zip) ||
    (ext === "doc" && ole)
  )
    return ext as DocumentFormat;
  throw new IntelligenceError("DOCUMENT_TYPE");
}
export function validatePages(v: unknown): ProcessedDocument {
  if (
    !object(v) ||
    !exact(v, [
      "schemaVersion",
      "format",
      "sha256",
      "parserVersion",
      "pages",
      "fileBase64",
      "warnings",
    ]) ||
    v.schemaVersion !== "document-pages/1" ||
    !["pdf", "docx", "doc"].includes(v.format as string) ||
    typeof v.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.sha256) ||
    !text(v.parserVersion, 200) ||
    !Array.isArray(v.pages) ||
    v.pages.length > documentLimits.pages ||
    (v.format === "pdf" ? !v.pages.length : !!v.pages.length) ||
    !text(v.fileBase64, 14_000_000) ||
    !Array.isArray(v.warnings) ||
    v.warnings.length > 20 ||
    !v.warnings.every((x) => text(x, 500))
  )
    throw new IntelligenceError("PROCESSOR_OUTPUT");
  let chars = 0;
  for (const [i, p] of v.pages.entries()) {
    if (
      !object(p) ||
      !exact(p, ["number", "text", "method", "warnings"]) ||
      p.number !== i + 1 ||
      !text(p.text, documentLimits.characters, true) ||
      !["text", "scan", "visual"].includes(p.method as string) ||
      !Array.isArray(p.warnings) ||
      p.warnings.length > 20 ||
      !p.warnings.every((x) => text(x, 500))
    )
      throw new IntelligenceError("PROCESSOR_OUTPUT");
    chars += p.text.length;
  }
  if (chars > documentLimits.characters)
    throw new IntelligenceError("DOCUMENT_TEXT_LIMIT");
  return structuredClone(v) as unknown as ProcessedDocument;
}
export function validateAdmission(v: unknown, pages: number): Admission {
  if (
    !object(v) ||
    !exact(v, ["kind", "reason", "pages"]) ||
    !["cv", "not_cv", "uncertain"].includes(v.kind as string) ||
    !text(v.reason, 1000) ||
    !Array.isArray(v.pages) ||
    v.pages.length > pages ||
    !v.pages.every((n) => Number.isInteger(n) && n >= 1 && n <= pages)
  )
    throw new IntelligenceError("ADMISSION_OUTPUT");
  return structuredClone(v) as unknown as Admission;
}
export const candidatePath =
  /^(name|titles\.[01]|contacts\.(email|phone|location|linkedin)|professionalSkills\.\d{1,2}|technicalSkills\.\d{1,2}|roles\.\d\.(title|company|location|start|end|ongoing|context|bullets\.\d{1,2})|education\.\d\.(institution|qualification|field|location|start|end|details)|languages\.\d\.(title|proficiency))$/;
export function validateExtraction(
  v: unknown,
  pages: DocumentPage[],
): Extraction {
  if (
    !object(v) ||
    !exact(v, ["schemaVersion", "candidates", "warnings", "omittedPages"]) ||
    v.schemaVersion !== "cv-extraction/1" ||
    !Array.isArray(v.candidates) ||
    !v.candidates.length ||
    v.candidates.length > documentLimits.candidates ||
    !Array.isArray(v.warnings) ||
    v.warnings.length > 30 ||
    !v.warnings.every((x) => text(x, 500)) ||
    !Array.isArray(v.omittedPages) ||
    v.omittedPages.length > pages.length ||
    !v.omittedPages.every(
      (n) => Number.isInteger(n) && n >= 1 && n <= pages.length,
    )
  )
    throw new IntelligenceError("EXTRACTION_OUTPUT");
  const ids = new Set(),
    paths = new Set();
  for (const c of v.candidates) {
    if (
      !object(c) ||
      !exact(
        c,
        ["id", "path", "value", "page", "quote", "confidence"],
        ["warning"],
      ) ||
      !text(c.id, 80) ||
      !/^[A-Za-z0-9_-]+$/.test(c.id) ||
      ids.has(c.id) ||
      !text(c.path, 120) ||
      !candidatePath.test(c.path) ||
      paths.has(c.path) ||
      !text(c.value, 2000) ||
      (pages.length
        ? !Number.isInteger(c.page) ||
          (c.page as number) < 1 ||
          (c.page as number) > pages.length
        : c.page !== null) ||
      !text(c.quote, 2000) ||
      !["low", "medium", "high"].includes(c.confidence as string) ||
      (c.warning !== undefined && !text(c.warning, 500))
    )
      throw new IntelligenceError("EXTRACTION_OUTPUT");
    const source = pages[(c.page as number) - 1];
    if (source?.method === "text" && !source.text.includes(c.quote))
      throw new IntelligenceError("EVIDENCE_MISMATCH");
    // Scan transcriptions are explicitly uncertain; a claimed confidence does not verify them.
    if (source?.method !== "text" && !c.warning)
      c.warning = pages.length
        ? "Scan transcription requires review against the original page."
        : "Native Word excerpt requires review; original pagination is unknown.";
    if (
      /\.(start|end)$/.test(c.path) &&
      !/^(\d{4}|(0[1-9]|1[0-2])\/\d{4})$/.test(c.value)
    )
      throw new IntelligenceError("DATE_AMBIGUOUS");
    if (c.path.endsWith(".ongoing") && !["true", "false"].includes(c.value))
      throw new IntelligenceError("EXTRACTION_OUTPUT");
    ids.add(c.id);
    paths.add(c.path);
  }
  if (
    (v.candidates as Candidate[]).reduce(
      (n, c) => n + c.value.length + c.quote.length,
      0,
    ) > documentLimits.characters
  )
    throw new IntelligenceError("DOCUMENT_TEXT_LIMIT");
  return structuredClone(v) as unknown as Extraction;
}
export function validateQuestionPlan(
  v: unknown,
  targetId: string,
): QuestionPlan {
  if (
    !object(v) ||
    !exact(v, ["schemaVersion", "targetId", "questions"], ["goal"]) ||
    v.schemaVersion !== "career-question-plan/1" ||
    v.targetId !== targetId ||
    (v.goal !== undefined && !text(v.goal, 1000)) ||
    !Array.isArray(v.questions) ||
    !v.questions.length ||
    v.questions.length > 3
  )
    throw new IntelligenceError("QUESTION_OUTPUT");
  const ids = new Set();
  for (const q of v.questions) {
    if (
      !object(q) ||
      !exact(q, [
        "id",
        "dimension",
        "text",
        "why",
        "selectionMode",
        "options",
      ]) ||
      !text(q.id, 100) ||
      ids.has(q.id) ||
      ![
        "context",
        "ownership",
        "tools",
        "scale",
        "contribution",
        "impact",
        "complexity",
      ].includes(q.dimension as string) ||
      !text(q.text, 1000) ||
      !text(q.why, 1000) ||
      !["single", "multiple"].includes(q.selectionMode as string) ||
      !Array.isArray(q.options) ||
      q.options.length > 6 ||
      !q.options.every(
        (o) =>
          object(o) &&
          exact(o, ["id", "label"]) &&
          text(o.id, 80) &&
          text(o.label, 500),
      ) ||
      new Set(q.options.map((o) => (o as Record<string, unknown>).id)).size !==
        q.options.length
    )
      throw new IntelligenceError("QUESTION_OUTPUT");
    ids.add(q.id);
  }
  return structuredClone(v) as unknown as QuestionPlan;
}
export function validateRewrite(
  v: unknown,
  targetId: string,
  facts: { id: string; text: string }[],
): RoleRewrite {
  if (
    !object(v) ||
    !exact(v, ["schemaVersion", "targetId", "text", "factIds", "warnings"]) ||
    v.schemaVersion !== "career-role-rewrite/1" ||
    v.targetId !== targetId ||
    !text(v.text, 6000) ||
    !Array.isArray(v.factIds) ||
    !v.factIds.length ||
    v.factIds.length > 24 ||
    !v.factIds.every((id) => facts.some((f) => f.id === id)) ||
    new Set(v.factIds).size !== v.factIds.length ||
    !Array.isArray(v.warnings) ||
    v.warnings.length > 20 ||
    !v.warnings.every((x) => text(x, 500))
  )
    throw new IntelligenceError("REWRITE_OUTPUT");
  // Numeric tokens must occur in cited evidence. This is a guard, not proof of semantic entailment.
  const support = facts
    .filter((f) => v.factIds instanceof Array && v.factIds.includes(f.id))
    .map((f) => f.text)
    .join("\n");
  const supportedNumbers = new Set(support.match(/\d+(?:[.,]\d+)*%?/g) ?? []);
  for (const n of (v.text as string).match(/\d+(?:[.,]\d+)*%?/g) ?? [])
    if (!supportedNumbers.has(n))
      throw new IntelligenceError("UNSUPPORTED_METRIC");
  return structuredClone(v) as unknown as RoleRewrite;
}
export function isImportReview(v: unknown): v is ImportReview {
  if (
    !object(v) ||
    !exact(v, [
      "id",
      "sourceHash",
      "format",
      "parserVersion",
      "pages",
      "admission",
      "extraction",
      "confirmedIds",
    ]) ||
    !text(v.id, 100) ||
    typeof v.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.sourceHash) ||
    !["pdf", "docx", "doc"].includes(v.format as string) ||
    !text(v.parserVersion, 200) ||
    (v.format === "pdf"
      ? !Number.isInteger(v.pages) ||
        (v.pages as number) < 1 ||
        (v.pages as number) > 10
      : v.pages !== null) ||
    !Array.isArray(v.confirmedIds) ||
    v.confirmedIds.length > 250 ||
    !v.confirmedIds.every((x) => text(x, 100))
  )
    return false;
  try {
    validateAdmission(v.admission, (v.pages as number) ?? 0);
    const pages = Array.from({ length: (v.pages as number) ?? 0 }, (_, i) => ({
      number: i + 1,
      text: "",
      method: "scan" as const,
      warnings: [],
    }));
    const result = validateExtraction(structuredClone(v.extraction), pages);
    return v.confirmedIds.every((id) =>
      result.candidates.some((c) => c.id === id),
    );
  } catch {
    return false;
  }
}
export function answerEvidenceText(answer: {
  text: string;
  options?: QuestionOption[];
  selectedOptionIds?: string[];
  selectionMode?: "single" | "multiple";
}): string {
  const options = answer.options ?? [],
    ids = answer.selectedOptionIds ?? [];
  if (
    options.length > 6 ||
    ids.length > 6 ||
    options.some((o) => !text(o.id, 80) || !text(o.label, 500)) ||
    new Set(options.map((o) => o.id)).size !== options.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !options.some((o) => o.id === id)) ||
    (answer.selectionMode === "single" && ids.length > 1)
  )
    throw new IntelligenceError("INVALID_CHOICES");
  return [
    ...options.filter((o) => ids.includes(o.id)).map((o) => o.label),
    answer.text,
  ]
    .filter((x) => x.trim())
    .join("\n");
}
export type RoleRewriteReview = {
  id: string;
  proposal: RoleRewrite;
  input: import("./context.ts").CareerContext;
  status: "pending" | "accepted" | "rejected";
};
export function isRoleRewriteReview(v: unknown): v is RoleRewriteReview {
  if (
    !object(v) ||
    !exact(v, ["id", "proposal", "input", "status"]) ||
    !text(v.id, 100) ||
    !["pending", "accepted", "rejected"].includes(v.status as string) ||
    !object(v.input) ||
    !text(v.input.targetId, 100) ||
    !["ro", "en"].includes(v.input.locale as string) ||
    !Array.isArray(v.input.facts) ||
    v.input.facts.length > 24 ||
    !v.input.facts.every(
      (f) =>
        object(f) &&
        text(f.id, 100) &&
        text(f.text, 2000) &&
        text(f.sourceId, 100),
    )
  )
    return false;
  const p = v.proposal;
  if (
    !object(p) ||
    !exact(p, ["schemaVersion", "targetId", "text", "factIds", "warnings"]) ||
    p.schemaVersion !== "career-role-rewrite/1" ||
    p.targetId !== v.input.targetId ||
    !text(p.text, 6000, true) ||
    !Array.isArray(p.factIds) ||
    !p.factIds.length ||
    p.factIds.length > 24 ||
    !p.factIds.every((id) =>
      (v.input as { facts: { id: string }[] }).facts.some((f) => f.id === id),
    ) ||
    !Array.isArray(p.warnings) ||
    p.warnings.length > 20 ||
    !p.warnings.every((x) => text(x, 500))
  )
    return false;
  // Incomplete/edited pending wording can autosave; only accepted proposals must pass the acceptance guard.
  if (v.status !== "accepted") return true;
  try {
    validateRewrite(
      p,
      v.input.targetId,
      v.input.facts as { id: string; text: string }[],
    );
    return true;
  } catch {
    return false;
  }
}
