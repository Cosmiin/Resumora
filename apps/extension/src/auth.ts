import {
  createClient,
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { copy } from "./copy";
import type { EnvConfig, EnvId } from "./environments";
import type { KeyValueStorage } from "./storage";

export const AUTH_TIMEOUT_MS = 20_000;

export interface Auth {
  email(env: EnvId): Promise<string | null>;
  signIn(env: EnvId, email: string, password: string): Promise<
    { ok: true; email: string } | { ok: false; message: string }
  >;
  signOut(env: EnvId): Promise<void>;
  accessToken(env: EnvId): Promise<{ token: string } | { expired: true } | { offline: true } | null>;
  refresh(env: EnvId): Promise<string | null>;
}

export function createAuth(deps: {
  storage: KeyValueStorage;
  environments: Record<EnvId, EnvConfig>;
  fetch?: typeof fetch;
}): Auth {
  const clients = new Map<EnvId, SupabaseClient>();
  const storageKey = (env: EnvId) => `resumora-auth-${env}`;
  const clientFor = (env: EnvId) => {
    const config = deps.environments[env];
    if (!config.configured) return null;
    let client = clients.get(env);
    if (!client) {
      client = createClient(config.supabaseUrl, config.supabaseKey, {
        auth: {
          storage: {
            getItem: (key) => deps.storage.get(key),
            setItem: (key, value) => deps.storage.set(key, value),
            removeItem: (key) => deps.storage.remove(key),
          },
          storageKey: storageKey(env),
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: (input, init) => {
            const timeout = AbortSignal.timeout(AUTH_TIMEOUT_MS);
            const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            return (deps.fetch ?? fetch)(input, {
              ...init,
              signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            });
          },
        },
      });
      clients.set(env, client);
    }
    return client;
  };
  const signInError = (env: EnvId, error: unknown) => {
    if (isAuthError(error)) {
      if (error.code === "invalid_credentials") return copy.wrongPassword;
      if (error.code === "email_not_confirmed") return copy.confirmEmail;
    }
    return isAuthRetryableFetchError(error) && error.status === 0
      ? copy.cantReach(env)
      : copy.somethingWrong;
  };

  return {
    async email(env) {
      if (!deps.environments[env].configured) return null;
      const stored = await deps.storage.get(storageKey(env));
      if (!stored) return null;
      try {
        const email = JSON.parse(stored)?.user?.email;
        return typeof email === "string" ? email : null;
      } catch {
        return null;
      }
    },
    async signIn(env, email, password) {
      try {
        const client = clientFor(env);
        if (!client) return { ok: false, message: copy.somethingWrong };
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) return { ok: false, message: signInError(env, error) };
        return { ok: true, email: data.user.email ?? email };
      } catch (error) {
        return { ok: false, message: signInError(env, error) };
      }
    },
    async signOut(env) {
      try {
        await clientFor(env)?.auth.signOut({ scope: "local" });
      } finally {
        await deps.storage.remove(storageKey(env));
      }
    },
    async accessToken(env) {
      const client = clientFor(env);
      if (!client) return null;
      // Supabase retries refresh failures, so limit the whole session lookup too.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        client.auth.getSession(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), AUTH_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));
      if (!result) return { offline: true };
      const { data, error } = result;
      if (data.session) return { token: data.session.access_token };
      if (error) {
        if (isAuthRetryableFetchError(error)) return { offline: true };
        await deps.storage.remove(storageKey(env));
        return { expired: true };
      }
      return null;
    },
    async refresh(env) {
      try {
        const client = clientFor(env);
        if (!client) return null;
        const { data, error } = await client.auth.refreshSession();
        return error ? null : data.session?.access_token ?? null;
      } catch {
        return null;
      }
    },
  };
}
