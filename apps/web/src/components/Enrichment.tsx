import { useEffect, useRef, useState } from "react";
import { applyAnswer, enrichmentTarget } from "../base/enrichment";
import {
  clone,
  fact,
  localId,
  type Answer,
  type BaseDraft,
} from "../base/model";
import { focusField, patchFact } from "../base/editing";
import { formatDate } from "../base/dates";
import { Button, useCopy } from "./ui";
import { DocumentPreview } from "./DocumentPreview";
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
}: {
  draft: BaseDraft;
  change: (d: BaseDraft) => void;
  goEdit: () => void;
  asOf: { year: string; month: string };
}) {
  const t = useCopy(),
    targets = [
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
        .filter((s) => !["languages"].includes(s.kind))
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
    signature.current = target?.field.id;
    input.current?.focus();
  }, [targetId, index]);
  const current = d.answers.find(
    (a) => a.targetId === targetId && a.question === question,
  );
  const answer: Answer = current ?? {
    id: `answer_${targetId}_${question}`,
    targetId,
    question,
    text: "",
    status: "draft",
    mode: "append",
  };
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
  function put(text: string) {
    const next = clone(d);
    next.answers = [
      ...next.answers.filter((a) => a.id !== answer.id),
      { ...answer, text, status: "draft" },
    ];
    change(next);
    setError("");
  }
  function next() {
    setIndex((i) => (i + 1) % dimensions.length);
  }
  function submit() {
    try {
      if (!target || !signature.current) throw new Error("staleTarget");
      const result = applyAnswer(
        d,
        { ...answer, status: "draft" },
        signature.current,
      );
      change(result);
      signature.current = enrichmentTarget(result, targetId)?.field.id;
      setError("");
      next();
    } catch {
      setError(
        t(
          "Destinația s-a schimbat. Răspunsul este păstrat; selectează din nou intrarea.",
          "The target changed. Your answer is retained; select the entry again.",
        ),
      );
    }
  }
  function skip(status: "skipped" | "unknown") {
    const result = clone(d);
    result.answers = [
      ...result.answers.filter((a) => a.id !== answer.id),
      { ...answer, status },
    ];
    change(result);
    next();
  }
  if (!targets.length)
    return (
      <section className="card">
        <h2>
          {t(
            "Adaugă întâi o experiență sau o intrare",
            "Add an experience or entry first",
          )}
        </h2>
        <Button onClick={goEdit}>{t("Editor", "Editor")}</Button>
      </section>
    );
  const preview = clone(d),
    previewTarget = enrichmentTarget(preview, targetId),
    pendingId = `pending-${answer.id}`;
  if (previewTarget && answer.text.trim() && answer.status === "draft") {
    const prior = [
      previewTarget.field,
      ...(previewTarget.entry.bullets ?? []),
    ].find((f) => f.id === answer.factId);
    if (prior || answer.mode === "replace") {
      Object.assign(prior ?? previewTarget.field, {
        value: answer.text,
        fieldId: pendingId,
        id: pendingId,
      });
    } else {
      (previewTarget.entry.bullets ??= []).push({
        ...fact(answer.text),
        fieldId: pendingId,
        id: pendingId,
      });
    }
    delete preview.presentation.contributionHtml?.[targetId];
  }
  return (
    <div className="editor-layout enrichment-inline">
      <section
        className="card question-card"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || !(e.ctrlKey || e.metaKey)) return;
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
        <label htmlFor="enrich-target">{t("Intrare", "Entry")}</label>
        <select
          id="enrich-target"
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            signature.current = enrichmentTarget(d, e.target.value)?.field.id;
            setIndex(0);
          }}
        >
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
          {questions[question]}
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
          {t(
            "Scrie ce știi; un rezultat nemăsurat este suficient.",
            "Write what you know; an unmeasured outcome is enough.",
          )}
        </p>
        <div className="actions">
          <Button
            variant="primary"
            disabled={!answer.text.trim()}
            onClick={submit}
          >
            {t("Salvează și continuă", "Save and next")} <kbd>⌘/Ctrl Enter</kbd>
          </Button>
          <Button onClick={() => skip("unknown")}>
            {t("Nu știu", "I don't know")} <kbd>⌘/Ctrl ⇧ K</kbd>
          </Button>
          <Button onClick={() => skip("skipped")}>
            {t("Omit", "Skip")} <kbd>⌘/Ctrl ⇧ J</kbd>
          </Button>
        </div>
        {error && <p role="alert">{error}</p>}
        <details className="section-info-text">
          <summary>
            {t("Relevanță pentru job și surse", "Job relevance and sources")}
          </summary>
          <p>
            {t(
              "AI și relevanța pentru job nu sunt conectate. Răspunsurile sunt folosite exact cum le scrii.",
              "AI and job relevance are not connected. Your answers are used as written.",
            )}
          </p>
        </details>
      </section>
      <DocumentPreview
        draft={preview}
        asOf={asOf}
        onTextEdit={(id, text) => {
          if (id === pendingId) {
            put(text);
            input.current?.focus();
            return;
          }
          const f = [
            ...d.roles.flatMap((r) => [r.context, ...r.bullets]),
            ...d.optionalSections.flatMap((s) =>
              s.entries.flatMap((e) => [e.details, ...(e.bullets ?? [])]),
            ),
          ].find((f) => f.fieldId === id);
          if (f) change(patchFact(d, f, text));
        }}
        onEdit={(id) => {
          goEdit();
          focusField(id);
        }}
      />
    </div>
  );
}
