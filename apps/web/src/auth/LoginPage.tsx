import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { useT } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { Button, Input, Notice } from "../ui/index.ts";
import { useAuth } from "./AuthProvider.tsx";
import { authErrorKey } from "./authErrors.ts";
import { AuthLayout } from "./AuthLayout.tsx";

export function LoginPage() {
  const t = useT();
  const { session } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  // After logging in, go back to the page that asked for it (same site only).
  const from = location.state?.from;
  const destination =
    typeof from?.pathname === "string" && from.pathname.startsWith("/") && !from.pathname.startsWith("//")
      ? from.pathname + (typeof from.search === "string" ? from.search : "")
      : "/cv";

  if (session) return <Navigate to={destination} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(authErrorKey(error.message));
    } catch {
      setError("authError.generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("login.side.title")} text={t("login.side.text")}>
      <form className="auth-form" onSubmit={submit}>
        <h2 className="ui-heading">{t("login.title")}</h2>
        {error && <Notice kind="bad">{t(error)}</Notice>}
        <Input label={t("auth.email")} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={t("auth.password")} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="primary" loading={busy}>
          {t("login.submit")}
        </Button>
        <p className="ui-small">
          <Link to="/forgot-password">{t("login.forgot")}</Link>
        </p>
        <p className="ui-small">
          {t("login.new")} <Link to="/signup">{t("public.nav.signup")}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
