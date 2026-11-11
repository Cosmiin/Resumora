import { useCallback } from "react";
import { en, type MessageKey } from "./en.ts";
import { ro } from "./ro.ts";
import { getLanguage, useLanguage, type Language } from "./language.ts";

type Vars = Record<string, string | number>;

/** Copy for `key` in `language`. A key Romanian doesn't have yet falls back to English. */
export function translate(language: Language, key: MessageKey, vars?: Vars): string {
  const text: string = (language === "ro" ? ro[key] : undefined) ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m)) : text;
}

/** Look up UI copy in the current language; `{name}` placeholders are filled from `vars`. */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(getLanguage(), key, vars);
}

/** Like `t`, but the component re-renders when the language changes. Use this in new screens. */
export function useT(): (key: MessageKey, vars?: Vars) => string {
  const language = useLanguage();
  return useCallback((key: MessageKey, vars?: Vars) => translate(language, key, vars), [language]);
}
