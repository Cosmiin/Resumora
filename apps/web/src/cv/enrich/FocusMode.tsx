import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fingerprint, type CvContent } from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { roleName } from "../edit/sections/RoleItem.tsx";
import { formatRange } from "../page/blocks.ts";
import type { Via } from "./AnswerBox.tsx";
import { BrainDumpStep, DumpPickStep } from "./BrainDumpStep.tsx";
import { CelebrateMoment } from "./CelebrateMoment.tsx";
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
};

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
const DUMP_KINDS = new Set<FocusStep["kind"]>(["brainDump", "dumpWorking", "dumpEmpty", "dumpPick", "dumpScoring"]);
const SELF_FOCUSING = new Set<FocusStep["kind"]>(["proposal", "celebrate"]);

/** Full-screen focus mode: the role on the left, one step at a time on the right. */
export function FocusMode({ target, cv, dispatch, scores, waitForSave, onClose }: Props) {
  const session = useFocusSession({ cv, roleId: target.roleId, bulletId: target.bulletId, mode: target.mode, scores, dispatch, waitForSave, onClose });
  const { step, queue, position, busy } = session;
  const root = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  // Scores we already know before the next background score arrives: accepted bullets and celebrated roles.
  const [accepted, setAccepted] = useState<ReadonlyMap<string, number>>(new Map());
  const [known, setKnown] = useState<number | null>(null);
  // The ramble lives here, not in the step, so it survives a failed call and Try again.
  const [dump, setDump] = useState<{ value: string; via: Via[] }>({ value: "", via: [] });

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

  useEffect(() => {
    if (step.kind === "celebrate") setKnown(step.to);
  }, [step]);

  // Esc and Tab are handled on the document, not the dialog: when the focused control disappears
  // (the mic after a denied permission, a step that changes under the cursor), focus falls to <body>
  // and a dialog-level handler would never see the key.
  const close = useRef(session.close);
  useEffect(() => {
    close.current = session.close;
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
  }, []);

  const stepKey = `${step.kind}:${"bulletId" in step ? step.bulletId : ""}`;
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

  const role = cv.experience.find((r) => r.id === target.roleId);
  if (!role) return null;
  const name = roleName(role, "experience");
  const entry = scores.get(role.id);
  const result = entry?.result;
  const fresh = entry?.state === "ready" && result?.fingerprint === fingerprint(role, cv.locale);
  const roleScore = fresh ? (result?.score ?? null) : (known ?? result?.score ?? null);
  const grades = new Map(result?.bullets.map((b) => [b.id, b.score]));
  const scoreOf = (id: string) => (fresh ? grades.get(id) : (accepted.get(id) ?? grades.get(id)));
  const currentId = "bulletId" in step ? step.bulletId : step.kind === "celebrate" ? undefined : queue[position];
  const dumping = DUMP_KINDS.has(step.kind);
  const dates = formatRange(role.startDate, role.endDate, role.current, cv.locale);

  const proposalText = step.kind === "proposal" ? role.bullets.find((b) => b.id === step.bulletId)?.text ?? "" : "";
  const inQueue = !dumping && step.kind !== "roleDone" && queue.length > 0;
  const asking = step.kind === "question" && step.question !== null;

  return createPortal(
    <div
      ref={root}
      className="focus-mode"
      role="dialog"
      aria-modal="true"
      aria-label={t("enrich.focus.dialog", { role: name })}
    >
      <aside className="fm-left">
        <p className="fm-eyebrow">{t("enrich.focus.yourRole")}</p>
        <p className="fm-role">{name}</p>
        <p className="fm-role-meta">{[role.company, dates].filter(Boolean).join(" · ")}</p>
        <ul className="fm-bullets">
          {role.bullets.map((b) => {
            const n = scoreOf(b.id);
            const cls = ["fm-bullet", b.id === currentId && "is-current", b.id === currentId && step.kind === "working" && "is-working", accepted.has(b.id) && "is-new"];
            return (
              <li key={b.id} className={cls.filter(Boolean).join(" ")} aria-current={b.id === currentId ? "true" : undefined}>
                <span>{b.text}</span>
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
        <p className="fm-score">
          <b>{roleScore ?? "–"}</b>
          <span className="fm-eyebrow">{roleScore === null ? t("enrich.focus.noScore") : t("enrich.focus.roleScore")}</span>
        </p>
      </aside>

      <section className="fm-right" ref={right} aria-busy={busy}>
        <button type="button" className="fm-close" onClick={() => session.close()}>
          <span aria-hidden="true">✕</span> {t("enrich.focus.close")}
        </button>
        {inQueue && (
          <>
            <div className="fm-steps" aria-hidden="true">
              {queue.map((id, i) => (
                <i key={id} className={i < position ? "is-done" : i === position ? "is-on" : undefined} />
              ))}
            </div>
            <p className="fm-eyebrow">
              {t(asking ? "enrich.focus.questionOf" : "enrich.focus.progress", { n: Math.min(position + 1, queue.length), total: queue.length })}
            </p>
          </>
        )}

        {(step.kind === "brainDump" || step.kind === "dumpWorking" || step.kind === "dumpEmpty") && (
          <BrainDumpStep
            roleId={role.id}
            value={dump.value}
            via={dump.via}
            onChange={(value, via) => setDump({ value, via })}
            locale={cv.locale}
            working={step.kind === "dumpWorking"}
            empty={step.kind === "dumpEmpty"}
            busy={busy}
            onSubmit={session.submitAnswer}
            onSkip={session.skip}
          />
        )}
        {step.kind === "dumpPick" && (
          <DumpPickStep proposals={step.proposals} roleAfterAll={step.roleAfterAll} busy={busy} onAdd={session.addSelected} />
        )}
        {step.kind === "dumpScoring" && <Working text={t("enrich.focus.dump.scoring")} />}
        {(step.kind === "question" || step.kind === "needsDetail") && (
          <QuestionStep
            key={stepKey}
            bulletId={step.bulletId}
            question={step.question}
            needsDetail={step.kind === "needsDetail"}
            locale={cv.locale}
            busy={busy}
            onSubmit={session.submitAnswer}
            onSkip={session.skip}
          />
        )}
        {step.kind === "working" && <Working text={t("enrich.focus.working")} />}
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
              <span className="fm-eyebrow">{t("enrich.focus.roleScore")}</span>
            </p>
            <button type="button" className="fm-btn" onClick={() => session.close()}>
              {t("enrich.focus.done.back")}
            </button>
          </div>
        )}
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
