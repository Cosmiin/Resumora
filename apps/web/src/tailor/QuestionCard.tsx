import { useState } from "react";
import { isRoleSection, type Answer, type Locale, type ScoredKind, type TailorQuestion } from "@resumora/shared";
import { AnswerBox, type Via } from "../cv/enrich/AnswerBox.tsx";
import { t } from "../i18n/t.ts";
import { RolePanel, roleMeta, type Role } from "./RolePanel.tsx";

export type Draft = Omit<Answer, "questionId">;

type Props = {
  question: TailorQuestion;
  /** "Role 1 of 3 · Question 2 of 2", or "Question 2 of 5". */
  progress: string;
  /** The answer given before (after Back), shown selected. */
  initial?: Draft;
  /** Next: the answer, kept in the browser until the step's last question. */
  onNext(answer: Draft): void;
  onSkip(): void;
  /** Absent on the first question. */
  onBack?(): void;
  /** Experience, Projects & volunteering: the item the question is about, shown on the left, and its kind. */
  role?: Role;
  kind?: ScoredKind;
  /** Skills: the person's roles, to say where a confirmed skill was used. */
  roles?: Role[];
  locale?: Locale;
};

export const VIA: Record<Answer["via"], Via[]> = { option: ["pick"], typed: ["type"], voice: ["voice"], skip: [] };
/** Spoken words win, then typed ones; a pick alone is an option. */
export const answerVia = (via: Via[]): Answer["via"] => (via.includes("voice") ? "voice" : via.includes("type") ? "typed" : "option");

/** One question in the enrichment style: a choice only selects; Next, Back and Skip move. */
export function QuestionCard({ role, kind, locale = "en", ...props }: Props) {
  if (!role || !isRoleSection(props.question.section)) return <Question {...props} locale={locale} />;
  return <div className="tailor-split">
    <RolePanel role={role} locale={locale} bulletId={props.question.bulletId} kind={kind} />
    <Question {...props} locale={locale} />
  </div>;
}

function Question({ question, progress, initial, onNext, onSkip, onBack, roles = [], locale }: Omit<Props, "role" | "kind">) {
  const [value, setValue] = useState(initial?.value ?? "");
  const [via, setVia] = useState<Via[]>(initial ? VIA[initial.via] : []);
  const [roleIds, setRoleIds] = useState<string[]>(initial?.roleIds ?? []);
  const answer = value.trim();
  // A skill is confirmed by any answer except the last option ("No").
  const confirmed = question.kind === "skill" && answer !== "" && answer !== question.options.at(-1);
  const toggle = (id: string) => setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const next = () => {
    const picked = confirmed ? roles.map((r) => r.id).filter((id) => roleIds.includes(id)) : [];
    onNext({ value: answer, via: answerVia(via), ...(picked.length > 0 ? { roleIds: picked } : {}) });
  };

  return <section className="tailor-card" aria-labelledby={`q-${question.id}`}>
    <p className="tailor-eyebrow">{progress}</p>
    <h2 id={`q-${question.id}`}>{question.text}</h2>
    <AnswerBox question={{ bulletId: question.bulletId ?? question.id, text: question.text, options: question.options, kind: "detail" }} value={value} via={via}
      locale={locale} onChange={(text, how) => { setValue(text); setVia(how); }} />
    {confirmed && roles.length > 0 && <div className="answer-opts" role="group" aria-label={t("tailor.question.usedIn")}>
      <p className="tailor-eyebrow">{t("tailor.question.usedIn")}</p>
      {roles.map((r) => <button key={r.id} type="button" className="answer-opt" aria-pressed={roleIds.includes(r.id)} onClick={() => toggle(r.id)}>
        {[r.title.trim() || t("tailor.role.untitled"), roleMeta(r, locale ?? "en")].filter(Boolean).join(" · ")}
      </button>)}
    </div>}
    <div className="fm-foot">
      {onBack && <button type="button" className="fm-ghost" onClick={onBack}>{t("tailor.question.back")}</button>}
      <button type="button" className="fm-ghost" onClick={onSkip}>{t("tailor.question.skip")}</button>
      <button type="button" className="fm-btn" disabled={!answer} onClick={next}>{t("tailor.question.next")}</button>
    </div>
  </section>;
}
