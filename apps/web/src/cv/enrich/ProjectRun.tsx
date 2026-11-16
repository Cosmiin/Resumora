import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_TEXT, PROJECT_DESCRIPTION_MAX, type CvContent, type Locale, type ProjectQuestion, type ProjectWriteAnswer } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { formatRange } from "../page/blocks.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";
import { FocusBar } from "./FocusBar.tsx";
import type { FocusTarget } from "./focus-context.ts";
import { TITLE_FIRST, focusStep } from "./focus-step.ts";
import { useFocusFrame } from "./FocusMode.tsx";
import { BackButton } from "./QuestionStep.tsx";
import { useProjectRun, type ProjectDecision } from "./useProjectRun.ts";

type Props = {
  target: FocusTarget;
  cv: CvContent;
  dispatch(a: CvAction): void;
  waitForSave(): Promise<void>;
  onClose(): void;
  /** In the guided path: where this project sits in it ("Project 1 of 2"). */
  context?: string;
  /** In the guided path, the last screen moves on instead of going back to the CV. */
  next?: { label: string; onNext(): void };
};

/** A whole project to describe (not one of its bullets) gets the project run, not the role run. */
export function isProjectTarget(cv: Pick<CvContent, "projects">, target: FocusTarget): boolean {
  return !target.bulletId && target.mode === "improve" && cv.projects.some((p) => p.id === target.roleId);
}

/**
 * One project's short flow: how much is coming, up to 6 questions (one per screen, options to tick), the writer,
 * then one approval of a sentence, at most two bullets and the tools for Skills, each kept or edited right there.
 */
