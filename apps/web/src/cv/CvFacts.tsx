import { useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scoredItems, type CvContent } from "@resumora/shared";
import { getPreferences, preferencesKey, savePreferences } from "../account/account-api.ts";
import { useAuth } from "../auth/AuthProvider.tsx";
import { t } from "../i18n/t.ts";
import { averageScore, belowTarget } from "./enrich/EnrichPath.tsx";
import type { RoleScoreState } from "./enrich/useRoleScores.ts";
import { TEMPLATES, type TemplateId } from "./page/templates.ts";

/** A CV with nothing in it yet: the flow starts with an upload instead of an empty page. */
export function isBlankCv(cv: CvContent): boolean {
  const { fullName, summary } = cv.basics;
  return ![fullName, summary].some((s) => s.trim()) && cv.experience.length + cv.education.length + cv.projects.length
    + cv.volunteering.length + cv.technicalSkills.length + cv.professionalSkills.length + cv.unclearSkills.length + cv.languages.length
    + cv.certifications.length + cv.custom.length === 0;
}

/**
 * The template the person's CVs start with (their preference). The base CV page shows it, and choosing another
 * one here saves the preference. Until it has loaded, the page uses the first template.
 */
export function useStartTemplate(enabled: boolean): { template: TemplateId | undefined; choose(id: TemplateId): void; failed: boolean } {
  const key = preferencesKey(useAuth().session?.user.id);
  const client = useQueryClient();
  const preferences = useQuery({ queryKey: key, queryFn: getPreferences, enabled, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: (id: TemplateId) => savePreferences({ defaultTemplate: id }),
    onSuccess: (saved) => client.setQueryData(key, saved),
  });
  return { template: save.isPending ? save.variables : preferences.data?.defaultTemplate, choose: save.mutate, failed: save.isError };
}

type Props = {
  cv: CvContent;
  scores: ReadonlyMap<string, RoleScoreState>;
  template: TemplateId | undefined;
  onTemplate(id: TemplateId): void;
  templateFailed: boolean;
};

/** Beside the base CV: its strength, the template its copies start with, and its language. */
export function CvFacts({ cv, scores, template, onTemplate, templateFailed }: Props) {
  const id = useId();
  const items = scoredItems(cv);
  const strength = averageScore(new Map(items.map(({ item }) => {
    const s = scores.get(item.id);
    return [item.id, s?.state === "ready" ? (s.result?.score ?? null) : null];
  })));
  const waiting = items.filter(({ item }) => scores.get(item.id)?.state === "ready" && belowTarget(scores.get(item.id))).length;
  return (
    <div className="cv-facts">
      <div className="cv-fact">
        <p className="cv-fact-label">{t("enrich.end.strength")}</p>
        <p className="cv-fact-score"><b>{strength ?? "–"}</b>{strength !== null && <small>{t("enrich.end.of100")}</small>}</p>
        <p className="cv-fact-note">
          {strength === null ? t("cv.facts.noScore") : waiting === 0 ? t("cv.facts.clear") : t(waiting === 1 ? "cv.facts.waitingOne" : "cv.facts.waiting", { n: waiting })}
        </p>
      </div>
      <div className="cv-fact">
        <label className="cv-fact-label" htmlFor={id}>{t("cv.facts.template")}</label>
        <select className="ui-input" id={id} value={template ?? TEMPLATES[0].id} onChange={(e) => onTemplate(e.target.value as TemplateId)}>
          {TEMPLATES.map((tpl) => <option key={tpl.id} value={tpl.id}>{t(tpl.label)}</option>)}
        </select>
        <p className="cv-fact-hint">{t("cv.facts.templateHint")}</p>
        {templateFailed && <p role="alert" className="cv-fact-error">{t("cv.facts.templateError")}</p>}
      </div>
      <div className="cv-fact">
        <p className="cv-fact-label">{t("cv.facts.language")}</p>
        <p>{t(`cv.facts.language.${cv.locale}`)}</p>
      </div>
    </div>
  );
}
