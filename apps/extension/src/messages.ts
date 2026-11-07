import type { EnvId } from "./environments";

export type Request =
  | { type: "getState" }
  | { type: "signIn"; email: string; password: string }
  | { type: "signOut" }
  | { type: "setEnvironment"; env: EnvId }
  | { type: "checkActiveTab" }
  | { type: "saveActiveTab" };

export interface PopupState {
  env: EnvId;
  email: string | null;
  environments: { id: EnvId; label: string; configured: boolean }[];
}

export type SignInReply =
  | { ok: true; state: PopupState }
  | { ok: false; message: string };

export type CheckResult =
  | { kind: "capture" }
  | { kind: "capturing" }
  | { kind: "notJob" }
  | { kind: "couldntRead"; pasteUrl: string }
  | { kind: "cantRead" };

export type SaveResult =
  | { kind: "saved"; openUrl: string }
  | { kind: "existing"; openUrl: string }
  | { kind: "couldntRead"; pasteUrl: string }
  | { kind: "cantRead" }
  | { kind: "signedOut"; message: string | null }
  | { kind: "error"; message: string; requestId: string | null };
