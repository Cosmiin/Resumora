import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { useT } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { Button, ButtonLink, CoachNote, Input, Notice } from "../ui/index.ts";
import { useAuth } from "./AuthProvider.tsx";
import { authErrorKey } from "./authErrors.ts";
import { AuthLayout } from "./AuthLayout.tsx";
import { returnTo } from "./returnTo.ts";

export function SignUpPage() {
  const t = useT();
  const { session } = useAuth();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);

  // With a session the person is already signed in (no email confirmation needed): on to the app.
  if (session) return <Navigate to={returnTo(location.state)} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The name travels with the login until the person can save it in their profile.
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() } } });
      if (error) setError(authErrorKey(error.message));
      else if (!data.session) setSent(true);
    } catch {
      setError("authError.generic");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) setError(authErrorKey(error.message));
      else setResent(true);
    } catch {
      setError("authError.generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("signup.side.title")} text={t("signup.side.text")}>
      {sent ? (
        <div className="auth-form">
          <h2 className="ui-heading">{t("signup.sent.title")}</h2>
          <p>{t("signup.sent.text", { email })}</p>
          <CoachNote size="sm">{t("signup.sent.hint")}</CoachNote>
          {error && <Notice kind="bad">{t(error)}</Notice>}
          <div className="ui-row">
            <Button loading={busy} onClick={resend}>
              {t("signup.sent.resend")}
            </Button>
            <ButtonLink to="/login" state={location.state} variant="quiet">
              {t("public.nav.login")}
            </ButtonLink>
          </div>
          <p className="auth-said" role="status">
            {resent ? t("signup.sent.resent") : ""}
          </p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <h2 className="ui-heading">{t("signup.title")}</h2>
          {error && <Notice kind="bad">{t(error)}</Notice>}
          <Input label={t("auth.name")} autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={t("auth.email")} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label={t("auth.password")} hint={t("auth.passwordHint")} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={busy}>
            {t("signup.submit")}
          </Button>
          <p className="ui-small">
            {t("signup.haveAccount")}{" "}
            <Link to="/login" state={location.state}>
              {t("public.nav.login")}
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
