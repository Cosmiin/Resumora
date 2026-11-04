import { Sparkles } from "lucide-react";
import { contentLocale } from "@resumora/contracts/editor/content-language";
import { useExperienceScore } from "./useExperienceScore";
import { useContext, useEffect, useState } from "react";
import {
  experienceTarget,
  experienceText,
  currentExperienceAssessment,
} from "@resumora/contracts/intelligence/experience";
import {
  useGuidedExperience,
  type GuidedExperienceProps,
} from "./useGuidedExperience";
import { ExperienceModal } from "./ExperienceModal";
import { ProfileEditorContext } from "./ProfileOverview";
import { Button, useCopy, LanguageContext } from "./ui";
import { ExperienceEnrichment } from "./ExperienceEnrichment";
import { ActivityAnimation } from "./ActivityAnimation";
import { AnswerHint } from "./AnswerHint";
import { GuidedRoleOverview } from "./GuidedRoleOverview";
import { VoiceTyping } from "./VoiceTyping";
import { ProfileSkillsReview } from "./ProfileSkillsReview";
import { usePacedText } from "./usePacedText";

export function ExperienceWorkspace(props: GuidedExperienceProps) {
  if (props.targetId === "__skills") return <ProfileSkillsReview {...props} />;
  const s = props.draft.experienceEnrichment?.[props.targetId];
  const legacy =
    !s?.guided &&
    (s?.editor ||
      s?.proposal ||
      s?.pending?.request.intent === "point" ||
      s?.round?.point);
  return legacy ? (
    <ExperienceEnrichment {...props} />
  ) : (
    <GuidedExperience {...props} />
  );
}

