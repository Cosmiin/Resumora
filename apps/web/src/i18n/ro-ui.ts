import type { uiEn } from "./en-ui.ts";

/** Romanian copy for the shared components. The type makes a missing or extra key a compile error. */
export const uiRo: Record<keyof typeof uiEn, string> = {
  "ui.close": "Închide",
  "ui.loading": "Se lucrează…",
  "ui.language.label": "Limba interfeței",
  "ui.language.en": "English",
  "ui.language.ro": "Română",
  "ui.diff.now": "Acum:",
  "ui.diff.suggested": "Rândul propus",
  "ui.diff.keep": "Păstrez rândul meu",
  "ui.diff.useNew": "Folosesc propunerea",
  "ui.diff.useGuess": "Da, e adevărat. Folosește-o",
  "ui.diff.edit": "Editez rândul",
  "ui.diff.saveEdit": "Salvează",
  "ui.diff.editLabel": "Editează punctul propus",
  "ui.diff.kept": "Păstrat",
  "ui.diff.usingNew": "Folosești propunerea",
  "ui.diff.usingEdit": "Folosești varianta editată",
  "ui.diff.checkTitle": "O parte din rândul acesta este presupunerea mea",
  "ui.diff.guess": "Am scris",
  "ui.diff.checkAsk": "Ai făcut asta în acest rol?",
  "ui.diff.checkText": "Nu apare în CV-ul sau în răspunsurile tale.",
  "ui.diff.noChange": "Punctul acesta se potrivește deja cu jobul. Nu propunem nicio schimbare.",
};
