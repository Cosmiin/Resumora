import { canonicalContentLocale, contentLocale, hasReliableContentLanguage, hasSubstantialLanguageNarrative } from '@resumora/contracts/editor/content-language';
import type { BaseDraft } from '@resumora/contracts/editor/model';
/** Historical default RO/EN keys stay stable; explicit other regions/scripts are independent. */
export function jobLocaleKey(value: unknown): string | null {
 const locale=canonicalContentLocale(value);
 return locale==='ro-RO'?'ro':locale==='en-GB'?'en':locale;
}
/** A job copy owns its language, even when cloned from a differently detected Base. */
export function jobDocumentLocale(draft: BaseDraft, value: unknown): void {
 const locale=canonicalContentLocale(value);if(!locale)throw Error('CONTENT_LOCALE_INVALID');
 // Legacy keys encode the established display locales.
 const resolved=locale==='ro'?'ro-RO':locale==='en'?'en-GB':locale;
 if(jobLocaleKey(contentLocale(draft))===jobLocaleKey(locale))return;
 draft.language=resolved;draft.documentLocale=resolved;
 draft.contentLanguage={locale:resolved,confidence:'high',source:'translation',policyVersion:'cv-language/1'};
 if(draft.translation)draft.translation.documentLocale=resolved;
}

/** Existing accepted job copies own an explicit locale. Legacy Base prose needs
 * its bounded detection before a vacancy can trigger content generation. */
export async function requireJobContentLanguage(draft: BaseDraft, savedDocument = false): Promise<void> {
 if(savedDocument)return;
 if(draft.contentLanguage?.status==='unavailable')throw Error('CONTENT_LANGUAGE_UNAVAILABLE');
 if(hasSubstantialLanguageNarrative(draft)&&!await hasReliableContentLanguage(draft))throw Error('CONTENT_LANGUAGE_REQUIRED');
}
