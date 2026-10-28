import {
  useCallback,
  useEffect,
  useMemo,
  Fragment,
  useRef,
  useState,
  type ReactNode,
} from "react";
export type Account = { id: string; email: string };
export type AuthTransport = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;
type Status = { user: Account | null; csrfToken: string; recovery: boolean };
export function AuthShell({
  children,
  fetcher = fetch,
}: {
  children: (account: Account, transport: AuthTransport) => ReactNode;
  fetcher?: typeof fetch;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<
    "login" | "signup" | "recovery" | "password"
  >(window.location.pathname === "/reset-password" ? "password" : "login");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(
      window.location.search.includes("auth=link-invalid")
        ? "Link invalid sau expirat. Cere un link nou în acest browser."
        : "",
    );
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const csrf = useRef(""),
    generation = useRef(0);
  const loggingOut = useRef(false);
  const verified = useRef(false),
    accountId = useRef<string | null>(null);
  const pending = useRef(Promise.resolve()),
    accountPending = useRef(Promise.resolve()),
    independent = useRef(Promise.resolve());
  const ordered = useCallback(
    <T,>(
      operation: () => Promise<T>,
      lane: "session" | "account" | "intelligence" = "session",
    ) => {
      const result = (
        lane === "session"
          ? Promise.all([pending.current, independent.current])
          : lane === "account"
            ? Promise.all([pending.current, accountPending.current])
            : pending.current
      ).then(operation);
      const settled = result.then(
        () => {},
        () => {},
      );
      if (lane === "session") pending.current = settled;
      else {
        independent.current = Promise.all([independent.current, settled]).then(
          () => {},
        );
        if (lane === "account") accountPending.current = settled;
      }
      return result;
    },
    [],
  );
  const transport: AuthTransport = useCallback(
    async (path, init = {}) => {
      const startedGeneration = generation.current,
        startedCsrf = csrf.current;
      const headers = new Headers(init.headers);
      if (init.method && init.method !== "GET") {
        headers.set("X-CSRF-Token", csrf.current);
        if (!headers.has("Content-Type"))
          headers.set("Content-Type", "application/json");
      }
      let response: Response;
      try {
        response = await fetcher(path, {
          ...init,
          headers,
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch (error) {
        if (
          !(
            init.signal?.aborted &&
            (error as { name?: string } | null)?.name === "AbortError"
          ) &&
          !path.startsWith("/v1/auth/") &&
          startedGeneration === generation.current &&
          startedCsrf === csrf.current
        ) {
          verified.current = false;
          setError(
            "Conexiunea nu este confirmată. Reîncearcă verificarea sesiunii.",
          );
        }
        throw error;
      }
      if (
        response.status === 503 &&
        !path.startsWith("/v1/auth/") &&
        startedGeneration === generation.current &&
        startedCsrf === csrf.current
      ) {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        if (
          body?.error?.code === "AUTH_UNAVAILABLE" &&
          startedGeneration === generation.current &&
          startedCsrf === csrf.current
        ) {
          verified.current = false;
          setError(
            "Conexiunea nu este confirmată. Reîncearcă verificarea sesiunii.",
          );
        }
      }
      if (
        response.status === 401 &&
        !path.startsWith("/v1/auth/") &&
        startedGeneration === generation.current &&
        startedCsrf === csrf.current
      ) {
        generation.current++;
        verified.current = false;
        setStatus(null);
        setMode("login");
        setError("Sesiunea a expirat. Autentifică-te din nou.");
      }
      return response;
    },
    [fetcher],
  );
  const load = useCallback(
    async (recoverLogout = false) => {
      if (loggingOut.current && !recoverLogout) return;
      const started = generation.current;
      try {
        const response = await transport("/v1/auth/session");
        const body = await response.json();
        if (started !== generation.current) return;
        if (!response.ok)
          throw Error(
            body.error?.message ?? "Autentificarea nu este disponibilă.",
          );
        if (
          accountId.current !== (body.user?.id ?? null) ||
          csrf.current !== body.csrfToken
        )
          generation.current++;
        csrf.current = body.csrfToken;
        accountId.current = body.user?.id ?? null;
        verified.current = !loggingOut.current;
        if (loggingOut.current) return;
        setStatus(body);
        if (body.recovery) setMode("password");
        setError("");
        return body as Status;
      } catch (e) {
        if (started !== generation.current) return;
        verified.current = false;
        setError(
          e instanceof Error
            ? e.message
            : "Autentificarea nu este disponibilă.",
        );
      } finally {
        setReady(true);
      }
    },
    [transport],
  );
  // A retired adapter must never send old draft work under a replacement session.
  const accountTransport = useMemo<AuthTransport>(() => {
    const expectedCsrf = status?.csrfToken,
      expectedAccount = status?.user?.id,
      expectedGeneration = generation.current;
    const assertCurrent = () => {
      if (
        !expectedCsrf ||
        accountId.current !== expectedAccount ||
        csrf.current !== expectedCsrf ||
        loggingOut.current ||
        generation.current !== expectedGeneration
      )
        throw new Error("SESSION_CHANGED");
      if (!verified.current) throw new Error("SESSION_UNVERIFIED");
    };
    return (path, init) => {
      const send = () => {
        assertCurrent();
        return transport(path, init);
      };
      if (
        init?.method === "POST" &&
        [
          "/v1/intelligence/imports",
          "/v1/intelligence/questions",
          "/v1/intelligence/rewrite",
        ].includes(path)
      )
        return ordered(async () => {
          assertCurrent();
          const next = await load();
          if (next?.recovery) throw new Error("SESSION_CHANGED");
        }).then(() => ordered(send, "intelligence"));
      return ordered(
        send,
        path.startsWith("/v1/intelligence/") ? "intelligence" : "account",
      );
    };
  }, [
    status?.csrfToken,
    status?.user?.id,
    status?.recovery,
    transport,
    ordered,
    load,
  ]);
  async function reloadAfterAction() {
    generation.current++;
    verified.current = false;
    csrf.current = "";
    setStatus(null);
    return load(true);
  }
  useEffect(() => {
    void ordered(() => load());
    const focus = () => {
      void ordered(() => load());
    };
    const interval = window.setInterval(focus, 60_000);
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [load, ordered]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget,
      data = new FormData(form);
    const body =
      mode === "password"
        ? { password: data.get("password") }
        : mode === "recovery"
          ? { email: data.get("email") }
          : { email: data.get("email"), password: data.get("password") };
    await ordered(async () => {
      try {
        const response = await transport("/v1/auth/" + mode, {
          method: "POST",
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(
            result.error?.message ?? "Cererea nu a reușit. Încearcă din nou.",
          );
        form.reset();
        if (mode === "login") {
          loggingOut.current = false;
          generation.current++;
          await load();
        } else if (mode === "password") {
          setMode("login");
          window.history.replaceState(null, "", "/");
          await reloadAfterAction();
          setNotice("Parolă schimbată. Autentifică-te cu parola nouă.");
        } else
          setNotice(
            "Dacă există un cont eligibil, verifică emailul. Deschide linkul în acest browser.",
          );
      } catch (e) {
        if (mode === "password") {
          const next = await reloadAfterAction();
          if (next && !next.recovery) {
            setMode("login");
            window.history.replaceState(null, "", "/");
          }
        }
        setError(e instanceof Error ? e.message : "Cererea nu a reușit.");
      } finally {
        setBusy(false);
      }
    });
  }
  async function logout() {
    if (busy) return;
    verified.current = false;
    loggingOut.current = true;
    setBusy(true);
    setStatus(null);
    setMode("login");
    setNotice("");
    await ordered(async () => {
      try {
        if (!csrf.current) await load(true);
        if (!csrf.current)
          throw Error("Deconectarea nu este confirmată. Reîncearcă.");
        const response = await transport("/v1/auth/logout", {
          method: "POST",
          body: "{}",
        });
        if (!response.ok)
          throw Error("Deconectarea nu este confirmată. Reîncearcă.");
        loggingOut.current = false;
        await reloadAfterAction();
      } catch (e) {
        await reloadAfterAction();
        setError(
          e instanceof Error
            ? e.message
            : "Deconectarea nu este confirmată. Reîncearcă.",
        );
      } finally {
        setBusy(false);
      }
    });
  }
  if (!ready)
    return (
      <main className="auth-panel" aria-busy="true">
        Se verifică sesiunea…
      </main>
    );
  if (status?.user && !status.recovery)
    return (
      <>
        <div className="auth-account">
          <span>{status.user.email}</span>
          <button
            className="btn btn-ghost"
            onClick={() => void logout()}
            disabled={busy}
          >
            Deconectare
          </button>
        </div>
        {error && (
          <div role="alert">
            <p>
              {error} Modificările rămân în această pagină; salvarea așteaptă
              verificarea sesiunii.
            </p>
            <button
              className="btn btn-ghost"
              onClick={() => void ordered(() => load())}
            >
              Reîncearcă conexiunea
            </button>
          </div>
        )}
        <Fragment key={`${status.user.id}:${status.csrfToken}`}>
          {children(status.user, accountTransport)}
        </Fragment>
      </>
    );
  const reset = mode === "password",
    allowedReset = !!status?.recovery;
  return (
    <main className="auth-panel">
      <img src="/resumora-logo.svg" alt="Resumora" width="142" height="34" />
      <h1>
        {reset
          ? "Parolă nouă"
          : mode === "signup"
            ? "Creează un cont"
            : mode === "recovery"
              ? "Resetează parola"
              : "Autentificare"}
      </h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {reset && !allowedReset ? (
        <p>Cere un link de resetare și deschide-l în acest browser.</p>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          {mode !== "password" && (
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                disabled={busy}
              />
            </label>
          )}
          {mode !== "recovery" && (
            <label>
              {reset ? "Parolă nouă" : "Parolă"}
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "login" ? 1 : 8}
                maxLength={128}
                disabled={busy}
              />
            </label>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !status}
          >
            {busy
              ? "Se procesează…"
              : reset
                ? "Salvează parola"
                : mode === "signup"
                  ? "Creează cont"
                  : mode === "recovery"
                    ? "Trimite link"
                    : "Intră în cont"}
          </button>
        </form>
      )}
      <nav aria-label="Autentificare">
        {(["login", "signup", "recovery"] as const).map((next) => (
          <button
            className="btn btn-ghost"
            key={next}
            disabled={busy || mode === next}
            onClick={() => {
              setMode(next);
              setNotice("");
              setError("");
            }}
          >
            {next === "login"
              ? "Autentificare"
              : next === "signup"
                ? "Creează cont"
                : "Ai uitat parola?"}
          </button>
        ))}
      </nav>
      {status && (
        <button
          className="btn btn-ghost"
          onClick={() => void logout()}
          disabled={busy}
        >
          Anulează și deconectează
        </button>
      )}
      {!status && (
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (loggingOut.current) void logout();
            else void ordered(() => load());
          }}
          disabled={busy}
        >
          Reîncearcă conexiunea
        </button>
      )}
    </main>
  );
}
