import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getPreferences } from "../account/account-api.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { isBlankCv } from "../cv/CvFacts.tsx";
import { getCv } from "../cv/cv-api.ts";
import { getTemplate } from "../cv/page/templates.ts";
import { getLanguage } from "../i18n/language.ts";
import { useT } from "../i18n/t.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { Skeleton } from "../ui/index.ts";
import { jobName, listAllTailored } from "./useCvDoc.ts";
import "../styles/cvs.css";

/** "11 Nov 2026" in the interface language. */
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString(getLanguage(), { day: "numeric", month: "short", year: "numeric" });

/** `/cvs`: the base CV and every version tailored to a job, each with its next steps. */
export function MyCvsPage() {
  const t = useT();
  const userId = useAuth().session?.user.id ?? "anonymous";
  const all = useQuery({
    queryKey: ["my-cvs", userId],
    queryFn: async () => {
      const [base, tailored, preferences] = await Promise.all([getCv(), listAllTailored(), getPreferences()]);
      return { base, tailored, template: getTemplate(preferences.defaultTemplate) };
    },
  });
  const meta = (parts: string[]) => parts.filter(Boolean).join(" · ");

  let body;
  if (all.isPending) {
    body = <div className="ui-sheet ui-stack" aria-busy="true"><p role="status" className="ui-sr">{t("cvs.loading")}</p>
      <Skeleton width="40%" height="26px" /><Skeleton width="60%" /><Skeleton width="55%" height="26px" /><Skeleton width="35%" /></div>;
  } else if (all.isError) {
    body = <div className="ui-stack"><p role="alert" className="ui-notice ui-notice--bad">{t("cvs.loadError")}</p>
      <p><button type="button" className="ui-btn" onClick={() => void all.refetch()}>{t("tailor.retry")}</button></p></div>;
  } else if (isBlankCv(all.data.base.content) && all.data.tailored.length === 0) {
    body = <div className="ui-empty"><h2 className="ui-empty-title">{t("cvs.empty.title")}</h2><p className="ui-empty-text">{t("cvs.empty.text")}</p>
      <Link className="ui-btn ui-btn--primary" to="/cv">{t("cvs.empty.upload")}</Link></div>;
  } else {
    const { base, tailored, template } = all.data;
    body = <>
      <p className="ui-lead cvs-lead">{t("cvs.lead")}</p>
      <section className="cvs-group" aria-labelledby="cvs-base">
        <h2 className="ui-heading" id="cvs-base">{t("cvs.base")}</h2>
        <div className="ui-sheet"><div className="cvs-row">
          <div className="ui-stack ui-stack--s">
            <p className="cvs-name" lang={base.content.locale}>{base.content.basics.fullName.trim() || t("cvs.unnamed")}</p>
            <p className="ui-small ui-muted">{meta([t(`tailored.lang.${base.content.locale}`), t(template.label), t("cvs.updated", { day: dayOf(base.updatedAt) })])}</p>
          </div>
          <div className="ui-row">
            <Link className="ui-btn ui-btn--sm" to="/cv">{t("cvs.open")}</Link>
            <Link className="ui-btn ui-btn--sm" to="/cv/template">{t("cvs.template")}</Link>
            <Link className="ui-btn ui-btn--sm" to="/cv/export">{t("cvs.export")}</Link>
          </div>
        </div></div>
      </section>
      <section className="cvs-group" aria-labelledby="cvs-tailored">
        <h2 className="ui-heading" id="cvs-tailored">{t("cvs.tailored")}</h2>
        {tailored.length === 0 ? <p className="ui-notice">{t("cvs.noTailored")} <Link to="/jobs">{t("cvs.toJobs")}</Link></p>
          : <div className="ui-sheet"><ul className="cvs-list" aria-labelledby="cvs-tailored">
            {tailored.map((item) => {
              const page = `/jobs/${encodeURIComponent(item.jobId)}/cv`;
              const query = `?cv=${encodeURIComponent(item.id)}`;
              return <li key={item.id}><div className="cvs-row">
                <div className="ui-stack ui-stack--s">
                  <p className="cvs-name">{jobName(item.jobTitle, item.company) || t("cvs.untitledJob")}</p>
                  <div className="ui-row">
                    <span className={item.inProgress ? "ui-pill ui-pill--warn" : "ui-pill ui-pill--good"}>{t(item.inProgress ? "cvs.inProgress" : "cvs.ready")}</span>
                    <span className="ui-small ui-muted">{meta([t(`tailored.lang.${item.language}`), item.inProgress ? "" : t(getTemplate(item.template).label),
                      t("cvs.updated", { day: dayOf(item.updatedAt) })])}</span>
                  </div>
                </div>
                <div className="ui-row">
                  {item.inProgress ? <Link className="ui-btn ui-btn--primary ui-btn--sm" to={`/jobs/${encodeURIComponent(item.jobId)}/tailor`}>{t("cvs.continue")}</Link> : <>
                    <Link className="ui-btn ui-btn--sm" to={page + query}>{t("cvs.open")}</Link>
                    <Link className="ui-btn ui-btn--sm" to={`${page}/template${query}`}>{t("cvs.template")}</Link>
                    <Link className="ui-btn ui-btn--sm" to={`${page}/export${query}`}>{t("cvs.export")}</Link>
                  </>}
                </div>
              </div></li>;
            })}
          </ul></div>}
      </section>
      <p className="ui-coach ui-coach--sm cvs-after">{t("cvs.snapshot")}</p>
    </>;
  }

  return <AppShell>
    <main className="ui-page cvs-page">
      <div className="ui-wrap ui-main cvs-mid">
        <h1 className="ui-title">{t("cvs.title")}</h1>
        {body}
      </div>
    </main>
  </AppShell>;
}
