import { useCallback, useEffect, useRef, useState } from "react";
import {
  BRAIN_DUMP_QUESTION, MAX_LONG_TEXT, fingerprint, newId, notesHash,
  type CvContent, type Experience, type Question, type RoleResult,
} from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import type { Via } from "./AnswerBox.tsx";
import { brainDump, improveBullet, roleFacts, scoreRole } from "./enrich-api.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

export type FocusMode = "improve" | "standOut";
export type FocusStep =
  | { kind: "role"; index: number }
  | { kind: "brainDump" }
  | { kind: "dumpWorking" }
  | { kind: "dumpPick"; proposals: { id: string; text: string; score: number }[]; roleAfterAll: number | null }
  | { kind: "dumpEmpty" }
  | { kind: "scoring"; source: "dump" | "bullet" | "opening" }
  | { kind: "question"; bulletId: string; question: Question; asked: number }
  | { kind: "working"; bulletId: string }
  | { kind: "proposal"; bulletId: string; text: string; bulletBefore: number; bulletAfter: number; roleBefore: number | null; roleAfter: number; cached: boolean }
  | { kind: "needsDetail"; bulletId: string; question: Question; asked: number }
  | { kind: "failed"; bulletId: string | null; reason: "unavailable" | "saving" }
  | { kind: "celebrate"; from: number | null; to: number; next: "queue" | "done" }
  | { kind: "roleDone"; score: number | null };

type Options = {
  cv: CvContent; roleId: string; bulletId?: string; mode: FocusMode;
  scores: Map<string, RoleScoreState>; dispatch: (a: CvAction) => void;
  waitForSave: () => Promise<void>; onClose: () => void;
};
type View = { step: FocusStep; queue: string[]; position: number; busy: boolean };

function buildQueue(role: Experience | undefined, result: RoleResult | undefined, opts: Options): string[] {
  const grades = new Map(role && result && result.fingerprint === fingerprint(role, opts.cv.locale)
    ? result.bullets.map((b) => [b.id, b]) : []);
  // The bullet picked with ✨ is always in the queue, even at 100: focus mode opens on that bullet.
  const bullets = (role?.bullets ?? []).filter((b) => b.id === opts.bulletId || (opts.mode === "improve"
    ? (grades.get(b.id)?.score ?? 0) < 75 : grades.get(b.id)?.impact !== "specific"));
  if (opts.mode === "improve") {
    bullets.sort((a, b) => (grades.get(a.id)?.score ?? 0) - (grades.get(b.id)?.score ?? 0));
    const chosen = bullets.findIndex((b) => b.id === opts.bulletId);
    if (chosen > 0) bullets.unshift(...bullets.splice(chosen, 1));
  }
  return bullets.map((b) => b.id);
}
const questionKey = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
function bulletStep(
  role: Experience | undefined, queue: string[], position: number, result: RoleResult | undefined,
  shown: Map<string, Set<string>>, completed: Set<string>, next?: { bulletId: string; question: Question | null },
): Pick<View, "step" | "position"> {
  while (queue[position]) {
    const bulletId = queue[position]!;
    const asked = shown.get(bulletId) ?? new Set<string>();
    const followUp = next?.bulletId === bulletId;
    const question = followUp ? next.question : result?.questions.find((q) => q.bulletId === bulletId) ?? null;
    if (!role?.bullets.some((b) => b.id === bulletId) || completed.has(bulletId) || asked.size >= 3
      || (followUp && !question) || (question && asked.has(questionKey(question.text)))) {
      completed.add(bulletId);
      position++;
      continue;
    }
    if (!question) return { position, step: { kind: "working", bulletId } };
    asked.add(questionKey(question.text));
    shown.set(bulletId, asked);
    return { position, step: { kind: followUp ? "needsDetail" : "question", bulletId, question, asked: asked.size } };
  }
  return { position, step: { kind: "roleDone", score: result?.score ?? null } };
}
function firstStep(
  role: Experience | undefined, result: RoleResult | undefined, queue: string[],
  shown: Map<string, Set<string>>, completed: Set<string>,
): Pick<View, "step" | "position"> {
  return result?.roleQuestions.length ? { position: 0, step: { kind: "role", index: 0 } }
    : role && role.bullets.length <= 1 ? { position: 0, step: { kind: "brainDump" } }
    : bulletStep(role, queue, 0, result, shown, completed);
}

