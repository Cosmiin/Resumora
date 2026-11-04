import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { supabase } from "../lib/supabase.ts";
import { t } from "../i18n/t.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { hasUnsavedChanges } from "../cv/unsaved.ts";

/** Top bar (brand, navigation, page actions, account menu) around a signed-in page. */
export function AppShell(props: {
  actions?: ReactNode;
  /** True while a full-window screen (the import review) covers the page: the top bar is out of reach. */
  inert?: boolean;
  children: ReactNode;
}) {
  const { actions, inert, children } = props;
  const email = useAuth().session?.user.email ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  function signOut() {
    if (hasUnsavedChanges() && !window.confirm(t("app.signOutUnsaved"))) return;
    void supabase.auth.signOut();
  }

  return (
    <div className="app-shell">
      <header className="app-header" inert={inert}>
        <strong className="app-brand">{t("app.name")}</strong>
        <nav aria-label={t("nav.main")} className="app-nav">
          <NavLink to="/cv">{t("nav.myCv")}</NavLink>
        </nav>
        <div className="app-actions">{actions}</div>
        <div className="app-account" ref={accountRef}>
          <button
            type="button"
            className="app-account-button"
            aria-label={t("nav.account", { email })}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {email.charAt(0).toUpperCase()}
          </button>
          {menuOpen && (
            <div className="app-account-menu">
              <p className="app-account-email">{email}</p>
              <button type="button" className="secondary" onClick={signOut}>{t("app.signOut")}</button>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
