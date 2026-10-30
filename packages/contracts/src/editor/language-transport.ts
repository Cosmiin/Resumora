import type { BaseDraft } from "./model.ts";
import type { TranslationSource } from "./languages.ts";
import type {
  TranslationItem,
  TranslationOutput,
  GlossaryEntry,
} from "../intelligence/translation.ts";
export type LanguageRequest = {
  source: TranslationSource;
  sourceLocale: string;
  targetLocale: string;
  targetRevision: number;
  targetDocumentId: string | null;
  variantId: string;
  sectionIds: string[];
  glossary: GlossaryEntry[];
};
export type LanguageReview = {
  values: { id: string; text: string }[];
  confirmed: string[];
};
export type LanguageAccepted = {
  kind: "base" | "job";
  id: string;
  revision: number;
  variantId?: string;
  jobId?: string;
  documentId?: string;
  locale?: string;
};
export type LanguageProposal = {
  id: string;
  request: LanguageRequest;
  state:
    | "pending"
    | "processing"
    | "ready"
    | "accepted"
    | "cancelled"
    | "failed"
    | "stale"
    | "unknown";
  step: number;
  reviewRevision: number;
  output: TranslationOutput | null;
  review: LanguageReview | null;
  accepted: LanguageAccepted | null;
};
export type LanguageVersionInfo = {
  id: string;
  revision: number;
  locale: string;
  variantId?: string;
  documentId?: string;
  fingerprint?: string;
  translation?: unknown;
};
export type DocumentLanguageContext = {
  source: {
    pin: TranslationSource;
    locale: string;
    draft: BaseDraft;
    items: TranslationItem[];
    accepted: boolean;
  } | null;
  versions: LanguageVersionInfo[];
};
