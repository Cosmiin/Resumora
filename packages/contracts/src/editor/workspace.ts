import { isBaseDraft } from "./transport.ts";
import { isUuid } from "./identity.ts";

export const draftKinds = [
  "import-review",
  "translation-review",
  "resume",
] as const;
export type DraftKind = (typeof draftKinds)[number];
export type WorkspaceDraft<T = Record<string, unknown>> = {
  id: string;
  kind: DraftKind;
  revision: number;
  value: T;
  updatedAt: string;
};
export type CareerOperation = {
  id: string;
  kind: "questions" | "rewrite";
  state:
    "processing" | "ready" | "unknown" | "failed" | "accepted" | "rejected";
  input: Record<string, unknown>;
  result: unknown;
  createdAt: string;
};
export const resumeId = "00000000-0000-4000-8000-000000000001";
export const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max = 20000) =>
  typeof v === "string" && v.length <= max && !v.includes("\0");
export function validateWorkspaceValue(
  kind: DraftKind,
  value: unknown,
): Record<string, unknown> {
  if (
    !object(value) ||
    new TextEncoder().encode(JSON.stringify(value)).length > 900000
  )
    throw Error("invalidRequest");
  const allowed: Record<DraftKind, string[]> = {
    "import-review": [
      "draft",
      "selected",
      "targets",
      "ownerConfirmed",
      "profileId",
      "profileFingerprint",
    ],

    "translation-review": ["values", "confirmed", "step", "proposalId"],
    resume: ["route"],
  };
  if (Object.keys(value).some((k) => !allowed[kind].includes(k)))
    throw Error("invalidRequest");

  if (
    kind === "resume" &&
    (!string(value.route, 512) ||
      !/^#\/profile(?:\/|$)/.test(String(value.route)))
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.draft !== undefined &&
    !isBaseDraft(value.draft)
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.selected !== undefined &&
    (!Array.isArray(value.selected) ||
      value.selected.length > 250 ||
      !value.selected.every((v) => string(v, 256)))
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.targets !== undefined &&
    (!object(value.targets) ||
      Object.entries(value.targets).some(
        ([k, v]) => !string(k, 128) || !string(v, 128),
      ))
  )
    throw Error("invalidRequest");
  if (
    kind === "import-review" &&
    value.ownerConfirmed !== undefined &&
    typeof value.ownerConfirmed !== "boolean"
  )
    throw Error("invalidRequest");

  if (
    kind === "translation-review" &&
    (!object(value.values) ||
      Object.values(value.values).some((v) => !string(v)) ||
      !Array.isArray(value.confirmed) ||
      !value.confirmed.every((v) => string(v, 256)) ||
      !Number.isSafeInteger(value.step) ||
      Number(value.step) < 0 ||
      !isUuid(value.proposalId))
  )
    throw Error("invalidRequest");
  return value;
}
