import { useState } from "react";
import type { Answer, Locale, TailorQuestion } from "@resumora/shared";
import { AnswerBox, type Via } from "../cv/enrich/AnswerBox.tsx";
import { t } from "../i18n/t.ts";
import { answerVia, VIA } from "./QuestionCard.tsx";
import { roleMeta, type Role } from "./RolePanel.tsx";

export const roleName = (role: Role, locale: Locale) => [role.title.trim() || t("tailor.role.untitled"), roleMeta(role, locale)].filter(Boolean).join(" · ");

/** Going back (BackA) in Experience: the roles already tailored, each one opens its answers. */
export function FinishedRoles({ roles, locale, onPick, onClose }: { roles: Role[]; locale: Locale; onPick(roleId: string): void; onClose(): void }) {
  return <section className="tailor-card">
    <h2 id="finished-roles">{t("tailor.back.roles")}</h2>
    <ul className="tailor-back-list" aria-labelledby="finished-roles">
      {roles.map((role) => <li key={role.id}>
        <button type="button" className="tailor-pill" onClick={() => onPick(role.id)}>{roleName(role, locale)}</button>
      </li>)}
    </ul>
    <div className="fm-foot"><button type="button" className="fm-ghost" onClick={onClose}>{t("tailor.back.resume")}</button></div>
  </section>;
}

type Props = {
  /** The role, or the step's name for a finished step outside Experience. */
  title: string;
  questions: TailorQuestion[];
  answers: Answer[];
  busy: boolean;
  locale: Locale;
  /** A role: every question's answer, an emptied one as a skip. Absent: the answers are only shown. */
  onUpdate?(answers: Answer[]): void;
  onClose(): void;
};


/** A finished role's answers, each editable in place, and Update this role (another finished step: read only). */
export function YourAnswers({ title, questions, answers, busy, locale, onUpdate, onClose }: Props) {
  const [drafts, setDrafts] = useState(() => questions.map((question) => {
    const given = answers.find((answer) => answer.questionId === question.id);
    return { value: given?.value ?? "", via: given ? VIA[given.via] : [] as Via[], roleIds: given?.roleIds };
  }));
  const update = () => onUpdate?.(questions.map((question, i): Answer => {
    const { value, via, roleIds } = drafts[i]!;
    return value.trim()
      ? { questionId: question.id, value: value.trim(), via: answerVia(via), ...(roleIds ? { roleIds } : {}) }
      : { questionId: question.id, value: null, via: "skip" };
  }));

  return <section className="tailor-card" aria-labelledby="your-answers">
    <p className="tailor-eyebrow">{title}</p>
    <h2 id="your-answers">{t("tailor.back.answers")}</h2>
    {questions.length === 0 && <p>{t("tailor.back.none")}</p>}
    {questions.map((question, i) => <div key={question.id} className="tailor-back-answer">
      <p className="tailor-steer-q">{question.text}</p>
      {onUpdate
        ? <AnswerBox question={{ bulletId: question.bulletId ?? question.id, text: question.text, options: question.options, kind: "detail" }}
          value={drafts[i]!.value} via={drafts[i]!.via} locale={locale} readOnly={busy}
          onChange={(value, via) => setDrafts((all) => all.map((draft, j) => (j === i ? { ...draft, value, via } : draft)))} />
        : <p>{drafts[i]!.value || t("tailor.back.skipped")}</p>}
    </div>)}
    <div className="fm-foot">
      <button type="button" className="fm-ghost" onClick={onClose}>{t("tailor.back.resume")}</button>
      {onUpdate && <button type="button" className="fm-btn" disabled={busy} onClick={update}>{t("tailor.back.update")}</button>}
    </div>
  </section>;
}
