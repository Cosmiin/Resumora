import { Navigate, Outlet, useLocation } from "react-router";
import { t } from "../i18n/t.ts";
import { useAuth } from "./AuthProvider.tsx";

/** Guard for signed-in pages: redirects to /login when there is no session. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="page-loading">{t("app.loading")}</p>;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
