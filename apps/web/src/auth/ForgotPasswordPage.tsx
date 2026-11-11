import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { useT } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { Button, ButtonLink, Input, Notice } from "../ui/index.ts";
import { authErrorKey } from "./authErrors.ts";
import { AuthLayout } from "./AuthLayout.tsx";

/** Asks for the email and sends a link to `/reset-password`. */
export function ForgotPasswordPage() {
  const t = useT();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) setError(authErrorKey(error.message));
      else setSent(true);
    } catch {
      setError("authError.generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("forgot.side.title")} text={t("forgot.side.text")}>
      {sent ? (
        <div className="auth-form">
          <h2 className="ui-heading">{t("forgot.sent.title")}</h2>
          <p role="status">{t("forgot.sent.text")}</p>
          <ButtonLink to="/login" state={location.state} variant="quiet">
            {t("forgot.back")}
          </ButtonLink>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <h2 className="ui-heading">{t("forgot.title")}</h2>
          {error && <Notice kind="bad">{t(error)}</Notice>}
          <Input label={t("auth.email")} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" variant="primary" loading={busy}>
            {t("forgot.submit")}
          </Button>
          <p className="ui-small">
            <Link to="/login" state={location.state}>
              {t("forgot.back")}
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
