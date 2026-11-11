import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLEAR_AT, MAX_LONG_TEXT, MAX_TEXT, findScored, fingerprint, newId, notesHash,
  type CvContent, type Experience, type RoleResult,
} from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { roleListOf } from "../edit/lists.ts";
import type { Via } from "./AnswerBox.tsx";
import { brainDump, improveBullet, roleDescription, roleFacts, scoreRole } from "./enrich-api.ts";
import { t } from "../../i18n/t.ts";
import { RUN_MAX, buildRun, gapItems, itemQuestion, questionKey, splitRun, type RunItem } from "./run.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

/** One piece of the role that the answers changed: its description, one of its bullets, or a new bullet. */
export type Change =
  | { id: string; kind: "description"; before: string; after: string }
  | { id: string; kind: "bullet"; bulletId: string; before: string; after: string }
  | { id: string; kind: "new"; before: ""; after: string };

export type RunStep =
  /** The first screen of a role. Its questions may still be loading (`ready` is false). */
  | { kind: "start" }
  | { kind: "question"; index: number }
  /** After a thin role's "Tell us about…": the questions are asked for again with that answer in view. */
  | { kind: "thinking" }
  /** After the last question: the held rewrites are collected and the rest is written. */
  | { kind: "working" }
  | { kind: "approve"; changes: Change[] }
  | { kind: "failed" }
  | { kind: "done" };

type Options = {
  cv: CvContent; roleId: string;
  scores: ReadonlyMap<string, RoleScoreState>; dispatch: (a: CvAction) => void;
  waitForSave: () => Promise<void>; onClose: () => void;
  /** What the person wants their CV to bring out: the questions are asked for with it in view. */
  focus?: string;
  /** A score the run asked for itself (answers that changed no text), so the editor shows the same number. */
  onScore?: (result: RoleResult) => void;
};

/** A rewrite prepared in the background and kept until the approval screen. none: nothing better; error: the call failed. */
type Held = { text: string } | "none" | "error";

type View = {
  step: RunStep; items: RunItem[]; rest: RunItem[]; ready: boolean; busy: boolean;
  /** The answers given in this run, by item key: Back shows them again, and sending again updates the same note. */
  answers: Record<string, { noteId: string; text: string }>;
  /** The role's score when this run started, and how many pieces of the role it changed. */
  before: number | null; applied: number; answered: number;
  /** The score asked for by the run itself, when the answers changed no text. */
  own: RoleResult | null; rescored: boolean; timedOut: boolean;
};

const isThin = (role: Experience | undefined, result: RoleResult | undefined) =>
  !!role && (role.bullets.length <= 1 || !!result?.thin);
const squash = (text: string) => text.trim().replace(/\s+/g, " ");

/**
 * What is still to ask after a run: from the newest score when there is one (its questions are about the text as it
 * is now), otherwise what the run left over, without the lines that changed.
 */
function remaining(role: Experience | undefined, newest: RoleResult | undefined, rest: readonly RunItem[], asked: ReadonlySet<string>, changed: ReadonlySet<string>): RunItem[] {
  const alive = (item: RunItem) => item.kind !== "line" || (!changed.has(item.question.bulletId) && !!role?.bullets.some((b) => b.id === item.question.bulletId));
  const waiting = rest.filter((item) => alive(item) && !asked.has(questionKey(itemQuestion(item))));
  if (!newest) return waiting;
  const followUps = waiting.filter((item) => item.kind === "line" && item.followUp);
  const taken = new Set([...asked, ...followUps.map((item) => questionKey(itemQuestion(item)))]);
  return [...followUps, ...buildRun(newest, { thin: false, answered: taken })];
}

/**
 * One role's run (flow B): its questions one after another, every rewrite prepared in the background and held,
 * then one approval of the whole role. Answers are saved as notes as they are given; nothing else on the CV
 * changes before `apply`.
 */
