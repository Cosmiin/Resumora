import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { t } from "../i18n/t.ts";
import { useAuth } from "./AuthProvider.tsx";

let signedOutPath: string | null = null;

/** The next time the session ends, go to `path` instead of the log in page (after deleting the account: the homepage). */
export function signOutTo(path: string): void {
  signedOutPath = path;
}

/** Guard for signed-in pages: redirects to /login when there is no session. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  // A request made for one sign-out doesn't apply to a later one.
  useEffect(() => {
    if (session) signedOutPath = null;
  }, [session]);

  if (loading) return <p className="page-loading">{t("app.loading")}</p>;
  if (!session) {
    if (signedOutPath) return <Navigate to={signedOutPath} replace />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
