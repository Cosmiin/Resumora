import { contentLocale } from "@resumora/contracts/editor/content-language";
import { useContext } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import {
  currentExperienceAssessment,
  experienceScoreIdentity,
  experienceText,
  isWritingAssessment,
  assessmentFeedback,
  priorityExperiencePoint,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import type { BaseDraft } from "../base/model";
import { ExperienceScoresContext } from "./useProfileExperienceScores";
import { pointFeedback } from "./ExperiencePointFeedback";
import { useCopy, LanguageContext } from "./ui";

/** A projection of the saved assessment, never another AI request. */
export function ExperienceScoreHint({
  draft,
  id,
}: {
  draft: BaseDraft;
  id: string;
}) {
  const scores = useContext(ExperienceScoresContext),
    t = useCopy();
  const locale = contentLocale(draft);
  if (!scores)
    return (
      <p>
        <Sparkles size={15} aria-hidden="true" />
        {t(
          "Ai putea clarifica impactul acestei experiențe?",
          "Could this experience show your impact more clearly?",
        )}
      </p>
    );
  const s = draft.experienceEnrichment?.[id];
  const current = currentExperienceAssessment(draft, id);
  const previous = isWritingAssessment(s?.assessment?.value)
    ? s.assessment.value
    : undefined;
  const samePending =
    s?.scorePending &&
    (!s.scorePending.scoreIdentity ||
      s.scorePending.scoreIdentity ===
        experienceScoreIdentity(
          draft,
          id,
          s.scorePending.request.feedbackLocale ?? draft.language,
        ));
  const failed = samePending && s?.scoreError;
  const empty = !experienceText(draft, id).trim();
  const updating =
    !empty &&
    !failed &&
    (!current || scores.forRole(id).running || scores.forRole(id).preparing);
  const priority = current && priorityExperiencePoint(current);
  const feedback = assessmentFeedback(current, locale)?.points.find(
    (p) => p.point.start === priority?.point.start,
  );
  const displayed = current ?? previous;
  return (
    <p className="experience-profile-feedback" aria-busy={updating}>
      {updating ? (
        <LoaderCircle
          size={15}
          className="experience-score-spinner"
          aria-hidden="true"
        />
      ) : (
        <Sparkles size={15} aria-hidden="true" />
      )}
      {displayed && (
        <strong className="experience-profile-score">
          {t("Calitatea formulării", "Writing quality")}: {displayed.score}/100
          {!current && t(" · scor anterior", " · previous score")}
        </strong>
      )}
      <span>
        {empty
          ? t(
              "Adaugă ce făceai în acest rol pentru a primi recomandări.",
              "Describe your work in this role to get guidance.",
            )
          : failed
            ? t(
                "Evaluarea nu este disponibilă acum. Poți edita sau reîncerca din experiență.",
                "Assessment is unavailable. You can edit or retry inside this experience.",
              )
            : updating
              ? previous
                ? t(
                    "Actualizăm evaluarea după modificările tale…",
                    "Updating after your changes…",
                  )
                : t("Evaluăm această experiență…", "Reviewing this experience…")
              : priority
                ? (feedback?.improvement ?? pointFeedback(priority.issue, t))
                : t(
                    "Contribuțiile sunt clare și utile. Nu este nevoie să le extinzi.",
                    "Your contributions are clear and useful. No need to make them longer.",
                  )}
      </span>
    </p>
  );
}
