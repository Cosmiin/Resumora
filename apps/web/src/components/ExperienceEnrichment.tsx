import { contentLocale } from "@resumora/contracts/editor/content-language";
import { ExperienceDetailPanel } from "./ExperienceDetailPanel";
import { ExperiencePointFeedback } from "./ExperiencePointFeedback";
import { useExperienceScore } from "./useExperienceScore";
import {
  experienceDefiniteFailures,
  experienceRecoveryDelays,
  experienceErrorCode,
} from "../base/experience-requests";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Plus,
  Sparkles,
  Undo2,
  ArrowRight,
} from "lucide-react";
import { clone, localId, type BaseDraft } from "../base/model";
import {
  experienceIdentity,
  currentExperienceAssessment,
  assessmentFeedback,
  experienceText,
  experiencePoints,
  experienceFingerprint,
  type ExperienceSession,
  type ExperienceRequest,
  type ExperienceResult,
  type PointRef,
} from "@resumora/contracts/intelligence/experience";
import {
  applyExperiencePoint,
  undoExperiencePoint,
  confirmExperienceDetail,
  applyExperienceSkills,
} from "../base/experience";
import type { IntelligenceClient } from "../base/intelligence";
import { IntelligenceRequestError } from "../base/intelligence";
import { ExperienceModal } from "./ExperienceModal";
import { ProfileEditorContext } from "./ProfileOverview";
import { AutoTextarea } from "./AutoTextarea";
import { Button, useCopy, LanguageContext } from "./ui";

type Props = {
  draft: BaseDraft;
  targetId: string;
  change: (draft: BaseDraft) => void;
  ready: boolean;
  saveFailed: boolean;
  retrySave?: () => void;
  request: NonNullable<IntelligenceClient["experience"]>;
  close?: () => void;
};
const stateOf = (d: BaseDraft, id: string): ExperienceSession =>
  d.experienceEnrichment?.[id] ?? { version: 1 };
function update(d: BaseDraft, id: string, fn: (s: ExperienceSession) => void) {
  const n = clone(d);
  fn(((n.experienceEnrichment ??= {})[id] ??= { version: 1 }));
  return n;
}