export function ProjectRun({ target, cv, dispatch, waitForSave, onClose, context, next }: Props) {
  const run = useProjectRun({ cv, projectId: target.roleId, dispatch, waitForSave, onClose });
  const { step, questions, busy } = run;
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  useFocusFrame(root, () => run.close());

  const stepKey = `${step.kind}:${step.kind === "question" ? step.index : ""}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = pane.current;
      if (!el || el.contains(document.activeElement)) return;
      focusStep(el, TITLE_FIRST);
    });
    return () => cancelAnimationFrame(frame);
  }, [stepKey]);

  const project = cv.projects.find((p) => p.id === target.roleId);
  if (!project) return null;
  const name = roleName(project, "projects");
  const meta = [project.company.trim(), formatRange(project.startDate, project.endDate, project.current, cv.locale)].filter(Boolean).join(" · ");
  const leave = () => run.close(next?.onNext);
  const framed = step.kind !== "start" && step.kind !== "done";
  const shown = step.kind === "question" ? questions[step.index] : undefined;

  return createPortal(
    <div ref={root} className="ui-page focus-mode role-run" role="dialog" aria-modal="true" aria-label={t("enrich.project.dialog", { name })}>
      <FocusBar context={framed ? context : undefined} name={framed ? name : undefined} company={project.company} onClose={() => run.close()} />
      <div className="rr-col" ref={pane} aria-busy={busy}>
        {step.kind === "start" && (
          <div className="rr-card">
            {context && <p className="rr-where">{context}</p>}
            <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{name}</h2>
            {meta && <p>{meta}</p>}
            {run.loadFailed ? (
              <p className="ui-notice ui-notice--bad" role="alert">{t("enrich.project.loadFailed")}</p>
            ) : (
              <p className="rr-lead" role="status">{run.ready ? t(questions.length ? "enrich.project.count" : "enrich.project.countNone") : t("enrich.focus.loading")}</p>
            )}
            <div className="rr-actions">
              {run.loadFailed
                ? <button type="button" className="fm-btn" onClick={run.reload}>{t("enrich.focus.tryAgain")}</button>
                : <button type="button" className="fm-btn" disabled={!run.ready} onClick={run.start}>{t("enrich.run.start")}</button>}
              {next && <button type="button" className="ui-btn" onClick={leave}>{t("enrich.run.skipItem")}</button>}
            </div>
          </div>
        )}

        {step.kind === "question" && shown && (
          <>
            <div className="rr-prog">
              <p className="fm-eyebrow">{t("enrich.focus.questionOf", { n: step.index + 1, total: questions.length })}</p>
              <div className="fm-steps" aria-hidden="true">
                {questions.map((q, i) => <i key={q.id} className={i < step.index ? "is-done" : i === step.index ? "is-on" : undefined} />)}
              </div>
            </div>
            <ProjectQuestionStep key={shown.id} question={shown} initial={run.answers[shown.id]} locale={cv.locale} busy={busy}
              onSubmit={run.answer} onSkip={run.skip} onBack={run.canBack ? run.back : undefined} />
          </>
        )}

        {step.kind === "working" && (
          <div className="fm-working" role="status">
            <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
            <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.project.working")}</h2>
          </div>
        )}

        {step.kind === "approve" && (
          <Approve name={name} meta={meta} answer={step.answer} locale={cv.locale} busy={busy} onApply={run.apply} />
        )}

        {step.kind === "empty" && (
          <div className="rr-card">
            <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.project.empty")}</h2>
            <div className="rr-actions">
              <button type="button" className="fm-btn" onClick={next ? leave : () => run.close()}>{next ? next.label : t("enrich.project.close")}</button>
            </div>
          </div>
        )}

        {step.kind === "failed" && (
          <>
            <p className="ui-notice ui-notice--bad" role="alert" id="fm-step-title" tabIndex={-1}>{t("enrich.project.failed")}</p>
            <div className="fm-foot">
              <button type="button" className="fm-ghost" onClick={() => run.close()} disabled={busy}>{t("enrich.project.close")}</button>
              <button type="button" className="fm-btn" onClick={run.retry} disabled={busy}>{t("enrich.focus.tryAgain")}</button>
            </div>
          </>
        )}

        {step.kind === "done" && (
          <div className="rr-card">
            <p className="rr-where">{name}</p>
            <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.project.done")}</h2>
            <div className="rr-actions">
              <button type="button" className="fm-btn" onClick={leave}>{next ? next.label : t("enrich.focus.done.back")}</button>
              {next && <button type="button" className="ui-btn" onClick={() => run.close()}>{t("enrich.run.done.finish")}</button>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One project question: options to tick, your own words or voice, and Back / Skip / Next. */
function ProjectQuestionStep({ question, initial, locale, busy, onSubmit, onSkip, onBack }: {
  question: ProjectQuestion; initial?: { text: string; via: Via[] }; locale: Locale; busy: boolean;
  onSubmit(text: string, via: Via[]): void; onSkip(): void; onBack?(): void;
}) {
  const [value, setValue] = useState(initial?.text ?? "");
  const [via, setVia] = useState<Via[]>(initial?.via ?? []);
  const [voiceBusy, setVoiceBusy] = useState(false);
  return (
    <>
      <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{question.text}</h2>
      <AnswerBox question={{ bulletId: question.id, text: question.text, kind: "detail", options: question.options }} value={value} via={via} locale={locale}
        onBusyChange={setVoiceBusy}
        onChange={(v, how) => {
          setValue(v);
          setVia(how);
        }} />
      <div className="fm-foot">
        <BackButton onBack={onBack} busy={busy} />
        <button type="button" className="fm-ghost" onClick={onSkip} disabled={busy}>{t("enrich.focus.skip")}</button>
        <button type="button" className="fm-btn" disabled={busy || voiceBusy || value.trim() === ""} onClick={() => onSubmit(value, via)}>{t("enrich.project.next")}</button>
      </div>
    </>
  );
}

type Piece = { key: string; kind: "description" | "bullet"; use: boolean; text: string };

/** The project as it will read: each new piece kept or left out, or edited right there; the tools for Skills as chips. */
function Approve({ name, meta, answer, locale, busy, onApply }: {
  name: string; meta: string; answer: ProjectWriteAnswer; locale: Locale; busy: boolean; onApply(d: ProjectDecision): void;
}) {
  const [pieces, setPieces] = useState<Piece[]>(() => [
    ...(answer.description.trim() ? [{ key: "d", kind: "description" as const, use: true, text: answer.description }] : []),
    ...answer.bullets.map((text, i) => ({ key: `b${i}`, kind: "bullet" as const, use: true, text })),
  ]);
  const [tools, setTools] = useState(() => answer.extraTools.map((name) => ({ name, use: true })));
  const set = (key: string, change: Partial<Piece>) => setPieces((all) => all.map((p) => (p.key === key ? { ...p, ...change } : p)));
  const description = pieces.find((p) => p.kind === "description");
  const bullets = pieces.filter((p) => p.kind === "bullet");
  return (
    <>
      <p className="fm-eyebrow">{t("enrich.project.approve.eyebrow")}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{name}</h2>
      <p className="rr-lead">{t("enrich.project.approve.line")}</p>
      <div className="rr-sheet" lang={locale}>
        <p className="rr-sheet-title">{name}</p>
        {meta && <p className="rr-sheet-meta">{meta}</p>}
        {description && <div className="rr-piece"><PieceView piece={description} locale={locale} busy={busy} onChange={(c) => set(description.key, c)} /></div>}
        {bullets.length > 0 && (
          <ul>
            {bullets.map((b) => <li key={b.key}><PieceView piece={b} locale={locale} busy={busy} onChange={(c) => set(b.key, c)} /></li>)}
          </ul>
        )}
      </div>
      {tools.length > 0 && (
        <div className="rr-tools">
          <p className="fm-eyebrow">{t("enrich.project.skills")}</p>
          <span className="rr-chips">
            {tools.map((tool) => (
              <button key={tool.name} type="button" className={tool.use ? "ui-btn ui-btn--sm" : "ui-btn ui-btn--sm rr-out"} aria-pressed={tool.use} disabled={busy}
                aria-label={t(tool.use ? "enrich.project.removeTool" : "enrich.project.addTool", { name: tool.name })}
                onClick={() => setTools((all) => all.map((x) => (x.name === tool.name ? { ...x, use: !x.use } : x)))}>
                {tool.name}{tool.use ? " ×" : ""}
              </button>
            ))}
          </span>
        </div>
      )}
      <div className="rr-actions">
        <button type="button" className="fm-btn" disabled={busy} onClick={() => onApply({
          description: description?.use ? description.text : null,
          bullets: bullets.filter((b) => b.use).map((b) => b.text),
          tools: tools.filter((x) => x.use).map((x) => x.name),
        })}>
          {t("enrich.project.apply")}
        </button>
      </div>
    </>
  );
}

/** One new piece: its text, Keep (pressed while it is used) and Edit, or the edit box. */
function PieceView({ piece, locale, busy, onChange }: { piece: Piece; locale: Locale; busy: boolean; onChange(c: Partial<Piece>): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    return (
      <span className="rr-edit">
        <textarea lang={locale} aria-label={t("enrich.project.editLabel")} value={draft} rows={3}
          maxLength={piece.kind === "description" ? PROJECT_DESCRIPTION_MAX : MAX_TEXT} onChange={(e) => setDraft(e.target.value)} />
        <span className="rr-chips">
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={draft.trim() === ""} onClick={() => {
            onChange({ use: true, text: draft.trim() });
            setDraft(null);
          }}>{t("enrich.project.save")}</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setDraft(null)}>{t("enrich.project.cancel")}</button>
        </span>
      </span>
    );
  }
  return (
    <>
      <span className={piece.use ? "rr-new" : "rr-out"}>{piece.text}</span>
      {" "}
      <span className="rr-chips">
        <button type="button" className="ui-btn ui-btn--sm" aria-pressed={piece.use} disabled={busy} onClick={() => onChange({ use: !piece.use })}>{t("enrich.project.keep")}</button>
        {piece.use && <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => setDraft(piece.text)}>{t("enrich.project.edit")}</button>}
      </span>
    </>
  );
}
