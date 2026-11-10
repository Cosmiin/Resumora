import { useSyncExternalStore } from "react";

/** Interface languages. CV text has its own language and is not affected by this. */
export const LANGUAGES = ["en", "ro"] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = "resumora.language";
const listeners = new Set<() => void>();

function read(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ro" || saved === "en") return saved;
  } catch {
    // Storage can be blocked (private window); fall through to the default.
  }
  return "en";
}

let current: Language = read();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // The choice still holds for this visit.
  }
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current interface language; the component re-renders when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
