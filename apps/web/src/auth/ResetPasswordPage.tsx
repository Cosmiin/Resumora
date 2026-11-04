import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { t } from "../i18n/t.ts";
import type { MessageKey } from "../i18n/en.ts";
import { authErrorKey } from "./authErrors.ts";
import { AuthLayout } from "./AuthLayout.tsx";

/** Opened from the reset email; Supabase has already signed the user in for recovery. */
export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(authErrorKey(error.message));
    else setDone(true);
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit}>
        <h2>{t("auth.reset.title")}</h2>
        {done ? (
          <p role="status">
            {t("auth.reset.done")} <Link to="/cv">{t("app.name")}</Link>
          </p>
        ) : (
          <>
            <label>
              {t("auth.newPassword")}
              <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p role="alert" className="form-error">{t(error)}</p>}
            <button type="submit" disabled={busy}>{t("auth.reset.submit")}</button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}