/** Owns one open focus session; every content change goes through the editor's reducer. */
export function useFocusSession(opts: Options): {
  step: FocusStep; queue: string[]; position: number; busy: boolean;
  roleQuestions: RoleResult["roleQuestions"];
  result: RoleResult | undefined;
  submitAnswer(text: string, via: Via[]): void;
  skip(): void; useProposal(): void; keepMine(): void;
  addSelected(ids: string[]): void; next(): void; retry(): void; close(): void; freeTalk(): void;
} {
  const [initial] = useState(() => {
    const shown = new Map<string, Set<string>>();
    const completed = new Set<string>();
    const role = opts.cv.experience.find((r) => r.id === opts.roleId);
    const result = opts.scores.get(opts.roleId)?.result;
    const queue = buildQueue(role, result, opts);
    const fresh = role && result?.fingerprint === fingerprint(role, opts.cv.locale);
    const start: Pick<View, "step" | "position"> = fresh ? firstStep(role, result, queue, shown, completed)
      : { position: 0, step: { kind: "scoring", source: "opening" } };
    return { shown, completed, view: { queue, busy: !fresh, ...start } };
  });
  const [view, setView] = useState<View>(initial.view);
  const current = useRef(opts);
  const session = useRef({
    view, alive: true, closed: false, notesChanged: false, lastCelebrated: null as number | null,
    result: opts.scores.get(opts.roleId)?.result, openingStarted: false, roleAnswered: false,
    shown: initial.shown, completed: initial.completed,
    rerun: new Set<string>(), returnPosition: 0,
    returnStep: null as Extract<FocusStep, { kind: "role" | "question" | "needsDetail" }> | null,
    lastCall: undefined as { bulletId: string | null; source?: "answers" } | undefined,
    callText: "", scoreBefore: null as number | null, scorePrint: "", afterCelebrate: 0,
  });
  useEffect(() => { current.current = opts; });
  useEffect(() => {
    const s = session.current;
    s.alive = true;
    return () => { s.alive = false; };
  }, []);
  const update = useCallback((patch: Partial<View>) => {
    const s = session.current;
    if (patch.step?.kind === "celebrate") s.lastCelebrated = patch.step.to;
    s.view = { ...s.view, ...patch };
    if (s.alive && !s.closed) setView(s.view);
  }, []);
  const go = useCallback((position: number, queue = session.current.view.queue, next?: { bulletId: string; question: Question | null }) => {
    const s = session.current;
    const o = current.current;
    const role = o.cv.experience.find((r) => r.id === o.roleId);
    const resume = s.returnStep;
    s.returnStep = null;
    if (resume?.kind === "role") {
      update({ queue, position: s.returnPosition, busy: false, step: resume });
      return;
    }
    if (resume && queue.includes(resume.bulletId) && role?.bullets.some((b) => b.id === resume.bulletId)) {
      const at = queue.indexOf(resume.bulletId);
      const before = queue.slice(0, at);
      const done = before.filter((id) => s.completed.has(id));
      // A newly scored bullet may sort before this one; keep it for after the question we paused.
      queue = [...done, resume.bulletId, ...before.filter((id) => !s.completed.has(id)), ...queue.slice(at + 1)];
      update({ queue, position: done.length, busy: false, step: resume });
      return;
    }
    const entry = o.scores.get(o.roleId);
    const result = entry?.state === "ready" && role && entry.result?.fingerprint === fingerprint(role, o.cv.locale)
      ? entry.result : session.current.result;
    for (const id of queue.slice(0, position)) s.completed.add(id);
    update({ queue, busy: false, ...bulletStep(role, queue, position, result, s.shown, s.completed, next) });
  }, [update]);

  const run = useCallback(async (bulletId: string | null, source?: "answers") => {
    const s = session.current;
    if (s.view.busy || s.closed || !s.alive) return;
    s.lastCall = { bulletId, source };
    update({ busy: true, step: bulletId ? { kind: "working", bulletId } : { kind: "dumpWorking" } });
    let saving = true;
    try {
      await current.current.waitForSave();
      if (!s.alive || s.closed) return;
      for (let retry = 0; retry < 2; retry++) {
        const o = current.current;
        const role = o.cv.experience.find((r) => r.id === o.roleId);
        if (!role) return;
        const print = fingerprint(role, o.cv.locale);
        saving = false;
        try {
          if (bulletId) {
            const bullet = role.bullets.find((b) => b.id === bulletId);
            if (!bullet) { go(s.view.position + 1); return; }
            s.callText = bullet.text;
            const answer = await improveBullet({ roleId: o.roleId, bulletId, fingerprint: print });
            if (!s.alive || s.closed) return;
            if ("needsDetail" in answer) {
              const next = answer.nextQuestion;
              go(s.view.position, s.view.queue, { bulletId, question: next ? { ...next, bulletId, kind: "detail" } : null });
            } else update({ busy: false, step: { kind: "proposal", bulletId, text: answer.proposal.text,
              bulletBefore: answer.bulletBefore, bulletAfter: answer.bulletAfter,
              roleBefore: answer.roleBefore, roleAfter: answer.roleAfter, cached: answer.cached } });
          } else {
            const answer = await brainDump({ roleId: o.roleId, fingerprint: print, ...(source ? { source } : {}) });
            if (!s.alive || s.closed) return;
            s.scoreBefore = answer.roleBefore;
            if (!answer.proposals.length && s.returnStep) { go(s.returnPosition); return; }
            update({ busy: false, step: answer.proposals.length
              ? { kind: "dumpPick", proposals: answer.proposals, roleAfterAll: answer.roleAfterAll }
              : { kind: "dumpEmpty" } });
          }
          return;
        } catch (err) {
          if (!(err instanceof ApiClientError && err.status === 409 && err.code === "not_saved")) throw err;
          saving = true;
          if (retry === 1) throw err;
          await current.current.waitForSave();
          if (!s.alive || s.closed) return;
        }
      }
    } catch {
      if (s.alive && !s.closed) update({ busy: false, step: { kind: "failed", bulletId, reason: saving ? "saving" : "unavailable" } });
    }
  }, [go, update]);

  useEffect(() => {
    if (view.step.kind === "working") void run(view.step.bulletId);
  }, [view.step, run]);

  useEffect(() => {
    const s = session.current;
    if (view.step.kind !== "scoring" || view.step.source !== "opening" || s.openingStarted) return;
    s.openingStarted = true;
    const open = async () => {
      let result: RoleResult | undefined;
      try {
        await current.current.waitForSave();
        if (!s.alive || s.closed) return;
        const o = current.current;
        const role = o.cv.experience.find((r) => r.id === o.roleId);
        if (role) result = await scoreRole(o.roleId, fingerprint(role, o.cv.locale));
      } catch { /* No role questions: continue with bullets or free talk. */ }
      if (!s.alive || s.closed) return;
      const o = current.current;
      const role = o.cv.experience.find((r) => r.id === o.roleId);
      if (role && result?.fingerprint !== fingerprint(role, o.cv.locale)) result = undefined;
      const entry = o.scores.get(o.roleId);
      if (entry?.state === "ready" && role && entry.result?.fingerprint === fingerprint(role, o.cv.locale)) result = entry.result;
      s.result = result ?? s.result;
      const queue = buildQueue(role, result, o);
      update({ busy: false, queue, ...firstStep(role, result, queue, s.shown, s.completed) });
    };
    void open();
  }, [view.step, update]);

  const finishScoring = useCallback((fresh?: RoleResult) => {
    const s = session.current;
    if (s.closed || s.view.step.kind !== "scoring" || s.view.step.source === "opening") return;
    const o = current.current;
    const role = o.cv.experience.find((r) => r.id === o.roleId);
    const dumping = s.view.step.source === "dump";
    const queue = dumping ? buildQueue(role, fresh ?? o.scores.get(o.roleId)?.result, o).filter((id) => !s.completed.has(id)) : s.view.queue;
    const position = dumping ? 0 : s.view.position + 1;
    if (fresh) s.result = { ...fresh, roleQuestions: s.result?.roleQuestions ?? fresh.roleQuestions };
    if (fresh?.score != null && (s.scoreBefore === null || fresh.score > s.scoreBefore)) {
      s.afterCelebrate = position;
      update({ busy: false, queue, position: dumping ? 0 : s.view.position, step: {
        kind: "celebrate", from: s.scoreBefore, to: fresh.score, next: s.returnStep?.kind === "role" || position < queue.length ? "queue" : "done",
      } });
    } else go(position, queue);
  }, [go, update]);
  useEffect(() => {
    if (view.step.kind !== "scoring" || view.step.source === "opening") return;
    const timer = setTimeout(() => finishScoring(), 15000);
    return () => clearTimeout(timer);
  }, [view.step, finishScoring]);
  useEffect(() => {
    if (view.step.kind !== "scoring" || view.step.source === "opening") return;
    const o = current.current;
    const role = o.cv.experience.find((r) => r.id === o.roleId);
    const entry = o.scores.get(o.roleId);
    if (role && entry?.state === "ready" && entry.result
      && entry.result.fingerprint !== session.current.scorePrint
      && entry.result.fingerprint === fingerprint(role, o.cv.locale)) finishScoring(entry.result);
  }, [opts.cv, opts.roleId, opts.scores, view.step, finishScoring]);
  useEffect(() => {
    const o = current.current;
    if (!o.cv.experience.some((r) => r.id === o.roleId) && !session.current.closed) {
      session.current.closed = true;
      o.onClose();
    }
  }, [opts.cv, opts.roleId, opts.onClose]);

  const available = () => !session.current.view.busy && !session.current.closed;
  const advance = () => {
    const s = session.current;
    if (!available()) return;
    const step = s.view.step;
    if (step.kind === "role") {
      if (step.index + 1 < (s.result?.roleQuestions.length ?? 0)) update({ step: { kind: "role", index: step.index + 1 } });
      else {
        const role = current.current.cv.experience.find((r) => r.id === current.current.roleId);
        if (role && role.bullets.length <= 1) {
          if (s.roleAnswered) void run(null, "answers");
          else update({ step: { kind: "brainDump" } });
        } else go(0);
      }
    } else if (step.kind === "celebrate") go(s.afterCelebrate);
    else if (step.kind === "brainDump" || step.kind === "dumpEmpty" || step.kind === "dumpPick"
      || (step.kind === "failed" && step.bulletId === null)) go(s.returnPosition);
    else if ("bulletId" in step) go(s.view.position + 1);
  };
  let step = view.step;
  if (step.kind === "roleDone") {
    const entry = opts.scores.get(opts.roleId);
    const role = opts.cv.experience.find((r) => r.id === opts.roleId);
    const result = entry?.state === "ready" && role && entry.result?.fingerprint === fingerprint(role, opts.cv.locale)
      ? entry.result : session.current.result ?? entry?.result;
    step = { kind: "roleDone", score: role && result
      && result.fingerprint === fingerprint(role, opts.cv.locale)
      ? result.score : session.current.lastCelebrated ?? result?.score ?? null };
  }
  return {
    ...view, step, roleQuestions: session.current.result?.roleQuestions ?? [], result: session.current.result,
    submitAnswer(text, via) {
      if (!available()) return;
      const s = session.current;
      const step = s.view.step;
      if (step.kind !== "role" && step.kind !== "question" && step.kind !== "needsDetail" && step.kind !== "brainDump" && step.kind !== "dumpEmpty") return;
      const answer = text.trim().slice(0, MAX_LONG_TEXT);
      if (!answer) return;
      const o = current.current;
      const bulletId = "bulletId" in step ? step.bulletId : null;
      const question = step.kind === "role" ? s.result?.roleQuestions[step.index] : "question" in step ? step.question : null;
      s.notesChanged = true;
      o.dispatch({ type: "setNote", roleId: o.roleId, note: {
        id: newId(), question: question?.text ?? BRAIN_DUMP_QUESTION,
        answer, via: via.length ? via : ["type"], askedAt: new Date().toISOString(),
      } });
      if (step.kind === "role") { s.roleAnswered = true; advance(); }
      else void run(bulletId);
    },
    skip: advance,
    keepMine() { if (session.current.view.step.kind === "proposal") advance(); },
    useProposal: () => {
      if (!available()) return;
      const s = session.current;
      const step = s.view.step;
      if (step.kind !== "proposal") return;
      const o = current.current;
      const role = o.cv.experience.find((r) => r.id === o.roleId);
      const bullet = role?.bullets.find((b) => b.id === step.bulletId);
      if (!bullet) { go(s.view.position + 1); return; }
      if (bullet.text !== s.callText) {
        if (s.rerun.has(step.bulletId)) { go(s.view.position + 1); return; }
        s.rerun.add(step.bulletId);
        void run(step.bulletId);
        return;
      }
      o.dispatch({ type: "replaceBullet", roleId: o.roleId, bulletId: step.bulletId, text: step.text });
      if (!step.cached) {
        s.scoreBefore = step.roleBefore;
        s.scorePrint = fingerprint(role!, o.cv.locale);
        update({ busy: true, step: { kind: "scoring", source: "bullet" } });
      } else if (step.roleBefore !== null && step.roleAfter <= step.roleBefore) go(s.view.position + 1);
      else {
        s.afterCelebrate = s.view.position + 1;
        update({ step: { kind: "celebrate", from: step.roleBefore, to: step.roleAfter,
          next: s.afterCelebrate < s.view.queue.length ? "queue" : "done" } });
      }
    },
    addSelected(ids) {
      if (!available()) return;
      const s = session.current;
      if (s.view.step.kind !== "dumpPick") return;
      const texts = s.view.step.proposals.filter((p) => ids.includes(p.id)).map((p) => p.text);
      if (!texts.length) { go(s.returnPosition); return; }
      const o = current.current;
      const role = o.cv.experience.find((r) => r.id === o.roleId);
      if (!role) return;
      s.scorePrint = fingerprint(role, o.cv.locale);
      update({ busy: true, step: { kind: "scoring", source: "dump" } });
      o.dispatch({ type: "addBullets", roleId: o.roleId, texts });
    },
    next: advance,
    retry() {
      const s = session.current;
      if (available() && s.view.step.kind === "failed" && s.lastCall) void run(s.lastCall.bulletId, s.lastCall.source);
    },
    freeTalk() {
      const s = session.current;
      if (!available()) return;
      const step = s.view.step;
      if (step.kind !== "role" && step.kind !== "question" && step.kind !== "needsDetail") return;
      s.returnPosition = s.view.position;
      s.returnStep = step;
      update({ step: { kind: "brainDump" } });
    },
    close() {
      // Works while busy too (✕ / Esc at any point): every await in `run` re-checks `closed`.
      const s = session.current;
      if (s.closed) return;
      const o = current.current;
      s.closed = true;
      // role-facts reads the saved notes, so it waits for the last answer to be saved.
      if (s.notesChanged) void o.waitForSave().then(() => roleFacts(o.roleId)).then(({ facts, fromNotes }) => {
        const role = current.current.cv.experience.find((r) => r.id === o.roleId);
        if (role && notesHash(role.notes) === fromNotes) o.dispatch({
          type: "setFacts", roleId: o.roleId, facts: { items: facts, fromNotes, updatedAt: new Date().toISOString() },
        });
      }).catch(() => undefined);
      o.onClose();
    },
  };
}
