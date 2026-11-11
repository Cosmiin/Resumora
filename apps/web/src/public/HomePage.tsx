import { useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthProvider.tsx";
import { useT } from "../i18n/t.ts";
import { ButtonAnchor, ButtonLink, CoachNote, Mark, Page, Sheet } from "../ui/index.ts";
import { EXTENSION_DOWNLOAD_URL, InstallSteps } from "./extension.tsx";
import { PublicHeader } from "./PublicHeader.tsx";

const STEPS = [1, 2, 3] as const;

/** The public homepage. A signed-in visitor goes straight to their CV. */
export function HomePage() {
  const t = useT();
  const { session, loading } = useAuth();
  const { hash } = useLocation();

  // "How it works" and "Browser extension" in the header point at sections of this page.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  if (loading) return <Page>{null}</Page>;
  if (session) return <Navigate to="/cv" replace />;

  return (
    <Page>
      <PublicHeader />
      <main>
        <div className="ui-wrap home-hero">
          <div>
            <h1 className="home-hero-title">{t("home.hero.title")}</h1>
            <p className="home-hero-sub">{t("home.hero.sub")}</p>
            <div className="ui-row home-hero-actions">
              <ButtonLink to="/signup" variant="primary">
                {t("home.hero.cta")}
              </ButtonLink>
              <ButtonLink to="/login" variant="quiet">
                {t("home.hero.login")}
              </ButtonLink>
            </div>
            <p className="home-hero-note">{t("home.hero.note")}</p>
          </div>
          {/* One real example of what the product does: a vague line, a question, the answer, the line it becomes. */}
          <div className="home-demo">
            <Sheet>
              <span className="home-demo-label">{t("home.demo.label")}</span>
              <div>
                <p className="home-cap">{t("home.demo.before")}</p>
                <p className="home-demo-before" lang="en">
                  Made some integrations between apps
                </p>
              </div>
              <CoachNote>{t("home.demo.question")}</CoachNote>
              <p className="home-demo-answer">{t("home.demo.answer")}</p>
              <div>
                <p className="home-cap">{t("home.demo.after")}</p>
                <p className="home-demo-after" lang="en">
                  <Mark>Connected HubSpot and Airtable through Make</Mark>
                </p>
              </div>
            </Sheet>
          </div>
        </div>

        <section className="home-band" id="how" aria-labelledby="how-title">
          <div className="ui-wrap">
            <h2 className="ui-heading ui-heading--lg" id="how-title">
              {t("home.steps.title")}
            </h2>
            <ol className="home-steps">
              {STEPS.map((n) => (
                <li key={n}>
                  <span className="home-step-n" aria-hidden="true">
                    {n}
                  </span>
                  <h3>{t(`home.steps.${n}.title`)}</h3>
                  <p className="ui-muted">{t(`home.steps.${n}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-extension" id="extension" aria-labelledby="extension-title">
          <div className="ui-wrap">
            <div>
              <h2 className="ui-heading ui-heading--lg" id="extension-title">
                {t("home.extension.title")}
              </h2>
              <p className="ui-lead home-extension-lead">{t("home.extension.lead")}</p>
              <InstallSteps />
              <div className="ui-row home-extension-actions">
                <ButtonAnchor href={EXTENSION_DOWNLOAD_URL} download>
                  {t("extension.download")}
                </ButtonAnchor>
              </div>
              <p className="ui-muted ui-small home-extension-note">{t("home.extension.note")}</p>
            </div>
            {/* A sketch of the extension's panel, not a control. */}
            <div className="home-panel" aria-hidden="true">
              <p className="home-cap">{t("home.extension.panelCaption")}</p>
              <div className="home-panel-card">
                <p className="home-panel-title" lang="en">
                  No-Code Automation Developer
                </p>
                <p className="ui-muted ui-small" lang="en">
                  Flowbridge, remote (EU)
                </p>
                <ul className="home-keywords" lang="en">
                  <li className="has">Make</li>
                  <li className="has">Zapier</li>
                  <li>REST APIs</li>
                  <li>webhooks</li>
                  <li className="has">Airtable</li>
                </ul>
                <span className="home-panel-button">{t("home.extension.panelButton")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="home-closing" aria-labelledby="closing-title">
          <div className="ui-wrap">
            <h2 className="ui-heading ui-heading--lg" id="closing-title">
              {t("home.closing.title")}
            </h2>
            <ButtonLink to="/signup" variant="primary">
              {t("home.hero.cta")}
            </ButtonLink>
          </div>
        </section>
      </main>
    </Page>
  );
}
