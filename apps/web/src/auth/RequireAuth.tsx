import { Navigate, Outlet } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { t } from "../i18n/t.ts";
import { useAuth } from "./AuthProvider.tsx";
import { hasUnsavedChanges } from "../cv/unsaved.ts";

/** Layout for signed-in pages: redirects to /login when there is no session. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <p className="page-loading">{t("app.loading")}</p>;
  if (!session) return <Navigate to="/login" replace />;

  function signOut() {
    if (hasUnsavedChanges() && !window.confirm(t("app.signOutUnsaved"))) return;
    void supabase.auth.signOut();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <strong>{t("app.name")}</strong>
        <span className="app-user">{session.user.email}</span>
        <button type="button" onClick={signOut}>{t("app.signOut")}</button>
      </header>
      <Outlet />
    </div>
  );
}
