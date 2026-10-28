/** Prepared paste-only boundary. No IO, ownership grant, extraction or publication. */
export const jobIntakeLimits = {
  textCharacters: 200_000,
  metadataCharacters: 20_000,
  urlCharacters: 2_048,
  jsonBytes: 1_048_576,
} as const;

/** Browser selectors only; the authenticated server must resolve all lineage. */
export type BaseCvSelection = {
  documentId: string;
  versionId: string;
  profileVersionId: string;
};
export type JobIntake = {
  text: string;
  title?: string;
  company?: string;
  location?: string;
  sourceUrl?: string;
  baseCv?: BaseCvSelection;
};
export type JobIntakeIssue = {
  field: string;
  code: 'invalid_shape' | 'unknown_field' | 'required' | 'invalid_text' | 'too_long' | 'invalid_url' | 'invalid_id' | 'too_large';
};
export type JobIntakeResult = { ok: true; value: JobIntake } | { ok: false; issues: JobIntakeIssue[] };

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// PostgreSQL JSON/text cannot preserve NUL or unpaired UTF-16 surrogates.
const validText = (value: string) => !/[\u0000\uD800-\uDFFF]/u.test(value);
const characters = (value: string) => Array.from(value).length;

/** Errors contain field/code only: never echo pasted text, URLs or identifiers. */
export function normalizeJobIntake(input: unknown): JobIntakeResult {
  if (!record(input)) return { ok: false, issues: [{ field: '$', code: 'invalid_shape' }] };
  const issues: JobIntakeIssue[] = [];
  const issue = (field: string, code: JobIntakeIssue['code']) => { issues.push({ field, code }); };
  const fields = ['text', 'title', 'company', 'location', 'sourceUrl', 'baseCv'];
  if (Object.keys(input).some(key => !fields.includes(key))) issue('$', 'unknown_field');
  const value: JobIntake = { text: '' };
  if (typeof input.text !== 'string') issue('text', 'required');
  else if (input.text.length > jobIntakeLimits.textCharacters * 2) issue('text', 'too_long');
  else if (!validText(input.text)) issue('text', 'invalid_text');
  else if (!input.text.trim()) issue('text', 'required');
  else if (characters(input.text) > jobIntakeLimits.textCharacters) issue('text', 'too_long');
  else value.text = input.text; // Do not trim, translate, normalize Unicode or line endings.

  for (const field of ['title', 'company', 'location', 'sourceUrl'] as const) {
    if (!Object.hasOwn(input, field)) continue;
    const raw = input[field];
    const limit = field === 'sourceUrl' ? jobIntakeLimits.urlCharacters : jobIntakeLimits.metadataCharacters;
    if (typeof raw !== 'string' || !validText(raw)) { issue(field, 'invalid_text'); continue; }
    if (raw.length > limit * 2 || characters(raw) > limit) { issue(field, 'too_long'); continue; }
    const trimmed = raw.trim();
    if (!trimmed) continue; // Blank optional form fields mean absent, never fabricated.
    if (field === 'sourceUrl') {
      try {
        const url = new URL(trimmed);
        if (!/^https?:\/\//i.test(trimmed) || !['http:', 'https:'].includes(url.protocol)
          || !url.hostname || url.username || url.password || /[\s\u0000-\u001f\u007f\\]/u.test(trimmed)) throw new Error();
      } catch { issue(field, 'invalid_url'); continue; }
    }
    value[field] = trimmed; // URL parsing validates syntax only; retain supplied spelling.
  }
  if (Object.hasOwn(input, 'baseCv')) {
    const selected = input.baseCv;
    const keys = ['documentId', 'versionId', 'profileVersionId'] as const;
    if (!record(selected)) issue('baseCv', 'invalid_shape');
    else {
      if (Object.keys(selected).some(key => !keys.includes(key as typeof keys[number]))) issue('baseCv', 'unknown_field');
      for (const field of keys) {
        if (typeof selected[field] !== 'string' || !uuid.test(selected[field])) issue(`baseCv.${field}`, 'invalid_id');
      }
      if (keys.every(field => typeof selected[field] === 'string' && uuid.test(selected[field]))) {
        value.baseCv = { documentId: selected.documentId as string, versionId: selected.versionId as string,
          profileVersionId: selected.profileVersionId as string };
      }
    }
  }
  if (issues.length) return { ok: false, issues };
  if (new TextEncoder().encode(JSON.stringify(value)).length > jobIntakeLimits.jsonBytes) {
    return { ok: false, issues: [{ field: '$', code: 'too_large' }] };
  }
  return { ok: true, value };
}

export type JobMappingPreview = {
  /** Candidate fields for confirm_job.p_input, NOT a validated reviewed-job command. */
  reviewedInput: { captureKind: 'paste'; text: string; title?: string; company?: string; location?: string; requirements: [] };
  deferred: { sourceUrl?: string; requestedBase?: BaseCvSelection };
  extractionState: 'pending';
  publicationBlockers: ('review_required' | 'title_required' | 'company_required' | 'source_url_persistence_unavailable')[];
};

/** Revalidates even typed callers; no partial success or silent metadata loss. */
export function previewJobMapping(input: unknown):
  { ok: true; value: JobMappingPreview } | { ok: false; issues: JobIntakeIssue[] } {
  const parsed = normalizeJobIntake(input);
  if (!parsed.ok) return parsed;
  const { text, title, company, location, sourceUrl, baseCv } = parsed.value;
  const reviewedInput: JobMappingPreview['reviewedInput'] = { captureKind: 'paste', text, requirements: [] };
  if (title !== undefined) reviewedInput.title = title;
  if (company !== undefined) reviewedInput.company = company;
  if (location !== undefined) reviewedInput.location = location;
  const deferred: JobMappingPreview['deferred'] = {};
  if (sourceUrl !== undefined) deferred.sourceUrl = sourceUrl;
  if (baseCv !== undefined) deferred.requestedBase = { ...baseCv };
  const publicationBlockers: JobMappingPreview['publicationBlockers'] = ['review_required'];
  if (!title) publicationBlockers.push('title_required');
  if (!company) publicationBlockers.push('company_required');
  if (sourceUrl) publicationBlockers.push('source_url_persistence_unavailable');
  return { ok: true, value: { reviewedInput, deferred, extractionState: 'pending', publicationBlockers } };
}
