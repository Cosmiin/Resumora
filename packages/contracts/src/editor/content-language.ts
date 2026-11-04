import { isAccepted, type BaseDraft, type Fact } from './model.ts';
import { currentWording, isWordingFieldVisible } from './wording.ts';

/** Validated at wire boundaries with canonicalContentLocale. UI Locale remains ro | en. */
export type ContentLocale = string;
export type ContentLanguageDecision = {
  locale: ContentLocale;
  confidence: 'low' | 'medium' | 'high';
  /** Explicit provisional/unsupported outcome; absent on compatible historical decisions. */
  status?: 'detected' | 'insufficient' | 'unavailable';
  source: 'import' | 'narrative' | 'user-correction' | 'translation';
  policyVersion: 'cv-language/1';
  narrativeFingerprint?: string;
  labels?: Record<string, string>;
};
export const contentLanguagePolicyVersion = 'cv-language/1' as const;

/** Only language tags, never free-form language names or prompt instructions. */
export function canonicalContentLocale(value: unknown): ContentLocale | null {
  if (typeof value !== 'string' || value.length > 35 ||
      !/^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*$/.test(value)) return null;
  try {
    const canonical = Intl.getCanonicalLocales(value)[0];
    const primary = new Intl.Locale(canonical).language;
    if (['und', 'mul', 'zxx'].includes(primary) ||
        new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(primary) === undefined) return null;
    return canonical;
  } catch {
    return null;
  }
}
export function isDocumentLabels(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length <= 64 && JSON.stringify(value).length <= 12000 &&
    Object.entries(value).every(([key, label]) =>
      /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key) &&
      typeof label === 'string' && !!label.trim() && label.length <= 500 && !/[\u0000-\u001f\u007f]/.test(label));
}
export function isContentLanguageDecision(value: unknown): value is ContentLanguageDecision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return ['locale', 'confidence', 'source', 'policyVersion'].every(k => Object.hasOwn(v, k)) &&
    Object.keys(v).every(k => ['locale', 'confidence', 'source', 'policyVersion', 'narrativeFingerprint', 'labels', 'status'].includes(k)) &&
    typeof v.locale === "string" && canonicalContentLocale(v.locale) === v.locale &&
    typeof v.confidence === 'string' && ['low', 'medium', 'high'].includes(v.confidence) &&
    typeof v.source === 'string' && ['import', 'narrative', 'user-correction', 'translation'].includes(v.source) &&
    v.policyVersion === contentLanguagePolicyVersion &&
    (v.status === undefined || ['detected', 'insufficient', 'unavailable'].includes(v.status as string)) &&
    (v.narrativeFingerprint === undefined || (typeof v.narrativeFingerprint === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(v.narrativeFingerprint))) &&
    (v.labels === undefined || isDocumentLabels(v.labels));
}
type LanguageDraft = Pick<BaseDraft, 'language' | 'documentLocale' | 'contentLanguage' | 'translation'>;
/** Saved translation target, persisted decision, then historical/UI-derived fallback. */
export function contentLocale(draft: LanguageDraft): ContentLocale {
  const translated = canonicalContentLocale(draft.translation?.documentLocale);
  if (translated) return translated;
  if (isContentLanguageDecision(draft.contentLanguage)) return draft.contentLanguage.locale;
  return canonicalContentLocale(draft.documentLocale) ?? canonicalContentLocale(draft.language) ?? 'ro';
}
/** Primary language compatibility for existing prompt consumers; never collapses to English. */
export function contentLanguage(draft: LanguageDraft): string {
  return new Intl.Locale(contentLocale(draft)).language;
}
export function canCorrectContentLanguage(draft: LanguageDraft): boolean {
  return !draft.translation && isContentLanguageDecision(draft.contentLanguage) &&
    ['import', 'narrative'].includes(draft.contentLanguage.source) && draft.contentLanguage.confidence !== 'high';
}
/** Visible connected professional prose only. Names, titles, skills, language lists,
 * source quotations and raw Q&A cannot determine a CV's language. Detection thresholds
 * and fingerprints belong to the bounded inference operation, not this projection. */
