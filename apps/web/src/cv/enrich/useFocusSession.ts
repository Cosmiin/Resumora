import { useCallback, useEffect, useRef, useState } from "react";
import {
  BRAIN_DUMP_QUESTION, MAX_LONG_TEXT, fingerprint, hashText, newId, notesHash,
  type CvContent, type Experience, type Question, type RoleResult,
} from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ApiClientError } from "../../lib/api-error.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import type { Via } from "./AnswerBox.tsx";
import { brainDump, improveBullet, roleFacts } from "./enrich-api.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

export type FocusMode = "improve" | "standOut";
export type FocusStep =
  | { kind: "brainDump" }
  | { kind: "dumpWorking" }
  | { kind: "dumpPick"; proposals: { id: string; text: string; score: number }[]; roleAfterAll: number | null }
  | { kind: "dumpEmpty" }
  | { kind: "scoring"; source: "dump" | "bullet" }
  | { kind: "question"; bulletId: string; question: Question | null }
  | { kind: "working"; bulletId: string }
  | { kind: "proposal"; bulletId: string; text: string; bulletBefore: number; bulletAfter: number; roleBefore: number | null; roleAfter: number; cached: boolean }
  | { kind: "needsDetail"; bulletId: string; question: Question | null }
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
  const grades = new Map(result?.bullets.map((b) => [b.id, b]));
  // The bullet picked with ✨ is always in the queue, even at 100: focus mode opens on that bullet.
  const bullets = (role?.bullets ?? []).filter((b) => b.id === opts.bulletId || (opts.mode === "improve"
    ? grades.get(b.id)?.score !== 100 : grades.get(b.id)?.impact !== "specific"));
  if (opts.mode === "improve") {
    bullets.sort((a, b) => (grades.get(a.id)?.score ?? 0) - (grades.get(b.id)?.score ?? 0));
    const chosen = bullets.findIndex((b) => b.id === opts.bulletId);
    if (chosen > 0) bullets.unshift(...bullets.splice(chosen, 1));
  }
  return bullets.map((b) => b.id);
}
function bulletStep(id: string | undefined, result: RoleResult | undefined): FocusStep {
  if (!id) return { kind: "roleDone", score: result?.score ?? null };
  const question = result?.questions.find((q) => q.bulletId === id) ?? null;
  return question ? { kind: "question", bulletId: id, question } : { kind: "working", bulletId: id };
}
const questionKey = (id: string, question: Question) => hashText(id + "\u0000" + question.text);

