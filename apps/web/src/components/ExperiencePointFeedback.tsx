import {
  pointNeedsExample,
  type PointQuality,
  type QualityIssue,
  type AssessedPoint,
} from "@resumora/contracts/intelligence/experience";
import { useCopy } from "./ui";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";

export function pointFeedback(
  issue: QualityIssue,
  t: (ro: string, en: string) => string,
): string {
  const messages: Record<QualityIssue, [string, string]> = {
    example: [
      "Descrie o activitate de care te ocupai. Câteva cuvinte sunt suficiente.",
      "Describe a task you handled. A few words are enough.",
    ],
    contribution: [
      "Clarifică ce ai făcut tu în această activitate.",
      "Explain what you personally did in this activity.",
    ],
    clarity: [
      "Folosește o formulare directă, despre o singură activitate.",
      "Use direct wording about one activity.",
    ],
    specificity: [
      "Adaugă un detaliu concret: ce făceai, pentru cine sau în ce scop?",
      "Add one concrete detail: what did you do, for whom or why?",
    ],
    methods: [
      "Numește metoda sau instrumentul folosit și explică ce făceai cu el.",
      "Name the method or tool you used and explain what you did with it.",
    ],
    scope: [
      "Spune pentru cine era munca sau cât de amplă era.",
      "Explain who the work was for or how broad it was.",
    ],
    outcome: [
      "Spune la ce folosea munca. Nu este nevoie să inventezi cifre.",
      "Explain what the work helped with. Numbers are optional.",
    ],
    terminology: [
      "Numește competența sau tehnologia demonstrată, dacă o poți confirma.",
      "Name the demonstrated skill or technology, if you can confirm it.",
    ],
    duplicate: [
      "Acest punct repetă o contribuție. Combină-l cu cel original sau descrie altă activitate.",
      "This point repeats a contribution. Combine it with the original or describe another activity.",
    ],
    none: [
      "Punctul este clar și util. Nu este nevoie să îl extinzi.",
      "This point is clear and useful. No need to make it longer.",
    ],
  };
  return t(...messages[issue]);
}
export function ExperiencePointFeedback({
  text,
  quality,
  expanded = false,
  diagnostic,
}: {
  text: string;
  quality?: PointQuality;
  expanded?: boolean;
  diagnostic?: AssessedPoint;
}) {
  const t = useCopy();
  const issue = pointNeedsExample(text) ? "example" : quality?.issue;
  if (!issue) return null;
  const strong =
    issue === "none" &&
    (quality?.score ?? 0) >= experiencePolicy.thresholds.clear;
  return (
    <div
      className={`experience-point-feedback ${strong ? "is-clear" : "needs-detail"}`}
    >
      <span>
        {issue === "example"
          ? t("Are nevoie de un exemplu", "Needs an example")
          : issue === "duplicate"
            ? t("Contribuție repetată", "Repeated contribution")
            : strong
              ? t("Clar și util", "Clear and useful")
              : t("Poate fi mai clar", "Could be clearer")}
      </span>
      {expanded && diagnostic?.strength && <p>{diagnostic.strength}</p>}
      {expanded && (
        <p>
          {diagnostic?.improvement ??
            (issue === "none" && diagnostic?.strength
              ? null
              : pointFeedback(issue, t))}
        </p>
      )}
      {expanded && diagnostic?.suggestedQuestion && (
        <p>{diagnostic.suggestedQuestion}</p>
      )}
      {expanded && quality && (
        <details>
          <summary>
            {t("Cum este evaluat acest punct", "How this point is assessed")}
          </summary>
          <p>
            {t("Calitatea punctului", "Point quality")}:{" "}
            <strong>{quality.score}/100</strong>
          </p>
          <p>
            {t(
              `Contribuție ${experiencePolicy.weights.contribution}% · Claritate ${experiencePolicy.weights.clarity}% · Detalii utile ${experiencePolicy.weights.specificity}%`,
              `Contribution ${experiencePolicy.weights.contribution}% · Clarity ${experiencePolicy.weights.clarity}% · Useful specifics ${experiencePolicy.weights.specificity}%`,
            )}
          </p>
          {!quality.meaningful && (
            <p>
              {t(
                "Fără o activitate recognoscibilă, punctul primește zero.",
                "Without a recognisable activity, this point earns zero.",
              )}
            </p>
          )}
        </details>
      )}
    </div>
  );
}
