import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { findScored, fingerprint, type CvContent } from "@resumora/shared";
import { SCORED_LIST, type LineList } from "../edit/lists.ts";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { itemLines } from "./enrich-api.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { formatRange } from "../page/blocks.ts";
import type { Via } from "./AnswerBox.tsx";
import { BrainDumpStep, DumpPickStep } from "./BrainDumpStep.tsx";
import { CelebrateMoment } from "./CelebrateMoment.tsx";
import { DescriptionStep } from "./DescriptionStep.tsx";
import type { FocusTarget } from "./focus-context.ts";
import { ProposalStep } from "./ProposalStep.tsx";
import { QuestionStep } from "./QuestionStep.tsx";
import { useFocusSession, type FocusStep } from "./useFocusSession.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  target: FocusTarget;
  cv: CvContent;
  dispatch(a: CvAction): void;
  scores: Map<string, RoleScoreState>;
  waitForSave(): Promise<void>;
  onClose(): void;
  /** The guided path's bar ("Role n of N" and its segments), across the top. */
  topBar?: ReactNode;
  /** In the guided path, "That's all for this role" moves on ("Next role →") instead of going back to the CV. */
  next?: { label: string; onNext(): void };
};

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
const DUMP_KINDS = new Set<FocusStep["kind"]>(["brainDump", "dumpWorking", "dumpEmpty", "dumpPick"]);
const SECTIONS = ["role", "bullets", "tools", "description"] as const;
const SELF_FOCUSING = new Set<FocusStep["kind"]>(["proposal", "celebrate"]);

/** The frame every focus screen shares: scroll lock (focus goes back on close), Esc closes, Tab stays inside. */
export function useFocusFrame(root: RefObject<HTMLDivElement | null>, onClose: () => void) {
  // Scroll lock while open; focus goes back where it was on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  // Esc and Tab are handled on the document, not the dialog: when the focused control disappears
  // (the mic after a denied permission, a step that changes under the cursor), focus falls to <body>
  // and a dialog-level handler would never see the key.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !root.current) return;
      // Nothing focusable in focus mode is ever hidden (and offsetParent is null for the fixed ✕ on phones), so no visibility filter.
      const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      // Focus may sit outside the list (a step heading with tabIndex -1, or <body>): wrap from there too.
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === -1 || at === items.length - 1)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [root]);
}

