import type { MouseEvent, ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useT } from "../i18n/t.ts";
import { hasUnsavedChanges } from "../cv/unsaved.ts";

/** Top bar (brand, navigation, page actions) around a signed-in page. */
export function AppShell(props: {
  actions?: ReactNode;
  /** True while a full-window screen (the import review) covers the page: the top bar is out of reach. */
  inert?: boolean;
  children: ReactNode;
}) {
  const { actions, inert, children } = props;
  const t = useT();

  // Leaving the editor with unsaved changes asks first.
  const guard = (event: MouseEvent) => {
    if (hasUnsavedChanges() && !window.confirm(t("shell.leaveUnsaved"))) event.preventDefault();
  };

  return (
    <div className="app-shell">
      <div className="shell-band" inert={inert}>
        <header className="ui-wrap shell-top">
          <Link className="shell-brand" to="/cv" onClick={guard}>
            {t("app.name")}
          </Link>
          <nav aria-label={t("shell.nav.label")} className="shell-nav">
            <NavLink to="/cv" onClick={guard}>
              {t("shell.nav.cv")}
            </NavLink>
            <NavLink to="/jobs" onClick={guard}>
              {t("shell.nav.jobs")}
            </NavLink>
            <NavLink to="/cvs" onClick={guard}>
              {t("shell.nav.cvs")}
            </NavLink>
            <NavLink to="/account" onClick={guard}>
              {t("shell.nav.account")}
            </NavLink>
          </nav>
          <div className="shell-actions">{actions}</div>
        </header>
      </div>
      {children}
    </div>
  );
}