/** Explicit actions create requests. Mount/refresh only recovers an existing receipt. */
export function ExperienceEnrichment(props: Props) {
  const {
    draft: d,
    targetId: id,
    change,
    ready,
    saveFailed,
    retrySave,
    request,
  } = props;
  const feedbackLocale = contentLocale(d);
  const t = useCopy(),
    profile = useContext(ProfileEditorContext);
  const role = d.roles.find((r) => r.id === id);
  const [stage, setStage] = useState<"points" | "questions" | "skills">(() =>
    stateOf(d, id).skills && !profile?.documentMode
      ? "skills"
      : stateOf(d, id).round && !stateOf(d, id).proposal
        ? "questions"
        : "points",
  );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [checking, setChecking] = useState(false),
    [preparing, setPreparing] = useState(false),
    [resume, setResume] = useState(false);
  const [editingDetail, setEditingDetail] = useState<string>(),
    [detailText, setDetailText] = useState("");
  const live = useRef(props);
  live.current = props;
  const armed = useRef(new Set<string>()),
    attempted = useRef(new Set<string>()),
    inFlight = useRef(false),
    queuing = useRef(false),
    alive = useRef(true),
    recoveryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
      undefined,
    ),
    recoveryAttempts = useRef(new Map<string, number>());
  const score = useExperienceScore(props);
  const storedState = stateOf(d, id);
  const identity = role ? experienceIdentity(d, id) : "";
  const [cachePin, setCachePin] = useState<{
    identity: string;
    fingerprint: string;
  }>();
  useEffect(() => {
    if (
      !role ||
      !d.contentLanguage ||
      (!storedState.proposal && !storedState.skills)
    )
      return;
    let active = true;
    void experienceFingerprint(d, id).then((fingerprint) => {
      if (active) setCachePin({ identity, fingerprint });
    });
    return () => {
      active = false;
    };
  }, [
    identity,
    !!d.contentLanguage,
    storedState.proposal?.fingerprint,
    storedState.skills?.fingerprint,
  ]);
  const compatible = (value?: { fingerprint: string }) =>
    !d.contentLanguage ||
    !value ||
    (cachePin?.identity === identity &&
      cachePin.fingerprint === value.fingerprint);
  const s = {
      ...storedState,
      proposal: compatible(storedState.proposal)
        ? storedState.proposal
        : undefined,
      skills: compatible(storedState.skills) ? storedState.skills : undefined,
    },
    body = role ? experienceText(d, id) : "",
    points = experiencePoints(body),
    currentAssessment = currentExperienceAssessment(d, id),
    currentFeedback = assessmentFeedback(currentAssessment, feedbackLocale);
  const pending = s.pending,
    blocked = preparing || working || !!pending,
    editor = s.editor;
  const qIndex =
    s.round?.answerIds.findIndex(
      (answerId) =>
        !d.answers.some(
          (a) =>
            a.id === answerId &&
            ["confirmed", "skipped", "unknown"].includes(a.status),
        ),
    ) ?? -1;
  const question =
    (s.round?.feedbackLocale ??
      (d.contentLanguage?.source !== "user-correction"
        ? d.language
        : undefined)) === feedbackLocale && qIndex >= 0
      ? s.round?.questions[qIndex]
      : undefined;
  const answer = question
    ? d.answers.find((a) => a.id === s.round!.answerIds[qIndex])
    : undefined;
  const editorStale = !!editor && editor.baseText !== body;
  const close = () => {
    if (!working && !preparing) (props.close ?? profile?.closeEnrichment)?.();
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(recoveryTimer.current);
    };
  }, []);
  useEffect(() => {
    profile?.setRoleBusy(id, working);
    return () => profile?.setRoleBusy(id, false);
  }, [working, id, profile?.setRoleBusy]);
  const commit = (
    fn: (s: ExperienceSession) => void,
    base = live.current.draft,
  ) => live.current.change(update(base, id, fn));
  async function queue(
    intent: ExperienceRequest["intent"],
    point?: PointRef,
    base = live.current.draft,
    instruction?: string,
  ) {
    if (intent === "score") {
      void score.queue(base, true);
      return;
    }
    if (inFlight.current || queuing.current || stateOf(base, id).pending)
      return;
    if (intent === "questions" && point) {
      const diagnostic = assessmentFeedback(
        currentExperienceAssessment(base, id),
        feedbackLocale,
      )?.points.find(
        (p) => p.point.start === point.start && p.point.text === point.text,
      );
      if (diagnostic?.suggestedQuestion) {
        const fingerprint = await experienceFingerprint(base, id);
        if (
          !alive.current ||
          experienceIdentity(live.current.draft, id) !==
            experienceIdentity(base, id)
        )
          return;
        const questionText = diagnostic.suggestedQuestion;
        const existing = [...base.answers]
          .reverse()
          .find(
            (a) =>
              a.targetId === id &&
              a.questionText.trim().toLowerCase() ===
                questionText.trim().toLowerCase() &&
              !stateOf(base, id).supersededAnswerIds?.includes(a.id),
          );
        const roundId = crypto.randomUUID();
        const dimension =
          diagnostic.issue === "methods"
            ? "tools"
            : diagnostic.issue === "scope"
              ? "scale"
              : diagnostic.issue === "outcome"
                ? "impact"
                : "ownership";
        commit((state) => {
          state.round = {
            id: roundId,
            feedbackLocale,
            fingerprint,
            point,
            questions: [
              { id: `${roundId}-question`, dimension, text: questionText },
            ],
            answerIds: [existing?.id ?? `${roundId}-answer`],
          };
        });
        setStage("questions");
        return;
      }
    }
    queuing.current = true;
    setPreparing(true);
    setError("");
    setResume(false);
    setNotice("");
    try {
      const identity = experienceIdentity(base, id),
        fingerprint = await experienceFingerprint(base, id);
      if (
        !alive.current ||
        experienceIdentity(live.current.draft, id) !== identity
      )
        return;
      const pending = {
        id: crypto.randomUUID(),
        request: {
          intent,
          fingerprint,
          feedbackLocale,
          ...(point ? { point } : {}),
          ...(instruction ? { instruction } : {}),
        },
      };
      armed.current.add(pending.id);
      commit((state) => {
        state.pending = pending;
      });
    } finally {
      queuing.current = false;
      if (alive.current) setPreparing(false);
    }
  }

  async function execute(recover: boolean) {
    const p = stateOf(live.current.draft, id).pending;
    if (
      !p ||
      p.request.intent === "score" ||
      inFlight.current ||
      (!recover && !live.current.ready)
    )
      return;
    inFlight.current = true;
    clearTimeout(recoveryTimer.current);
    if (!recover) {
      setWorking(true);
      setError("");
    }
    setChecking(recover);
    setResume(false);
    attempted.current.add(p.id);
    try {
      const result = await live.current.request(
        {
          snapshotId: "",
          revision: 0,
          targetId: id,
          operationId: p.id,
          experience: p.request,
        },
        recover,
      );
      if (!alive.current) return;
      const before = live.current.draft,
        identity = experienceIdentity(before, id);
      if (stateOf(before, id).pending?.id !== p.id) return;
      const fingerprint = await experienceFingerprint(before, id);
      const current = live.current.draft;
      if (stateOf(current, id).pending?.id !== p.id) return;
      if (
        fingerprint !== result.fingerprint ||
        experienceIdentity(current, id) !== identity
      ) {
        commit((state) => {
          delete state.pending;
        });
        setError(
          t(
            "Experiența s-a schimbat. Alege din nou punctul pe care vrei să-l îmbunătățești.",
            "This experience changed. Choose the point you want to improve again.",
          ),
        );
        return;
      }
      setError("");
      setResume(false);
      const followUp =
        result.intent === "point" && result.needsDetails
          ? [
              {
                id: `${p.id}-detail`,
                dimension: "ownership" as const,
                text: result.needsDetails,
              },
            ]
          : result.intent === "questions"
            ? result.questions
            : undefined;
      let next = update(current, id, (state) => {
        delete state.pending;
        if (result.intent === "point" && !result.needsDetails) {
          state.proposal = result;
          if (result.assessment)
            state.assessment = {
              fingerprint: result.fingerprint,
              body: experienceText(current, id),
              value: result.assessment,
            };
        }
        if (followUp) {
          if (followUp.length)
            state.round = {
              id: p.id,
              feedbackLocale: p.request.feedbackLocale,
              fingerprint: result.fingerprint,
              ...("point" in result && result.point
                ? { point: result.point }
                : {}),
              questions: followUp,
              answerIds: followUp.map(() => localId()),
            };
        }
        if (result.intent === "skills") {
          state.skills = result;
          state.skillChoices = Object.fromEntries(
            result.skills.map((skill) => [
              skill.id,
              { selected: false, label: skill.label, category: skill.category },
            ]),
          );
        }
        if (result.intent === "score")
          state.assessment = {
            fingerprint: result.fingerprint,
            body: experienceText(current, id),
            value: result.assessment,
          };
      });
      if (followUp?.length) {
        const round = stateOf(next, id).round!;
        for (const [i, q] of followUp.entries())
          next.answers.push({
            id: round.answerIds[i],
            targetId: id,
            question: q.dimension,
            questionText: q.text,
            text: "",
            status: "draft",
          });
        setStage("questions");
      } else if (result.intent === "questions") {
        setNotice(
          t(
            "Ai oferit deja detalii utile. Poți îmbunătăți punctul cu ce ai scris.",
            "You’ve already shared useful detail. Improve this point with what you have.",
          ),
        );
        setStage("points");
      }
      if (result.intent === "skills" && !profile?.documentMode) setStage("skills");
      if (result.intent === "point" && !result.needsDetails) setStage("points");
      live.current.change(next);
    } catch (e) {
      if (!alive.current) return;
      const code = experienceErrorCode(e);
      if (experienceDefiniteFailures.has(code)) {
        commit((state) => {
          delete state.pending;
        });
        setError(
          code === "SAVE_REQUIRED"
            ? t(
                "Salvează modificările și încearcă din nou.",
                "Save your changes and try again.",
              )
            : t(
                "Nu am putut pregăti sugestia. Textul tău este păstrat; poți edita sau încerca din nou.",
                "We couldn’t prepare that suggestion. Your text is safe; edit it or try again.",
              ),
        );
      } else {
        const missing = code === "MISSING" || code === "NOT_FOUND";
        setResume(missing);
        const count = recoveryAttempts.current.get(p.id) ?? 0;
        setError(
          missing
            ? t(
                "Modificările sunt salvate. Continuă când ești pregătit.",
                "Your changes are saved. Continue when you’re ready.",
              )
            : code === "AI_REQUEST_PENDING"
              ? t(
                  "Pregătim în continuare sugestia. Poți închide fereastra și reveni.",
                  "Your suggestion is still being prepared. You can close this window and come back.",
                )
              : t(
                  "Nu am putut confirma rezultatul. Textul tău este păstrat. Verifică progresul sau continuă editarea CV-ului.",
                  "We couldn’t confirm the result. Your text is safe. Check progress or continue editing your CV.",
                ),
        );
        if (!missing && count < experienceRecoveryDelays.length) {
          recoveryAttempts.current.set(p.id, count + 1);
          recoveryTimer.current = setTimeout(
            () => void execute(true),
            experienceRecoveryDelays[count],
          );
        }
      }
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setWorking(false);
        setChecking(false);
      }
    }
  }
  useEffect(() => {
    if (
      !pending ||
      pending.request.intent === "score" ||
      working ||
      attempted.current.has(pending.id)
    )
      return;
    if (armed.current.has(pending.id) && !ready) return;
    void execute(!armed.current.has(pending.id));
  }, [pending?.id, ready]);
  useEffect(() => {
    if (!pending || pending.request.intent === "score") return;
    const recheck = () => {
      if (
        document.visibilityState === "hidden" ||
        inFlight.current ||
        (armed.current.has(pending.id) && !attempted.current.has(pending.id))
      )
        return;
      void execute(true);
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [pending?.id]);
  if (!role) return null;
  function select(point?: PointRef) {
    setStage("points");
    setNotice("");
    setError("");
    commit((state) => {
      state.editor = {
        baseText: body,
        ...(point ? { point } : {}),
        text: point?.text ?? "",
        mode: point ? "edit" : "add",
      };
      delete state.proposal;
      delete state.round;
    });
  }
  async function savePoint(
    text: string,
    origin: "user_authored" | "ai_generated",
    point = editor?.point,
  ) {
    if (editorStale || !text.trim() || text.length > 2000 || blocked) return;
    const before = live.current.draft,
      identity = experienceIdentity(before, id),
      proposal = stateOf(before, id).proposal;
    if (
      origin === "ai_generated" &&
      (!proposal ||
        (await experienceFingerprint(before, id)) !== proposal.fingerprint ||
        experienceIdentity(live.current.draft, id) !== identity)
    ) {
      commit((state) => {
        delete state.proposal;
      });
      setError(
        t(
          "Detaliile s-au schimbat. Pregătește o nouă sugestie.",
          "Details changed. Prepare a new suggestion.",
        ),
      );
      return;
    }
    let next = applyExperiencePoint(
      live.current.draft,
      id,
      point,
      text,
      origin,
    );
    const proposedAssessment =
      origin === "ai_generated" ? proposal?.proposedAssessment : undefined;
    if (proposedAssessment) {
      const fingerprint = await experienceFingerprint(next, id);
      if (experienceIdentity(live.current.draft, id) !== identity) {
        setError(
          t(
            "Experiența s-a schimbat. Alege din nou punctul.",
            "The experience changed. Choose the point again.",
          ),
        );
        return;
      }
      next = applyExperiencePoint(live.current.draft, id, point, text, origin);
      next.experienceEnrichment![id].assessment = {
        fingerprint,
        body: experienceText(next, id),
        value: proposedAssessment,
      };
    }
    change(next);
    setNotice(t("Actualizat", "Updated"));
    setStage("points");
    if (!proposedAssessment) void score.queue(next);
  }

  function setAnswer(text: string) {
    const next = clone(live.current.draft),
      stored = next.answers.find((a) => a.id === s.round!.answerIds[qIndex]);
    if (stored) stored.text = text;
    change(next);
  }
  function confirmAnswer(skip = false) {
    if (!question || !s.round) return;
    const answerId = s.round.answerIds[qIndex];
    if (skip) {
      const next = clone(live.current.draft),
        a = next.answers.find((a) => a.id === answerId)!;
      a.status = "unknown";
      change(next);
    } else
      change(
        confirmExperienceDetail(
          live.current.draft,
          id,
          answer?.text ?? "",
          question.text,
          question.dimension,
          answerId,
        ),
      );
  }
  function finishQuestions() {
    let next = live.current.draft;
    if (question && answer?.text.trim())
      next = confirmExperienceDetail(
        next,
        id,
        answer.text,
        question.text,
        question.dimension,
        answer.id,
      );
    const round = stateOf(next, id).round;
    if (round) {
      next = clone(next);
      for (const a of next.answers)
        if (round.answerIds.includes(a.id) && a.status === "draft")
          a.status = "unknown";
    }
    change(next);
    setStage("points");
    if (
      !round?.point &&
      !stateOf(next, id).editor?.text.trim() &&
      !next.answers.some(
        (a) => round?.answerIds.includes(a.id) && a.status === "confirmed",
      )
    ) {
      setNotice(
        t(
          "Nimic nu a fost adăugat. Poți reveni când îți amintești un detaliu.",
          "Nothing added. Come back whenever you remember a detail.",
        ),
      );
      return;
    }
    void queue("point", round?.point, next);
  }
  const proposal = s.proposal;
  const selectedChoices = Object.values(s.skillChoices ?? {}).filter(
    (c) => c.selected && !c.dismissed && c.label.trim(),
  ).length;
  return (
    <ExperienceModal
      context={[role.title.value, role.company.value]
        .filter(Boolean)
        .join(" · ")}
      reviewing={false}
      canReview={false}
      showSteps={false}
      wide
      busy={working || preparing}
      focusKey={
        stage === "questions"
          ? `question-${qIndex}`
          : stage === "skills"
            ? "skills"
            : proposal
              ? "proposal"
              : editor
                ? `edit-${editor.point?.start ?? "new"}`
                : "points"
      }
      close={close}
      notice={
        saveFailed ? (
          <p className="experience-save-error" role="alert">
            {t(
              "Modificările nu sunt salvate încă.",
              "Your changes haven’t saved yet.",
            )}{" "}
            {retrySave && (
              <Button variant="ghost" onClick={retrySave}>
                {t("Reîncearcă salvarea", "Retry save")}
              </Button>
            )}
          </p>
        ) : undefined
      }
    >
      <div className="experience-workspace-layout">
        <div className="experience-modal-scroll experience-workbench">
          <div className="experience-feedback" aria-live="polite">
            {notice && (
              <span>
                <Check size={16} />
                {notice}
              </span>
            )}
          </div>
          {error && (
            <div className="experience-modal-error" role="alert">
              <p>{error}</p>
              {pending && (
                <div className="experience-actions">
                  <Button
                    disabled={working || checking}
                    onClick={() => void execute(true)}
                  >
                    {t("Verifică progresul", "Check progress")}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={working || preparing}
                    onClick={close}
                  >
                    {t("Continuă editarea CV-ului", "Continue editing CV")}
                  </Button>
                  {resume && (
                    <Button
                      disabled={working || !ready}
                      onClick={() => void execute(false)}
                    >
                      {t("Continuă cererea", "Continue request")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          {pending && !error && (
            <p role="status" className="experience-request-status">
              <Sparkles size={16} />
              {working
                ? pending.request.intent === "score"
                  ? t(
                      "Verificăm detaliile din CV…",
                      "Checking the detail in your CV…",
                    )
                  : pending.request.intent === "questions"
                    ? t(
                        "Găsim câteva întrebări utile…",
                        "Finding a few useful questions…",
                      )
                    : pending.request.intent === "skills"
                      ? t(
                          "Căutăm competențe susținute de experiență…",
                          "Finding skills supported by your experience…",
                        )
                      : t(
                          "Pregătim o variantă pentru acest punct…",
                          "Preparing a version of this point…",
                        )
                : t(
                    "Păstrăm cererea și modificările tale…",
                    "Saving your changes and request…",
                  )}
            </p>
          )}
          {stage === "questions" && s.round ? (
            <>
              <Button
                variant="ghost"
                disabled={blocked}
                onClick={() => setStage("points")}
              >
                <ChevronLeft size={16} />
                {t("Înapoi la punct", "Back to your point")}
              </Button>
              {question ? (
                <>
                  <p className="experience-eyebrow">
                    {t(
                      `Un detaliu util · ${qIndex + 1} din ${s.round.questions.length}`,
                      `One useful detail · ${qIndex + 1} of ${s.round.questions.length}`,
                    )}
                  </p>
                  <h3 data-modal-stage-focus tabIndex={-1}>
                    <label htmlFor="experience-coach-answer">
                      {question.text}
                    </label>
                  </h3>
                  {s.round.point && (
                    <blockquote className="experience-point-context">
                      {s.round.point.text}
                    </blockquote>
                  )}
                  <AutoTextarea
                    id="experience-coach-answer"
                    value={answer?.text ?? ""}
                    maxLength={2000}
                    disabled={blocked}
                    placeholder={t(
                      "Câteva cuvinte sunt suficiente.",
                      "A few words are enough.",
                    )}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  {question.dimension === "tools" && (
                    <ToolHints
                      draft={d}
                      disabled={blocked}
                      onChoose={(tool) =>
                        setAnswer(
                          [answer?.text.trim(), tool]
                            .filter(Boolean)
                            .join(", "),
                        )
                      }
                    />
                  )}
                  <div className="experience-actions">
                    <Button
                      variant="primary"
                      disabled={blocked || !answer?.text.trim()}
                      onClick={() => confirmAnswer()}
                    >
                      {t("Continuă", "Continue")}
                      <ArrowRight size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={blocked}
                      onClick={() => confirmAnswer(true)}
                    >
                      {t("Nu sunt sigur", "Not sure")}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={finishQuestions}
                  >
                    {t(
                      "Încheie cu ce am oferit",
                      "Finish with what I’ve shared",
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <h3 data-modal-stage-focus tabIndex={-1}>
                    {t(
                      "Suficient pentru un punct mai clar",
                      "Enough for a clearer point",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Folosim doar detaliile pe care le-ai confirmat.",
                      "We’ll use only the details you confirmed.",
                    )}
                  </p>
                  <Button
                    variant="primary"
                    disabled={blocked}
                    onClick={finishQuestions}
                  >
                    {t("Arată-mi punctul", "Show me the point")}
                    <ArrowRight size={16} />
                  </Button>
                </>
              )}
            </>
          ) : stage === "skills" && s.skills && !profile?.documentMode ? (
            <>
              <Button
                variant="ghost"
                disabled={blocked}
                onClick={() => setStage("points")}
              >
                <ChevronLeft size={16} />
                {t("Înapoi la experiență", "Back to experience")}
              </Button>
              <h3 data-modal-stage-focus tabIndex={-1}>
                {t(
                  "Ce competențe vrei în CV?",
                  "Which skills belong on your CV?",
                )}
              </h3>
              <p className="experience-modal-intro">
                {t(
                  "Alege ce te reprezintă. Poți schimba denumirea sau categoria.",
                  "Choose what represents you. You can change the name or category.",
                )}
              </p>
              {!s.skills.skills.length && (
                <p>
                  {t(
                    "Nu am găsit competențe noi suficient susținute. Le poți adăuga oricând în profil.",
                    "No new skills were clearly supported. You can always add skills in your profile.",
                  )}
                </p>
              )}
              {(["technicalSkills", "professionalSkills"] as const).map(
                (category) => (
                  <section key={category} className="experience-skill-group">
                    <h4>
                      {category === "technicalSkills"
                        ? t("Competențe tehnice", "Technical skills")
                        : t("Competențe profesionale", "Professional skills")}
                    </h4>
                    {s
                      .skills!.skills.filter(
                        (skill) =>
                          !s.skillChoices?.[skill.id]?.dismissed &&
                          (s.skillChoices?.[skill.id]?.category ??
                            skill.category) === category,
                      )
                      .map((skill) => {
                        const choice = s.skillChoices![skill.id];
                        const choose = (patch: Partial<typeof choice>) => {
                          commit((state) => {
                            state.skillChoices![skill.id] = {
                              ...state.skillChoices![skill.id],
                              ...patch,
                            };
                          });
                          if (patch.category)
                            requestAnimationFrame(() =>
                              document
                                .getElementById(
                                  `experience-skill-category-${skill.id}`,
                                )
                                ?.focus(),
                            );
                        };
                        return (
                          <article
                            className="experience-skill-choice"
                            key={skill.id}
                          >
                            <div className="experience-skill-fields">
                              <input
                                type="checkbox"
                                aria-label={t(
                                  `Include ${choice.label}`,
                                  `Include ${choice.label}`,
                                )}
                                checked={choice.selected}
                                disabled={blocked}
                                onChange={(e) =>
                                  choose({ selected: e.target.checked })
                                }
                              />
                              <input
                                aria-label={t(
                                  `Denumire: ${skill.label}`,
                                  `Skill name: ${skill.label}`,
                                )}
                                value={choice.label}
                                maxLength={100}
                                disabled={blocked}
                                onChange={(e) =>
                                  choose({ label: e.target.value })
                                }
                              />
                            </div>
                            <select
                              id={`experience-skill-category-${skill.id}`}
                              aria-label={t(
                                `Categorie: ${skill.label}`,
                                `Category: ${skill.label}`,
                              )}
                              value={choice.category}
                              disabled={blocked}
                              onChange={(e) =>
                                choose({
                                  category: e.target.value as typeof category,
                                })
                              }
                            >
                              <option value="technicalSkills">
                                {t("Tehnică", "Technical")}
                              </option>
                              <option value="professionalSkills">
                                {t("Profesională", "Professional")}
                              </option>
                            </select>
                            <Button
                              variant="ghost"
                              className="experience-dismiss-skill"
                              disabled={blocked}
                              aria-label={t(
                                `Omite ${skill.label}`,
                                `Dismiss ${skill.label}`,
                              )}
                              onClick={() =>
                                choose({ selected: false, dismissed: true })
                              }
                            >
                              {t("Omite", "Dismiss")}
                            </Button>
                          </article>
                        );
                      })}
                  </section>
                ),
              )}
            </>
          ) : (
            <>
              <div className="experience-workbench-intro" hidden={!!editor}>
                <h3 data-modal-stage-focus tabIndex={-1}>
                  {t(
                    "Experiența ta, punct cu punct",
                    "Your experience, one point at a time",
                  )}
                </h3>
                <p>
                  {t(
                    "Alege un punct. Scrie în felul tău sau lasă-ne să-l facem mai clar.",
                    "Choose a point. Write it your way, or let us help make it clearer.",
                  )}
                </p>
              </div>
              <div className="experience-point-list">
                {points.map((point, index) => {
                  const active = editor?.point?.start === point.start;
                  const quality = currentAssessment?.points.find(
                    (p) =>
                      p.point.start === point.start &&
                      p.point.text === point.text,
                  );
                  const diagnostic = currentFeedback?.points.find(
                    (p) =>
                      p.point.start === point.start &&
                      p.point.text === point.text,
                  );
                  return (
                    <article
                      key={`${point.start}-${index}`}
                      className={`experience-point ${active ? "is-active" : ""}`}
                    >
                      <span
                        className="experience-point-number"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <ExperiencePointFeedback
                        text={point.text}
                        quality={quality}
                        diagnostic={diagnostic}
                        expanded={active}
                      />
                      {active ? (
                        <div className="experience-point-editor">
                          {!proposal && (
                            <>
                              <label htmlFor="experience-point-text">
                                {t("Punctul tău", "Your point")}
                              </label>
                              <AutoTextarea
                                id="experience-point-text"
                                data-modal-stage-focus
                                tabIndex={0}
                                maxLength={2000}
                                disabled={blocked}
                                value={editor!.text}
                                onChange={(e) =>
                                  commit((state) => {
                                    state.editor!.text = e.target.value;
                                  })
                                }
                              />
                            </>
                          )}
                          {editorStale ? (
                            <p role="alert">
                              {t(
                                "Textul experienței s-a schimbat. Selectează din nou punctul.",
                                "The experience text changed. Choose the point again.",
                              )}
                            </p>
                          ) : proposal ? (
                            <Proposal
                              proposal={proposal}
                              blocked={blocked}
                              apply={() =>
                                void savePoint(
                                  proposal.text,
                                  "ai_generated",
                                  proposal.point,
                                )
                              }
                              again={() => void queue("point", proposal.point)}
                              cancel={() =>
                                commit((state) => {
                                  delete state.proposal;
                                })
                              }
                            />
                          ) : (
                            <>
                              <div className="experience-actions">
                                <Button
                                  variant="primary"
                                  disabled={
                                    blocked ||
                                    !editor!.text.trim() ||
                                    editor!.text.length > 2000 ||
                                    editor!.text === point.text
                                  }
                                  onClick={() =>
                                    void savePoint(
                                      editor!.text,
                                      "user_authored",
                                    )
                                  }
                                >
                                  {t("Salvează punctul", "Save point")}
                                </Button>
                                <Button
                                  disabled={
                                    blocked ||
                                    editor!.text !== point.text ||
                                    point.text.length > 2000
                                  }
                                  onClick={() => void queue("point", point)}
                                >
                                  <Sparkles size={16} />
                                  {t(
                                    "Îmbunătățește punctul",
                                    "Improve this point",
                                  )}
                                </Button>
                              </div>
                              <Button
                                variant="ghost"
                                disabled={
                                  blocked ||
                                  editor!.text !== point.text ||
                                  point.text.length > 2000
                                }
                                onClick={() =>
                                  s.round && qIndex >= 0
                                    ? setStage("questions")
                                    : void queue("questions", point)
                                }
                              >
                                {t(
                                  "Ajută-mă să adaug detalii",
                                  "Help me add more detail",
                                )}
                                <ArrowRight size={16} />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            disabled={blocked}
                            onClick={() =>
                              commit((state) => {
                                delete state.editor;
                                delete state.proposal;
                              })
                            }
                          >
                            {t("Închide punctul", "Close point")}
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="experience-point-select"
                          disabled={blocked}
                          onClick={() => select(point)}
                        >
                          <span>{point.text}</span>
                          <span className="experience-point-edit-label">
                            {t("Editează", "Edit")}
                          </span>
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              {editor?.mode === "add" ? (
                <section className="experience-add-point">
                  <h4>
                    <label htmlFor="experience-new-point">
                      {t(
                        "Ce ai mai făcut în acest rol?",
                        "What else did you do in this role?",
                      )}
                    </label>
                  </h4>
                  <AutoTextarea
                    id="experience-new-point"
                    data-modal-stage-focus
                    value={editor.text}
                    maxLength={2000}
                    disabled={blocked}
                    onChange={(e) =>
                      commit((state) => {
                        state.editor!.text = e.target.value;
                      })
                    }
                    placeholder={t(
                      "Notează o activitate, o problemă rezolvată sau un rezultat.",
                      "Jot down something you did, a problem you solved or a result.",
                    )}
                  />
                  {proposal ? (
                    <Proposal
                      proposal={proposal}
                      blocked={blocked}
                      apply={() =>
                        void savePoint(proposal.text, "ai_generated")
                      }
                      again={() => void queue("point")}
                      cancel={() =>
                        commit((state) => {
                          delete state.proposal;
                        })
                      }
                    />
                  ) : (
                    <>
                      <div className="experience-actions">
                        <Button
                          variant="primary"
                          disabled={blocked || !editor.text.trim()}
                          onClick={() =>
                            void savePoint(editor.text, "user_authored")
                          }
                        >
                          {t("Adaugă în CV", "Add to CV")}
                        </Button>
                        <Button
                          disabled={blocked || !editor.text.trim()}
                          onClick={() => {
                            const next = confirmExperienceDetail(
                              d,
                              id,
                              editor.text,
                              t(
                                "Note pentru un punct nou",
                                "Notes for a new point",
                              ),
                            );
                            change(next);
                            void queue("point", undefined, next);
                          }}
                        >
                          <Sparkles size={16} />
                          {t("Formulează punctul", "Shape this point")}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        disabled={blocked}
                        onClick={() => {
                          if (s.round && qIndex >= 0) {
                            setStage("questions");
                            return;
                          }
                          let next = d;
                          if (editor.text.trim()) {
                            next = confirmExperienceDetail(
                              d,
                              id,
                              editor.text,
                              t(
                                "Note pentru un punct nou",
                                "Notes for a new point",
                              ),
                            );
                            change(next);
                          }
                          void queue("questions", undefined, next);
                        }}
                      >
                        {d.answers.some(
                          (a) => a.targetId === id && a.status === "confirmed",
                        )
                          ? t(
                              "Explorează o altă realizare",
                              "Explore another achievement",
                            )
                          : t(
                              "Ajută-mă să găsesc ceva de inclus",
                              "Help me find something worth including",
                            )}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={() =>
                      commit((state) => {
                        delete state.editor;
                        delete state.proposal;
                      })
                    }
                  >
                    {t("Anulează", "Cancel")}
                  </Button>
                </section>
              ) : (
                <Button
                  variant="ghost"
                  disabled={blocked}
                  onClick={() => select()}
                >
                  <Plus size={16} />
                  {t("Adaugă un punct", "Add a point")}
                </Button>
              )}
              {s.undo && s.undo.after === body && (
                <Button
                  variant="ghost"
                  disabled={blocked}
                  onClick={() => {
                    const next = undoExperiencePoint(d, id);
                    change(next);
                    setNotice(
                      t(
                        "Ultima modificare a fost anulată",
                        "Last change undone",
                      ),
                    );
                    void score.queue(next);
                  }}
                >
                  <Undo2 size={16} />
                  {t("Anulează ultima modificare", "Undo last update")}
                </Button>
              )}
              <DetailsShared
                draft={d}
                targetId={id}
                blocked={blocked}
                editing={editingDetail}
                text={detailText}
                edit={(a) => {
                  setEditingDetail(a.id);
                  setDetailText(a.text);
                }}
                setText={setDetailText}
                save={() => {
                  const a = d.answers.find((a) => a.id === editingDetail)!;
                  change(
                    confirmExperienceDetail(
                      d,
                      id,
                      detailText,
                      a.questionText,
                      a.question,
                      a.id,
                    ),
                  );
                  setEditingDetail(undefined);
                }}
                cancel={() => setEditingDetail(undefined)}
              />
            </>
          )}
        </div>
        <ExperienceDetailPanel
          contentLocale={feedbackLocale}
          assessment={s.assessment}
          body={body}
          score={score}
          ready={ready}
          onFocusPoint={select}
        />
      </div>
      <footer className="experience-modal-footer experience-workbench-footer">
        {stage === "skills" && s.skills && !profile?.documentMode ? (
          <>
            <Button
              variant="ghost"
              disabled={blocked}
              onClick={() => {
                commit((state) => {
                  delete state.skills;
                  delete state.skillChoices;
                });
                setStage("points");
              }}
            >
              {t("Poate mai târziu", "Maybe later")}
            </Button>
            <Button
              variant="primary"
              disabled={blocked || !selectedChoices}
              onClick={async () => {
                const before = live.current.draft,
                  identity = experienceIdentity(before, id),
                  review = stateOf(before, id).skills;
                const fingerprint = await experienceFingerprint(before, id);
                const current = live.current.draft,
                  state = stateOf(current, id);
                if (
                  !review ||
                  review.fingerprint !== fingerprint ||
                  experienceIdentity(current, id) !== identity ||
                  !state.skills
                ) {
                  commit((state) => {
                    delete state.skills;
                    delete state.skillChoices;
                  });
                  setStage("points");
                  setError(
                    t(
                      "Experiența s-a schimbat. Verifică din nou competențele.",
                      "The experience changed. Review skills again.",
                    ),
                  );
                  return;
                }
                change(
                  applyExperienceSkills(
                    current,
                    id,
                    state.skills.skills,
                    state.skillChoices ?? {},
                  ),
                );
                setStage("points");
                setNotice(
                  t(
                    "Competențele selectate au fost adăugate",
                    "Selected skills added",
                  ),
                );
              }}
            >
              {t(
                `Adaugă ${selectedChoices} selectate`,
                `Add ${selectedChoices} selected`,
              )}
            </Button>
          </>
        ) : (
          <>
            {!profile?.documentMode && <Button
              variant="ghost"
              disabled={blocked}
              onClick={() => s.skills ? setStage("skills") : void queue("skills")}
            >
              {t("Verifică competențele", "Review skills")}
            </Button>}
            <Button
              variant="primary"
              disabled={working || preparing}
              onClick={close}
            >
              {t("Gata pentru moment", "Done for now")}
            </Button>
          </>
        )}
      </footer>
    </ExperienceModal>
  );
}
function Proposal({
  proposal,
  blocked,
  apply,
  again,
  cancel,
}: {
  proposal: Extract<ExperienceResult, { intent: "point" }>;
  blocked: boolean;
  apply: () => void;
  again: () => void;
  cancel: () => void;
}) {
  const t = useCopy();
  return (
    <section
      data-modal-stage-focus
      tabIndex={-1}
      className="experience-point-proposal"
      aria-label={t("Sugestie pentru acest punct", "Suggestion for this point")}
    >
      <p className="experience-eyebrow">
        <Sparkles size={14} />
        {t("O variantă mai clară", "A clearer version")}
      </p>
      <p className="experience-proposed-text">{proposal.text}</p>
      <p className="experience-proposal-reason">{proposal.explanation}</p>
      {proposal.assessment && proposal.proposedAssessment && (
        <p className="experience-proposal-reason">
          {t(
            `Nivel de detaliu posibil: ${proposal.proposedAssessment.score}/100 (acum ${proposal.assessment.score}). Se schimbă doar când folosești varianta.`,
            `Potential detail score: ${proposal.proposedAssessment.score}/100 (currently ${proposal.assessment.score}). Changes only when you use this point.`,
          )}
        </p>
      )}
      {proposal.point && (
        <details>
          <summary>
            {t("Compară cu originalul", "Compare with original")}
          </summary>
          <p>{proposal.point.text}</p>
        </details>
      )}
      <div className="experience-actions">
        <Button variant="primary" disabled={blocked} onClick={apply}>
          {t("Folosește varianta", "Use this")}
          <Check size={16} />
        </Button>
        <Button variant="ghost" disabled={blocked} onClick={again}>
          {t("Altă variantă", "Try again")}
        </Button>
        <Button variant="ghost" disabled={blocked} onClick={cancel}>
          {t("Păstrează textul meu", "Keep my wording")}
        </Button>
      </div>
    </section>
  );
}
function ToolHints({
  draft,
  disabled,
  onChoose,
}: {
  draft: BaseDraft;
  disabled: boolean;
  onChoose: (tool: string) => void;
}) {
  const t = useCopy();
  const tools = [
    ...new Set(draft.technicalSkills.map((f) => f.value).filter(Boolean)),
  ].slice(0, 10);
  return tools.length ? (
    <div className="experience-tool-hints">
      <p>
        {t(
          "Menționate în CV — alege doar ce ai folosit aici:",
          "Mentioned in your CV — choose only what you used here:",
        )}
      </p>
      <div>
        {tools.map((tool) => (
          <Button
            key={tool}
            disabled={disabled}
            variant="ghost"
            onClick={() => onChoose(tool)}
          >
            <Plus size={14} />
            {tool}
          </Button>
        ))}
      </div>
    </div>
  ) : null;
}
function DetailsShared({
  draft,
  targetId,
  blocked,
  editing,
  text,
  edit,
  setText,
  save,
  cancel,
}: {
  draft: BaseDraft;
  targetId: string;
  blocked: boolean;
  editing?: string;
  text: string;
  edit: (a: { id: string; text: string }) => void;
  setText: (v: string) => void;
  save: () => void;
  cancel: () => void;
}) {
  const t = useCopy();
  const answers = draft.answers.filter(
    (a) =>
      a.targetId === targetId &&
      a.status === "confirmed" &&
      !draft.experienceEnrichment?.[targetId]?.supersededAnswerIds?.includes(
        a.id,
      ),
  );
  if (!answers.length) return null;
  return (
    <details className="experience-shared-details">
      <summary>
        {t("Detaliile oferite de tine", "Details you’ve shared")}
      </summary>
      <p>
        {t(
          "Sunt păstrate pentru sugestii. Apar în CV doar când folosești un punct.",
          "Saved for suggestions. They appear in your CV only when you use a point.",
        )}
      </p>
      {answers.map((a) => (
        <article key={a.id}>
          <strong>
            {a.questionText === "A point you wrote"
              ? t("Un punct scris de tine", "A point you wrote")
              : a.questionText}
          </strong>
          {editing === a.id ? (
            <>
              <AutoTextarea
                aria-label={t("Editează detaliul", "Edit detail")}
                value={text}
                maxLength={2000}
                onChange={(e) => setText(e.target.value)}
                disabled={blocked}
              />
              <Button disabled={blocked || !text.trim()} onClick={save}>
                {t("Salvează detaliul", "Save detail")}
              </Button>
              <Button disabled={blocked} variant="ghost" onClick={cancel}>
                {t("Anulează", "Cancel")}
              </Button>
            </>
          ) : (
            <>
              <p>{a.text}</p>
              <Button
                disabled={blocked}
                variant="ghost"
                onClick={() => edit(a)}
              >
                {t("Editează detaliul", "Edit detail")}
              </Button>
            </>
          )}
        </article>
      ))}
    </details>
  );
}
