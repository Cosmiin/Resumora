import { useState } from "react";
import { isRoleSection, type Answer, type JobExtraction, type Locale, type MatchScore, type ScoredKind, type TailorQuestion } from "@resumora/shared";
import { AnswerBox, type Via } from "../cv/enrich/AnswerBox.tsx";
import { t } from "../i18n/t.ts";
import { nameOf } from "./role-done.ts";
import { RolePanel, roleMeta, type Role } from "./RolePanel.tsx";

export type Draft = Omit<Answer, "questionId">;

type Props = {
  question: TailorQuestion;
  /** "Role 1 of 3 · Question 2 of 2", or "Question 2 of 5". */
  progress: string;
  /** Where the question sits among the step's questions, for the progress dots. */
  index: number;
  total: number;
  /** The answer given before (after Back), shown selected. */
  initial?: Draft;
  /** Next: the answer, kept in the browser until the step's last question. */
  onNext(answer: Draft): void;
  onSkip(): void;
  /** Absent on the first question. */
  onBack?(): void;
  /** Experience, Projects & volunteering: the item the question is about, shown on its sheet, and its kind. */
  role?: Role;
  kind?: ScoredKind;
  /** Skills: the person's roles, to say where a confirmed skill was used. */
  roles?: Role[];
  locale?: Locale;
  /** The job and the base CV's match with it: what the ad asks for behind this question. */
  job?: JobExtraction | null;
  score?: MatchScore | null;
};

export const VIA: Record<Answer["via"], Via[]> = { option: ["pick"], typed: ["type"], voice: ["voice"], skip: [] };
/** Spoken words win, then typed ones; a pick alone is an option. */
export const answerVia = (via: Via[]): Answer["via"] => (via.includes("voice") ? "voice" : via.includes("type") ? "typed" : "option");

/** One question on the focus screen: the role's sheet beside it, what the ad asks for, and why the coach asks. */
export function QuestionCard({ role, kind, locale = "en", ...props }: Props) {
  const sheet = !!role && isRoleSection(props.question.section);
  return <>
    <div className="fm-prog">
      <p className="fm-eyebrow" role="status">{props.progress}</p>
      <div className="fm-steps" aria-hidden="true">
        {Array.from({ length: props.total }, (_, i) => <i key={i} className={i < props.index ? "is-done" : i === props.index ? "is-on" : undefined} />)}
      </div>
    </div>
    <div className={sheet ? "fm-grid has-sheet" : "fm-grid"}>
      <Question {...props} locale={locale} scoped={sheet} />
      {sheet && <RolePanel role={role} locale={locale} bulletId={props.question.bulletId} kind={kind} />}
    </div>
  </>;
}

function Question({ question, index, total, initial, onNext, onSkip, onBack, roles = [], locale, job = null, score = null, scoped }:
  Omit<Props, "role" | "kind" | "progress"> & { scoped: boolean }) {
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
  // What the ad asks for behind the question: the requirement or keyword it is about, and how the CV stands on it.
  const asked = question.gap ? nameOf(question.gap, job) : null;
  const status = score?.labels.find((label) => label.ref === question.gap)?.status;

  return <section className="fm-right" aria-labelledby={`q-${question.id}`}>
    <h2 className="fm-q" id={`q-${question.id}`}>{question.text}</h2>
    {asked && <div className="tailor-asks">
      <span className="ui-label">{t("tailor.question.adAsks")}</span>
      <ul className="tailor-kw"><li className="is-miss">{asked}</li></ul>
      {status && status !== "met" && <span className="ui-pill ui-pill--warn">{t(status === "partial" ? "tailor.question.partly" : "tailor.question.missing")}</span>}
    </div>}
    <AnswerBox question={{ bulletId: question.bulletId ?? question.id, text: question.text, options: question.options, kind: "detail" }} value={value} via={via}
      locale={locale} onChange={(text, how) => { setValue(text); setVia(how); }} />
    {confirmed && roles.length > 0 && <div className="answer-opts" role="group" aria-label={t("tailor.question.usedIn")}>
      <p className="ui-label">{t("tailor.question.usedIn")}</p>
      {roles.map((r) => <button key={r.id} type="button" className="answer-opt" aria-pressed={roleIds.includes(r.id)} onClick={() => toggle(r.id)}>
        {[r.title.trim() || t("tailor.role.untitled"), roleMeta(r, locale ?? "en")].filter(Boolean).join(" · ")}
      </button>)}
    </div>}
    {question.reason.trim() && <p className="fm-why">{t("enrich.focus.why", { reason: question.reason.trim() })}</p>}
    <div className="fm-foot">
      {onBack && <button type="button" className="fm-ghost fm-back" onClick={onBack}>{t("tailor.question.back")}</button>}
      <button type="button" className="fm-ghost" onClick={onSkip}>{t("tailor.question.skip")}</button>
      <button type="button" className="fm-btn" disabled={!answer} onClick={next}>{t(index + 1 < total ? "tailor.question.next" : "tailor.question.finish")}</button>
    </div>
    {scoped && <p className="fm-fine">{t("tailor.question.scope")}</p>}
  </section>;
}