export function useRoleRun(opts: Options) {
  const [initial] = useState(() => {
    const role = findScored(opts.cv, opts.roleId)?.item;
    const entry = opts.scores.get(opts.roleId);
    const print = role ? fingerprint(role, opts.cv.locale) : "";
    // A current score has the questions already. With a focus they are asked for again, with it in view.
    const result = role && entry?.state === "ready" && entry.result?.fingerprint === print && !opts.focus ? entry.result : undefined;
    const asked = new Set(role?.notes.map((note) => questionKey(note.question)));
    const thin = isThin(role, result);
    const run = splitRun(result ? buildRun(result, { thin, answered: asked }) : []);
    // Below 100 with every stored question already answered: more are asked for, so the role can still be improved.
    const spent = result !== undefined && run.items.length === 0 && (result.score ?? 0) < 100;
    const view: View = {
      step: { kind: "start" }, ...run, ready: result !== undefined && !spent, busy: false, answers: {},
      before: result?.score ?? null, applied: 0, answered: 0, own: null, rescored: false, timedOut: false,
    };
    return { view, result, asked, thin, print, spent };
  });
  const [view, setView] = useState<View>(initial.view);
  const current = useRef(opts);
  const session = useRef({
    view, alive: true, closed: false, notesChanged: false, loadStarted: false,
    result: initial.result, asked: initial.asked, thin: initial.thin, printAtOpen: initial.print,
    cursor: 0, finishing: 0, boxRescored: false, described: false, spent: initial.spent, roleAnswered: false,
    held: new Map<string, Promise<Held>>(), tokens: new Map<string, number>(), changed: new Set<string>(),
  });
  useEffect(() => { current.current = opts; });
  useEffect(() => {
    const s = session.current;
    s.alive = true;
    return () => { s.alive = false; };
  }, []);

  const update = useCallback((patch: Partial<View>) => {
    const s = session.current;
    s.view = { ...s.view, ...patch };
    if (s.alive && !s.closed) setView(s.view);
  }, []);

  /** Runs a call against the saved role. "Not saved yet" waits for the save and tries once more. */
  const saved = useCallback(async <T,>(call: (role: Experience, print: string) => Promise<T>): Promise<T | undefined> => {
    const s = session.current;
    await current.current.waitForSave();
    for (let attempt = 0; ; attempt++) {
      if (!s.alive || s.closed) return undefined;
      const o = current.current;
      const role = findScored(o.cv, o.roleId)?.item;
      if (!role) return undefined;
      try {
        return await call(role, fingerprint(role, o.cv.locale));
      } catch (err) {
        if (attempt > 0 || !(err instanceof ApiClientError && err.status === 409 && err.code === "not_saved")) throw err;
        await current.current.waitForSave();
      }
    }
  }, []);

  const show = useCallback((index: number) => {
    const s = session.current;
    const item = s.view.items[index];
    if (!item) return;
    s.cursor = index;
    s.asked.add(questionKey(itemQuestion(item)));
    update({ busy: false, step: { kind: "question", index } });
  }, [update]);

  // The questions, when the stored score is not current (or a focus is given): asked for once, on the first screen.
  useEffect(() => {
    const s = session.current;
    if (s.view.ready || s.loadStarted) return;
    s.loadStarted = true;
    void (async () => {
      let result: RoleResult | undefined;
      try {
        result = await saved((_, print) => {
          const o = current.current;
          return o.focus ? scoreRole(o.roleId, print, true, o.focus) : s.spent ? scoreRole(o.roleId, print, true, undefined, true) : scoreRole(o.roleId, print);
        });
      } catch { /* No questions from this call: the stored ones, if they are for this text. */ }
      if (!s.alive || s.closed) return;
      const o = current.current;
      const role = findScored(o.cv, o.roleId)?.item;
      const print = role ? fingerprint(role, o.cv.locale) : "";
      if (result?.fingerprint !== print) result = undefined;
      const stored = o.scores.get(o.roleId)?.result;
      if (!result && stored?.fingerprint === print) result = stored;
      s.result = result;
      s.printAtOpen = print;
      s.thin = isThin(role, result);
      let all = buildRun(result, { thin: s.thin, answered: s.asked });
      const answers: View["answers"] = {};
      // Still below 80 and nothing new to ask: the app asks about what the page still does not show (a result, a
      // tool, a size), then the lines' own questions once more. An earlier answer comes back in its box to add to.
      if (s.spent && all.length === 0 && result) {
        const gaps = gapItems(result, role?.bullets ?? [], { results: t("enrich.run.gap.results"), tools: t("enrich.run.gap.tools"), scale: t("enrich.run.gap.scale") });
        all = [...gaps, ...buildRun({ ...result, roleQuestions: [] }, { thin: false, answered: new Set() })];
        for (const item of all) {
          const note = role?.notes.find((n) => questionKey(n.question) === questionKey(itemQuestion(item)));
          if (note) answers[item.key] = { noteId: note.id, text: note.answer };
        }
      }
      update({ ...splitRun(all), answers, ready: true, before: result?.score ?? null });
    })();
  }, [saved, update]);

  /** A follow-up question arrives while the run goes on: it comes right after the question on screen. */
  const addFollowUp = useCallback((bulletId: string, question: { text: string; options: string[] }) => {
    const s = session.current;
    const kind = s.view.step.kind;
    if (s.closed || !s.alive || (kind !== "question" && kind !== "working")) return;
    const key = `follow:${bulletId}`;
    if (s.asked.has(questionKey(question.text)) || [...s.view.items, ...s.view.rest].some((item) => item.key === key)) return;
    const item: RunItem = { key, kind: "line", followUp: true, question: { bulletId, text: question.text, options: question.options, kind: "detail" } };
    const at = Math.min(s.cursor + 1, s.view.items.length);
    let items = [...s.view.items.slice(0, at), item, ...s.view.items.slice(at)];
    let rest = s.view.rest;
    // A run stays at RUN_MAX: the follow-up takes the place of the last question still to come, which waits for later.
    if (items.length > RUN_MAX) {
      if (at < items.length - 1) {
        rest = [items[items.length - 1]!, ...rest];
        items = items.slice(0, -1);
      } else {
        rest = [item, ...rest];
        items = s.view.items;
      }
    }
    update({ items, rest });
  }, [update]);

  /** Prepares one bullet's rewrite in the background and holds it for the approval screen. */
  const hold = useCallback((bulletId: string, followUp: boolean) => {
    const s = session.current;
    const token = (s.tokens.get(bulletId) ?? 0) + 1;
    s.tokens.set(bulletId, token);
    const { roleId } = current.current;
    const task = (async (): Promise<Held> => {
      try {
        const answer = await saved((role, print) => (role.bullets.some((b) => b.id === bulletId)
          ? improveBullet({ roleId, bulletId, fingerprint: print }) : Promise.resolve(undefined)));
        if (!answer) return "none";
        if ("needsDetail" in answer) {
          if (followUp && answer.nextQuestion && s.tokens.get(bulletId) === token) addFollowUp(bulletId, answer.nextQuestion);
          return "none";
        }
        return { text: answer.proposal.text };
      } catch {
        return "error";
      }
    })();
    s.held.set(bulletId, task);
  }, [saved, addFollowUp]);

  /** The last screen. Answers that changed no text can still move the score ("No one reported to me"): ask for it. */
  const toDone = useCallback((applied: number) => {
    const s = session.current;
    update({ busy: false, step: { kind: "done" }, applied, own: null, rescored: false, timedOut: false });
    if (applied > 0 || s.view.answered === 0) return;
    const run = s.finishing;
    void saved((_, print) => scoreRole(current.current.roleId, print, true)).then((result) => {
      if (!result || s.finishing !== run) return;
      // Leaving before the score comes back must not lose it: My CV shows it either way.
      current.current.onScore?.(result);
      if (!s.alive || s.closed) return;
      s.result = result;
      update({ own: result });
    }).catch(() => undefined).finally(() => {
      if (s.finishing === run) update({ rescored: true });
    });
  }, [saved, update]);

  /** After the last question: collect the held rewrites, write what is still missing, then show the role to approve. */
  const finish = useCallback(async (retry = false) => {
    const s = session.current;
    const run = ++s.finishing;
    const stale = () => !s.alive || s.closed || s.finishing !== run;
    s.cursor = s.view.items.length;
    update({ busy: true, step: { kind: "working" } });
    await Promise.all(s.held.values());
    if (stale()) return;
    // A follow-up came in while waiting: it is asked before anything is shown.
    if (s.cursor < s.view.items.length) { show(s.cursor); return; }
    const o = current.current;
    const role = findScored(o.cv, o.roleId)?.item;
    if (!role) return;
    if (retry) for (const [id, task] of [...s.held]) if ((await task) === "error") hold(id, false);
    // Nothing left to ask, but earlier answers are saved with the role: they are used now.
    const fromEarlier = (s.spent || s.view.items.length === 0) && role.notes.length > 0;
    // The role's answers (tools, people, scale) belong in its lines too: the weak lines not asked about are rewritten with them in view.
    if (s.view.answered > 0 || fromEarlier) {
      const grades = new Map(s.result?.bullets.map((b) => [b.id, b.score]));
      // An answer about the whole role (a tool, the team, the scale) may belong in any line that is not complete yet.
      const upTo = s.roleAnswered ? 100 : CLEAR_AT;
      for (const b of role.bullets) if (b.text.trim() !== "" && !s.held.has(b.id) && (grades.get(b.id) ?? 0) < upTo) hold(b.id, false);
    }
    let added: { id: string; text: string }[] = [];
    let description = "";
    let failed = false;
    const dump = s.thin && s.view.answered > 0
      ? saved((_, print) => brainDump({ roleId: o.roleId, fingerprint: print, source: "answers" })).then((a) => { added = a?.proposals ?? []; }).catch(() => { failed = true; })
      : null;
    // A description the role already has is only written again when this run brought answers: no answers, no reason to reword it.
    const marks = s.result?.coverage?.marks;
    const contextMissing = fromEarlier && !!marks && (marks.company !== "shown" || marks.purpose !== "shown");
    const describe = s.described || (role.description.trim() !== "" && s.view.answered === 0 && !contextMissing) ? null
      : saved((_, print) => roleDescription({ roleId: o.roleId, fingerprint: print })).then((a) => { description = a?.text ?? ""; s.described = true; }).catch(() => { failed = true; });
    await Promise.all([dump, describe, ...s.held.values()]);
    if (stale()) return;
    if (s.cursor < s.view.items.length) { show(s.cursor); return; }
    const now = findScored(current.current.cv, o.roleId)?.item;
    if (!now) return;
    const changes: Change[] = [];
    if (description && squash(description) !== squash(now.description)) changes.push({ id: "description", kind: "description", before: now.description, after: description });
    for (const b of now.bullets) {
      const held = await s.held.get(b.id);
      if (held === "error") failed = true;
      else if (held && held !== "none" && squash(held.text) !== squash(b.text)) changes.push({ id: `bullet:${b.id}`, kind: "bullet", bulletId: b.id, before: b.text, after: held.text });
    }
    for (const p of added) changes.push({ id: `new:${p.id}`, kind: "new", before: "", after: p.text });
    if (stale()) return;
    if (changes.length) update({ busy: false, step: { kind: "approve", changes } });
    else if (failed) update({ busy: false, step: { kind: "failed" } });
    else toDone(0);
  }, [hold, saved, show, toDone, update]);

  const next = useCallback(() => {
    const s = session.current;
    if (s.cursor + 1 < s.view.items.length) show(s.cursor + 1);
    else void finish();
  }, [finish, show]);

  /** The owner's rule: once "Tell us about…" is answered, the questions are asked for again with that answer in view. */
  const afterBox = useCallback(async () => {
    const s = session.current;
    update({ busy: true, step: { kind: "thinking" } });
    let fresh: RoleResult | undefined;
    try {
      fresh = await saved((_, print) => {
        const o = current.current;
        return o.focus ? scoreRole(o.roleId, print, true, o.focus) : scoreRole(o.roleId, print, true);
      });
    } catch { /* The questions it already had stay. */ }
    if (!s.alive || s.closed) return;
    const o = current.current;
    const role = findScored(o.cv, o.roleId)?.item;
    if (fresh && role && fresh.fingerprint === fingerprint(role, o.cv.locale)) {
      s.result = fresh;
      const box = s.view.items.filter((item) => item.kind === "box");
      update(splitRun([...box, ...buildRun(fresh, { thin: false, answered: s.asked })]));
    }
    next();
  }, [next, saved, update]);

  // The new score did not come: after 15 seconds the last screen stops waiting for it.
  const waitingForScore = view.step.kind === "done" && view.applied > 0 && !view.timedOut;
  useEffect(() => {
    if (!waitingForScore) return;
    const timer = setTimeout(() => update({ timedOut: true }), 15000);
    return () => clearTimeout(timer);
  }, [waitingForScore, update]);

  // The role was removed while its run was open.
  useEffect(() => {
    const o = current.current;
    if (!findScored(opts.cv, opts.roleId) && !session.current.closed) {
      session.current.closed = true;
      o.onClose();
    }
  }, [opts.cv, opts.roleId]);

  const role = findScored(opts.cv, opts.roleId)?.item;
  const print = role ? fingerprint(role, opts.cv.locale) : "";
  const entry = opts.scores.get(opts.roleId);
  const arrived = entry?.state === "ready" && entry.result?.fingerprint === print ? entry.result : undefined;
  const done = view.step.kind === "done";
  // The newest score after the run: for the changed text, or the one the run asked for itself.
  const newest = !done ? undefined : view.applied > 0 ? (arrived && print !== session.current.printAtOpen ? arrived : undefined)
    : view.own ?? (arrived && arrived.score !== view.before ? arrived : undefined);
  const waiting = done && !newest && (view.applied > 0 ? !view.timedOut : view.answered > 0 && !view.rescored);
  const more = done ? remaining(role, newest ?? (view.applied === 0 ? session.current.result : undefined), view.rest, session.current.asked, session.current.changed) : [];
  const result = newest ?? (done && view.applied > 0 ? undefined : session.current.result);
  const available = () => !session.current.view.busy && !session.current.closed;
  const shown = view.step.kind === "question" ? view.items[view.step.index] : undefined;

  return {
    step: view.step, items: view.items, ready: view.ready, busy: view.busy,
    /** The score to explain: the one the run opened with, or the newest once the role is done. */
    result,
    before: view.before, after: newest?.score ?? null, waiting, applied: view.applied, answered: view.answered,
    /** How many questions still wait after this run. */
    more: more.length,
    /** The answer given earlier to the question on screen (after Back), or "". */
    prefill: shown ? view.answers[shown.key]?.text ?? "" : "",
    canBack: view.step.kind === "question" && view.step.index > 0,
    start() {
      if (!available() || session.current.view.step.kind !== "start" || !session.current.view.ready) return;
      if (session.current.view.items.length) show(0);
      else void finish();
    },
    answer(text: string, via: Via[]) {
      const s = session.current;
      const step = s.view.step;
      if (!available() || step.kind !== "question") return;
      const item = s.view.items[step.index];
      const value = text.trim().slice(0, MAX_LONG_TEXT);
      if (!item || !value) return;
      const o = current.current;
      const earlier = s.view.answers[item.key];
      const noteId = earlier?.noteId ?? newId();
      s.notesChanged = true;
      o.dispatch({ type: "setNote", roleId: o.roleId, note: {
        id: noteId, question: itemQuestion(item), answer: value, via: via.length ? via : ["type"], askedAt: new Date().toISOString(),
      } });
      update({ answers: { ...s.view.answers, [item.key]: { noteId, text: value } }, answered: s.view.answered + 1 });
      // An answer about a line: its rewrite is prepared now and held. Only a first answer can bring a follow-up.
      if (item.kind === "role") s.roleAnswered = true;
      if (item.kind === "line") hold(item.question.bulletId, !item.followUp);
      // An answer changed after Back: the rewrites already held were written with the old one, so they are made again.
      else if (earlier && earlier.text !== value) for (const id of [...s.held.keys()]) hold(id, false);
      if (item.kind === "box" && !s.boxRescored) {
        s.boxRescored = true;
        void afterBox();
      } else next();
    },
    skip() {
      if (available() && session.current.view.step.kind === "question") next();
    },
    back() {
      const step = session.current.view.step;
      if (available() && step.kind === "question" && step.index > 0) show(step.index - 1);
    },
    /** "Looks good": every piece listed (with its final text) goes into the CV; the ones left out stay as they were. */
    apply(decisions: { id: string; text: string }[]) {
      const s = session.current;
      const step = s.view.step;
      if (!available() || step.kind !== "approve") return;
      const o = current.current;
      const now = findScored(o.cv, o.roleId)?.item;
      if (!now) return;
      const texts = new Map(decisions.map((d) => [d.id, d.text.trim()]));
      const fresh: string[] = [];
      let applied = 0;
      for (const change of step.changes) {
        const text = texts.get(change.id);
        if (!text) continue;
        if (change.kind === "description") {
          const list = roleListOf(o.cv, o.roleId);
          if (!list || squash(text) === squash(now.description)) continue;
          o.dispatch({ type: "setItemField", list, itemId: o.roleId, field: "description", value: text.slice(0, MAX_LONG_TEXT) });
          applied++;
        } else if (change.kind === "bullet") {
          const bullet = now.bullets.find((b) => b.id === change.bulletId);
          if (!bullet || squash(text) === squash(bullet.text)) continue;
          o.dispatch({ type: "replaceBullet", roleId: o.roleId, bulletId: change.bulletId, text: text.slice(0, MAX_TEXT) });
          s.changed.add(change.bulletId);
          applied++;
        } else fresh.push(text.slice(0, MAX_TEXT));
      }
      if (fresh.length) {
        o.dispatch({ type: "addBullets", roleId: o.roleId, texts: fresh });
        applied += fresh.length;
      }
      toDone(applied);
    },
    /** The changes could not be prepared: try once more. */
    retry() {
      if (available() && session.current.view.step.kind === "failed") void finish(true);
    },
    /** …or leave them: the answers are saved. */
    giveUp() {
      if (available() && session.current.view.step.kind === "failed") toDone(0);
    },
    /** "A few more questions": another run for the same role, from what is still open. */
    moreQuestions() {
      const s = session.current;
      if (!available() || s.view.step.kind !== "done" || more.length === 0) return;
      s.result = newest ?? s.result;
      s.printAtOpen = print;
      s.thin = isThin(role, newest ?? s.result);
      s.held = new Map();
      s.tokens = new Map();
      s.changed = new Set();
      s.roleAnswered = false;
      s.finishing++;
      update({ ...splitRun(more), answers: {}, before: newest?.score ?? s.view.before, applied: 0, answered: 0, own: null, rescored: false, timedOut: false });
      show(0);
    },
    /** Works at any point (✕ / Esc): every await re-checks `closed`. `then` replaces going back to the CV ("Next role"). */
    close(then?: () => void) {
      const s = session.current;
      if (s.closed) return;
      const o = current.current;
      s.closed = true;
      // role-facts reads the saved notes, so it waits for the last answer to be saved.
      if (s.notesChanged) void o.waitForSave().then(() => roleFacts(o.roleId)).then(({ facts, fromNotes }) => {
        const now = findScored(current.current.cv, o.roleId)?.item;
        if (now && notesHash(now.notes) === fromNotes) o.dispatch({
          type: "setFacts", roleId: o.roleId, facts: { items: facts, fromNotes, updatedAt: new Date().toISOString() },
        });
      }).catch(() => undefined);
      (then ?? o.onClose)();
    },
  };
}