/** Full-screen focus mode: the role on the left, one step at a time on the right. */
export function FocusMode({ target, cv, dispatch, scores, waitForSave, onClose, topBar, next }: Props) {
  // The session always closes the same way (saving the role's facts); only where it goes next differs.
  const moving = useRef(false);
  const leave = useRef({ onClose, next });
  useEffect(() => {
    leave.current = { onClose, next };
  });
  const [finish] = useState(() => () => {
    const { onClose: close, next: then } = leave.current;
    if (moving.current && then) then.onNext();
    else close();
  });
  const session = useFocusSession({ cv, roleId: target.roleId, bulletId: target.bulletId, mode: target.mode, scores, dispatch, waitForSave, onClose: finish });
  const { step, queue, position, busy } = session;
  const root = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  // Scores we already know before the next background score arrives: accepted bullets and celebrated roles.
  const [accepted, setAccepted] = useState<ReadonlyMap<string, number>>(new Map());
  const [known, setKnown] = useState<number | null>(null);
  // The ramble lives here, not in the step, so it survives a failed call and Try again.
  const [dump, setDump] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });

  useFocusFrame(root, session.close);

  useEffect(() => {
    if (step.kind === "celebrate") setKnown(step.to);
  }, [step]);

  const stepKey = `${step.kind}:${"bulletId" in step ? step.bulletId : ""}:${"index" in step ? step.index : "asked" in step ? step.asked : ""}:${session.revisit ?? ""}`;
  // Back to the box: its earlier text comes back into it.
  const { revisit, prefill } = session;
  useEffect(() => {
    if (revisit !== null && step.kind === "brainDump") setDump({ value: prefill ?? "", via: [] });
  }, [revisit, prefill, step.kind]);
  useEffect(() => {
    if (SELF_FOCUSING.has(step.kind)) return;
    const frame = requestAnimationFrame(() => {
      const pane = right.current;
      if (!pane || pane.contains(document.activeElement)) return;
      const el = pane.querySelector<HTMLElement>("textarea:not(:disabled), .fm-btn:not(:disabled)") ?? pane.querySelector<HTMLElement>("#fm-step-title");
      el?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [stepKey, step.kind]);

  const found = findScored(cv, target.roleId);
  const role = found?.item;
  if (!role) return null;
  const kind = found!.kind;
  const name = roleName(role, SCORED_LIST[kind]);
  const entry = scores.get(role.id);
  const result = entry?.state === "ready" && entry.result?.fingerprint === fingerprint(role, cv.locale)
    ? entry.result : session.result ?? entry?.result;
  const fresh = result?.fingerprint === fingerprint(role, cv.locale);
  const roleScore = fresh ? (result?.score ?? null) : (known ?? result?.score ?? null);
  const grades = new Map(result?.bullets.map((b) => [b.id, b.score]));
  const scoreOf = (id: string) => (fresh ? grades.get(id) : (accepted.get(id) ?? grades.get(id)));
  const currentId = session.section === "bullets" && step.kind !== "celebrate"
    ? ("bulletId" in step ? step.bulletId : queue[position]) : undefined;
  // Turning role answers into bullets is a plain working screen, not the box (E1).
  const answersWorking = step.kind === "dumpWorking" && step.source === "answers";
  const dumping = (DUMP_KINDS.has(step.kind) && !answersWorking) || (step.kind === "scoring" && step.source === "dump");
  const dates = formatRange(role.startDate, role.endDate, role.current, cv.locale);

  const proposalText = step.kind === "proposal" ? role.bullets.find((b) => b.id === step.bulletId)?.text ?? "" : "";
  const inQueue = !dumping && !answersWorking && step.kind !== "roleDone" && step.kind !== "role" && step.kind !== "describing" && step.kind !== "description"
    && !(step.kind === "scoring" && (step.source === "opening" || step.source === "box")) && queue.length > 0;
  // 2B: one dot per step of the role (done / shown / to come) on steps that ask something.
  const askingStep = step.kind === "role" || step.kind === "brainDump" || step.kind === "question" || step.kind === "needsDetail"
    || step.kind === "dumpPick" || step.kind === "dumpEmpty";
  const back = session.canBack ? session.back : undefined;
  const roleQuestion = step.kind === "role" ? session.roleQuestions[step.index] : undefined;
  const sectionIndex = session.section === "done" ? SECTIONS.length : SECTIONS.indexOf(session.section);
  const bulletIndex = "bulletId" in step && step.bulletId !== null ? queue.indexOf(step.bulletId) : -1;
  const eyebrow = session.section === "role" && step.kind === "role"
    ? t("enrich.focus.section.roleEyebrow", { n: step.index + 1, total: session.roleQuestions.length })
    : session.section === "bullets"
      ? t("enrich.focus.section.bulletsEyebrow", { n: bulletIndex >= 0 ? bulletIndex + 1 : Math.min(position + 1, queue.length), total: queue.length })
      : session.section === "description" ? t("enrich.focus.section.descriptionEyebrow")
        : session.section === "done" ? null : t(`enrich.focus.section.${session.section}`);

  return createPortal(
    <div
      ref={root}
      className={topBar ? "focus-mode has-path" : "focus-mode"}
      data-section={session.section}
      role="dialog"
      aria-modal="true"
      aria-label={t("enrich.focus.dialog", { role: name })}
    >
      {topBar}
      <aside className="fm-left">
        <p className="fm-eyebrow">{t(`enrich.focus.your.${kind}`)}</p>
        <div className="page-tabs">
          {SECTIONS.map((section, i) => (
            <span key={section} aria-current={section === session.section ? "step" : undefined} className={i < sectionIndex ? "is-done" : undefined}>
              {i < sectionIndex && <span aria-hidden="true">✓ </span>}{t(`enrich.focus.section.${section}`)}
            </span>
          ))}
        </div>
        <div className="page-sheet">
          <div className={session.section === "role" || session.section === "tools" || session.section === "description" ? "fm-role-block page-bar" : "fm-role-block"}>
            <div className="fm-role-line">
              <p className="fm-role"><span>{name}</span>{role.company && <> — {role.company}</>}</p>
              <p className="fm-role-meta">{dates}</p>
            </div>
            {(role.description || step.kind === "description") && (
              <p className={step.kind === "description" ? "fm-page-description is-proposed" : "fm-page-description"}>
                {step.kind === "description" ? step.text : role.description}
              </p>
            )}
          </div>
          <ul className="fm-bullets">
            {role.bullets.map((b) => {
              const n = scoreOf(b.id);
              const cls = ["fm-bullet", b.id === currentId && "page-mark", b.id === currentId && step.kind === "working" && "is-working", accepted.has(b.id) && "fm-improved"];
              return (
                <li key={b.id} className={cls.filter(Boolean).join(" ")} aria-current={b.id === currentId ? "true" : undefined}>
                  <span>{step.kind === "proposal" && b.id === currentId
                    ? <><s className="page-del">{b.text}</s>{" "}<ins className="page-ins">{step.text}</ins></> : b.text}</span>
                  {n !== undefined && (
                    <span className={n >= 75 ? "fm-tag is-up" : "fm-tag is-low"} aria-label={t("enrich.focus.bulletScore", { n })}>
                      {n}
                    </span>
                  )}
                </li>
              );
            })}
            {dumping && step.kind !== "dumpPick" && (
              <>
                <li className="fm-slot" aria-hidden="true">{t("enrich.focus.dump.slot")}</li>
                <li className="fm-slot" aria-hidden="true">+</li>
              </>
            )}
          </ul>
        </div>
        <p className="fm-score">
          <b>{roleScore ?? "–"}</b>
          <span className="fm-eyebrow">{roleScore === null ? t("enrich.focus.noScore") : t(`enrich.focus.score.${kind}`)}</span>
        </p>
      </aside>

      <section className="fm-right" ref={right} aria-busy={busy}>
        <div className="page-note">
          {eyebrow && <p className="page-note-eyebrow">{eyebrow}</p>}
          <button type="button" className="fm-close" onClick={() => session.close()}>
            <span aria-hidden="true">✕</span> {t("enrich.focus.close")}
          </button>
          {askingStep && (
            <div className="fm-steps" aria-hidden="true">
              {Array.from({ length: session.dots.total }, (_, i) => (
                <i key={i} className={i < session.dots.done ? "is-done" : i === session.dots.done ? "is-on" : undefined} />
              ))}
            </div>
          )}
          {inQueue && !askingStep && (
            <div className="fm-steps" aria-hidden="true">
              {queue.map((id, i) => (
                <i key={id} className={i < position ? "is-done" : i === position ? "is-on" : undefined} />
              ))}
            </div>
          )}
          {step.kind === "role" && roleQuestion && (
            <QuestionStep key={stepKey} question={roleQuestion} needsDetail={false} initial={session.prefill ?? ""} onBack={back}
              locale={cv.locale} busy={busy} onSubmit={session.submitAnswer} onSkip={session.skip} onFreeTalk={session.freeTalk} />
          )}

          {answersWorking && <Working text={t("enrich.focus.dump.working")} />}
          {(step.kind === "brainDump" || (step.kind === "dumpWorking" && !answersWorking) || step.kind === "dumpEmpty") && (
            <BrainDumpStep
              roleId={role.id}
              title={role.title}
              company={role.company}
              value={dump.value}
              via={dump.via}
              onChange={(value, via) => setDump({ value, via })}
              locale={cv.locale}
              working={step.kind === "dumpWorking"}
              empty={step.kind === "dumpEmpty"}
              busy={busy}
              boxFirst={session.boxFirst}
              onSubmit={session.submitAnswer}
              onSkip={session.skip}
              onBack={back}
            />
          )}
          {step.kind === "dumpPick" && (
            <DumpPickStep proposals={step.proposals} roleAfterAll={step.roleAfterAll} busy={busy} onAdd={session.addSelected} onBack={back} />
          )}
          {step.kind === "scoring" && <Working text={t(step.source === "dump" ? "enrich.focus.dump.scoring" : step.source === "opening" ? "enrich.focus.loading"
            : step.source === "box" ? "enrich.focus.box.scoring" : "enrich.focus.scoring")} />}
          {(step.kind === "question" || step.kind === "needsDetail") && (
            <QuestionStep
              key={stepKey}
              question={step.question}
              initial={session.prefill ?? ""}
              onBack={back}
              needsDetail={step.kind === "needsDetail"}
              locale={cv.locale}
              busy={busy}
              onSubmit={session.submitAnswer}
              onSkip={session.skip}
              onFreeTalk={session.freeTalk}
            />
          )}
          {step.kind === "working" && <Working text={t("enrich.focus.working")} />}
          {step.kind === "describing" && <Working text={t("enrich.focus.describe.working")} />}
          {step.kind === "description" && (
            <DescriptionStep key={step.text} text={step.text} keywords={step.keywords} busy={busy} onUse={session.useDescription} onSkip={session.skip} />
          )}
          {step.kind === "proposal" && (
            <ProposalStep
              key={stepKey}
              before={proposalText}
              after={step.text}
              bulletBefore={step.bulletBefore}
              bulletAfter={step.bulletAfter}
              busy={busy}
              onUse={() => {
                setAccepted((m) => new Map(m).set(step.bulletId, step.bulletAfter));
                session.useProposal();
              }}
              onKeep={session.keepMine}
            />
          )}
          {step.kind === "failed" && (
            <>
              <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>
                {t(step.reason === "saving" ? "enrich.focus.failed.saving" : "enrich.focus.failed.unavailable")}
              </h2>
              <div className="fm-foot">
                <button type="button" className="fm-ghost" onClick={session.skip} disabled={busy}>
                  {t("enrich.focus.skip")}
                </button>
                <button type="button" className="fm-btn" onClick={session.retry} disabled={busy}>
                  {t("enrich.focus.tryAgain")}
                </button>
              </div>
            </>
          )}
          {step.kind === "roleDone" && (
            <div className="fm-done">
              <p className="fm-eyebrow">{t("enrich.focus.done.eyebrow")}</p>
              <h2 className="fm-q is-big" id="fm-step-title" tabIndex={-1}>{t("enrich.focus.done.title")}</h2>
              <p className="fm-done-score">
                <b>{step.score ?? "–"}</b>
                <span className="fm-eyebrow">{t(`enrich.focus.score.${kind}`)}</span>
              </p>
              <button type="button" className="fm-btn" onClick={() => {
                moving.current = true;
                session.close();
              }}>
                {next ? next.label : t("enrich.focus.done.back")}
              </button>
            </div>
          )}
        </div>
      </section>

      {step.kind === "celebrate" && <CelebrateMoment key={`${step.from}-${step.to}`} from={step.from} to={step.to} role={name} onNext={session.next} />}
    </div>,
    document.body,
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

type LightItem = { id: string; name?: string; title?: string; provider?: string; issuer?: string; publisher?: string; date?: string; bullets?: { id: string; text: string }[] };
type LightStep = { kind: "box" } | { kind: "working" } | { kind: "pick"; lines: string[] } | { kind: "failed" };

/**
 * 3B: one lighter item (a course, award, publication or interest) in the guided path, on the focus mode frame:
 * the item on the left; on the right "Tell us about ‹item›", then "Pick the ones that are true" (none ticked).
 * No score and no questions. Skip, None of these and an empty answer all move on; Back returns to the box.
 */
export function LightStop({ section, itemId, cv, dispatch, waitForSave, onClose, onNext, topBar }: {
  section: LineList; itemId: string; cv: CvContent; dispatch(a: CvAction): void; waitForSave(): Promise<void>;
  onClose(): void; onNext(): void; topBar?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  useFocusFrame(root, onClose);
  const [step, setStep] = useState<LightStep>({ kind: "box" });
  const [answer, setAnswer] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const pane = right.current;
      if (!pane || pane.contains(document.activeElement)) return;
      (pane.querySelector<HTMLElement>("textarea:not(:disabled), .fm-btn:not(:disabled)") ?? pane.querySelector<HTMLElement>("#fm-step-title"))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [step.kind]);

  const item = (cv[section] as LightItem[]).find((i) => i.id === itemId);
  if (!item) return null;
  const name = (item.name ?? item.title ?? "").trim() || t(`enrich.path.section.${section}`);
  const meta = [item.provider ?? item.issuer ?? item.publisher ?? "", formatRange(item.date ?? "", "", false, cv.locale)].map((s) => s.trim()).filter(Boolean).join(" · ");
  const lines = (item.bullets ?? []).filter((b) => b.text.trim() !== "");
  const busy = step.kind === "working";

  const ask = async (text: string) => {
    setStep({ kind: "working" });
    try {
      await waitForSave();
      const found = (await itemLines({ section, itemId, text: text.trim() })).lines;
      if (!alive.current) return;
      if (found.length) setStep({ kind: "pick", lines: found });
      else onNext();
    } catch {
      if (alive.current) setStep({ kind: "failed" });
    }
  };

  return createPortal(
    <div ref={root} className={topBar ? "focus-mode has-path" : "focus-mode"} role="dialog" aria-modal="true" aria-label={t("enrich.light.dialog", { name })}>
      {topBar}
      <aside className="fm-left">
        <p className="fm-eyebrow">{t(`enrich.path.section.${section}`)}</p>
        <p className="fm-role">{name}</p>
        {meta && <p className="fm-role-meta">{meta}</p>}
        <ul className="fm-bullets">
          {lines.map((b) => <li key={b.id} className="fm-bullet"><span>{b.text}</span></li>)}
          {step.kind !== "pick" && <li className="fm-slot" aria-hidden="true">{t("enrich.light.slot")}</li>}
        </ul>
      </aside>
      <section className="fm-right" ref={right} aria-busy={busy}>
        <button type="button" className="fm-close" onClick={onClose}>
          <span aria-hidden="true">✕</span> {t("enrich.focus.close")}
        </button>
        {(step.kind === "box" || step.kind === "working") && (
          <BrainDumpStep
            roleId={itemId} title={name} company="" value={answer.value} via={answer.via}
            onChange={(value, via) => setAnswer({ value, via })} locale={cv.locale}
            working={busy} empty={false} busy={busy} boxFirst onSubmit={(text) => void ask(text)} onSkip={onNext}
            copy={{ question: t("enrich.light.question", { name }), hint: t("enrich.light.hint"),
              prompts: [t(`enrich.light.prompt1.${section}`), t("enrich.light.prompt2"), t("enrich.light.prompt3")] }}
          />
        )}
        {step.kind === "pick" && (
          <DumpPickStep lines proposals={step.lines.map((text, i) => ({ id: String(i), text }))} roleAfterAll={null} busy={false}
            onBack={() => setStep({ kind: "box" })}
            onAdd={(ids) => {
              const texts = step.lines.filter((_, i) => ids.includes(String(i)));
              if (texts.length) dispatch({ type: "addLines", list: section, itemId, texts });
              onNext();
            }} />
        )}
        {step.kind === "failed" && (
          <>
            <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.light.failed")}</h2>
            <div className="fm-foot">
              <button type="button" className="fm-ghost" onClick={onNext}>{t("enrich.focus.skip")}</button>
              <button type="button" className="fm-btn" onClick={() => void ask(answer.value)}>{t("enrich.focus.tryAgain")}</button>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
