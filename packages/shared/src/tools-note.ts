/**
 * The note the Enrich Tools step saves on a role: its question and its "none" answer, in each app language.
 * The web's copy (en-basecv / ro-basecv) uses these, and the skills route reads them to find the tools a person ticked.
 */
export const TOOLS_NOTE = {
  en: { question: "Which tools did you use?", none: "None of these" },
  ro: { question: "Ce instrumente ai folosit?", none: "Niciunul dintre acestea" },
} as const;
