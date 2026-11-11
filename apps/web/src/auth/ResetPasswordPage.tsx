import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { useT } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { Button, ButtonLink, Input, Notice, Skeleton } from "../ui/index.ts";
import { useAuth } from "./AuthProvider.tsx";
import { authErrorKey } from "./authErrors.ts";
import { AuthLayout } from "./AuthLayout.tsx";

/** Opened from the reset email. A working link has already signed the person in for recovery. */
export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(authErrorKey(error.message));
      else await navigate("/cv", { replace: true });
    } catch {
      setError("authError.generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("forgot.side.title")} text={t("forgot.side.text")}>
      {loading ? (
        <div className="auth-form" aria-busy="true">
          <span className="ui-sr" role="status">
            {t("app.loading")}
          </span>
          <Skeleton width="60%" height="28px" />
          <Skeleton height="48px" />
        </div>
      ) : !session ? (
        <div className="auth-form">
          <h2 className="ui-heading">{t("reset.title")}</h2>
          <Notice kind="bad">{t("reset.expired")}</Notice>
          <ButtonLink to="/forgot-password" variant="primary">
            {t("reset.again")}
          </ButtonLink>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <h2 className="ui-heading">{t("reset.title")}</h2>
          {error && <Notice kind="bad">{t(error)}</Notice>}
          <Input label={t("reset.password")} hint={t("auth.passwordHint")} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" loading={busy}>
            {t("reset.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
