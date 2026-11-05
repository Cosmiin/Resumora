import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { useAuth } from "./AuthProvider.tsx";
import { authErrorKey } from "./authErrors.ts";
import { AuthLayout } from "./AuthLayout.tsx";

type Mode = "signIn" | "signUp" | "forgot";

const titles: Record<Mode, MessageKey> = {
  signIn: "auth.signIn.title",
  signUp: "auth.signUp.title",
  forgot: "auth.forgot.title",
};
const submits: Record<Mode, MessageKey> = {
  signIn: "auth.signIn.submit",
  signUp: "auth.signUp.submit",
  forgot: "auth.forgot.submit",
};

export function LoginPage() {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  if (session) return <Navigate to="/cv" replace />;

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(authErrorKey(error.message));
      } else if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) setError(authErrorKey(error.message));
        // With a session the user is already signed in and AuthProvider moves on to the app;
        // without one, Supabase has emailed a confirmation link.
        else if (!data.session) setNotice("auth.signUp.done");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) setError(authErrorKey(error.message));
        else setNotice("auth.forgot.done");
      }
    } catch {
      setError("auth.genericError");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <h2>{t(titles[mode])}</h2>
        {mode === "signIn" && <p className="auth-subtitle">{t("auth.signIn.subtitle")}</p>}
        <label>
          {t("auth.email")}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "forgot" && (
          <label>
            {t("auth.password")}
            <input
              type="password"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              required
              minLength={mode === "signUp" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p role="alert" className="form-error">{t(error)}</p>}
        {notice && <p role="status" className="form-notice">{t(notice, { email })}</p>}
        <button type="submit" disabled={busy}>{t(submits[mode])}</button>
        <div className="auth-links">
          {mode !== "signIn" && <button type="button" className="link" onClick={() => switchTo("signIn")}>{t("auth.toSignIn")}</button>}
          {mode !== "signUp" && <button type="button" className="link" onClick={() => switchTo("signUp")}>{t("auth.toSignUp")}</button>}
          {mode === "signIn" && <button type="button" className="link" onClick={() => switchTo("forgot")}>{t("auth.toForgot")}</button>}
        </div>
      </form>
    </AuthLayout>
  );
}
