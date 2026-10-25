import { useState } from "react";
import { ArrowRight, Check, MessageSquare } from "lucide-react";
import { applyAnswer } from "../base/enrichment";
import { clone, localId, type Answer, type BaseDraft } from "../base/model";
import { Button, Field, Pill, useCopy } from "./ui";
export function Enrichment({
  draft: d,
  change,
  goEdit,
}: {
  draft: BaseDraft;
  change: (next: BaseDraft) => void;
  goEdit: () => void;
}) {
  const t = useCopy(),
    [targetId, setTargetId] = useState(d.roles[0]?.id ?? ""),
    [question, setQuestion] = useState<Answer["question"]>("contribution");
  const [reviewTarget, setReviewTarget] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const current = d.answers.find(
    (a) => a.targetId === targetId && a.question === question,
  );
  const answer: Answer = current ?? {
    id: localId(),
    targetId,
    question,
    text: "",
    status: "draft",
    mode: "append",
  };
  const role = d.roles.find((r) => r.id === targetId),
    reviewing = answer.status === "review",
    handled = ["confirmed", "skipped", "unknown"].includes(answer.status);
  const questions = {
    contribution: t(
      "Ce ai făcut tu și ce s-a schimbat pentru echipă?",
      "What did you do, and what changed for the team?",
    ),
    tools: t(
      "Ce instrumente ai folosit și pentru ce activitate?",
      "Which tools did you use, and for what work?",
    ),
    context: t(
      "Cu cine ai lucrat și în ce context?",
      "Who did you work with, and in what context?",
    ),
  };
  function put(patch: Partial<Answer>) {
    const next = clone(d);
    next.answers = [
      ...next.answers.filter((a) => a.id !== answer.id),
      { ...answer, ...patch },
    ];
    change(next);
    setConfirmed(false);
    setError("");
  }
  if (!d.roles.length)
    return (
      <section className="card empty">
        <MessageSquare size={32} />
        <h2>{t("Începem cu un rol real", "Start with a real role")}</h2>
        <p>
          {t(
            "Adaugă experiență în editor pentru întrebări legate de acel rol.",
            "Add experience in the editor for questions tied to that role.",
          )}
        </p>
        <Button variant="primary" onClick={goEdit}>
          {t("Deschide editorul", "Open editor")}
        </Button>
      </section>
    );
  return (
    <div className="enrichment-layout">
      <section className="card">
        <h2>
          {t("Un pas mic, mai mult context", "A small step, more context")}
        </h2>
        <p>
          {t(
            "Răspunde doar ce știi. Rezultatele calitative sunt suficiente; nu ai nevoie de procente.",
            "Answer what you know. Qualitative results are enough; percentages are not required.",
          )}
        </p>
        <label className="field">
          {t("Rolul vizat", "Target role")}
          <select
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setReviewTarget(null);
              setConfirmed(false);
            }}
          >
            {d.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title.value || t("Rol nou", "New role")} · {r.company.value}
              </option>
            ))}
          </select>
        </label>
        <div className="question-list">
          {(["contribution", "tools", "context"] as const).map((q) => (
            <Button
              key={q}
              aria-pressed={q === question}
              onClick={() => {
                setQuestion(q);
                setReviewTarget(null);
                setConfirmed(false);
              }}
            >
              {questions[q]}
            </Button>
          ))}
        </div>
        <p className="small muted">
          {t(
            "Destinație: CV de bază. Îmbogățirea doar pentru un job nu este disponibilă încă.",
            "Destination: Base CV. Job-only enrichment is not available yet.",
          )}
        </p>
      </section>
      <section className="card answer-card">
        <Pill tone={handled ? "good" : "neutral"}>
          {handled
            ? answer.status === "confirmed"
              ? t("Răspuns confirmat în ciornă", "Answer confirmed in draft")
              : t("Omis · nu adaugă informații", "Skipped · adds no facts")
            : reviewing
              ? t("Pasul 2 · Confirmă", "Step 2 · Confirm")
              : t("Pasul 1 · Răspunde", "Step 1 · Answer")}
        </Pill>
        <h2>{questions[question]}</h2>
        {handled ? (
          <>
            <p>
              {answer.text ||
                t("Nu a fost adăugată nicio informație.", "No fact was added.")}
            </p>
            <p className="muted">
              {answer.status === "confirmed"
                ? t(
                    "Poți edita informația în rolul vizat. Salvează explicit ciorna pentru o versiune în această sesiune.",
                    "You can edit the fact in the target role. Save the draft explicitly for a version in this session.",
                  )
                : t(
                    "Poți reveni oricând la această întrebare.",
                    "You can return to this question at any time.",
                  )}
            </p>
            {answer.status !== "confirmed" && (
              <Button onClick={() => put({ status: "draft" })}>
                {t("Răspunde acum", "Answer now")}
              </Button>
            )}
            <Button variant="primary" onClick={goEdit}>
              {t("Vezi CV-ul de bază", "See Base CV")}
            </Button>
          </>
        ) : reviewing ? (
          <>
            <h3>{t("Ce ai spus", "What you told us")}</h3>
            <blockquote>{answer.text}</blockquote>
            <p className="muted">
              {t(
                "Textul va fi folosit exact cum l-ai scris. Nu a fost extras, reformulat sau generat de AI.",
                "Your exact words will be used. Nothing was extracted, rewritten, or AI-generated.",
              )}
            </p>
            <fieldset>
              <legend>{t("Mod de adăugare", "How to add it")}</legend>
              <label className="check">
                <input
                  type="radio"
                  name="answer-mode"
                  checked={answer.mode === "append"}
                  onChange={() => put({ mode: "append" })}
                />
                {t(
                  "Adaugă o contribuție la acest rol",
                  "Append a contribution to this role",
                )}
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="answer-mode"
                  checked={answer.mode === "replace"}
                  onChange={() => put({ mode: "replace" })}
                />
                {t(
                  "Înlocuiește doar contextul acestui rol",
                  "Replace only this role’s context",
                )}
              </label>
            </fieldset>
            {answer.mode === "replace" && (
              <div className="before-after">
                <p>
                  <b>{t("Înainte", "Before")}: </b>
                  {role?.context.value || "—"}
                </p>
                <p>
                  <b>{t("După", "After")}: </b>
                  {answer.text}
                </p>
              </div>
            )}
            <label className="check check-card">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t(
                "Aceste informații sunt adevărate și descriu munca mea.",
                "These facts are true and describe my own work.",
              )}
            </label>
            <div className="actions">
              <Button
                onClick={() => {
                  put({ status: "draft" });
                  setReviewTarget(null);
                }}
              >
                {t("Editează răspunsul", "Edit answer")}
              </Button>
              <Button
                variant="primary"
                disabled={!confirmed || !reviewTarget}
                onClick={() => {
                  try {
                    change(applyAnswer(d, answer, reviewTarget!));
                    setConfirmed(false);
                  } catch {
                    setError(
                      t(
                        "Rolul sau contextul s-a schimbat. Răspunsul este păstrat; revino la editare și verifică din nou destinația.",
                        "The role or context changed. Your answer is preserved; edit it and review the target again.",
                      ),
                    );
                  }
                }}
              >
                <Check size={16} />
                {t(
                  "Confirmă și aplică în ciornă",
                  "Confirm and apply to draft",
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field
              label={t("Răspunsul tău", "Your answer")}
              multiline
              value={answer.text}
              onChange={(v) => put({ text: v, status: "draft" })}
              hint={t(
                "Poți spune că nu ai măsurat rezultatul. Nu presupunem instrumente, ani sau cifre.",
                "You can say the result was not measured. We infer no tools, years, or numbers.",
              )}
            />
            <div className="actions">
              <Button onClick={() => put({ status: "skipped" })}>
                {t("Omit întrebarea", "Skip question")}
              </Button>
              <Button onClick={() => put({ status: "unknown" })}>
                {t("Nu știu", "I don’t know")}
              </Button>
              <Button
                variant="primary"
                disabled={!answer.text.trim() || !role}
                onClick={() => {
                  put({ status: "review" });
                  setReviewTarget(role!.context.id);
                }}
              >
                <ArrowRight size={16} />
                {t("Revizuiește răspunsul", "Review answer")}
              </Button>
            </div>
          </>
        )}
        {reviewing && !reviewTarget && (
          <p className="notice">
            {t(
              "Redeschide editarea răspunsului pentru a verifica din nou destinația.",
              "Edit the answer again to recheck its target.",
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
