import type { EnvId } from "./environments";

export type Request =
  | { type: "getState" }
  | { type: "signIn"; email: string; password: string }
  | { type: "signOut" }
  | { type: "setEnvironment"; env: EnvId }
  | { type: "saveActiveTab" };

export interface PopupState {
  env: EnvId;
  email: string | null;
  environments: { id: EnvId; label: string; configured: boolean }[];
}

export type SignInReply =
  | { ok: true; state: PopupState }
  | { ok: false; message: string };
