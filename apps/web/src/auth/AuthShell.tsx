import {
  useCallback,
  useEffect,
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
  const transport: AuthTransport = useCallback(
    async (path, init = {}) => {
      const headers = new Headers(init.headers);
      if (init.method && init.method !== "GET") {
        headers.set("X-CSRF-Token", csrf.current);
        headers.set("Content-Type", "application/json");
      }
      const response = await fetcher(path, {
        ...init,
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401 && !path.startsWith("/v1/auth/")) {
        generation.current++;
        setStatus(null);
        setMode("login");
        setError("Sesiunea a expirat. Autentifică-te din nou.");
      }
      return response;
    },
    [fetcher],
  );
  const load = useCallback(async () => {
    if (loggingOut.current) return;
    const started = generation.current;
    try {
      const response = await transport("/v1/auth/session");
      const body = await response.json();
      if (started !== generation.current) return;
      if (!response.ok)
        throw Error(
          body.error?.message ?? "Autentificarea nu este disponibilă.",
        );
      csrf.current = body.csrfToken;
      setStatus(body);
      if (body.recovery) setMode("password");
      setError("");
    } catch (e) {
      if (started !== generation.current) return;
      setStatus(null);
      setError(
        e instanceof Error ? e.message : "Autentificarea nu este disponibilă.",
      );
    } finally {
      setReady(true);
    }
  }, [transport]);
  useEffect(() => {
    void load();
    const focus = () => {
      void load();
    };
    const interval = window.setInterval(focus, 60_000);
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
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
        await load();
        setNotice("Parolă schimbată. Autentifică-te cu parola nouă.");
      } else
        setNotice(
          "Dacă există un cont eligibil, verifică emailul. Deschide linkul în acest browser.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cererea nu a reușit.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (busy) return;
    generation.current++;
    loggingOut.current = true;
    setBusy(true);
    setStatus(null);
    setMode("login");
    setNotice("");
    try {
      const response = await transport("/v1/auth/logout", {
        method: "POST",
        body: "{}",
      });
      if (!response.ok)
        throw Error("Deconectarea nu este confirmată. Reîncearcă.");
      loggingOut.current = false;
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Deconectarea nu este confirmată. Reîncearcă.",
      );
    } finally {
      setBusy(false);
    }
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
        {children(status.user, transport)}
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
            else void load();
          }}
          disabled={busy}
        >
          Reîncearcă conexiunea
        </button>
      )}
    </main>
  );
}
