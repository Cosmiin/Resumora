import { z } from "zod";
import { TailorLanguageSchema } from "./tailor.ts";

export const TemplateIdSchema = z.enum(["classic", "modern", "compact"]);

/**
 * The language a new tailored CV starts in: "job" = the job ad's language,
 * "cv" = the base CV's language, otherwise always that language.
 */
export const TailoringLanguagePreferenceSchema = z.enum(["job", "cv", ...TailorLanguageSchema.options]);
export type TailoringLanguagePreference = z.infer<typeof TailoringLanguagePreferenceSchema>;

const displayName = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .transform((name) => name || null);

/** Account-wide preferences. A user who never saved any gets the defaults. */
export const PreferencesSchema = z
  .object({
    displayName,
    defaultTemplate: TemplateIdSchema,
    tailoringLanguage: TailoringLanguagePreferenceSchema,
  })
  .strict();
export type Preferences = z.infer<typeof PreferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = { displayName: null, defaultTemplate: "classic", tailoringLanguage: "job" };

/** Any subset of the preferences; at least one field. */
export const PreferencesPatchSchema = PreferencesSchema.partial().refine((patch) => Object.keys(patch).length > 0, {
  message: "Nothing to save",
});
export type PreferencesPatch = z.infer<typeof PreferencesPatchSchema>;
