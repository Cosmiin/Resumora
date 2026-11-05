import type { ReactNode } from "react";
import { t } from "../i18n/t.ts";

/** Two columns: the product promise on the left, the form on the right. Stacks under 900px. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-promise">
        <p className="auth-brand">{t("app.name")}</p>
        <h1>{t("auth.promise.title")}</h1>
        <p className="auth-promise-text">{t("auth.promise.text")}</p>
        <div className="auth-sketch" aria-hidden="true">
          <div className="auth-sketch-card">
            <div className="auth-sketch-name" />
            <div className="auth-sketch-bar" />
            <div className="auth-sketch-bar short" />
            <div className="auth-sketch-pills">
              <span />
              <span />
              <span />
            </div>
            <div className="auth-sketch-bar" />
            <div className="auth-sketch-bar short" />
          </div>
        </div>
      </section>
      <div className="auth-form-column">{children}</div>
    </main>
  );
}