/** Owns one open focus session; every content change goes through the editor's reducer. */
export function useFocusSession(opts: Options): {
  step: FocusStep; queue: string[]; position: number; busy: boolean;
  submitAnswer(text: string, via: Via[]): void;
  skip(): void; useProposal(): void; keepMine(): void;
  addSelected(ids: string[]): void; next(): void; retry(): void; close(): void;
} {
  const [view, setView] = useState<View>(() => {
    const role = opts.cv.experience.find((r) => r.id === opts.roleId);
    const result = opts.scores.get(opts.roleId)?.result;
    const queue = buildQueue(role, result, opts);
    return { queue, position: 0, busy: false, step: role && role.bullets.length <= 2
      ? { kind: "brainDump" } : bulletStep(queue[0], result) };
  });
  const current = useRef(opts);
  const session = useRef({
    view, alive: true, closed: false, notesChanged: false, lastCelebrated: null as number | null,
    attempts: new Map<string, number>(), answered: new Set<string>(), rerun: new Set<string>(),
    lastCall: undefined as { bulletId: string | null; counted: boolean } | undefined,
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
  const go = useCallback((position: number, queue = session.current.view.queue) => {
    const o = current.current;
    const role = o.cv.experience.find((r) => r.id === o.roleId);
    while (queue[position] && !role?.bullets.some((b) => b.id === queue[position])) position++;
    update({ queue, position, busy: false, step: bulletStep(queue[position], o.scores.get(o.roleId)?.result) });
  }, [update]);

  const run = useCallback(async (bulletId: string | null, repeat = false) => {
    const s = session.current;
    if (s.view.busy || s.closed || !s.alive) return;
    const call = { bulletId, counted: repeat && s.lastCall?.counted === true };
    s.lastCall = call;
    update({ busy: true, step: bulletId ? { kind: "working", bulletId } : { kind: "dumpWorking" } });
    let saving = true;
    try {
      await current.current.waitForSave();
      if (!s.alive || s.closed) return;
      if (bulletId && !call.counted && (s.attempts.get(bulletId) ?? 0) >= 2) {
        go(s.view.position + 1);
        return;
      }
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
            if (!call.counted) {
              s.attempts.set(bulletId, (s.attempts.get(bulletId) ?? 0) + 1);
              call.counted = true;
            }
            const answer = await improveBullet({ roleId: o.roleId, bulletId, fingerprint: print });
            if (!s.alive || s.closed) return;
            if ("needsDetail" in answer) {
              const question = current.current.scores.get(o.roleId)?.result?.questions.find((q) => q.bulletId === bulletId) ?? null;
              update({ busy: false, step: { kind: "needsDetail", bulletId,
                question: question && !s.answered.has(questionKey(bulletId, question)) ? question : null } });
            } else update({ busy: false, step: { kind: "proposal", bulletId, text: answer.proposal.text,
              bulletBefore: answer.bulletBefore, bulletAfter: answer.bulletAfter,
              roleBefore: answer.roleBefore, roleAfter: answer.roleAfter, cached: answer.cached } });
          } else {
            const answer = await brainDump({ roleId: o.roleId, fingerprint: print });
            if (!s.alive || s.closed) return;
            s.scoreBefore = answer.roleBefore;
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

  const finishScoring = useCallback((fresh?: RoleResult) => {
    const s = session.current;
    if (s.closed || s.view.step.kind !== "scoring") return;
    const o = current.current;
    const role = o.cv.experience.find((r) => r.id === o.roleId);
    const dumping = s.view.step.source === "dump";
    const queue = dumping ? buildQueue(role, fresh ?? o.scores.get(o.roleId)?.result, o) : s.view.queue;
    const position = dumping ? 0 : s.view.position + 1;
    if (fresh?.score != null && (s.scoreBefore === null || fresh.score > s.scoreBefore)) {
      s.afterCelebrate = position;
      update({ busy: false, queue, position: dumping ? 0 : s.view.position, step: {
        kind: "celebrate", from: s.scoreBefore, to: fresh.score, next: position < queue.length ? "queue" : "done",
      } });
    } else go(position, queue);
  }, [go, update]);
  useEffect(() => {
    if (view.step.kind !== "scoring") return;
    const timer = setTimeout(() => finishScoring(), 15000);
    return () => clearTimeout(timer);
  }, [view.step.kind, finishScoring]);
  useEffect(() => {
    if (view.step.kind !== "scoring") return;
    const o = current.current;
    const role = o.cv.experience.find((r) => r.id === o.roleId);
    const entry = o.scores.get(o.roleId);
    if (role && entry?.state === "ready" && entry.result
      && entry.result.fingerprint !== session.current.scorePrint
      && entry.result.fingerprint === fingerprint(role, o.cv.locale)) finishScoring(entry.result);
  }, [opts.cv, opts.roleId, opts.scores, view.step.kind, finishScoring]);
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
    if (step.kind === "celebrate") go(s.afterCelebrate);
    else if (step.kind === "brainDump" || step.kind === "dumpEmpty" || step.kind === "dumpPick"
      || (step.kind === "failed" && step.bulletId === null)) go(0);
    else if ("bulletId" in step) go(s.view.position + 1);
  };
  let step = view.step;
  if (step.kind === "roleDone") {
    const entry = opts.scores.get(opts.roleId);
    const result = entry?.result;
    const role = opts.cv.experience.find((r) => r.id === opts.roleId);
    step = { kind: "roleDone", score: entry?.state === "ready" && role && result
      && result.fingerprint === fingerprint(role, opts.cv.locale)
      ? result.score : session.current.lastCelebrated ?? result?.score ?? null };
  }
  return {
    ...view, step,
    submitAnswer(text, via) {
      if (!available()) return;
      const s = session.current;
      const step = s.view.step;
      if (step.kind !== "question" && step.kind !== "needsDetail" && step.kind !== "brainDump" && step.kind !== "dumpEmpty") return;
      const answer = text.trim().slice(0, MAX_LONG_TEXT);
      if (!answer) return;
      const o = current.current;
      const bulletId = "bulletId" in step ? step.bulletId : null;
      const question = "question" in step ? step.question : null;
      if (bulletId && question) s.answered.add(questionKey(bulletId, question));
      s.notesChanged = true;
      o.dispatch({ type: "setNote", roleId: o.roleId, note: {
        id: newId(), question: bulletId ? question?.text ?? t("enrich.focus.followUpQuestion") : BRAIN_DUMP_QUESTION,
        answer, via: via.length ? via : ["type"], askedAt: new Date().toISOString(),
      } });
      void run(bulletId);
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
      if (!texts.length) { go(0); return; }
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
      if (available() && s.view.step.kind === "failed" && s.lastCall) void run(s.lastCall.bulletId, true);
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
