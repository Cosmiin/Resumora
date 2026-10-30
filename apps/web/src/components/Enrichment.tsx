import {
  careerContext,
  type CareerContext,
} from "@resumora/contracts/intelligence/context";
import { RoleRewrite } from "./RoleRewrite";
import { acceptWording } from "../base/wording";
import type { RoleRewrite as RoleProposal } from "@resumora/contracts/intelligence/model";
import { AiSuggestions } from "./AiSuggestions";
import type { AuthTransport } from "../auth/AuthShell";
import { useEffect, useRef, useState } from "react";
import {
  saveAnswer,
  addAnswerToCv,
  removeAnswerFromCv,
  answerEvidenceText,
  enrichmentTarget,
  nextQuestionIndex,
} from "../base/enrichment";
import { clone, type Answer, type BaseDraft } from "../base/model";
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
export function Enrichment({
  draft: d,
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
}: {
  transport?: AuthTransport;
  snapshot?: { id: string; revision: number } | null;
  ready?: boolean;
  draft: BaseDraft;
  change: (d: BaseDraft) => void;
  goEdit: () => void;
  asOf: { year: string; month: string };
  undoFrom?: BaseDraft | null;
  durable?: boolean;
  prepareQuestions?: (targetId: string) => Promise<QuestionPlan>;
  rewriteRole?: (targetId: string) => Promise<RoleProposal>;
}) {
  const t = useCopy();
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
  const [targetId, setTargetId] = useState(targets[0]?.id ?? ""),
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
    setPlanning(false);
    setManual(false);
    setRewriteCycle(null);
    return () => {
      requestGeneration.current++;
    };
  }, [targetId]);
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
    if (!planFinished) setRewriteCycle(null);
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
  const saved = d.answers.filter((a) => a.sourceId);
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
  return (
    <div
      className="editor-layout enrichment-inline"
      onKeyDown={(e) => {
        if (
          !showAnswer ||
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
                  "Alege un rol și apasă Îmbunătățește. Răspunde la câteva întrebări, apoi verifică descrierea propusă.",
                  "Choose a role and click Improve. Answer a few questions, then review the proposed description.",
                )}
              </p>
            </div>
            <label htmlFor="enrich-target">
              {t("Rol sau experiență", "Role or experience")}
            </label>
            <select
              id="enrich-target"
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
            <p className="entry-context">{target?.field.value}</p>
            {prepareQuestions && !activePlan && (
              <Button
                variant="primary"
                disabled={planning || !target || !ready}
                onClick={async () => {
                  const before = currentDraft.current,
                    generation = ++requestGeneration.current;
                  const active = () => generation === requestGeneration.current;
                  setPlanning(true);
                  setManual(false);
                  setError("");
                  try {
                    const result = await prepareQuestions(targetId);
                    if (!active()) return;
                    if (currentDraft.current !== before)
                      throw new Error("stale");
                    const next = clone(before);
                    next.questionPlans = [
                      ...(next.questionPlans ?? []).slice(-19),
                      result,
                    ];
                    setEditingAnswerId(null);
                    change(next);
                    setIndex(0);
                  } catch {
                    if (active())
                      setError(
                        t(
                          "Întrebările AI nu sunt disponibile sau contextul s-a schimbat. Răspunsurile sunt păstrate; poți continua manual.",
                          "AI questions are unavailable or context changed. Answers are retained; manual questions remain available.",
                        ),
                      );
                  } finally {
                    if (active()) setPlanning(false);
                  }
                }}
              >
                {planning
                  ? t("Pregătim întrebările…", "Preparing questions…")
                  : t("Îmbunătățește", "Improve")}
              </Button>
            )}
            {prepareQuestions && !activePlan && !planning && !ready && (
              <p role="status" className="small muted">
                {t(
                  "Salvăm modificările. Vei putea continua imediat după salvare.",
                  "Saving your changes. You can continue once they are saved.",
                )}
              </p>
            )}
            {prepareQuestions && !activePlan && error && (
              <Button onClick={() => setManual(true)}>
                {t(
                  "Continuă cu întrebări manuale",
                  "Continue with manual questions",
                )}
              </Button>
            )}
            {showAnswer && (
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
                {!planFinished && !!answer.options?.length && (
                  <fieldset className="enrichment-choices">
                    <legend>
                      {t(
                        "Alege una, mai multe sau niciuna; poți scrie propriul răspuns.",
                        "Choose one, several or none; you can write your own answer.",
                      )}
                    </legend>
                    {answer.options.map((option) => (
                      <label className="enrichment-choice" key={option.id}>
                        <input
                          type={
                            answer.selectionMode === "single"
                              ? "radio"
                              : "checkbox"
                          }
                          name={`choices-${answer.id}`}
                          checked={
                            answer.selectedOptionIds?.includes(option.id) ??
                            false
                          }
                          onClick={() => {
                            if (
                              answer.selectionMode === "single" &&
                              answer.selectedOptionIds?.includes(option.id)
                            ) {
                              const next = clone(d);
                              next.answers = [
                                ...next.answers.filter(
                                  (a) => a.id !== answer.id,
                                ),
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
                                  ? answer.selectedOptionIds.filter(
                                      (id) => id !== option.id,
                                    )
                                  : [
                                      ...(answer.selectedOptionIds ?? []),
                                      option.id,
                                    ];
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
                )}
                {!planFinished && (
                  <>
                    <p className="small muted">
                      {t(
                        "Selectează doar ce ai făcut. Apasă din nou o opțiune pentru a o deselecta sau scrie în cuvintele tale.",
                        "Select only what you did. Click an option again to deselect it, or use your own words.",
                      )}
                    </p>
                    <textarea
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
                        rewriteRole
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
        <p className="small muted">
          {t(
            "Răspunsurile și selecțiile se păstrează separat de CV. Sugestiile AI nu sunt fapte confirmate.",
            "Answers and choices stay separate from the CV. AI suggestions are not confirmed facts.",
          )}
        </p>
        {rewriteRole &&
          target &&
          (!prepareQuestions ||
            planFinished ||
            (!activePlan &&
              saved.some(
                (a) => a.targetId === targetId && a.status === "confirmed",
              ))) && (
            <RoleRewrite
              draft={d}
              targetId={targetId}
              request={rewriteRole}
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
        <DocumentPreview
          draft={d}
          asOf={asOf}
          onTemplateChange={(versionId) => change(chooseTemplate(d, versionId))}
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
                signature.current = enrichmentTarget(next, targetId)?.field.id;
              change(next);
            }
          }}
          onEdit={(id) => {
            goEdit();
            focusField(id);
          }}
        />
      </div>
    </div>
  );
}
