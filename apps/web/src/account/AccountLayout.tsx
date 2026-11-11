import { NavLink, Outlet } from "react-router";
import { useT } from "../i18n/t.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { Page, Sheet } from "../ui/index.ts";

const SECTIONS = [
  { to: "/account/profile", label: "account.nav.profile" },
  { to: "/account/preferences", label: "account.nav.preferences" },
  { to: "/account/data", label: "account.nav.data" },
  { to: "/account/extension", label: "account.nav.extension" },
] as const;

/** The account area: section links on the left, the chosen section on a sheet of paper. */
export function AccountLayout() {
  const t = useT();
  return (
    <Page>
      <AppShell>
        <main className="ui-wrap ui-main">
          <h1 className="ui-title account-title">{t("account.title")}</h1>
          <div className="account-cols">
            <nav className="account-nav" aria-label={t("account.nav.label")}>
              {SECTIONS.map((section) => (
                <NavLink key={section.to} to={section.to}>
                  {t(section.label)}
                </NavLink>
              ))}
            </nav>
            <Sheet>
              <Outlet />
            </Sheet>
          </div>
        </main>
      </AppShell>
    </Page>
  );
}
