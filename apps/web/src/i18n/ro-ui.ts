import type { uiEn } from "./en-ui.ts";

/** Romanian copy for the shared components. The type makes a missing or extra key a compile error. */
export const uiRo: Record<keyof typeof uiEn, string> = {
  "ui.close": "Închide",
  "ui.loading": "Se lucrează…",
  "ui.language.label": "Limba interfeței",
  "ui.language.en": "English",
  "ui.language.ro": "Română",
  "ui.diff.now": "Acum",
  "ui.diff.suggested": "Propunere",
  "ui.diff.keep": "Păstrez",
  "ui.diff.useNew": "Folosesc propunerea",
  "ui.diff.edit": "Editez",
  "ui.diff.saveEdit": "Salvează",
  "ui.diff.editLabel": "Editează punctul propus",
  "ui.diff.kept": "Păstrat",
  "ui.diff.usingNew": "Folosești propunerea",
  "ui.diff.usingEdit": "Folosești varianta editată",
  "ui.diff.inferred": "Dedus, te rog confirmă",
  "ui.diff.noChange": "Punctul acesta se potrivește deja cu jobul. Nu propunem nicio schimbare.",
};
