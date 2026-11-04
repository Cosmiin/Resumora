import { ExperienceModal } from "./ExperienceModal";
import { RoleText } from "./RoleText";
import { ProfileEditorContext } from "./ProfileOverview";
import { replaceRoleIntroduction } from "@resumora/contracts/editor/content";
import { currentWording } from "../base/wording";
import { AutoTextarea } from "./AutoTextarea";
import {
  careerContext,
  type CareerContext,
} from "@resumora/contracts/intelligence/context";
import { RoleRewrite } from "./RoleRewrite";
import { IntelligenceRequestError } from "../base/intelligence";
import { acceptWording } from "../base/wording";
import type { RoleRewrite as RoleProposal } from "@resumora/contracts/intelligence/model";
import { AiSuggestions } from "./AiSuggestions";
import type { AuthTransport } from "../auth/AuthShell";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  saveAnswer,
  addAnswerToCv,
  removeAnswerFromCv,
  answerEvidenceText,
  enrichmentTarget,
  nextQuestionIndex,
} from "../base/enrichment";
import { clone, equalValues, type Answer, type BaseDraft } from "../base/model";
import { focusField, patchFact } from "../base/editing";
import { formatDate } from "../base/dates";
import { Button, useCopy } from "./ui";
import type { QuestionPlan } from "@resumora/contracts/intelligence/model";
import { DocumentPreview, PreviewText } from "./DocumentPreview";
import { chooseTemplate } from "../templates/registry";
const dimensions: Answer["question"][] = [
  "context",
  "ownership",
  "tools",
  "scale",
  "contribution",
  "impact",
  "complexity",
];
function AnswerHistory({
  collapsed,
  title,
  children,
}: {
  collapsed: boolean;
  title: string;
  children: ReactNode;
}) {
  return collapsed ? (
    <details className="guided-answer-history">
      <summary>{title}</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}
export function Enrichment({
  draft: d,
  autoStart = false,
  change,
  goEdit,
  asOf,
  undoFrom,
  durable = false,
  prepareQuestions,
  rewriteRole,
  transport,
  snapshot,
  ready = true,
  selectedTargetId,
  embedded = false,
  saveFailed = false,
  retrySave,
}: {
  saveFailed?: boolean;
  retrySave?: () => void;
  selectedTargetId?: string;
  embedded?: boolean;
  transport?: AuthTransport;
  snapshot?: { id: string; revision: number } | null;
  ready?: boolean;
  autoStart?: boolean;
  draft: BaseDraft;
  change: (d: BaseDraft) => void;
  goEdit: () => void;
  asOf: { year: string; month: string };
  undoFrom?: BaseDraft | null;
  durable?: boolean;
  prepareQuestions?: (targetId: string) => Promise<QuestionPlan>;
  rewriteRole?: (
    targetId: string,
    purpose?: "summary",
  ) => Promise<RoleProposal>;
}) {
  const t = useCopy(),
    profile = useContext(ProfileEditorContext),
    guided = embedded && !!rewriteRole,
    modal = embedded && !!profile?.documentMode;
  const [phase, setPhase] = useState<"questions" | "proposal" | "complete">(
      "questions",
    ),
    [purpose, setPurpose] = useState<"summary" | undefined>(),
    [rewriteBusy, setRewriteBusy] = useState(false);
  const targets = [
    ...d.roles.map((r) => ({
      id: r.id,
      label: [
        r.title.value,
        r.company.value,
        formatDate(r.start.value, d.language),
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...d.optionalSections
      .filter((s) => s.kind !== "languages")
      .flatMap((s) =>
        s.entries.map((e) => ({
          id: e.id,
          label: enrichmentTarget(d, e.id)!.label,
        })),
      ),
  ];
  const [targetId, setTargetId] = useState(
      selectedTargetId ?? targets[0]?.id ?? "",
    ),
    [index, setIndex] = useState(0),
    [error, setError] = useState("");
  const [planning, setPlanning] = useState(false);
  const [manual, setManual] = useState(false);
  const [rewriteCycle, setRewriteCycle] = useState<{
    id: string;
    input: CareerContext;
    plan: QuestionPlan;
  } | null>(null);
  const currentDraft = useRef(d),
    requestGeneration = useRef(0);
  currentDraft.current = d;
  useEffect(() => {
    if (!guided || !profile?.setRoleBusy) return;
    profile.setRoleBusy(targetId, planning || rewriteBusy);
    return () => profile.setRoleBusy(targetId, false);
  }, [guided, profile?.setRoleBusy, targetId, planning, rewriteBusy]);
  const pendingProposal = d.roleRewriteReviews
    ?.filter((r) => r.proposal.targetId === targetId && r.status === "pending")
    .at(-1);
  useEffect(() => {
    if (guided && pendingProposal) {
      setPurpose(pendingProposal.purpose);
      setPhase("proposal");
    }
  }, [guided, pendingProposal?.id]);
  useEffect(() => {
    setPlanning(false);
    setManual(false);
    setRewriteCycle(null);
    setPhase("questions");
    setPurpose(undefined);
    setRewriteBusy(false);
    if (guided && pendingProposal) {
      setPurpose(pendingProposal.purpose);
      setPhase("proposal");
    }
    return () => {
      requestGeneration.current++;
    };
  }, [targetId]);
  useEffect(() => {
    if (selectedTargetId && targets.some((t) => t.id === selectedTargetId)) {
      setTargetId(selectedTargetId);
      setIndex(0);
    }
  }, [selectedTargetId]);
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const editingAnswer = d.answers.find(
    (a) => a.id === editingAnswerId && a.targetId === targetId,
  );
  const activePlan = editingAnswer
    ? d.questionPlans?.find(
        (p) =>
          p.targetId === targetId &&
          p.questions.some((q) => q.id === editingAnswer.plannedQuestionId),
      )
    : d.questionPlans?.filter((p) => p.targetId === targetId).at(-1);
  const questionIndex =
    activePlan && !editingAnswer ? nextQuestionIndex(d, activePlan) : index;
  const planned = activePlan?.questions[questionIndex];
  const planFinished =
    !!activePlan &&
    !editingAnswer &&
    questionIndex === activePlan.questions.length;
  const showAnswer =
    !prepareQuestions || !!activePlan || manual || !!editingAnswer;
  useEffect(() => {
    if (!planFinished) {
      if (guided && rewriteCycle) setPhase("questions");
      setRewriteCycle(null);
    } else if (guided) {
      setPurpose(undefined);
      setPhase("proposal");
    }
  }, [planFinished]);
  const input = useRef<HTMLTextAreaElement>(null),
    target = enrichmentTarget(d, targetId),
    question = planned?.dimension ?? dimensions[index % dimensions.length];
  const signature = useRef(target?.field.id);
  useEffect(() => {
    const before = undoFrom && enrichmentTarget(undoFrom, targetId);
    if (
      before &&
      target &&
      signature.current === before.field.id &&
      before.field.fieldId === target.field.fieldId
    )
      signature.current = target.field.id;
  }, [undoFrom]);
  useEffect(() => {
    signature.current = target?.field.id;
    input.current?.focus();
  }, [targetId, index]);
  const questions: Record<Answer["question"], string> = {
    context: t(
      "Care erau responsabilitățile tale de zi cu zi?",
      "What were your day-to-day responsibilities?",
    ),
    ownership: t(
      "Ce ai făcut tu, cu ce autonomie?",
      "What did you do yourself, with what autonomy?",
    ),
    tools: t(
      "Ce instrumente ai folosit și pentru ce?",
      "Which tools did you use, and for what?",
    ),
    scale: t(
      "Cât de amplă era activitatea?",
      "What was the scope and scale of the work?",
    ),
    contribution: t(
      "Ce ai realizat sau îmbunătățit?",
      "What did you achieve or improve?",
    ),
    impact: t(
      "Ce rezultat ai observat sau măsurat?",
      "What outcome did you observe or measure?",
    ),
    complexity: t(
      "Ce dificultăți ai depășit?",
      "Which difficulties did you overcome?",
    ),
  };

  const current =
    editingAnswer ??
    d.answers.find(
      (a) =>
        a.targetId === targetId &&
        (planned
          ? a.plannedQuestionId === planned.id
          : !a.plannedQuestionId && a.question === question),
    );
  const answer: Answer = current ?? {
    id: `answer_${targetId}_${planned?.id ?? question}`,
    targetId,
    question,
    questionText: planned?.text ?? questions[question],
    ...(planned
      ? {
          plannedQuestionId: planned.id,
          options: planned.options,
          selectedOptionIds: [],
          selectionMode: planned.selectionMode,
        }
      : {}),
    targetLabel: target?.label,
    text: "",
    status: "draft",
  };
  function put(text: string) {
    const next = clone(d);
    next.answers = [
      ...next.answers.filter((a) => a.id !== answer.id),
      { ...answer, text, status: "draft" },
    ];
    change(next);
    setError("");
  }
  function queueRewrite(next: BaseDraft) {
    if (
      !rewriteRole ||
      !activePlan ||
      editingAnswerId ||
      nextQuestionIndex(next, activePlan) !== activePlan.questions.length
    )
      return;
    try {
      setRewriteCycle({
        id: crypto.randomUUID(),
        input: careerContext(next, targetId),
        plan: activePlan,
      });
    } catch {
      setError(
        t(
          "Adaugă detalii despre această experiență înainte de rescriere.",
          "Add details about this experience before rewriting.",
        ),
      );
    }
  }
  function advance() {
    setEditingAnswerId(null);
    setIndex((i) =>
      activePlan
        ? Math.min(questionIndex + 1, activePlan.questions.length)
        : (i + 1) % dimensions.length,
    );
  }
  function failure() {
    setError(
      t(
        "Destinația s-a schimbat. Răspunsul este păstrat; selectează din nou intrarea.",
        "The target changed. Your answer is retained; select the entry again.",
      ),
    );
  }
  function submit() {
    if (planFinished) return;
    if (!answerEvidenceText(answer).trim()) {
      input.current?.focus();
      return;
    }
    try {
      if (!signature.current) throw new Error("staleTarget");
      const next = saveAnswer(
        d,
        { ...answer, status: "draft" },
        signature.current,
      );
      change(next);
      setError("");
      queueRewrite(next);
      advance();
    } catch {
      failure();
    }
  }
  function skip(status: "skipped" | "unknown") {
    if (planFinished) return;
    const next = clone(d);
    next.answers = [
      ...next.answers.filter((a) => a.id !== answer.id),
      { ...answer, status },
    ];
    change(next);
    queueRewrite(next);
    advance();
  }
  function add(saved: Answer) {
    try {
      if (!signature.current || saved.targetId !== targetId)
        throw new Error("staleTarget");
      change(addAnswerToCv(d, saved.id, signature.current));
      setError("");
    } catch {
      failure();
    }
  }
  const saved = d.answers.filter(
    (a) => a.sourceId && (!guided || a.targetId === targetId),
  );
  function contextRow(a: Answer) {
    const source = d.sources.find((s) => s.id === a.sourceId)!;
    const destination = enrichmentTarget(d, a.targetId);
    const linked = destination?.entry.bullets?.find(
      (f) => f.fieldId === a.cvFieldId,
    );
    return (
      <div key={a.id} className="saved-answer">
        <p className="small muted">{a.targetLabel}</p>
        <p>
          <strong>{source.label}</strong>
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>{source.text}</p>
        {destination && (
          <div className="actions">
            <Button
              onClick={() => {
                setTargetId(a.targetId);
                setEditingAnswerId(a.id);
                if (guided) setPhase("questions");
                const priorPlan = d.questionPlans?.find(
                  (p) =>
                    p.targetId === a.targetId &&
                    p.questions.some((q) => q.id === a.plannedQuestionId),
                );
                setIndex(
                  a.plannedQuestionId
                    ? Math.max(
                        0,
                        priorPlan?.questions.findIndex(
                          (q) => q.id === a.plannedQuestionId,
                        ) ?? 0,
                      )
                    : dimensions.indexOf(a.question),
                );
                signature.current = destination.field.id;
                input.current?.focus();
              }}
            >
              {t("Editează răspunsul", "Edit answer")}
            </Button>
            {a.targetId === targetId && (
              <Button
                disabled={
                  a.status !== "confirmed" ||
                  linked?.value === answerEvidenceText(a)
                }
                onClick={() => add(a)}
              >
                {linked
                  ? linked.value === answerEvidenceText(a)
                    ? t("Adăugat în CV", "Added to CV")
                    : t("Actualizează în CV", "Update in CV")
                  : t("Adaugă în CV", "Add to CV")}
              </Button>
            )}
            {linked && (
              <Button onClick={() => change(removeAnswerFromCv(d, a.id))}>
                {t("Elimină din CV", "Remove from CV")}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }
  const autoStarted = useRef<string | null>(null);
  async function requestQuestions() {
    if (!prepareQuestions || planning || !target || !ready) return;

    const before = currentDraft.current,
      generation = ++requestGeneration.current;
    const active = () => generation === requestGeneration.current;
    setPlanning(true);
    setManual(false);
    setError("");
    try {
      const result = await prepareQuestions(targetId);
      if (!active()) return;
      if (!equalValues(currentDraft.current, before))
        throw new Error("STALE_INPUT");
      const next = clone(before);
      next.questionPlans = [...(next.questionPlans ?? []).slice(-19), result];
      setEditingAnswerId(null);
      change(next);
      setIndex(0);
    } catch (error) {
      if (active()) {
        const code =
          error instanceof IntelligenceRequestError
            ? error.code
            : error instanceof Error
              ? error.message
              : "";
        setError(
          code === "AI_OUTPUT_TRUNCATED"
            ? t(
                "Răspunsul AI s-a oprit înainte de a termina întrebările. Nu am aplicat întrebări incomplete; răspunsurile tale sunt păstrate. Poți apăsa din nou Îmbunătățește pentru o cerere nouă.",
                "AI stopped before finishing the questions. Incomplete questions were not applied; your answers are kept. You can click Improve again for a new request.",
              )
            : [
                  "AI_OUTPUT_INVALID",
                  "QUESTION_OUTPUT",
                  "QUESTION_REPEATED",
                ].includes(code)
              ? t(
                  "AI a returnat întrebări pe care nu le putem folosi în siguranță. Nu au fost aplicate, iar răspunsurile tale sunt păstrate. Poți cere din nou întrebări.",
                  "AI returned questions we cannot safely use. They were not applied, and your answers are kept. You can request questions again.",
                )
              : [
                    "STALE_INPUT",
                    "STALE",
                    "SAVE_REQUIRED",
                    "VERSION_CONFLICT",
                  ].includes(code)
                ? t(
                    "Contextul salvat s-a schimbat. Așteaptă salvarea modificărilor, apoi apasă Îmbunătățește. Răspunsurile tale sunt păstrate.",
                    "The saved context changed. Wait for your changes to save, then click Improve. Your answers are kept.",
                  )
                : ["AI_DISABLED", "AI_UNCONFIGURED"].includes(code)
                  ? t(
                      "Procesarea AI este dezactivată sau neconfigurată. Răspunsurile tale sunt păstrate; întrebările manuale rămân disponibile.",
                      "AI processing is off or unconfigured. Your answers are kept; manual questions remain available.",
                    )
                  : t(
                      "Nu putem confirma rezultatul cererii de întrebări. Răspunsurile tale sunt păstrate. Nu relansăm automat cererea; verifică starea înainte de o nouă încercare.",
                      "We cannot confirm the question request's outcome. Your answers are kept. We do not rerun it automatically; check its status before another attempt.",
                    ),
        );
      }
    } finally {
      if (active()) setPlanning(false);
    }
  }
  useEffect(() => {
    if (
      !autoStart ||
      profile?.questionIntent !== targetId ||
      !ready ||
      activePlan ||
      autoStarted.current === targetId
    )
      return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted || autoStarted.current === targetId) return;
      autoStarted.current = targetId;
      void requestQuestions();
    });
    return () => {
      mounted = false;
    };
  }, [autoStart, profile?.questionIntent, ready, targetId, activePlan]);
  const choiceControls = !planFinished && !!answer.options?.length && (
    <fieldset className="enrichment-choices">
      <legend>
        {modal
          ? t(
              "Variante sugerate. Selectează doar ce ai făcut tu sau scrie propriul răspuns.",
              "Suggested options. Select only what you did, or write your own answer.",
            )
          : t(
              "Alege una, mai multe sau niciuna; poți scrie propriul răspuns.",
              "Choose one, several or none; you can write your own answer.",
            )}
      </legend>
      {answer.options.map((option) => (
        <label className="enrichment-choice" key={option.id}>
          <input
            type={answer.selectionMode === "single" ? "radio" : "checkbox"}
            name={`choices-${answer.id}`}
            checked={answer.selectedOptionIds?.includes(option.id) ?? false}
            onClick={() => {
              if (
                answer.selectionMode === "single" &&
                answer.selectedOptionIds?.includes(option.id)
              ) {
                const next = clone(d);
                next.answers = [
                  ...next.answers.filter((a) => a.id !== answer.id),
                  {
                    ...answer,
                    selectedOptionIds: [],
                    status: "draft",
                  },
                ];
                change(next);
              }
            }}
            onChange={() => {
              const ids =
                answer.selectionMode === "single"
                  ? answer.selectedOptionIds?.includes(option.id)
                    ? []
                    : [option.id]
                  : answer.selectedOptionIds?.includes(option.id)
                    ? answer.selectedOptionIds.filter((id) => id !== option.id)
                    : [...(answer.selectedOptionIds ?? []), option.id];
              const next = clone(d);
              next.answers = [
                ...next.answers.filter((a) => a.id !== answer.id),
                {
                  ...answer,
                  selectedOptionIds: ids,
                  status: "draft",
                },
              ];
              change(next);
            }}
          />{" "}
          {option.label}
        </label>
      ))}
    </fieldset>
  );
  if (modal) {
    const role = d.roles.find((item) => item.id === targetId);
    const period = role
      ? [
          role.start.value.year ? formatDate(role.start.value, d.language) : "",
          role.ongoing.value
            ? t("Prezent", "Present")
            : role.end.value.year
              ? formatDate(role.end.value, d.language)
              : "",
        ]
          .filter(Boolean)
          .join(" – ")
      : "";
    const reviewing = phase === "proposal";
    const modalBusy = planning || rewriteBusy;
    const lastQuestion =
      !!activePlan &&
      !editingAnswer &&
      questionIndex === activePlan.questions.length - 1;
    return (
      <ExperienceModal
        context={
          role
            ? [role.title.value, role.company.value, period]
                .filter(Boolean)
                .join(" · ")
            : (targets.find((item) => item.id === targetId)?.label ??
              target?.label ??
              "")
        }
        reviewing={reviewing}
        canReview={!!rewriteRole}
        busy={modalBusy}
        focusKey={`${targetId}:${phase}:${planned?.id ?? index}:${planning}:${pendingProposal?.id ?? ""}:${editingAnswerId ?? ""}:${manual}`}
        close={() => profile.closeEnrichment()}
        notice={
          saveFailed ? (
            <div role="alert" className="experience-save-error">
              <p>
                {t(
                  "Ultimele modificări nu au putut fi salvate. Detaliile tale sunt păstrate în această pagină.",
                  "Your latest changes could not be saved. Your details are retained in this tab.",
                )}
              </p>
              {retrySave && (
                <Button variant="primary" onClick={retrySave}>
                  {t("Reîncearcă aceeași salvare", "Retry the same save")}
                </Button>
              )}
              <Button variant="ghost" onClick={profile.closeEnrichment}>
                {t(
                  "Înapoi în profil pentru a reîncerca salvarea",
                  "Back to profile to retry saving",
                )}
              </Button>
            </div>
          ) : undefined
        }
      >
        {reviewing && rewriteRole ? (
          <RoleRewrite
            key={`${targetId}-${purpose ?? "experience"}`}
            modal
            backToDetails={() => setPhase("questions")}
            purpose={purpose}
            draft={d}
            targetId={targetId}
            request={(id) => rewriteRole(id, purpose)}
            ready={ready}
            saveFailed={saveFailed}
            onBusyChange={setRewriteBusy}
            onDecision={() => profile.closeEnrichment()}
            onPurposeChange={
              d.roles.some((role) => role.id === targetId)
                ? setPurpose
                : undefined
            }
            autoRequest={rewriteCycle ?? undefined}
            onAutoRequest={() => setRewriteCycle(null)}
            change={change}
            accept={(draft, id, text, sources) => {
              if (purpose === "summary") {
                const prior = draft.presentation.approvedWording?.[id],
                  priorText = currentWording(draft, id);
                const whole = prior?.scope === "experience" && priorText;
                return acceptWording(draft, id, {
                  text: whole ? replaceRoleIntroduction(priorText, text) : text,
                  sources: whole
                    ? [
                        ...prior.sources,
                        ...sources.filter(
                          (fact) =>
                            !prior.sources.some(
                              (source) => source.id === fact.id,
                            ),
                        ),
                      ]
                    : sources,
                  ...(whole ? { scope: "experience" as const } : {}),
                  origin: "ai_generated",
                });
              }
              return acceptWording(draft, id, {
                text,
                sources,
                scope: "experience",
              });
            }}
          />
        ) : (
          <div
            className="experience-question-stage"
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                !(event.ctrlKey || event.metaKey) ||
                !showAnswer ||
                planFinished
              )
                return;
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                submit();
              }
            }}
          >
            <div className="experience-modal-scroll">
              {planning ? (
                <>
                  <h3 tabIndex={-1} data-modal-stage-focus>
                    {t("Pregătim întrebările…", "Preparing your questions…")}
                  </h3>
                  <p role="status">
                    {t(
                      "Citim această experiență pentru a te întreba doar despre detaliile care lipsesc.",
                      "Reading this experience to ask about the details that need clarification.",
                    )}
                  </p>
                </>
              ) : !showAnswer ? (
                <>
                  <h3 tabIndex={-1} data-modal-stage-focus>
                    {t(
                      "Adaugă detalii despre rolul tău",
                      "Add details about your role",
                    )}
                  </h3>
                  <p className="experience-modal-intro">
                    {t(
                      "Răspunde la câteva întrebări, apoi verifică descrierea propusă.",
                      "Answer a few questions, then review the proposed description.",
                    )}
                  </p>
                  {!ready && !saveFailed && (
                    <p role="status">
                      {t(
                        "Salvăm modificările înainte de a începe…",
                        "Saving your changes before starting…",
                      )}
                    </p>
                  )}
                </>
              ) : planFinished ? (
                <>
                  <h3 tabIndex={-1} data-modal-stage-focus>
                    {t(
                      "Detaliile tale sunt pregătite",
                      "Your details are ready",
                    )}
                  </h3>
                  <p className="experience-modal-intro">
                    {t(
                      "Poți corecta răspunsurile sau poți reveni la descrierea propusă.",
                      "You can edit your answers or return to the proposed description.",
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="experience-question-count">
                    {t(
                      `Întrebarea ${questionIndex + 1} din ${activePlan?.questions.length ?? dimensions.length}`,
                      `Question ${questionIndex + 1} of ${activePlan?.questions.length ?? dimensions.length}`,
                    )}
                  </p>
                  <h3 tabIndex={-1} data-modal-stage-focus>
                    <label htmlFor="enrichment-answer">
                      {answer.questionText}
                    </label>
                  </h3>
                  {choiceControls}
                  <AutoTextarea
                    ref={input}
                    id="enrichment-answer"
                    className="native"
                    rows={5}
                    value={answer.text}
                    placeholder={
                      answer.options?.length
                        ? t(
                            "Adaugă detalii în cuvintele tale…",
                            "Add details in your own words…",
                          )
                        : t(
                            "Descrie ce ai făcut tu…",
                            "Describe what you personally did…",
                          )
                    }
                    onChange={(event) => put(event.target.value)}
                  />
                  <p className="experience-answer-hint">
                    {durable
                      ? t(
                          "Răspunsurile se salvează automat. Vei verifica descrierea înainte să modifici CV-ul.",
                          "Answers autosave. You will review the description before your CV changes.",
                        )
                      : t(
                          "Răspunsurile rămân în această pagină. Vei verifica descrierea înainte să modifici CV-ul.",
                          "Answers stay in this tab. You will review the description before your CV changes.",
                        )}
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="experience-modal-error">
                  {error}
                </p>
              )}
              {error && !manual && (
                <Button variant="ghost" onClick={() => setManual(true)}>
                  {t(
                    "Continuă cu întrebări manuale",
                    "Continue with manual questions",
                  )}
                </Button>
              )}
              <details className="experience-current-wording">
                <summary>
                  {t("Vezi textul actual", "View current wording")}
                </summary>
                <div className="role-text">
                  <RoleText
                    text={
                      currentWording(d, targetId, true) ??
                      [
                        target?.field.value,
                        ...(target?.entry.bullets ?? []).map(
                          (bullet) => "- " + bullet.value,
                        ),
                      ]
                        .filter(Boolean)
                        .join("\n\n")
                    }
                  />
                </div>
              </details>
              {!!saved.length && (
                <details
                  className="experience-saved-answers"
                  open={planFinished || undefined}
                >
                  <summary>
                    {t(
                      `Răspunsurile tale (${saved.length})`,
                      `Your answers (${saved.length})`,
                    )}
                  </summary>
                  {saved.map((item) => (
                    <div className="experience-saved-answer" key={item.id}>
                      <strong>{item.questionText}</strong>
                      <p>{answerEvidenceText(item)}</p>
                      <Button
                        variant="ghost"
                        disabled={modalBusy}
                        onClick={() => {
                          setEditingAnswerId(item.id);
                          const plan = d.questionPlans?.find(
                            (plan) =>
                              plan.targetId === targetId &&
                              plan.questions.some(
                                (question) =>
                                  question.id === item.plannedQuestionId,
                              ),
                          );
                          setIndex(
                            item.plannedQuestionId
                              ? Math.max(
                                  0,
                                  plan?.questions.findIndex(
                                    (question) =>
                                      question.id === item.plannedQuestionId,
                                  ) ?? 0,
                                )
                              : dimensions.indexOf(item.question),
                          );
                          signature.current = target?.field.id;
                        }}
                      >
                        {t("Editează răspunsul", "Edit answer")}
                      </Button>
                    </div>
                  ))}
                </details>
              )}
              {rewriteRole && !planning && !planFinished && (
                <details className="experience-more-options">
                  <summary>{t("Mai multe opțiuni", "More options")}</summary>
                  <Button
                    variant="ghost"
                    disabled={!ready}
                    onClick={() => {
                      setPurpose(undefined);
                      setPhase("proposal");
                    }}
                  >
                    {t(
                      "Creează descrierea din detaliile existente",
                      "Create description from existing details",
                    )}
                  </Button>
                  {showAnswer && (
                    <Button variant="ghost" onClick={() => skip("unknown")}>
                      {t("Nu știu", "I don't know")}
                    </Button>
                  )}
                </details>
              )}
            </div>
            <footer className="experience-modal-footer experience-question-footer">
              {showAnswer && !planFinished && !planning ? (
                <>
                  <div className="actions">
                    <Button variant="ghost" onClick={() => skip("skipped")}>
                      {t("Omit întrebarea", "Skip question")}
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    disabled={!answerEvidenceText(answer).trim()}
                    onClick={submit}
                  >
                    {lastQuestion
                      ? t("Verifică descrierea", "Review description")
                      : editingAnswer
                        ? t("Salvează răspunsul", "Save answer")
                        : t("Salvează și continuă", "Save and continue")}
                  </Button>
                </>
              ) : planFinished && rewriteRole ? (
                <>
                  <Button variant="ghost" onClick={profile.closeEnrichment}>
                    {t("Înapoi în profil", "Back to profile")}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setPhase("proposal")}
                  >
                    {t("Verifică descrierea", "Review description")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    disabled={modalBusy}
                    onClick={profile.closeEnrichment}
                  >
                    {t("Înapoi în profil", "Back to profile")}
                  </Button>
                  {prepareQuestions && (
                    <Button
                      variant="primary"
                      disabled={planning || !ready}
                      onClick={() => void requestQuestions()}
                    >
                      {planning
                        ? t("Pregătim întrebările…", "Preparing questions…")
                        : t("Începe întrebările", "Start questions")}
                    </Button>
                  )}
                </>
              )}
            </footer>
          </div>
        )}
      </ExperienceModal>
    );
  }
  return (
    <div
      className={`editor-layout enrichment-inline ${embedded ? "embedded-enrichment" : ""} ${guided ? "guided-enrichment" : ""} ${autoStart ? "focused-enrichment" : ""}`}
      onKeyDown={(e) => {
        if (
          !showAnswer ||
          (guided && phase !== "questions") ||
          !target ||
          e.nativeEvent.isComposing ||
          !(e.ctrlKey || e.metaKey)
        )
          return;
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
        if (e.shiftKey && e.key.toLowerCase() === "k") {
          e.preventDefault();
          skip("unknown");
        }
        if (e.shiftKey && e.key.toLowerCase() === "j") {
          e.preventDefault();
          skip("skipped");
        }
      }}
    >
      <section className="card question-card">
        {targets.length ? (
          <>
            {(!guided || phase === "questions") && !autoStart && (
              <div>
                <p className="eyebrow">
                  {t(
                    "Un rol, o descriere mai clară",
                    "One role, a clearer description",
                  )}
                </p>
                <h2>
                  {t("Îmbunătățește experiența", "Improve your experience")}
                </h2>
                <p>
                  {t(
                    embedded
                      ? "Răspunde la câteva întrebări despre acest rol, apoi verifică descrierea propusă."
                      : "Alege un rol și apasă Îmbunătățește. Răspunde la câteva întrebări, apoi verifică descrierea propusă.",
                    embedded
                      ? "Answer a few questions about this role, then review the proposed description."
                      : "Choose a role and click Improve. Answer a few questions, then review the proposed description.",
                  )}
                </p>
              </div>
            )}
            <label htmlFor="enrich-target" hidden={embedded}>
              {t("Rol sau experiență", "Role or experience")}
            </label>
            <select
              className="native"
              id="enrich-target"
              hidden={embedded}
              value={target ? targetId : ""}
              onChange={(e) => {
                setEditingAnswerId(null);
                setTargetId(e.target.value);
                signature.current = enrichmentTarget(d, e.target.value)?.field
                  .id;
                setIndex(0);
              }}
            >
              {!target && (
                <option value="" disabled>
                  {t("Selectează o intrare", "Select an entry")}
                </option>
              )}
              {targets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label || t("Intrare nouă", "New entry")}
                </option>
              ))}
            </select>
            {!guided && <p className="entry-context">{target?.field.value}</p>}
            {guided && phase === "questions" && !autoStart && (
              <p className="small muted">
                {t(
                  "Întrebările sunt opționale. Confirmă doar ceea ce ai făcut; propunerea de CV vine la final.",
                  "Questions are optional. Confirm only what you did; the CV proposal comes afterward.",
                )}
              </p>
            )}
            {guided && phase === "complete" && (
              <div className="stack">
                <p role="status">
                  {t(
                    "Rolul a fost revizuit. Poți continua cu următorul.",
                    "Role reviewed. You can continue to the next one.",
                  )}
                </p>
                <Button
                  variant="primary"
                  disabled={!!profile?.busy}
                  onClick={() =>
                    profile
                      ? profile.nextRole(targetId, !currentWording(d, targetId))
                      : goEdit()
                  }
                >
                  {t("Următorul rol", "Next role")}
                </Button>
                <Button variant="ghost" onClick={() => setPhase("questions")}>
                  {t("Revino la întrebări", "Return to questions")}
                </Button>
              </div>
            )}
            {prepareQuestions &&
              !activePlan &&
              (!autoStart ||
                profile?.questionIntent !== targetId ||
                !!error ||
                planning) &&
              (!guided || phase === "questions") && (
                <Button
                  variant="primary"
                  disabled={planning || !target || !ready}
                  onClick={() => void requestQuestions()}
                >
                  {planning
                    ? t("Pregătim întrebările…", "Preparing questions…")
                    : t("Îmbunătățește", "Improve")}
                </Button>
              )}
            {prepareQuestions &&
              !activePlan &&
              !planning &&
              !ready &&
              (!guided || phase === "questions") && (
                <p role="status" className="small muted">
                  {t(
                    "Salvăm modificările. Vei putea continua imediat după salvare.",
                    "Saving your changes. You can continue once they are saved.",
                  )}
                </p>
              )}
            {prepareQuestions &&
              !activePlan &&
              error &&
              (!guided || phase === "questions") && (
                <Button onClick={() => setManual(true)}>
                  {t(
                    "Continuă cu întrebări manuale",
                    "Continue with manual questions",
                  )}
                </Button>
              )}
            {showAnswer && (!guided || phase === "questions") && (
              <>
                {planned && <p className="small muted">{planned.why}</p>}
                <p className="eyebrow">
                  {activePlan
                    ? t(
                        "Întrebări AI · sugestii, nu fapte",
                        "AI questions · suggestions, not facts",
                      )
                    : t("Îndrumare manuală", "Manual guidance")}{" "}
                  ·{" "}
                  {Math.min(
                    questionIndex + 1,
                    activePlan?.questions.length ?? dimensions.length,
                  )}
                  /{activePlan?.questions.length ?? dimensions.length}
                </p>
                <label className="question-title" htmlFor="enrichment-answer">
                  {planFinished
                    ? t(
                        "Întrebările sunt încheiate. Contextul tău este păstrat.",
                        "Questions completed. Your context is retained.",
                      )
                    : answer.questionText}
                </label>
                {choiceControls}
                {!planFinished && (
                  <>
                    <p className="small muted">
                      {t(
                        "Selectează doar ce ai făcut. Apasă din nou o opțiune pentru a o deselecta sau scrie în cuvintele tale.",
                        "Select only what you did. Click an option again to deselect it, or use your own words.",
                      )}
                    </p>
                    <AutoTextarea
                      ref={input}
                      id="enrichment-answer"
                      className="native"
                      disabled={planFinished}
                      rows={5}
                      value={answer.text}
                      onChange={(e) => put(e.target.value)}
                    />
                    <p className="small muted">
                      {durable
                        ? t(
                            "Contextul se salvează automat în contul tău. Salvarea răspunsului nu modifică CV-ul.",
                            "Context autosaves to your account. Saving an answer does not change the CV.",
                          )
                        : t(
                            "Contextul rămâne în memoria paginii. Salvarea răspunsului nu modifică CV-ul.",
                            "Context stays in page memory. Saving an answer does not change the CV.",
                          )}
                    </p>
                    {guided ? (
                      <div className="actions guided-question-actions">
                        <Button
                          variant="primary"
                          disabled={!answerEvidenceText(answer).trim()}
                          onClick={submit}
                        >
                          {activePlan &&
                          !editingAnswer &&
                          questionIndex === activePlan.questions.length - 1
                            ? t(
                                "Confirmă și creează propunerea",
                                autoStart
                                  ? "Use answer & suggest wording"
                                  : "Confirm and create proposal",
                              )
                            : t("Confirmă și continuă", "Confirm and continue")}
                        </Button>
                        <Button variant="ghost" onClick={() => skip("skipped")}>
                          {t("Omit", "Skip")}
                        </Button>
                        <details>
                          <summary>
                            {t("Alte opțiuni", "Other options")}
                          </summary>
                          <Button
                            variant="ghost"
                            onClick={() => skip("unknown")}
                          >
                            {t("Nu știu", "I don't know")}
                          </Button>
                        </details>
                      </div>
                    ) : (
                      <div className="actions">
                        <Button
                          variant="primary"
                          disabled={
                            planFinished || !answerEvidenceText(answer).trim()
                          }
                          onClick={submit}
                        >
                          {activePlan &&
                          !editingAnswer &&
                          questionIndex === activePlan.questions.length - 1 &&
                          !!rewriteRole
                            ? t(
                                "Salvează și creează descrierea",
                                "Save and create description",
                              )
                            : t("Salvează și continuă", "Save and next")}{" "}
                          <kbd>⌘/Ctrl Enter</kbd>
                        </Button>
                        <Button
                          disabled={planFinished}
                          onClick={() => skip("unknown")}
                        >
                          {t("Nu știu", "I don't know")} <kbd>⌘/Ctrl ⇧ K</kbd>
                        </Button>
                        <Button
                          disabled={planFinished}
                          onClick={() => skip("skipped")}
                        >
                          {t("Omit", "Skip")} <kbd>⌘/Ctrl ⇧ J</kbd>
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <h2>
              {t(
                "Adaugă întâi o experiență sau o intrare",
                "Add an experience or entry first",
              )}
            </h2>
            <Button onClick={goEdit}>{t("Editor", "Editor")}</Button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {(!guided || phase === "questions") && (
          <p className="small muted">
            {t(
              "Răspunsurile și selecțiile se păstrează separat de CV. Sugestiile AI nu sunt fapte confirmate.",
              "Answers and choices stay separate from the CV. AI suggestions are not confirmed facts.",
            )}
          </p>
        )}
        {guided && target && phase === "questions" && (
          <details className="guided-generation-options">
            <summary>
              {t(
                "Generează din informațiile existente",
                "Generate from existing information",
              )}
            </summary>
            <div className="actions">
              <Button
                disabled={planning || !ready}
                onClick={() => {
                  setPurpose(undefined);
                  setPhase("proposal");
                }}
              >
                {t("Propune formularea rolului", "Propose role wording")}
              </Button>
              {d.roles.some((r) => r.id === targetId) && (
                <Button
                  disabled={planning || !ready}
                  onClick={() => {
                    setPurpose("summary");
                    setPhase("proposal");
                  }}
                >
                  {t(
                    "Doar rezumatul scurt al rolului",
                    "Short role introduction only",
                  )}
                </Button>
              )}
            </div>
          </details>
        )}
        {guided && phase === "proposal" && (
          <Button
            variant="ghost"
            disabled={rewriteBusy}
            onClick={() => setPhase("questions")}
          >
            {t("Înapoi la întrebări", "Back to questions")}
          </Button>
        )}
        {rewriteRole &&
          target &&
          d.roles.some((r) => r.id === targetId) &&
          (!guided || (phase === "proposal" && purpose === "summary")) && (
            <RoleRewrite
              key={`summary-${targetId}`}
              purpose="summary"
              compact={guided}
              onBusyChange={guided ? setRewriteBusy : undefined}
              onDecision={
                guided
                  ? () =>
                      autoStart
                        ? profile?.closeEnrichment()
                        : setPhase("complete")
                  : undefined
              }
              onPurposeChange={
                guided
                  ? (next) => {
                      setPurpose(next);
                      setPhase("proposal");
                    }
                  : undefined
              }
              draft={d}
              targetId={targetId}
              request={(id) => rewriteRole(id, "summary")}
              ready={ready}
              change={change}
              accept={(draft, id, text, sources) => {
                const prior = draft.presentation.approvedWording?.[id];
                const priorText = currentWording(draft, id);
                const whole = prior?.scope === "experience" && priorText;
                return acceptWording(draft, id, {
                  text: whole ? replaceRoleIntroduction(priorText, text) : text,
                  sources: whole
                    ? [
                        ...prior.sources,
                        ...sources.filter(
                          (f) => !prior.sources.some((s) => s.id === f.id),
                        ),
                      ]
                    : sources,
                  ...(whole ? { scope: "experience" as const } : {}),
                  origin: "ai_generated",
                });
              }}
            />
          )}
        {rewriteRole &&
          target &&
          (!guided || (phase === "proposal" && !purpose)) && (
            <RoleRewrite
              draft={d}
              targetId={targetId}
              request={rewriteRole}
              compact={guided}
              onBusyChange={guided ? setRewriteBusy : undefined}
              onDecision={
                guided
                  ? () =>
                      autoStart
                        ? profile?.closeEnrichment()
                        : setPhase("complete")
                  : undefined
              }
              onPurposeChange={
                guided
                  ? (next) => {
                      setPurpose(next);
                      setPhase("proposal");
                    }
                  : undefined
              }
              autoRequest={rewriteCycle ?? undefined}
              ready={ready}
              onAutoRequest={() => setRewriteCycle(null)}
              change={change}
              accept={(draft, targetId, text, sources) =>
                acceptWording(draft, targetId, {
                  text,
                  sources,
                  scope: "experience",
                })
              }
            />
          )}
        {!rewriteRole && transport && target && (
          <AiSuggestions
            draft={d}
            targetId={targetId}
            snapshot={snapshot ?? null}
            ready={ready}
            transport={transport}
            change={change}
          />
        )}
      </section>
      <div className="stack">
        <AnswerHistory
          collapsed={guided}
          title={t(
            `Întrebări și răspunsuri (${saved.length})`,
            `Questions and answers (${saved.length})`,
          )}
        >
          <section
            className="card"
            aria-label={t("Context profesional", "Career context")}
          >
            {target && !planFinished && showAnswer && (
              <>
                <p>
                  <strong>{answer.questionText}</strong>
                </p>
                <PreviewText
                  key={answer.id}
                  value={answer.text}
                  label={t("Previzualizare răspuns", "Answer preview")}
                  change={put}
                />
              </>
            )}
            {!!saved.length && (
              <>
                <h3>{t("Ultimul răspuns salvat", "Latest saved answer")}</h3>
                {contextRow(saved.at(-1)!)}
                <details>
                  <summary>
                    {t(
                      "Toate întrebările și răspunsurile salvate",
                      "All saved questions and answers",
                    )}
                  </summary>
                  {saved.slice(0, -1).map(contextRow)}
                </details>
              </>
            )}
          </section>
        </AnswerHistory>
        {!embedded && (
          <DocumentPreview
            draft={d}
            asOf={asOf}
            onTemplateChange={(versionId) =>
              change(chooseTemplate(d, versionId))
            }
            onTextEdit={(id, text) => {
              const f = [
                ...d.roles.flatMap((r) => [r.context, ...r.bullets]),
                ...d.optionalSections.flatMap((s) =>
                  s.entries.flatMap((e) => [e.details, ...(e.bullets ?? [])]),
                ),
              ].find((f) => f.fieldId === id);
              if (f) {
                const next = patchFact(d, f, text);
                if (
                  target &&
                  f.fieldId === target.field.fieldId &&
                  signature.current === target.field.id
                )
                  signature.current = enrichmentTarget(next, targetId)?.field
                    .id;
                change(next);
              }
            }}
            onEdit={(id) => {
              goEdit();
              focusField(id);
            }}
          />
        )}
      </div>
    </div>
  );
}
