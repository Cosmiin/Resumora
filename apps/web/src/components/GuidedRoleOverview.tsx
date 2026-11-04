import { useContext, useId, useRef, useState, type ReactNode } from "react";
import {
  experiencePoints,
  assessmentFeedback,
  type DetailAssessment,
  type PointRef,
} from "@resumora/contracts/intelligence/experience";
import { pointFeedback } from "./ExperiencePointFeedback";
import { LanguageContext, useCopy } from "./ui";

export function GuidedRoleOverview({
  body,
  assessment,
  children,
  onSelectPoint,
  disabled = false,
  activePoint,
  questioning = false,
  completedPoints = [],
  scoreControls,
  textAction,
  contentLocale,
}: {
  body: string;
  assessment?: DetailAssessment;
  children: ReactNode;
  onSelectPoint?: (point: PointRef) => void;
  disabled?: boolean;
  activePoint?: PointRef;
  questioning?: boolean;
  completedPoints?: number[];
  scoreControls?: ReactNode;
  textAction?: ReactNode;
  contentLocale?: string;
}) {
  const t = useCopy(),
    locale = useContext(LanguageContext),
    prefix = useId();
  const [selected, setSelected] = useState<number>();
  const elements = useRef(new Map<number, HTMLDivElement>());
  const points = experiencePoints(body),
    feedback = assessmentFeedback(assessment, contentLocale ?? locale);
  const actionable =
    assessment?.rubric === "experience-quality/3"
      ? assessment.points
          .filter((p) => p.issue !== "none")
          .sort((a, b) => a.score - b.score)
      : [];
  const focus = (start: number) => {
    setSelected(start);
    const element = elements.current.get(start);
    element?.scrollIntoView?.({
      block: "nearest",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    element?.focus({ preventScroll: true });
  };
  const advice = (point: (typeof actionable)[number]) => {
    const index = points.findIndex((p) => p.start === point.point.start);
    const diagnostic = feedback?.points.find(
      (p) => p.point.start === point.point.start,
    );
    return (
      <button
        type="button"
        key={point.id}
        className={`guided-advice${(activePoint?.start ?? selected) === point.point.start ? " is-selected" : ""}`}
        aria-controls={`${prefix}-${point.point.start}`}
        disabled={disabled}
        onClick={() => {
          focus(point.point.start);
          onSelectPoint?.(point.point);
        }}
      >
        <span>
          {t(`Punctul ${index + 1}`, `Point ${index + 1}`)}{" "}
          <span>
            {completedPoints.includes(point.point.start)
              ? t("Detalii adăugate ✓", "Details added ✓")
              : ""}
          </span>
        </span>
        <strong>
          {diagnostic?.improvement || pointFeedback(point.issue, t)}
        </strong>
      </button>
    );
  };
  const expanded = activePoint?.start ?? selected;
  const inline =
    questioning &&
    !!activePoint &&
    points.some((point) => point.start === activePoint.start);
  return (
    <section
      className="guided-overview"
      data-modal-stage-focus={questioning ? undefined : true}
      tabIndex={-1}
    >
      <div className="guided-original">
        <div className="guided-section-heading">
          <h3>{t("Descrierea actuală", "Current description")}</h3>
          {textAction}
        </div>
        {points.length ? (
          points.map((point, index) => (
            <div
              className={`guided-original-point${(activePoint?.start ?? selected) === point.start ? " is-selected" : ""}`}
              key={point.start}
              id={`${prefix}-${point.start}`}
              tabIndex={-1}
              ref={(node) => {
                if (node) elements.current.set(point.start, node);
                else elements.current.delete(point.start);
              }}
            >
              <span
                className={`guided-point-number${actionable.some((item) => item.point.start === point.start) ? " needs-detail" : ""}`}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              {onSelectPoint ? (
                <button
                  type="button"
                  className="guided-point-select"
                  disabled={disabled}
                  aria-expanded={questioning && expanded === point.start}
                  aria-controls={
                    questioning && expanded === point.start
                      ? `${prefix}-questions`
                      : undefined
                  }
                  onClick={() => {
                    focus(point.start);
                    onSelectPoint(point);
                  }}
                >
                  {point.text}
                </button>
              ) : (
                <p>{point.text}</p>
              )}
              {inline && expanded === point.start && (
                <div
                  className="guided-inline-questions"
                  id={`${prefix}-questions`}
                >
                  {children}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="muted">
            {t(
              "Adaugă detalii despre activitatea ta pentru a crea descrierea.",
              "Add details about your work to create a description.",
            )}
          </p>
        )}
        {!inline && <div className="guided-overview-actions">{children}</div>}
      </div>
      <aside
        className="guided-guidance stack"
        aria-label={t("Ghid de redactare", "Writing guidance")}
      >
        <div className="guided-score">
          <span>{t("Calitatea redactării", "Writing quality")}</span>
          <strong>
            {assessment?.score ?? "—"}
            <small> / 100</small>
          </strong>
        </div>
        {scoreControls}
        {!!actionable.length && (
          <div className="guided-advice-list">
            {actionable.slice(0, 3).map(advice)}
            {actionable.length > 3 && (
              <details>
                <summary>{t("Toate sugestiile", "All suggestions")}</summary>
                {actionable.slice(3).map(advice)}
              </details>
            )}
          </div>
        )}
        {!assessment && (
          <p className="small muted">
            {t(
              "Evaluarea nu este încă disponibilă. Poți începe cu detaliile pe care le cunoști.",
              "The assessment is not available yet. You can start with the details you know.",
            )}
          </p>
        )}
        <details>
          <summary>
            {t("Cum funcționează scorul?", "How does the score work?")}
          </summary>
          <p>
            {t(
              "Evaluăm contribuția, claritatea și specificitatea. Scorul descrie redactarea, nu șansa de angajare.",
              "We assess contribution, clarity and specificity. The score describes writing quality, not your chance of being hired.",
            )}
          </p>
        </details>
      </aside>
    </section>
  );
}
