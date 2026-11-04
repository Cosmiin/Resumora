import { useContext, useEffect, useId, useState } from "react";
import { Check, ChevronDown, Circle, LoaderCircle } from "lucide-react";
import {
  detailDimensions,
  type ExperienceSession,
  type DetailDimension,
  type PointRef,
  isWritingAssessment,
  assessmentFeedback,
  priorityExperiencePoint,
} from "@resumora/contracts/intelligence/experience";
import type { useExperienceScore } from "./useExperienceScore";
import { pointFeedback } from "./ExperiencePointFeedback";
import { Button, useCopy, LanguageContext } from "./ui";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";

type Props = {
  assessment?: ExperienceSession["assessment"];
  body: string;
  score: ReturnType<typeof useExperienceScore>;
  ready: boolean;
  contentLocale?: string;
  onFocusPoint?: (point: PointRef) => void;
};
const compactQuery = "(max-width: 1000px)";

/** Advice uses the saved assessment only; opening this panel never starts AI work. */
export function ExperienceDetailPanel({
  assessment,
  body,
  score,
  ready,
  onFocusPoint,
  contentLocale,
}: Props) {
  const t = useCopy(),
    titleId = useId(),
    contentId = useId();
  const locale = useContext(LanguageContext);
  const [compact, setCompact] = useState(
    () =>
      window.matchMedia?.(compactQuery).matches ?? window.innerWidth <= 1000,
  );
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.(compactQuery);
    if (!media) return;
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const current =
    score.current !== false &&
    assessment?.body === body &&
    assessment.value.rubric === "experience-quality/3" &&
    assessment.value.policyVersion === experiencePolicy.version
      ? assessment.value
      : undefined;
  const displayed =
    current ??
    (isWritingAssessment(assessment?.value) ? assessment.value : undefined);
  const stale = !!assessment && !current;
  const feedback = assessmentFeedback(current, contentLocale ?? locale);
  const wrongLocale =
    assessment?.body === body &&
    displayed?.rubric === "experience-quality/3" &&
    !assessmentFeedback(displayed, contentLocale ?? locale);
  const updating =
    score.preparing || score.running || (!!score.pending && !score.error);
  const labels: Record<DetailDimension, string> = {
    contribution: t("Contribuția ta", "Your contribution"),
    methods: t("Metode și instrumente", "Methods & tools"),
    scope: t("Amploare și public", "Scope & audience"),
    outcome: t("Scop și rezultat", "Purpose & outcome"),
  };
  const hints: Record<DetailDimension, [string, string, string]> = {
    contribution: [
      t(
        "Spune ce ai făcut, decis sau coordonat personal.",
        "Say what you personally did, decided or owned.",
      ),
      t(
        "Clarifică partea ta: de ce te-ai ocupat tu?",
        "Make your part clearer: what did you do yourself?",
      ),
      t(
        "Contribuția ta este descrisă clar.",
        "Your contribution is clearly described.",
      ),
    ],
    methods: [
      t(
        "Numește instrumentele, tehnologiile sau procesul folosit.",
        "Name the tools, technologies or process you used.",
      ),
      t(
        "Explică modul în care ai folosit instrumentele sau metoda.",
        "Explain how you used the tools or method.",
      ),
      t("Modul tău de lucru este clar.", "Your approach is clearly described."),
    ],
    scope: [
      t(
        "Pentru cine era munca și cât de amplă era?",
        "Who was the work for, and how broad was it?",
      ),
      t(
        "Clarifică publicul, echipa, locațiile sau volumul de lucru.",
        "Clarify the audience, team, locations or workload.",
      ),
      t(
        "Amploarea muncii tale este clară.",
        "The reach of your work is clear.",
      ),
    ],
    outcome: [
      t(
        "Explică rezultatul sau de ce era importantă munca.",
        "Explain the result or why the work mattered.",
      ),
      t(
        "Leagă activitatea de un rezultat util sau de scopul ei.",
        "Connect the work to a useful result or purpose.",
      ),
      t(
        "Scopul sau rezultatul este descris clar.",
        "The purpose or result is clearly described.",
      ),
    ],
  };
  const weakPoints = current?.points.filter((p) => p.issue !== "none") ?? [];
  const priority = current && priorityExperiencePoint(current);
  const diagnostic = feedback?.points.find(
    (p) => p.point.start === priority?.point.start,
  );
  const usefulPoints =
    current?.points.filter(
      (p) => p.meaningful && p.score >= experiencePolicy.thresholds.useful,
    ).length ?? 0;
  const heading = (
    <>
      <span className="experience-guidance-heading">
        <span id={titleId}>
          {t("Calitatea experienței", "Experience quality")}
        </span>
        <span className="experience-guidance-caption">
          {t("În această experiență", "Across this experience")}
        </span>
      </span>
      <span className="experience-guidance-value">
        {updating && (
          <LoaderCircle
            size={18}
            className="experience-score-spinner"
            aria-label={t("Verificare în curs", "Checking in progress")}
          />
        )}
        {displayed ? (
          <>
            <strong>{displayed.score}</strong>
            <small>/100</small>
          </>
        ) : (
          <strong className="is-unchecked">—</strong>
        )}
      </span>
    </>
  );
  return (
    <aside className="experience-guidance" aria-labelledby={titleId}>
      {compact ? (
        <button
          type="button"
          className="experience-guidance-summary"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded(!expanded)}
        >
          {heading}
          <ChevronDown
            size={18}
            className={expanded ? "is-expanded" : ""}
            aria-hidden="true"
          />
          <span className="experience-guidance-mobile-status">
            {updating
              ? t("Se actualizează…", "Updating…")
              : current
                ? weakPoints.length
                  ? t(
                      `${weakPoints.length} ${weakPoints.length === 1 ? "punct" : "puncte"} de clarificat`,
                      `${weakPoints.length} ${weakPoints.length === 1 ? "point" : "points"} to clarify`,
                    )
                  : t(
                      "Punctele sunt clare și utile",
                      "Points are clear and useful",
                    )
                : t("Vezi ce poți include", "See what to include")}
          </span>
        </button>
      ) : (
        <div className="experience-guidance-summary">{heading}</div>
      )}
      <div
        id={contentId}
        className="experience-guidance-content"
        hidden={compact && !expanded}
      >
        {(current || wrongLocale) && displayed && (
          <div
            className="experience-guidance-meter"
            role="meter"
            aria-label={t(
              "Scorul nivelului de detaliu",
              "Experience detail score",
            )}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayed.score}
          >
            <span style={{ width: `${displayed.score}%` }} />
          </div>
        )}
        <p
          className="experience-guidance-state"
          role="status"
          aria-live="polite"
        >
          {updating
            ? t(
                "Verificăm textul folosit în CV…",
                "Checking the wording used in your CV…",
              )
            : score.lastCheck && current
              ? score.lastCheck.before === score.lastCheck.after
                ? t(
                    "Verificat acum · scor neschimbat",
                    "Checked just now · score unchanged",
                  )
                : t(
                    `Verificat acum · ${score.lastCheck.before === undefined ? current.score : `${score.lastCheck.before} → ${current.score}`}/100`,
                    `Checked just now · ${score.lastCheck.before === undefined ? current.score : `${score.lastCheck.before} → ${current.score}`}/100`,
                  )
              : assessment?.value.rubric === "experience-detail/1"
                ? t(
                    "Este disponibilă evaluarea fiecărui punct. Reverifică pentru noul scor.",
                    "Point-by-point assessment is available. Check again for the new score.",
                  )
                : stale
                  ? t(
                      "Textul s-a schimbat. Reverifică pentru recomandări actualizate.",
                      "The wording changed. Check again for current guidance.",
                    )
                  : !current
                    ? t(
                        "Verifică scorul pentru a vedea ce e clar și unde poți adăuga detalii.",
                        "Check your score to see what’s clear and where more detail could help.",
                      )
                    : t(
                        "Pe baza textului folosit în CV.",
                        "Based on the wording used in your CV.",
                      )}
        </p>
        {(!score.automatic ||
          !current ||
          score.error ||
          score.pending ||
          wrongLocale) && (
          <Button
            variant="ghost"
            aria-busy={updating}
            disabled={
              updating ||
              !body.trim() ||
              (score.error === "not_started" && !ready)
            }
            onClick={() => void score.check()}
          >
            {updating && (
              <LoaderCircle
                size={16}
                className="experience-score-spinner"
                aria-hidden="true"
              />
            )}
            {updating
              ? t("Verificăm experiența…", "Checking experience…")
              : wrongLocale
                ? t(
                    "Actualizează limba recomandărilor",
                    "Update feedback language",
                  )
                : score.automatic && score.error === "failed"
                  ? t("Reîncearcă evaluarea", "Retry assessment")
                  : score.pending
                    ? score.error === "not_started"
                      ? t("Continuă", "Continue")
                      : t("Verifică progresul", "Check progress")
                    : assessment
                      ? t("Reverifică", "Check again")
                      : t("Verifică nivelul de detaliu", "Check detail score")}
          </Button>
        )}
        {score.error && (
          <p className="experience-guidance-error" role="status">
            {t(
              "Scorul nu a putut fi actualizat. Poți continua editarea; textul CV-ului este păstrat.",
              "The score couldn’t be updated. You can keep editing; your CV text is safe.",
            )}
          </p>
        )}
        {(updating || stale) && displayed && (
          <p className="experience-score-previous">
            {t(
              score.error
                ? "Scor anterior — evaluarea nu este disponibilă."
                : "Scor anterior — verificarea este în curs.",
              score.error
                ? "Previous score — assessment unavailable."
                : "Previous score — checking is in progress.",
            )}
          </p>
        )}
        {current && (
          <div className="experience-quality-summary">
            <h3>
              {current.score < experiencePolicy.thresholds.substantialWork
                ? t("Are nevoie de completări", "Needs substantial work")
                : current.score < experiencePolicy.thresholds.clear
                  ? t(
                      "O bază utilă, cu detalii de adăugat",
                      "A useful start, with details to add",
                    )
                  : t(
                      "Contribuții clare și utile",
                      "Clear and useful contributions",
                    )}
            </h3>
            <p>
              {t(
                `${usefulPoints} ${usefulPoints === 1 ? "punct util" : "puncte utile"} · ${weakPoints.length} de clarificat`,
                `${usefulPoints} useful ${usefulPoints === 1 ? "point" : "points"} · ${weakPoints.length} to clarify`,
              )}
            </p>
            {priority && (
              <>
                <p>
                  {diagnostic?.improvement ?? pointFeedback(priority.issue, t)}
                </p>
                {onFocusPoint && (
                  <Button
                    variant="ghost"
                    disabled={updating}
                    onClick={() => onFocusPoint(priority.point)}
                  >
                    {t(
                      `Lucrează la punctul ${current.points.findIndex((p) => p.point.start === priority.point.start) + 1}`,
                      `Work on point ${current.points.findIndex((p) => p.point.start === priority.point.start) + 1}`,
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
        {feedback?.experience && (
          <div className="experience-quality-summary">
            {(
              ["distinctiveness", "professionalValue", "coherence"] as const
            ).map((key) => {
              const observation = feedback.experience![key];
              if (observation.status === "insufficient_context") return null;
              const label =
                key === "distinctiveness"
                  ? t("Contribuții distincte", "Distinct responsibilities")
                  : key === "professionalValue"
                    ? t("Valoarea contribuției", "Professional contribution")
                    : t("Coerența experienței", "Experience coherence");
              return (
                <div key={key}>
                  <h4>{label}</h4>
                  {observation.strength && <p>{observation.strength}</p>}
                  {observation.improvement && <p>{observation.improvement}</p>}
                </div>
              );
            })}
          </div>
        )}
        {current?.rubric === "experience-quality/3" &&
          current.scope === "partial" && (
            <p>
              {t(
                "Punctele au fost evaluate în grupuri. Coerența întregii experiențe nu a fost evaluată.",
                "Points were assessed in groups. Whole-experience coherence was not assessed.",
              )}
            </p>
          )}
        <p className="experience-ats-note">
          {t(
            "Instrumentele și competențele reale, numite clar, ajută angajatorii să găsească experiența ta. Le poți verifica la final.",
            "Clearly named tools and skills help employers find your experience. Review the supported skills when you’re ready.",
          )}
        </p>
        {!current && (
          <div className="experience-guidance-next">
            <h3>{t("Ce merită să incluzi", "What to include")}</h3>
            <p>
              {t(
                "O experiență ușor de înțeles răspunde la aceste patru întrebări.",
                "An easy-to-understand experience covers these four areas.",
              )}
            </p>
          </div>
        )}
        <h3 className="experience-coverage-title">
          {t(
            "Ce explică experiența în ansamblu",
            "Coverage across this experience",
          )}
        </h3>
        <ul className="experience-guidance-list">
          {detailDimensions.map((dimension) => {
            const grade = current?.dimensions.find(
              (g) => g.dimension === dimension,
            );
            const state = grade?.grade ?? "unchecked";
            const Icon = state === "specific" ? Check : Circle;
            return (
              <li
                key={dimension}
                className={`experience-guidance-item is-${state === "missing" ? "unchecked" : state}`}
              >
                <div className="experience-guidance-item-heading">
                  <h4>{labels[dimension]}</h4>
                  <span className="experience-guidance-badge">
                    <Icon size={13} aria-hidden="true" />
                    {state === "specific"
                      ? t("Bine explicat", "Well explained")
                      : state === "partial"
                        ? t("Poate fi mai clar", "Could be clearer")
                        : state === "missing"
                          ? t("Nu este menționat", "Not stated")
                          : t("De verificat", "Not assessed")}
                  </span>
                </div>
                <p>
                  {state === "missing" || state === "partial"
                    ? t(
                        "Adaugă detalii doar dacă ajută la înțelegerea muncii tale.",
                        "Add detail only if it helps explain your work.",
                      )
                    : hints[dimension][state === "specific" ? 2 : 0]}
                </p>
                {!!grade?.evidence.length && (
                  <details>
                    <summary>
                      {t("Vezi formularea din CV", "See wording in your CV")}
                    </summary>
                    {[...new Set(grade.evidence)].map((quote) => (
                      <q key={quote}>{quote}</q>
                    ))}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        <p className="experience-guidance-footnote">
          {t(
            "Alege un punct și folosește «Ajută-mă să adaug detalii». Scorul se actualizează după ce salvezi sau folosești un punct.",
            "Choose a point and use “Help me add more detail”. The score updates after you save or use a point.",
          )}
        </p>
      </div>
    </aside>
  );
}