export function GuidedExperience(props: GuidedExperienceProps) {
  const score = useExperienceScore(props);
  const flow = useGuidedExperience(props),
    t = useCopy(),
    locale = contentLocale(props.draft),
    profile = useContext(ProfileEditorContext);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const target = experienceTarget(props.draft, props.targetId),
    s = flow.state;
  const display = usePacedText(
    flow.stream,
    `${props.draft.id}:${props.targetId}:${flow.streamOperationId}`,
  );
  const revealing =
    !!s.roleProposal &&
    !!flow.stream &&
    display.pending &&
    !flow.saved &&
    !flow.foreground;
  const showingDraft =
    (flow.foreground && s.pending?.request.intent === "role" && !flow.error) ||
    revealing;
  useEffect(() => {
    profile?.setRoleBusy(props.targetId, flow.foreground && flow.working);
    return () => profile?.setRoleBusy(props.targetId, false);
  }, [props.targetId, flow.foreground, flow.working, profile?.setRoleBusy]);
  if (!target) return null;
  const current = currentExperienceAssessment(
    props.draft,
    props.targetId,
    locale,
  );
  const preview =
    s.preview?.candidate === s.candidate ? s.preview?.assessment : undefined;
  const comparable =
    current?.rubric === "experience-quality/3" &&
    current.scope === "complete" &&
    preview?.rubric === "experience-quality/3" &&
    preview.scope === "complete" &&
    current.policyVersion === preview.policyVersion &&
    current.feedbackLocale === preview.feedbackLocale;
  const label =
    target.kind === "projects"
      ? t("proiect", "project")
      : target.kind === "volunteering"
        ? t("activitate de voluntariat", "volunteering entry")
        : t("rol", "role");
  const blocked = flow.foreground || flow.preparing || voiceBusy;
  const overview = !flow.saved && !showingDraft && !s.roleProposal;
  return (
    <ExperienceModal
      wide={overview}
      footer={
        s.roleProposal && !showingDraft && !flow.saved ? (
          <Button
            variant="primary"
            disabled={!s.candidate?.trim() || flow.preparing}
            onClick={() => void flow.accept()}
          >
            {t("Folosește această versiune", "Use this version")}
          </Button>
        ) : undefined
      }
      context={target.title.value || label}
      reviewing={(!flow.foreground && !!s.roleProposal) || flow.saved}
      canReview
      showSteps={false}
      busy={flow.foreground && flow.working}
      focusKey={
        flow.saved
          ? "saved"
          : showingDraft
            ? "drafting"
            : s.roleProposal
              ? "review"
              : flow.questionsOpen
                ? (flow.question?.id ?? "questions")
                : "start"
      }
      close={props.close ?? profile?.closeEnrichment ?? (() => {})}
    >
      <div
        className={`guided-experience experience-modal-scroll stack${overview ? " guided-experience-overview" : ""}`}
      >
        {props.saveFailed && (
          <div role="alert">
            <p>
              {t(
                "Modificările sunt păstrate aici. Salvarea profilului trebuie reluată.",
                "Your changes are retained here. The Profile save needs attention.",
              )}
            </p>
            {props.retrySave && (
              <Button variant="primary" onClick={props.retrySave}>
                {t("Reîncearcă salvarea", "Retry save")}
              </Button>
            )}
          </div>
        )}
        {flow.error && (
          <div role="alert">
            <p>
              {["AI_DISABLED", "AI_UNCONFIGURED"].includes(flow.error)
                ? t(
                    "Asistența AI nu este disponibilă momentan. Serviciul trebuie configurat înainte de a pregăti întrebări sau propuneri noi. Descrierea și răspunsurile tale sunt păstrate.",
                    "AI assistance is currently unavailable. The service needs to be configured before it can prepare new questions or proposals. Your description and answers are retained.",
                  )
                : flow.error === "STALE_INPUT"
                  ? t(
                      "Informațiile s-au schimbat. Pregătește o versiune nouă.",
                      "The evidence changed. Prepare a new version.",
                    )
                  : s.pending
                    ? t(
                        flow.error === "MISSING"
                          ? "Cererea nu a pornit. O poți relua; răspunsurile sunt păstrate."
                          : "Cererea s-a întrerupt. Răspunsurile tale sunt păstrate.",
                        flow.error === "MISSING"
                          ? "The request did not start. You can resume it; your answers are retained."
                          : "The request was interrupted. Your answers are retained.",
                      )
                    : t(
                        "Nu am putut pregăti rezultatul. Poți încerca din nou; informațiile sunt păstrate.",
                        "We couldn’t prepare the result. You can try again; your information is retained.",
                      )}
            </p>
            {s.pending &&
              !["AI_RESULT_UNAVAILABLE", "MISSING"].includes(flow.error) && (
                <Button
                  variant="ghost"
                  disabled={flow.working}
                  onClick={() => void flow.check()}
                >
                  {t("Verifică rezultatul", "Check result")}
                </Button>
              )}
            {flow.error === "AI_RESULT_UNAVAILABLE" && s.pending && (
              <Button
                variant="primary"
                disabled={flow.working || !props.ready}
                onClick={flow.retry}
              >
                {t("Încearcă din nou", "Try again")}
              </Button>
            )}
            {flow.error === "MISSING" && s.pending && (
              <Button
                variant="primary"
                disabled={flow.working || !props.ready}
                onClick={flow.resume}
              >
                {t("Reia îmbunătățirea", "Resume improvement")}
              </Button>
            )}
          </div>
        )}
        {flow.saved ? (
          <section
            data-modal-stage-focus
            tabIndex={-1}
            className="guided-success"
          >
            <h3>
              {target.kind === "projects"
                ? t("Proiect salvat", "Project saved")
                : target.kind === "volunteering"
                  ? t("Activitate salvată", "Volunteering entry saved")
                  : t("Rol salvat", "Role saved")}
            </h3>
            <p>
              {t(
                "Ai o versiune nouă, verificată de tine. Un pas înainte pentru CV-ul tău.",
                "You have a new version you’ve reviewed. Another step forward for your CV.",
              )}
            </p>
            {s.acceptedScore && s.acceptedScore.text === s.acceptedText && (
              <p className="guided-score">
                {t("Calitatea redactării", "Writing quality")}:{" "}
                <strong>
                  {s.acceptedScore.before === undefined
                    ? s.acceptedScore.after
                    : `${s.acceptedScore.before} → ${s.acceptedScore.after}`}
                </strong>
              </p>
            )}
            <Button
              variant="primary"
              onClick={() => profile?.nextRole(props.targetId, false)}
            >
              {t("Continuă", "Continue")}
            </Button>
            {s.undo && (
              <Button variant="ghost" onClick={flow.undo}>
                {t("Anulează schimbarea", "Undo change")}
              </Button>
            )}
          </section>
        ) : flow.saving ? (
          <p role="status">{t("Salvăm rolul…", "Saving your role…")}</p>
        ) : showingDraft ? (
          <section className="guided-drafting" aria-busy={flow.foreground}>
            {!flow.stream && (
              <ActivityAnimation active={flow.working && !props.saveFailed} />
            )}
            <p role="status">
              {props.saveFailed
                ? t(
                    "Îmbunătățirea începe după salvarea profilului.",
                    "Improvement starts after your profile is saved.",
                  )
                : revealing
                  ? t(
                      "Versiunea este pregătită. Citește-o în ritmul tău.",
                      "Your draft is ready. Read at your own pace.",
                    )
                  : flow.elapsed >= 15
                    ? t(
                        "Durează puțin mai mult. Păstrăm progresul și verificăm rezultatul.",
                        "This is taking longer. We’re keeping your progress and checking the result.",
                      )
                    : flow.elapsed >= 10
                      ? t(
                          "Încă pregătim versiunea ta…",
                          "Still preparing your draft…",
                        )
                      : t("Pregătim versiunea ta…", "Preparing your draft…")}
            </p>
            {flow.stream && (
              <div className="guided-stream">
                <span className="small muted">
                  {revealing
                    ? t("Descriere propusă", "Proposed description")
                    : t("În curs de redactare…", "Drafting…")}
                </span>
                <div className="guided-prose">
                  {display.text.split(/(\s+)/u).map((part, index) =>
                    /^\s+$/u.test(part) ? (
                      part
                    ) : (
                      <span
                        key={`${flow.streamOperationId}:${index}`}
                        className="guided-word"
                      >
                        {part}
                      </span>
                    ),
                  )}
                  <span className="guided-cursor" aria-hidden="true">
                    ▍
                  </span>
                </div>
              </div>
            )}
            {revealing && (
              <Button variant="ghost" onClick={display.showAll}>
                {t("Arată tot textul", "Show full text")}
              </Button>
            )}
          </section>
        ) : s.roleProposal ? (
          <section className="stack" data-modal-stage-focus tabIndex={-1}>
            <h3>
              {t(
                "O descriere mai clară, în cuvintele tale",
                "A clearer description, in your words",
              )}
            </h3>
            <p>{s.roleProposal.explanation}</p>
            <div className="guided-score" role="status">
              <span>{t("Calitatea redactării", "Writing quality")}</span>
              <strong>
                {comparable
                  ? `${current.score} → ${preview.score}`
                  : preview?.rubric === "experience-quality/3" &&
                      preview.scope === "complete"
                    ? preview.score
                    : (current?.score ?? "—")}
              </strong>
              <span className="small">
                {!preview
                  ? s.previewFailed
                    ? t(
                        "Scorul nu este disponibil. Poți verifica și folosi textul.",
                        "The score is unavailable. You can review and use the text.",
                      )
                    : t(
                        "Verificăm propunerea. O poți folosi și înainte de scor.",
                        "Assessing the proposal. You can use it before the score arrives.",
                      )
                  : preview.rubric === "experience-quality/3" &&
                      preview.scope === "partial"
                    ? t("Evaluare parțială", "Partial assessment")
                    : comparable && preview.score === current.score
                      ? t(
                          "Aceeași evaluare; alege formularea care te reprezintă.",
                          "Same score; choose the wording that represents you.",
                        )
                      : ""}
              </span>
            </div>
            <label className="stack">
              {t("Descriere propusă", "Proposed description")}
              <textarea
                rows={10}
                maxLength={12000}
                value={s.candidate ?? s.roleProposal.text}
                onChange={(e) => flow.editCandidate(e.target.value)}
              />
            </label>
            <details>
              <summary>{t("Arată originalul", "Show original")}</summary>
              <div className="guided-prose">
                {experienceText(props.draft, props.targetId)}
              </div>
            </details>
            <Button
              variant="ghost"
              disabled={!!s.pending || flow.preparing}
              onClick={() => void flow.queue("role")}
            >
              {t("Pregătește o versiune nouă", "Prepare a new version")}
            </Button>
          </section>
        ) : (
          <GuidedRoleOverview
            body={experienceText(props.draft, props.targetId)}
            assessment={current}
            textAction={
              <Button
                variant="ghost"
                className="btn btn-ghost guided-improve-icon"
                disabled={blocked}
                aria-label={t(
                  "Îmbunătățește formularea cu AI",
                  "Improve wording with AI",
                )}
                title={t(
                  "Îmbunătățește formularea folosind doar informațiile existente",
                  "Improve wording using only existing information",
                )}
                onClick={() => void flow.queue("role")}
              >
                <Sparkles size={18} aria-hidden="true" />
              </Button>
            }
            contentLocale={locale}
            scoreControls={
              <div className="stack">
                <Button
                  variant="ghost"
                  disabled={
                    score.running ||
                    score.preparing ||
                    !props.ready ||
                    !experienceText(props.draft, props.targetId).trim()
                  }
                  onClick={() => void score.check()}
                >
                  {score.running || score.preparing
                    ? t("Evaluăm experiența…", "Assessing experience…")
                    : score.error === "failed"
                      ? t("Reîncearcă evaluarea", "Retry assessment")
                      : score.pending
                        ? t(
                            "Verifică progresul evaluării",
                            "Check assessment progress",
                          )
                        : current
                          ? t("Recalculează scorul", "Recalculate score")
                          : t("Evaluează experiența", "Assess experience")}
                </Button>
                {score.error && (
                  <p role="status">
                    {t(
                      "Evaluarea nu a putut fi finalizată. Poți reîncerca sau continua editarea; informațiile tale sunt păstrate.",
                      "The assessment could not finish. Retry or keep editing; your information is retained.",
                    )}
                  </p>
                )}
              </div>
            }
            onSelectPoint={flow.ask}
            disabled={blocked}
            questioning={flow.questionsOpen}
            activePoint={
              flow.questionsOpen ? flow.activeQuestionPoint : undefined
            }
            completedPoints={[s.round, ...(s.rounds ?? [])]
              .filter(
                (r) =>
                  r?.point &&
                  r.answerIds.some((id) =>
                    props.draft.answers.some(
                      (a) => a.id === id && a.status === "confirmed",
                    ),
                  ),
              )
              .map((r) => r!.point!.start)}
          >
            {flow.questionsOpen &&
            flow.question &&
            !flow.foreground &&
            !flow.preparing ? (
              <section className="stack" data-modal-stage-focus tabIndex={-1}>
                {s.round!.questions.length > 1 && (
                  <span className="small muted">
                    {t("Întrebarea", "Question")} {flow.qIndex + 1} /{" "}
                    {s.round!.questions.length}
                  </span>
                )}
                <label className="stack">
                  <h3>{flow.question!.text}</h3>
                  <textarea
                    rows={4}
                    aria-describedby={`answer-hint-${flow.question!.id}`}
                    maxLength={4000}
                    value={flow.answer?.text ?? ""}
                    onChange={(e) => flow.answerText(e.target.value)}
                  />
                </label>
                {props.transcribe && (
                  <VoiceTyping
                    language={locale}
                    key={`${props.targetId}:${flow.question!.id}`}
                    transcribe={props.transcribe}
                    disabled={flow.foreground || flow.preparing}
                    onBusyChange={setVoiceBusy}
                    remainingCharacters={Math.max(
                      0,
                      4000 - (flow.answer?.text.length ?? 0) - 1,
                    )}
                    onTranscript={flow.appendAnswerText}
                  />
                )}
                <AnswerHint
                  locale={locale}
                  question={flow.question!}
                  id={`answer-hint-${flow.question!.id}`}
                />
                <Button
                  variant="primary"
                  disabled={!flow.answer?.text.trim() || blocked}
                  onClick={() => flow.advance(false, true)}
                >
                  {flow.qIndex === s.round!.questions.length - 1
                    ? t("Vezi propunerea", "See proposal")
                    : t("Următoarea întrebare", "Next question")}
                </Button>
                <div className="guided-secondary">
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={flow.back}
                  >
                    {t("Înapoi la sugestii", "Back to suggestions")}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={() => flow.advance(true)}
                  >
                    {t("Sari peste", "Skip")}
                  </Button>
                </div>
              </section>
            ) : flow.questionsOpen &&
              (flow.preparing || (flow.foreground && !flow.error)) ? (
              <section
                className="stack"
                aria-busy="true"
                data-modal-stage-focus
                tabIndex={-1}
              >
                <ActivityAnimation active={flow.working && !props.saveFailed} />
                <p role="status">
                  {props.saveFailed
                    ? t(
                        "Întrebările pornesc după salvarea profilului.",
                        "Questions start after your profile is saved.",
                      )
                    : t(
                        "Pregătim întrebările pentru tine…",
                        "Preparing your questions…",
                      )}
                </p>
                <Button variant="ghost" onClick={flow.back}>
                  {t("Înapoi la sugestii", "Back to suggestions")}
                </Button>
              </section>
            ) : flow.questionsOpen ? (
              <section className="stack">
                {!s.pending && (
                  <p role="status">
                    {t(
                      "Ai parcurs întrebările pentru acest punct. Detaliile sunt păstrate.",
                      "You’ve worked through the questions for this point. Your details are retained.",
                    )}
                  </p>
                )}
                {!s.pending &&
                  s.round?.answerIds.map((id) => {
                    const answer = props.draft.answers.find(
                      (a) => a.id === id && a.status === "confirmed",
                    );
                    return answer ? <p key={id}>{answer.text}</p> : null;
                  })}
                <Button variant="ghost" onClick={flow.back}>
                  {t("Înapoi la sugestii", "Back to suggestions")}
                </Button>
              </section>
            ) : (
              <>
                {flow.notice && (
                  <p role="status">
                    {flow.notice === "saved"
                      ? t(
                          "Detalii salvate. Alege alt punct sau pregătește descrierea îmbunătățită.",
                          "Details saved. Choose another point or prepare your improved description.",
                        )
                      : t(
                          "Avem suficiente detalii. Poți pregăti descrierea îmbunătățită.",
                          "We have enough details. You can prepare your improved description.",
                        )}
                  </p>
                )}

                <Button
                  variant="primary"
                  disabled={blocked}
                  onClick={() => flow.ask()}
                >
                  {t(
                    "Îmbunătățește experiența prin întrebări",
                    "Improve your experience through questions",
                  )}
                </Button>
                <p className="small muted">
                  {t(
                    "Răspunde la câteva întrebări care te ajută să descrii mai clar ce ai făcut și ce ai realizat în acest rol.",
                    "Answer a few questions to describe more clearly what you did and achieved in this role.",
                  )}
                </p>
              </>
            )}
          </GuidedRoleOverview>
        )}
      </div>
    </ExperienceModal>
  );
}