export function languageNarrative(draft: BaseDraft): string {
  const parts: string[] = [];
  const hidden = new Set(draft.presentation.hiddenFields ?? []);
  const visible = (section: string) => draft.presentation.order.includes(section) && !draft.presentation.hidden.includes(section);
  const add = (text: string) => { if (text.trim()) parts.push(text.trim()); };
  const field = (f: Fact<string>) => { if (!hidden.has(f.fieldId) && isAccepted(f)) add(f.value); };
  if (visible('summary') && !hidden.has('summary') && !hidden.has(draft.summary.id)) add(draft.summary.text);
  const entry = (id: string, prose: Fact<string>, bullets: Fact<string>[]) => {
    const wording = currentWording(draft, id);
    if (wording && isWordingFieldVisible(draft, id)) add(wording);
    else field(prose);
    if (wording && draft.presentation.approvedWording?.[id]?.scope === 'experience') return;
    if (!hidden.has(`${id}-contributions`)) bullets.forEach(field);
  };
  if (visible('experience')) draft.roles.forEach(r => entry(r.id, r.context, r.bullets));
  if (visible('education')) draft.education.forEach(e => field(e.details));
  draft.optionalSections.filter(s => s.kind !== 'languages' && visible(s.id)).forEach(s => s.entries.forEach(e => entry(e.id, e.details, e.bullets ?? [])));
  return parts.join('\n').slice(0, 16000);
}
export function languageInstruction(locale: unknown): string {
  const canonical = canonicalContentLocale(locale);
  if (!canonical) throw new Error('CONTENT_LOCALE_INVALID');
  return `Write all generated user-facing prose in the CV content language (${canonical}). Preserve source quotations, names, established technology terms, numbers and facts exactly. Answers and job adverts in another language do not change the CV language. Keep JSON keys and enum values unchanged. If you cannot reliably produce this language, return an explicit unsupported-language result; never silently substitute another language.`;
}

async function languageHash(input: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))))
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
export const languageNarrativeFingerprint = (draft: BaseDraft): Promise<string> => languageHash(languageNarrative(draft));
/** Settled document language remains authoritative as accepted prose evolves. Provisional decisions may re-evaluate. */
export async function hasReliableContentLanguage(draft: BaseDraft): Promise<boolean> {
  const decision = draft.contentLanguage;
  if (draft.translation || decision?.source === 'translation' || decision?.source === 'user-correction') return true;
  if (!decision || decision.status === 'insufficient' || decision.status === 'unavailable') return false;
  return decision.source === 'import' || decision.source === 'narrative';
}
/** Stable across metadata autosaves/UI changes; changed narrative or explicit correction gets a fresh receipt. */
export async function languageDetectionOperationId(draft: BaseDraft, attempt = 0): Promise<string> {
  if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt > 3) throw Error("LANGUAGE_ATTEMPT_INVALID");
  const reliable = await hasReliableContentLanguage(draft);
  const hash = await languageHash(JSON.stringify([contentLanguagePolicyVersion, draft.id,
    await languageNarrativeFingerprint(draft), contentLocale(draft),
    reliable ? draft.contentLanguage?.source ?? 'translation' : null, ...(attempt ? [attempt] : [])]));
  const id = hash.slice(0, 32).split(''); id[12] = '4'; id[16] = '8';
  const v = id.join('');
  return `${v.slice(0,8)}-${v.slice(8,12)}-${v.slice(12,16)}-${v.slice(16,20)}-${v.slice(20)}`;
}

/** Conservative connected-prose threshold shared by scheduling and the API gate. */
export function hasSubstantialLanguageNarrative(draft: BaseDraft): boolean {
  const narrative = languageNarrative(draft);
  return narrative.replace(/\s/gu, '').length >= 100 &&
    ((narrative.match(/[\p{L}\p{M}]+/gu)?.length ?? 0) >= 16 ||
      // Unspaced writing systems must not depend on a privileged script list.
      (narrative.match(/[\p{L}\p{M}]/gu)?.length ?? 0) >= 100);
}
