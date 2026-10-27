import { useEffect, useRef, useState } from "react";
import {
  saveAnswer,
  addAnswerToCv,
  removeAnswerFromCv,
  enrichmentTarget,
} from "../base/enrichment";
import { clone, type Answer, type BaseDraft } from "../base/model";
import { focusField, patchFact } from "../base/editing";
import { formatDate } from "../base/dates";
import { Button, useCopy } from "./ui";
import { DocumentPreview, PreviewText } from "./DocumentPreview";
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
}: {
  draft: BaseDraft;
  change: (d: BaseDraft) => void;
  goEdit: () => void;
  asOf: { year: string; month: string };
  undoFrom?: BaseDraft | null;
  durable?: boolean;
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
        s.entries.map((e) => ({ id: e.id, label: e.title.value })),
      ),
  ];
  const [targetId, setTargetId] = useState(targets[0]?.id ?? ""),
    [index, setIndex] = useState(0),
    [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null),
    target = enrichmentTarget(d, targetId),
    question = dimensions[index];
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

  const current = d.answers.find(
    (a) => a.targetId === targetId && a.question === question,
  );
  const answer: Answer = current ?? {
    id: `answer_${targetId}_${question}`,
    targetId,
    question,
    questionText: questions[question],
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
  function advance() {
    setIndex((i) => (i + 1) % dimensions.length);
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
    if (!answer.text.trim()) {
      input.current?.focus();
      return;
    }
    try {
      if (!signature.current) throw new Error("staleTarget");
      change(saveAnswer(d, { ...answer, status: "draft" }, signature.current));
      setError("");
      advance();
    } catch {
      failure();
    }
  }
  function skip(status: "skipped" | "unknown") {
    const next = clone(d);
    next.answers = [
      ...next.answers.filter((a) => a.id !== answer.id),
      { ...answer, status },
    ];
    change(next);
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
                setIndex(dimensions.indexOf(a.question));
                signature.current = destination.field.id;
                input.current?.focus();
              }}
            >
              {t("Editează răspunsul", "Edit answer")}
            </Button>
            {a.targetId === targetId && (
              <Button
                disabled={a.status !== "confirmed" || linked?.value === a.text}
                onClick={() => add(a)}
              >
                {linked
                  ? linked.value === a.text
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
        if (!target || e.nativeEvent.isComposing || !(e.ctrlKey || e.metaKey))
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
            <label htmlFor="enrich-target">{t("Intrare", "Entry")}</label>
            <select
              id="enrich-target"
              value={target ? targetId : ""}
              onChange={(e) => {
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
            <p className="eyebrow">
              {t("Îndrumare manuală", "Manual guidance")} · {index + 1}/
              {dimensions.length}
            </p>
            <label className="question-title" htmlFor="enrichment-answer">
              {answer.questionText}
            </label>
            <textarea
              ref={input}
              id="enrichment-answer"
              className="native"
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
                disabled={!answer.text.trim()}
                onClick={submit}
              >
                {t("Salvează și continuă", "Save and next")}{" "}
                <kbd>⌘/Ctrl Enter</kbd>
              </Button>
              <Button onClick={() => skip("unknown")}>
                {t("Nu știu", "I don't know")} <kbd>⌘/Ctrl ⇧ K</kbd>
              </Button>
              <Button onClick={() => skip("skipped")}>
                {t("Omit", "Skip")} <kbd>⌘/Ctrl ⇧ J</kbd>
              </Button>
            </div>
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
            "AI și relevanța pentru job nu sunt conectate. Folosim doar cuvintele tale.",
            "AI and job relevance are not connected. Only your own wording is used.",
          )}
        </p>
      </section>
      <div className="stack">
        <section
          className="card"
          aria-label={t("Context profesional", "Career context")}
        >
          {target && (
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
