import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { useLanguage } from "../i18n/language.ts";
import { useT } from "../i18n/t.ts";
import { listJobs } from "../jobs/jobs-api.ts";
import { EXTENSION_DOWNLOAD_URL, InstallSteps } from "../public/extension.tsx";
import { ButtonAnchor } from "../ui/index.ts";

/**
 * How to install the extension, plus the newest job it saved. The server keeps no record of
 * whether an extension is connected, so this page doesn't claim to know.
 */
export function ExtensionPage() {
  const t = useT();
  const language = useLanguage();
  // The newest page of jobs is enough to find the latest one that came from the extension.
  const jobs = useQuery({ queryKey: ["account", "extension-last-job"], queryFn: () => listJobs() });
  const last = jobs.data?.items.find((job) => job.source === "extension");

  return (
    <section className="account-section" aria-labelledby="extension-page-title">
      <h2 className="ui-heading" id="extension-page-title">
        {t("extensionPage.title")}
      </h2>
      <p className="ui-lead account-section-text">{t("extensionPage.text")}</p>
      <InstallSteps />
      <div className="ui-row account-actions">
        <ButtonAnchor href={EXTENSION_DOWNLOAD_URL} download variant="primary">
          {t("extension.download")}
        </ButtonAnchor>
      </div>
      {jobs.isSuccess && (
        <dl className="account-facts">
          <dt className="ui-label">{t("extensionPage.lastJob")}</dt>
          <dd>
            {last ? (
              <>
                <Link to={`/jobs/${last.id}`}>
                  {[last.title ?? t("extensionPage.untitled"), last.company].filter(Boolean).join(", ")}
                </Link>{" "}
                <span className="ui-muted">({new Date(last.createdAt).toLocaleDateString(language)})</span>
              </>
            ) : (
              <span className="ui-muted">{t("extensionPage.noJob")}</span>
            )}
          </dd>
        </dl>
      )}
      <p className="ui-muted ui-small account-note">{t("extensionPage.signOut")}</p>
    </section>
  );
}
