import { canonicalContentLocale, contentLocale, isDocumentLabels } from './content-language.ts';
import type { BaseDraft } from './model.ts';

/** Shared preview/export localization contract; bounded once per document locale. */
export const documentLabelKeys = [
  'identity', 'summary', 'professionalSkills', 'technicalSkills', 'experience',
  'education', 'projects', 'certifications', 'languages', 'volunteering', 'custom',
  'present', 'ongoing', 'native', 'unknownDate', 'durationUnavailable',
  'totalExperience', 'incompleteDates', 'yourName', 'role', 'company', 'institution',
  'email', 'phone', 'location', 'address', 'link',
] as const;
export type DocumentLabels = Record<typeof documentLabelKeys[number], string>;
const ro = ['Despre tine', 'Rezumat profesional', 'Competențe profesionale', 'Competențe tehnice', 'Experiență profesională', 'Studii', 'Proiecte', 'Certificări', 'Limbi', 'Voluntariat', 'Secțiune proprie', 'Prezent', 'În curs', 'Nativ', 'Dată necunoscută', 'Durată indisponibilă', 'Experiență totală', 'Unele perioade nu sunt disponibile sau verificate.', 'Numele tău', 'Rol', 'Companie', 'Instituție', 'E-mail', 'Telefon', 'Localitate', 'Adresă', 'Link'];
const en = ['About you', 'Professional Summary', 'Professional skills', 'Technical skills', 'Professional experience', 'Education', 'Projects', 'Certifications', 'Languages', 'Volunteering', 'Custom section', 'Present', 'Ongoing', 'Native', 'Date unknown', 'Duration unavailable', 'Total experience', 'Some role dates are unavailable or unreviewed.', 'Your name', 'Role', 'Company', 'Institution', 'Email', 'Phone', 'Location', 'Address', 'Link'];
export function isCompleteDocumentLabels(value: unknown): value is DocumentLabels {
  return isDocumentLabels(value) && Object.keys(value).length === documentLabelKeys.length &&
    documentLabelKeys.every(key => Object.hasOwn(value, key));
}
export function builtInDocumentLabels(locale: string): DocumentLabels | null {
  const canonical = canonicalContentLocale(locale);
  if (!canonical) return null;
  const primary = new Intl.Locale(canonical).language;
  const labels = primary === 'ro' ? ro : primary === 'en' ? en : null;
  return labels ? Object.fromEntries(documentLabelKeys.map((key, index) => [key, labels[index]])) as DocumentLabels : null;
}
/** Missing non-built-in resources are explicit, never an English fallback. */
export function documentLabels(draft: BaseDraft): DocumentLabels | null {
  const locale = contentLocale(draft);
  const decision = draft.contentLanguage;
  if (decision?.status === "unavailable") return null;
  return builtInDocumentLabels(locale) ??
    (decision?.locale === locale && isCompleteDocumentLabels(decision.labels) ? decision.labels : null);
}

export const builtinDocumentLabels = builtInDocumentLabels;
