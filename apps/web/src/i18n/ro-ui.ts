import type { uiEn } from "./en-ui.ts";

/** Romanian copy for the shared components. The type makes a missing or extra key a compile error. */
export const uiRo: Record<keyof typeof uiEn, string> = {
  "ui.close": "Închide",
  "ui.loading": "Se lucrează…",
  "ui.language.label": "Limba interfeței",
  "ui.language.en": "English",
  "ui.language.ro": "Română",
  "ui.diff.now": "Pe CV-ul tău acum",
  "ui.diff.suggested": "Propunere",
  "ui.diff.keep": "Păstrez varianta mea",
  "ui.diff.useNew": "Folosesc propunerea",
  "ui.diff.useGuess": "Da, e adevărat. Folosește-o",
  "ui.diff.chosen": "Ales",
  "ui.diff.edit": "Editez eu rândul nou",
  "ui.diff.saveEdit": "Salvează",
  "ui.diff.editLabel": "Editează punctul propus",
  "ui.diff.kept": "Păstrat",
  "ui.diff.usingNew": "Folosești propunerea",
  "ui.diff.usingEdit": "Folosești varianta editată",
  "ui.diff.checkTitle": "Te rog verifică rândul acesta",
  "ui.diff.checkText": "O parte din rândul acesta este presupunerea mea: nu apare în CV-ul sau în răspunsurile tale. Folosește-l doar dacă este adevărat.",
  "ui.diff.noChange": "Punctul acesta se potrivește deja cu jobul. Nu propunem nicio schimbare.",
};
