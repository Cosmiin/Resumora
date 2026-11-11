import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_LONG_TEXT, MAX_TEXT, findScored, isAllowedOption, type CvContent, type Locale, type Question, type RoleResult } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { SCORED_LIST } from "../edit/lists.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { formatRange } from "../page/blocks.ts";
import { AnswerBox, type Via } from "./AnswerBox.tsx";
import { BrainDumpStep } from "./BrainDumpStep.tsx";
import { FocusBar } from "./FocusBar.tsx";
import type { FocusTarget } from "./focus-context.ts";
import { useFocusFrame } from "./FocusMode.tsx";
import { BackButton } from "./QuestionStep.tsx";
import { ScoreExplain, canExplain } from "./ScoreExplain.tsx";
import { issueTip } from "./tips.ts";
import type { RunItem } from "./run.ts";
import { useRoleRun, type Change } from "./useRoleRun.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  target: FocusTarget;
  cv: CvContent;
  dispatch(a: CvAction): void;
  scores: ReadonlyMap<string, RoleScoreState>;
  waitForSave(): Promise<void>;
  onClose(): void;
  /** In the guided path: where this role sits in it ("Role 1 of 2"). */
  context?: string;
  /** In the guided path, the last screen moves on ("Next role") instead of going back to the CV. */
  next?: { label: string; onNext(): void };
  /** What the person wants their CV to bring out: the role's questions are asked with it in view. */
  focus?: string;
  /** A score the run asked for itself, so the editor shows the same number. */
  onScore?(result: RoleResult): void;
};

/**
 * Flow B for one role: how much is coming, one question per screen, a working screen, the whole role to approve
 * once, and the score before and after. One column on every screen size; no score is shown between the first
 * screen and the last.
 */
