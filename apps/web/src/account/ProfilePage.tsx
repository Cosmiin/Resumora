import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Preferences } from "@resumora/shared";
import { useAuth } from "../auth/AuthProvider.tsx";
import { hasUnsavedChanges } from "../cv/unsaved.ts";
import { useT } from "../i18n/t.ts";
import { supabase } from "../lib/supabase.ts";
import { Button, Input, Notice, Skeleton } from "../ui/index.ts";
import { getPreferences, preferencesKey, savePreferences } from "./account-api.ts";

/** Profile (name, email), password and sign out. */
export function ProfilePage() {
  const t = useT();
  const userId = useAuth().session?.user.id;
  const preferences = useQuery({ queryKey: preferencesKey(userId), queryFn: getPreferences });

  function signOut() {
    if (hasUnsavedChanges() && !window.confirm(t("signOut.unsaved"))) return;
    void supabase.auth.signOut();
  }

  // Once loaded, the forms stay on screen: a later refresh that fails must not throw away what is being typed.
  if (!preferences.data) {
    if (preferences.isError) {
      return (
        <div className="ui-stack">
          <Notice kind="bad">{t("account.loadError")}</Notice>
          <div className="ui-row">
            <Button onClick={() => void preferences.refetch()}>{t("account.tryAgain")}</Button>
            <Button variant="quiet" onClick={signOut}>
              {t("signOut.button")}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="ui-stack" aria-busy="true">
        <span className="ui-sr" role="status">
          {t("account.loading")}
        </span>
        <Skeleton width="40%" height="28px" />
        <Skeleton height="48px" />
        <Skeleton height="48px" />
        <Skeleton width="160px" height="48px" />
      </div>
    );
  }

  return (
    <>
      {/* Keyed by person: someone else signing in on this device starts from their own name, not the one typed before. */}
      <ProfileForm key={userId} preferences={preferences.data} />
      <PasswordForm key={`password-${userId}`} />
      <section className="account-section" aria-labelledby="sign-out-title">
        <h2 className="ui-heading" id="sign-out-title">
          {t("signOut.title")}
        </h2>
        <p className="ui-muted account-section-text">{t("signOut.text")}</p>
        <div className="ui-row account-actions">
          <Button onClick={signOut}>{t("signOut.button")}</Button>
        </div>
      </section>
    </>
  );
}

function ProfileForm({ preferences }: { preferences: Preferences }) {
  const t = useT();
  const queryClient = useQueryClient();
  const user = useAuth().session?.user;
  const currentEmail = user?.email ?? "";
  // Until a name is saved here, show the one given at sign-up.
  const signUpName = typeof user?.user_metadata?.name === "string" ? user.user_metadata.name : "";
  const [name, setName] = useState(preferences.displayName ?? signUpName);
  const [email, setEmail] = useState(currentEmail);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "good" | "bad"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const submittedName = name;
    try {
      const saved = await savePreferences({ displayName: submittedName });
      queryClient.setQueryData(preferencesKey(user?.id), saved);
      // Show the name as stored (trimmed), unless the person kept typing while it was saving.
      setName((current) => (current === submittedName ? (saved.displayName ?? "") : current));
    } catch {
      setResult({ kind: "bad", text: t("profile.error") });
      setBusy(false);
      return;
    }
    // The name is saved at this point; the email is a separate step that can fail on its own.
    const newEmail = email.trim();
    if (!newEmail || newEmail === currentEmail) {
      setResult({ kind: "good", text: t("profile.saved") });
    } else {
      try {
        const { error } = await supabase.auth.updateUser({ email: newEmail });
        if (error) throw error;
        setResult({ kind: "good", text: t("profile.emailSent", { email: newEmail }) });
      } catch {
        setResult({ kind: "bad", text: t("profile.emailError") });
      }
    }
    setBusy(false);
  }

  return (
    <section className="account-section" aria-labelledby="profile-title">
      <h2 className="ui-heading" id="profile-title">
        {t("profile.title")}
      </h2>
      <form className="account-form" onSubmit={submit}>
        <Input label={t("profile.name")} autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={t("profile.email")} hint={t("profile.emailHint")} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="ui-row">
          <Button type="submit" variant="primary" loading={busy}>
            {t("profile.save")}
          </Button>
        </div>
        {result && <Notice kind={result.kind}>{result.text}</Notice>}
      </form>
    </section>
  );
}

function PasswordForm() {
  const t = useT();
  const email = useAuth().session?.user.email ?? "";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "good" | "bad"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      // Supabase changes a password for whoever holds the session, so the current one is checked here first.
      const check = await supabase.auth.signInWithPassword({ email, password: current });
      if (check.error) {
        const wrong = check.error.message.toLowerCase().includes("invalid login credentials");
        setResult({ kind: "bad", text: t(wrong ? "password.wrong" : "password.error") });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setCurrent("");
      setNext("");
      setResult({ kind: "good", text: t("password.saved") });
    } catch {
      setResult({ kind: "bad", text: t("password.error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="password-title">
      <h2 className="ui-heading" id="password-title">
        {t("password.title")}
      </h2>
      <form className="account-form" onSubmit={submit}>
        {result?.kind === "bad" && <Notice kind="bad">{result.text}</Notice>}
        <Input label={t("password.current")} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label={t("password.new")} hint={t("password.hint")} type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        <div className="ui-row">
          <Button type="submit" loading={busy}>
            {t("password.save")}
          </Button>
        </div>
        {result?.kind === "good" && <Notice kind="good">{result.text}</Notice>}
      </form>
    </section>
  );
}
