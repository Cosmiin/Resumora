import { Navigate, Outlet } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { t } from "../i18n/t.ts";
import { useAuth } from "./AuthProvider.tsx";

/** Layout for signed-in pages: redirects to /login when there is no session. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <p className="page-loading">{t("app.loading")}</p>;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <strong>{t("app.name")}</strong>
        <span className="app-user">{session.user.email}</span>
        <button type="button" onClick={() => supabase.auth.signOut()}>{t("app.signOut")}</button>
      </header>
      <Outlet />
    </div>
  );
}