export function RoleRun({ target, cv, dispatch, scores, waitForSave, onClose, context, next, focus, onScore }: Props) {
  const run = useRoleRun({ cv, roleId: target.roleId, scores, dispatch, waitForSave, onClose, focus, onScore });
  const { step, items, busy } = run;
  const root = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const [explain, setExplain] = useState(false);
  // "Tell us about…" keeps its text here, so Back shows it again.
  const [dump, setDump] = useState<{ value: string; via: Via[] } | null>(null);

  // Esc closes the score's explanation first, then the run.
  useFocusFrame(root, () => (explain ? setExplain(false) : run.close()));

  const stepKey = `${step.kind}:${step.kind === "question" ? items[step.index]?.key ?? "" : ""}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = pane.current;
      if (!el || el.contains(document.activeElement)) return;
      (el.querySelector<HTMLElement>("textarea:not(:disabled)") ?? el.querySelector<HTMLElement>("#fm-step-title") ?? el.querySelector<HTMLElement>(".fm-btn:not(:disabled)"))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [stepKey]);

  const found = findScored(cv, target.roleId);
  if (!found) return null;
  const { item: role, kind } = found;
  const name = roleName(role, SCORED_LIST[kind]);
  const meta = [role.company.trim(), formatRange(role.startDate, role.endDate, role.current, cv.locale)].filter(Boolean).join(" · ");
  const leaveRole = () => run.close(next?.onNext);
  const explainable = canExplain(run.result);
  const link = explainable && (
    <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm rr-link" onClick={() => setExplain(true)}>{t("enrich.explain.open")}</button>
  );
  const shown = step.kind === "question" ? items[step.index] : undefined;
  const framed = step.kind !== "start" && step.kind !== "done";

  return createPortal(
    <div ref={root} className="ui-page focus-mode role-run" role="dialog" aria-modal="true" aria-label={t("enrich.focus.dialog", { role: name })}>
      <FocusBar context={framed ? context : undefined} name={framed ? name : undefined} onClose={() => run.close()} />
      <div className="rr-col" ref={pane} aria-busy={busy}>
        {step.kind === "start" && (
          <div className="rr-card">
            {context && <p className="rr-where">{context}</p>}
            <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{name}</h2>
            {meta && <p>{meta}</p>}
            <p className="rr-lead" role="status">{run.ready ? countLine(items.length) : t("enrich.focus.loading")}</p>
            <div className="rr-actions">
              <button type="button" className="fm-btn" disabled={!run.ready} onClick={run.start}>{t("enrich.run.start")}</button>
              {next && <button type="button" className="ui-btn" onClick={leaveRole}>{t(kind === "role" ? "enrich.run.skipRole" : "enrich.run.skipItem")}</button>}
            </div>
            {(run.before !== null || link) && (
              <p className="rr-scoreline">
                {run.before !== null && <span>{t("enrich.run.scoreNow")} <b>{run.before}</b></span>}
                {link}
              </p>
            )}
          </div>
        )}

        {step.kind === "question" && shown && (
          <>
            <div className="rr-prog">
              <p className="fm-eyebrow">
                {t("enrich.focus.questionOf", { n: step.index + 1, total: items.length })} · {t(shown.kind === "line" ? "enrich.run.aboutLine" : "enrich.run.aboutRole")}
              </p>
              <div className="fm-steps" aria-hidden="true">
                {items.map((item, i) => <i key={item.key} className={i < step.index ? "is-done" : i === step.index ? "is-on" : undefined} />)}
              </div>
            </div>
            {shown.kind === "box" ? (
              <BrainDumpStep roleId={role.id} title={role.title} company={role.company} value={dump?.value ?? run.prefill} via={dump?.via ?? []}
                onChange={(value, via) => setDump({ value, via })} locale={cv.locale} working={false} empty={false} busy={busy} boxFirst
                onSubmit={run.answer} onSkip={run.skip} />
            ) : (
              <RunQuestion key={stepKey} item={shown} line={shown.kind === "line" ? role.bullets.find((b) => b.id === shown.question.bulletId)?.text : undefined}
                why={whyOf(shown, run.result)} initial={run.prefill} locale={cv.locale} busy={busy}
                onSubmit={run.answer} onSkip={run.skip} onBack={run.canBack ? run.back : undefined} />
            )}
          </>
        )}

        {step.kind === "thinking" && <Working text={t("enrich.focus.box.scoring")} />}
        {step.kind === "working" && <Working text={t("enrich.run.working")} />}

        {step.kind === "approve" && (
          <Approve name={name} meta={meta} description={role.description} bullets={role.bullets} changes={step.changes} locale={cv.locale} busy={busy} onApply={run.apply} />
        )}

        {step.kind === "failed" && (
          <>
            <p className="ui-notice ui-notice--bad" role="alert" id="fm-step-title" tabIndex={-1}>{t("enrich.run.failed")}</p>
            <div className="fm-foot">
              <button type="button" className="fm-ghost" onClick={run.giveUp} disabled={busy}>{t("enrich.focus.skip")}</button>
              <button type="button" className="fm-btn" onClick={run.retry} disabled={busy}>{t("enrich.focus.tryAgain")}</button>
            </div>
          </>
        )}

        {step.kind === "done" && (
          <div className="rr-card">
            <p className="rr-where">{name}</p>
            <Numbers before={run.before} after={run.after} waiting={run.waiting} />
            <p className={run.before !== null && run.after !== null && run.after !== run.before ? "fm-why rr-line is-after-count" : "fm-why rr-line"}>{doneLine(kind === "role", run.applied, run.answered, run.waiting, run.result)}</p>
            <div className="rr-actions">
              <button type="button" className="fm-btn" onClick={leaveRole}>{next ? next.label : t("enrich.focus.done.back")}</button>
              {next && <button type="button" className="ui-btn" onClick={() => run.close()}>{t("enrich.run.done.finish")}</button>}
              {run.more > 0 && <button type="button" className="ui-btn" onClick={run.moreQuestions}>{t("enrich.run.done.more")}</button>}
            </div>
            {link && <p>{link}</p>}
          </div>
        )}
      </div>
      {explainable && run.result && <ScoreExplain open={explain} onClose={() => setExplain(false)} name={name} role={role} result={run.result} />}
    </div>,
    document.body,
  );
}

/** "6 short questions, about 3 minutes. Then I show you what they changed." Half a minute a question. */
function countLine(n: number): string {
  if (n === 0) return t("enrich.run.count.none");
  if (n === 1) return t("enrich.run.count.one");
  return t(n === 2 ? "enrich.run.count.two" : "enrich.run.count.many", { n, minutes: Math.ceil(n / 2) });
}

/** "Why I ask": what the line is missing (from its score), or why the topic matters for the whole role. */
function whyOf(item: RunItem, result: RoleResult | undefined): string | null {
  if (item.kind === "box") return null;
  if (item.kind === "role") return t(`enrich.focus.whyTopic.${item.question.topic}`);
  const grade = result?.bullets.find((b) => b.id === item.question.bulletId);
  return !item.followUp && grade?.tip?.trim() ? issueTip(grade.issue, grade.tip) : t(`enrich.focus.whyKind.${item.question.kind}`);
}

/** The one sentence on the last screen: what the role says now, or that nothing on the page changed. */
function doneLine(isRole: boolean, applied: number, answered: number, waiting: boolean, result: RoleResult | undefined): string {
  if (waiting) return t("enrich.focus.scoring");
  if (applied === 0) return t(answered > 0 ? "enrich.run.done.saved" : "enrich.run.done.nothing");
  const marks = result?.coverage?.marks;
  const says = marks ? (["company", "actions", "results"] as const).filter((p) => marks[p] === "shown").map((p) => t(`enrich.run.done.says.${p}`)) : [];
  if (!result) return t("enrich.run.done.later");
  if (says.length === 0) return t("enrich.run.done.changed");
  const list = says.length === 1 ? says[0]! : `${says.slice(0, -1).join(", ")} ${t("enrich.run.done.and")} ${says[says.length - 1]}`;
  return t(isRole ? "enrich.run.done.now" : "enrich.run.done.nowItem", { list });
}

/** "69 → 88": the role's score before and after. One number when it did not move or the new one is not known. */
const COUNT_MS = 900;
/** No count-up for people who asked for less motion, or where the screen cannot say (tests). */
const stillMotion = () => typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The new score counting up from the old one, once (owner review, point 7). */
function useCountUp(from: number, to: number): number {
  const still = useRef(stillMotion()).current;
  const [shown, setShown] = useState(still ? to : from);
  useEffect(() => {
    if (still) return;
    let frame = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const p = Math.min(1, (now - t0) / COUNT_MS);
      setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [still, from, to]);
  return shown;
}

/** "69 → 88", the second number climbing, with a bar that fills along with it. */
function Moved({ before, after }: { before: number; after: number }) {
  const shown = useCountUp(before, after);
  return (
    <>
      <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>
        <span className="visually-hidden">{t("enrich.run.done.fromTo", { from: before, to: after })}</span>
        <span aria-hidden="true">{before} → {shown}</span>
      </h2>
      <div className="rr-bar" aria-hidden="true"><i style={{ width: `${shown}%` }} /></div>
    </>
  );
}

function Numbers({ before, after, waiting }: { before: number | null; after: number | null; waiting: boolean }) {
  const one = after ?? before;
  if (before !== null && after !== null && after !== before) return <Moved before={before} after={after} />;
  return (
    <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>
      <span className="visually-hidden">{one === null ? t("enrich.focus.noScore") : t("enrich.focus.bulletScore", { n: one })}</span>
      <span aria-hidden="true">{one ?? "–"}{waiting && before !== null ? " → …" : ""}</span>
    </h2>
  );
}

function Working({ text }: { text: string }) {
  return (
    <div className="fm-working" role="status">
      <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
      <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{text}</h2>
    </div>
  );
}

/** One question of the run: the line it is about (when it is about one), the likely answers, your own words, the reason. */
function RunQuestion({ item, line, why, initial, locale, busy, onSubmit, onSkip, onBack }: {
  item: Exclude<RunItem, { kind: "box" }>; line?: string; why: string | null; initial: string; locale: Locale; busy: boolean;
  onSubmit(text: string, via: Via[]): void; onSkip(): void; onBack?(): void;
}) {
  const [value, setValue] = useState(initial);
  const [via, setVia] = useState<Via[]>([]);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const options = item.question.options.filter((o) => o.length <= 60 && isAllowedOption(o)).slice(0, 4);
  const asked: Question = {
    bulletId: item.kind === "line" ? item.question.bulletId : item.question.id, text: item.question.text,
    kind: item.kind === "line" ? item.question.kind : "detail", options: options.length >= 2 ? options : [],
  };
  return (
    <>
      {line && <p className="rr-aboutline"><span className="visually-hidden">{t("enrich.run.lineLabel")} </span>“{line}”</p>}
      {item.kind === "line" && item.followUp && <p className="fm-note">{t("enrich.focus.needsDetail")}</p>}
      <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{asked.text}</h2>
      <AnswerBox question={asked} value={value} via={via} locale={locale} onBusyChange={setVoiceBusy}
        onChange={(v, how) => {
          setValue(v);
          setVia(how);
        }} />
      {why && <p className="fm-why">{t("enrich.focus.why", { reason: why })}</p>}
      <div className="fm-foot">
        <BackButton onBack={onBack} busy={busy} />
        <button type="button" className="fm-ghost" onClick={onSkip} disabled={busy}>{t("enrich.focus.skip")}</button>
        <button type="button" className="fm-btn" disabled={busy || voiceBusy || value.trim() === ""} onClick={() => onSubmit(value, via)}>{t("enrich.focus.improve")}</button>
      </div>
    </>
  );
}

type Pick = { use: boolean; text: string };

/**
 * Approve once: the role as it will read, every changed piece highlighted and used unless the person says otherwise.
 * "Keep mine" leaves one piece as it was, "Edit" changes its wording; "Looks good" applies the rest.
 */
function Approve({ name, meta, description, bullets, changes, locale, busy, onApply }: {
  name: string; meta: string; description: string; bullets: readonly { id: string; text: string }[]; changes: Change[]; locale: Locale; busy: boolean;
  onApply(decisions: { id: string; text: string }[]): void;
}) {
  const [picks, setPicks] = useState<Record<string, Pick>>(() => Object.fromEntries(changes.map((c) => [c.id, { use: true, text: c.after }])));
  const [was, setWas] = useState(false);
  const set = (id: string, pick: Pick) => setPicks((p) => ({ ...p, [id]: pick }));
  const piece = (change: Change) => (
    <Piece change={change} pick={picks[change.id] ?? { use: true, text: change.after }} was={was} locale={locale} busy={busy} onPick={(pick) => set(change.id, pick)} />
  );
  const describing = changes.find((c) => c.kind === "description");
  const byBullet = new Map(changes.flatMap((c) => (c.kind === "bullet" ? [[c.bulletId, c] as const] : [])));
  const added = changes.filter((c) => c.kind === "new");
  const anyBefore = changes.some((c) => c.before.trim() !== "");
  return (
    <>
      <p className="fm-eyebrow">{t("enrich.run.approve.eyebrow")}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.run.approve.title")}</h2>
      <p className="rr-lead">{t("enrich.run.approve.line")}</p>
      <div className="rr-sheet" lang={locale}>
        <p className="rr-sheet-title">{name}</p>
        {meta && <p className="rr-sheet-meta">{meta}</p>}
        {describing ? <div className="rr-piece">{piece(describing)}</div> : description.trim() !== "" && <p>{description}</p>}
        <ul>
          {bullets.filter((b) => b.text.trim() !== "").map((b) => {
            const change = byBullet.get(b.id);
            return <li key={b.id}>{change ? piece(change) : b.text}</li>;
          })}
          {added.map((change) => <li key={change.id}>{piece(change)}</li>)}
        </ul>
      </div>
      <div className="rr-actions">
        <button type="button" className="fm-btn" disabled={busy}
          onClick={() => onApply(changes.flatMap((c) => (picks[c.id]?.use ? [{ id: c.id, text: picks[c.id]!.text }] : [])))}>
          {t("enrich.run.approve.apply")}
        </button>
        {anyBefore && (
          <button type="button" className="ui-btn ui-btn--quiet ui-btn--sm rr-link" onClick={() => setWas((v) => !v)}>
            {t(was ? "enrich.run.approve.hideWas" : "enrich.run.approve.was")}
          </button>
        )}
      </div>
    </>
  );
}

/** One changed piece on the approval sheet. */
function Piece({ change, pick, was, locale, busy, onPick }: { change: Change; pick: Pick; was: boolean; locale: Locale; busy: boolean; onPick(pick: Pick): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const fresh = change.kind === "new";
  if (draft !== null) {
    return (
      <span className="rr-edit">
        <textarea lang={locale} aria-label={t("enrich.run.approve.editLabel")} value={draft} rows={change.kind === "description" ? 5 : 3}
          maxLength={change.kind === "description" ? MAX_LONG_TEXT : MAX_TEXT} onChange={(e) => setDraft(e.target.value)} />
        <span className="rr-chips">
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={draft.trim() === ""} onClick={() => {
            onPick({ use: true, text: draft.trim() });
            setDraft(null);
          }}>{t("enrich.focus.describe.save")}</button>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setDraft(null)}>{t("enrich.run.approve.cancel")}</button>
        </span>
      </span>
    );
  }
  return (
    <>
      {pick.use ? <span className="rr-new">{pick.text}</span> : <span className={fresh || change.before.trim() === "" ? "rr-out" : undefined}>{change.before.trim() || pick.text}</span>}
      {" "}
      <span className="rr-chips">
        <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => onPick({ ...pick, use: !pick.use })}>
          {t(pick.use ? (fresh ? "enrich.run.approve.leaveOut" : "enrich.focus.proposal.keep") : fresh ? "enrich.run.approve.add" : "enrich.run.approve.useNew")}
        </button>
        {pick.use && <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => setDraft(pick.text)}>{t("enrich.focus.describe.edit")}</button>}
      </span>
      {was && pick.use && change.before.trim() !== "" && (
        <span className="rr-was"><span className="visually-hidden">{t("enrich.focus.proposal.was")}: </span><s>{change.before}</s></span>
      )}
    </>
  );
}
