import { boundedJson } from "../ai/http.ts";
import {
  isAuthApiError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
} from "@supabase/auth-js";
import type { AuthError } from "@supabase/auth-js";
import { config, readCookie, writeCookie, clearCookie } from "./cookies.ts";
import {
  createAuth,
  authHeaders,
  authJson,
  authError,
  saveSession,
  verifySession,
  checkWrite,
  clearAuth,
} from "./session.ts";
import type {
  AuthConfig,
  SessionCookie,
  BrowserCookie,
  FlowCookie,
} from "./session.ts";

export const authMethods: Readonly<Record<string, string>> = {
  "/v1/auth/session": "GET",
  "/v1/auth/signup": "POST",
  "/v1/auth/login": "POST",
  "/v1/auth/logout": "POST",
  "/v1/auth/recovery": "POST",
  "/v1/auth/password": "POST",
  "/v1/auth/callback/confirm": "GET",
  "/v1/auth/callback/recovery": "GET",
};
const generic = {
  message:
    "If an eligible account exists, check your email. Use this browser to open the link.",
};
// Serializes password completion in the supported local Worker isolate, without retaining passwords.
const completions = new Set<string>();
// SDK transport/protocol errors can have status 0 or a synthetic 400. Only
// actual provider rejections should be interpreted as account/input failures.
function providerFailure(
  error: AuthError | null,
  headers: Headers,
): Response | null {
  if (!error) return null;
  if (error.status === 429) {
    headers.set("Retry-After", "60");
    return authError("RATE_LIMITED", 429, headers);
  }
  if (
    (!isAuthApiError(error) &&
      !isAuthSessionMissingError(error) &&
      !isAuthWeakPasswordError(error)) ||
    ![400, 401, 403, 422].includes(error.status ?? 0)
  ) {
    return authError("AUTH_UNAVAILABLE", 503, headers);
  }
  return null;
}
export async function authRoute(
  request: Request,
  env: AuthConfig,
  transport: typeof fetch = fetch,
): Promise<Response> {
  const headers = authHeaders();
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method !== authMethods[path]) {
    headers.set("Allow", authMethods[path]);
    return authError("METHOD_NOT_ALLOWED", 405, headers);
  }
  let cfg;
  try {
    cfg = config(env);
  } catch {
    return authError("AUTH_UNCONFIGURED", 503, headers);
  }
  try {
    if (path.includes("/callback/")) {
      const flow = await readCookie<FlowCookie>(request, env, "flow");
      clearCookie(headers, env, "flow");
      const purpose = path.endsWith("/recovery") ? "recovery" : "confirm";
      const code = url.searchParams.get("code");
      let success = false;
      if (
        flow?.purpose === purpose &&
        code &&
        code.length < 2048 &&
        url.searchParams.getAll("code").length === 1 &&
        !url.searchParams.has("error")
      ) {
        const auth = createAuth(env, flow.storage, transport);
        let recoveryEvent = false;
        const subscription = auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") recoveryEvent = true;
        });
        const { data, error } = await auth.exchangeCodeForSession(code);
        subscription.data.subscription.unsubscribe();
        if (
          !error &&
          data.session &&
          (purpose !== "recovery" || recoveryEvent)
        ) {
          const verified = await auth.getUser(data.session.access_token);
          if (
            !verified.error &&
            verified.data.user?.id === data.session.user.id &&
            verified.data.user.email_confirmed_at
          ) {
            await saveSession(
              headers,
              env,
              data.session,
              purpose === "recovery",
            );
            success = true;
          }
        }
      }
      headers.set(
        "Location",
        cfg.app +
          (success
            ? purpose === "recovery"
              ? "/reset-password"
              : "/"
            : "/?auth=link-invalid"),
      );
      return new Response(null, { status: 303, headers });
    }
    if (path === "/v1/auth/session") {
      const verified = await verifySession(request, env, headers, transport);
      let csrf = verified?.cookie.csrf;
      if (!csrf) {
        const browser = await readCookie<BrowserCookie>(
          request,
          env,
          "browser",
        );
        csrf = browser?.csrf ?? crypto.randomUUID();
        if (!browser)
          await writeCookie(headers, env, "browser", { csrf }, 3600);
      }
      return authJson(
        {
          user: verified?.user ?? null,
          csrfToken: csrf,
          recovery: verified?.cookie.recovery ?? false,
        },
        200,
        headers,
      );
    }
    if (!(await checkWrite(request, env)))
      return authError("FORBIDDEN", 403, headers);
    let body: Record<string, unknown>;
    try {
      const value = await boundedJson(new Response(request.body), 8192);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw Error();
      body = value as Record<string, unknown>;
    } catch {
      return authError("INVALID_INPUT", 400, headers);
    }
    if (path === "/v1/auth/logout") {
      const cookie = await readCookie<SessionCookie>(request, env, "session");
      clearAuth(headers, env);
      if (cookie) {
        // Supported Auth admin signOut calls /logout with the user's JWT, never a service role key.
        const { error } = await createAuth(env, {}, transport).admin.signOut(
          cookie.access,
          "local",
        );
        if (error && ![401, 403, 404].includes(error.status ?? 0))
          return authError("LOGOUT_INCOMPLETE", 503, headers);
      }
      return authJson({ message: "Signed out." }, 200, headers);
    }
    if (path === "/v1/auth/password") {
      const verified = await verifySession(request, env, headers, transport);
      if (!verified?.cookie.recovery)
        return authError("UNAUTHORIZED", 401, headers);
      if (
        typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > 128
      )
        return authError("INVALID_INPUT", 400, headers);
      // A fresh refresh validates revocation before update, rather than trusting an issued JWT after logout.
      const lock = verified.cookie.refresh;
      if (completions.has(lock))
        return authError("RECOVERY_IN_PROGRESS", 409, headers);
      completions.add(lock);
      try {
        const auth = createAuth(env, {}, transport);
        const refreshed = await auth.refreshSession({ refresh_token: lock });
        if (
          refreshed.error ||
          !refreshed.data.session ||
          refreshed.data.user?.id !== verified.user.id
        ) {
          clearAuth(headers, env);
          return authError("UNAUTHORIZED", 401, headers);
        }
        const result = await auth.updateUser({ password: body.password });
        const ended = await auth.signOut({ scope: "local" });
        clearAuth(headers, env);
        if (result.error)
          return authError("PASSWORD_UPDATE_FAILED", 400, headers);
        if (ended.error) return authError("LOGOUT_INCOMPLETE", 503, headers);
        return authJson(
          { message: "Password updated. Sign in with your new password." },
          200,
          headers,
        );
      } finally {
        completions.delete(lock);
      }
    }
    const email = body.email;
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      return authError("INVALID_INPUT", 400, headers);
    if (
      path !== "/v1/auth/recovery" &&
      (typeof body.password !== "string" ||
        body.password.length < (path === "/v1/auth/login" ? 1 : 8) ||
        body.password.length > 128)
    )
      return authError("INVALID_INPUT", 400, headers);
    if (path === "/v1/auth/login") {
      const auth = createAuth(env, {}, transport);
      const { data, error } = await auth.signInWithPassword({
        email,
        password: body.password as string,
      });
      const failure = providerFailure(error, headers);
      if (failure) return failure;
      if (error?.code === "email_not_confirmed")
        return authError("EMAIL_NOT_CONFIRMED", 403, headers);
      if (error)
        return error.code && error.code !== "invalid_credentials"
          ? authError("AUTH_UNAVAILABLE", 503, headers)
          : authError("INVALID_CREDENTIALS", 401, headers);
      if (!data.session || !data.user?.id)
        return authError("AUTH_UNAVAILABLE", 503, headers);
      const verified = await auth.getUser(data.session.access_token);
      const verificationFailure = providerFailure(verified.error, headers);
      if (verificationFailure) return verificationFailure;
      if (verified.error) return authError("INVALID_CREDENTIALS", 401, headers);
      if (verified.data.user?.id !== data.user.id)
        return authError("AUTH_UNAVAILABLE", 503, headers);
      await saveSession(headers, env, data.session, false);
      clearCookie(headers, env, "flow");
      return authJson(
        { user: { id: data.user!.id, email: data.user!.email } },
        200,
        headers,
      );
    }
    if (await readCookie<FlowCookie>(request, env, "flow"))
      return authError("FLOW_PENDING", 409, headers);
    const purpose = path === "/v1/auth/signup" ? "confirm" : "recovery";
    const storage: Record<string, string> = {};
    const auth = createAuth(env, storage, transport);
    const result =
      purpose === "confirm"
        ? await auth.signUp({
            email,
            password: body.password as string,
            options: { emailRedirectTo: cfg.api + "/v1/auth/callback/confirm" },
          })
        : await auth.resetPasswordForEmail(email, {
            redirectTo: cfg.api + "/v1/auth/callback/recovery",
          });
    const accountRejection =
      isAuthApiError(result.error) &&
      [400, 404, 422].includes(result.error.status) &&
      ["user_already_exists", "email_exists", "user_not_found"].includes(
        result.error.code ?? "",
      );
    const failure = accountRejection
      ? null
      : providerFailure(result.error, headers);
    if (failure) return failure;
    if (result.error && !accountRejection) {
      if (purpose === "confirm" && isAuthWeakPasswordError(result.error))
        return authError("PASSWORD_TOO_WEAK", 422, headers);
      if (
        [400, 422].includes(result.error.status ?? 0) &&
        ["email_address_invalid", "validation_failed"].includes(
          result.error.code ?? "",
        )
      )
        return authError("INVALID_INPUT", 400, headers);
      // These public email requests carry no user credentials. Unrecognized
      // rejections (including API key/configuration failures) are not delivery.
      return authError("AUTH_UNAVAILABLE", 503, headers);
    }
    if (purpose === "confirm" && !result.error) {
      const signedUp = "user" in result.data ? result.data.user : null;
      if (
        !signedUp ||
        typeof signedUp !== "object" ||
        !("id" in signedUp) ||
        typeof signedUp.id !== "string" ||
        !signedUp.id
      )
        return authError("AUTH_UNAVAILABLE", 503, headers);
    }
    // Provider account-existence errors share the same response. Do not return provider diagnostics.
    // Store only SDK PKCE verifier entries; never persist an unexpected signup session.
    const flowStorage = Object.fromEntries(
      Object.entries(storage).filter(([key]) => key.includes("code-verifier")),
    );
    // Match ciphertext/cookie sizes even when the SDK removes a verifier after an existing-account rejection.
    const flow = { purpose, storage: flowStorage };
    const padding = "0".repeat(Math.max(0, 2048 - JSON.stringify(flow).length));
    await writeCookie(headers, env, "flow", { ...flow, padding }, 3600);
    return authJson(generic, 200, headers);
  } catch {
    if (path.includes("/callback/")) {
      clearCookie(headers, env, "flow");
      headers.set("Location", cfg.app + "/?auth=link-invalid");
      return new Response(null, { status: 303, headers });
    }
    return authError("AUTH_UNAVAILABLE", 503, headers);
  }
}
