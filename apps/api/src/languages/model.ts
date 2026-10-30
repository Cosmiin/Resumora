import type { TranslationSource } from "@resumora/contracts/editor/languages";
import type {
  TranslationOutput,
  GlossaryEntry,
} from "@resumora/contracts/intelligence/translation";
import type {
  DraftSnapshot,
  EditorWireEnvelope,
} from "@resumora/contracts/editor/transport";
import type { CurrentJobDocument } from "@resumora/contracts/jobs/current-document";
export type {
  LanguageRequest,
  LanguageReview,
  LanguageProposal,
} from "@resumora/contracts/editor/language-transport";
import type {
  LanguageRequest,
  LanguageReview,
  LanguageProposal,
} from "@resumora/contracts/editor/language-transport";
export type LanguageContext = {
  source:
    | (Pick<DraftSnapshot, "id" | "revision" | "payload"> & {
        reason?: DraftSnapshot["reason"];
        documentId?: string;
        fingerprint: string;
        locale?: string;
      })
    | null;
  versions: {
    id: string;
    revision: number;
    locale: string;
    variantId?: string;
    documentId?: string;
    fingerprint?: string;
    translation?: unknown;
  }[];
};
export interface LanguageGateway {
  languageContext(jobId?: string): Promise<LanguageContext>;
  loadDraft(): Promise<DraftSnapshot | null>;
  loadBaseLanguage(
    variantId: string,
    snapshotId?: string,
  ): Promise<DraftSnapshot | null>;
  baseLanguageHistory(
    variantId: string,
    before?: number,
  ): Promise<DraftSnapshot[]>;
  writeBaseLanguage(input: {
    requestId: string;
    variantId: string;
    expectedRevision: number;
    payload: EditorWireEnvelope | null;
    restore?: string;
  }): Promise<DraftSnapshot>;
  loadCurrentJobDocument(
    jobId: string,
    locale?: string,
  ): Promise<CurrentJobDocument | null>;
  languageCommand(
    action: string,
    id: string,
    input?: unknown,
    secret?: string,
  ): Promise<
    LanguageProposal | { created: boolean; proposal: LanguageProposal }
  >;
  acceptLanguage(input: {
    operationId: string;
    requestId: string;
    reviewRevision: number;
    payload: EditorWireEnvelope;
    variantId: string;
  }): Promise<NonNullable<LanguageProposal["accepted"]>>;
}
