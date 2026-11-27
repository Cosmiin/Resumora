import { useState } from "react";
import type { Answer, Locale, TailorQuestion } from "@resumora/shared";
import { useT } from "../i18n/t.ts";
import { roleMeta, type Role } from "./role.ts";

type Use = NonNullable<Answer["use"]>;
type Pick = { use: Use | null; roleIds: string[] };

type Props = {
  /** One per thing the job asks for and the CV doesn't show, the most useful first. */
  questions: TailorQuestion[];
  /** The person's roles, in CV order. */
  roles: Role[];
  locale: Locale;
  /** The answers given before, when the screen is opened again. */
  answers?: Answer[];
  /** While the answers are being sent. */
  busy: boolean;
  /** One answer per question; a row left untouched is a skip. */
  onSubmit(answers: Answer[]): void;
  /** Leaves without sending anything: only when the screen was opened to change earlier answers. */
  onCancel?(): void;
};

/** Rows shown at once, and roles shown in a row, before "more". */
const ROWS = 6;
const ROLES = 3;

/**
 * Every question of a tailoring on one screen: one row per gap, answered by ticking the roles where it is true, or
 * with one tap for "no". A role the CV hints at comes first and says so, but nothing is ticked
 * for the person: a tick is their own statement, and it is what gets written.
 */
export function GapQuestions({ questions, roles, locale, answers = [], busy, onSubmit, onCancel }: Props) {
  const t = useT();
  const given = new Map(answers.map((answer) => [answer.questionId, answer]));
  const [picks, setPicks] = useState<Record<string, Pick>>(() => Object.fromEntries(questions.map((question) => {
    const answer = given.get(question.id);
    // An answer from when the screen had "No, but I used something similar" is a no: that answer wrote nothing either.
    const stored = answer?.via === "skip" ? null : answer?.use ?? null;
    const use = stored === "similar" ? "none" : stored;
    return [question.id, { use, roleIds: use === "used" ? answer?.roleIds ?? [] : [] }];
  })));
  const [allRows, setAllRows] = useState(false);
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const pick = (id: string) => picks[id] ?? { use: null, roleIds: [] };
  const set = (id: string, next: Pick) => setPicks((all) => ({ ...all, [id]: next }));

  const toggle = (id: string, roleId: string) => {
    const now = pick(id);
    const roleIds = now.use === "used" && now.roleIds.includes(roleId) ? now.roleIds.filter((x) => x !== roleId) : [...(now.use === "used" ? now.roleIds : []), roleId];
    set(id, { use: roleIds.length > 0 ? "used" : null, roleIds });
  };
  const sayNo = (id: string) => set(id, { use: pick(id).use === "none" ? null : "none", roleIds: [] });
  const submit = () => onSubmit(questions.map((question): Answer => {
    const { use, roleIds } = pick(question.id);
    if (use === "used") return { questionId: question.id, value: "Yes", via: "option", use, roleIds: roles.map((r) => r.id).filter((id) => roleIds.includes(id)) };
    return use ? { questionId: question.id, value: "No", via: "option", use } : { questionId: question.id, value: null, via: "skip" };
  }));

  const shown = allRows ? questions : questions.slice(0, ROWS);
  return <section className="tailor-gaps ui-stack">
    <h1 className="ui-title">{t(questions.length === 1 ? "tailor.gaps.titleOne" : "tailor.gaps.titleMany", { n: questions.length })}</h1>
    <p className="ui-lead">{t("tailor.gaps.lead")}</p>
    {onCancel && <p className="ui-notice" role="note">{t("tailor.gaps.again")}</p>}
    {shown.map((question) => {
      const { use, roleIds } = pick(question.id);
      const suggested = question.suggestedRoleIds ?? [];
      // The roles the CV hints at first, then CV order. A row opens with a few; a ticked one is always in sight.
      const ordered = [...roles.filter((r) => suggested.includes(r.id)), ...roles.filter((r) => !suggested.includes(r.id))];
      const open = allRoles.includes(question.id);
      const first = ordered.filter((r, i) => i < Math.max(ROLES, suggested.length) || (use === "used" && roleIds.includes(r.id)));
      const visible = open ? ordered : first;
      const more = ordered.length - visible.length;
      const heading = `gap-${question.id}`;
      return <div key={question.id} role="group" aria-labelledby={heading} className="ui-sheet tailor-gaprow">
        <h2 className="ui-heading" id={heading}>{question.text}</h2>
        {question.hint && suggested.length > 0 && <p className="ui-small ui-muted">{t("tailor.gaps.hint", { hint: question.hint })}</p>}
        <div className="answer-opts">
          {visible.map((r) => <button key={r.id} type="button" className="answer-opt" aria-pressed={use === "used" && roleIds.includes(r.id)} onClick={() => toggle(question.id, r.id)}>
            {[r.title.trim() || t("tailor.role.untitled"), roleMeta(r, locale)].filter(Boolean).join(" · ")}
            {suggested.includes(r.id) && <span className="tailor-gap-hinted"> · {t("tailor.gaps.hinted")}</span>}
          </button>)}
          {more > 0 && <button type="button" className="answer-opt is-other" onClick={() => setAllRoles((ids) => [...ids, question.id])}>
            {t(more === 1 ? "tailor.gaps.moreRolesOne" : "tailor.gaps.moreRoles", { n: more })}</button>}
        </div>
        <div className="answer-opts">
          <button type="button" className="answer-opt" aria-pressed={use === "none"} onClick={() => sayNo(question.id)}>{t("tailor.gaps.none")}</button>
        </div>
      </div>;
    })}
    {!allRows && questions.length > ROWS && <p><button type="button" className="ui-btn ui-btn--quiet" onClick={() => setAllRows(true)}>
      {t("tailor.gaps.showMore", { n: questions.length - ROWS })}</button></p>}
    <p className="tailor-gaps-go">
      {onCancel && <button type="button" className="ui-btn ui-btn--quiet" disabled={busy} onClick={onCancel}>{t("tailor.gaps.cancel")}</button>}
      <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={submit}>{t("tailor.gaps.go")}</button>
    </p>
  </section>;
}
