import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BRAIN_DUMP_QUESTION, CLEAR_AT, MAX_LONG_TEXT, PATH_BUDGET, findGraded, fingerprint, gradedItems, newId, pickBudget, questionKey,
  type BudgetItem, type Change, type CvContent, type HeldAsk, type Note, type RoleResult,
} from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { ApiClientError } from "../../lib/api-error.ts";
import { Skeleton } from "../../ui/Page.tsx";
import { formatRange } from "../page/blocks.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import type { Via } from "./AnswerBox.tsx";
import { BudgetStep } from "./BudgetStep.tsx";
import { CompaniesStep } from "./CompaniesStep.tsx";
import { EndStep, type HeldChange } from "./EndStep.tsx";
import { FactsStep } from "./FactsStep.tsx";
import { PrepRing, type PrepRow } from "./PrepRing.tsx";
import { checkChanges, getSkillSuggestions, placeAnswersOnCv, reportFailure, type SkillSuggestion } from "./enrich-api.ts";
import { PATH_PARALLEL, createLimiter, prepareRoleChanges, toChanges, type Limiter } from "./prepare.ts";
import type { Prepared } from "./prepared.ts";
import { ScoreRows } from "./ScoreRows.tsx";
import { PathScreen } from "./SectionSuggest.tsx";
import { ShapeStep, hasShapeWork, type ShapeDone } from "./ShapeStep.tsx";
import { ToolsStep } from "./ToolsStep.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  scores: Map<string, RoleScoreState>;
  waitForSave(): Promise<void>;
  onClose(): void;
  /** Puts a predicted score (after Shape, after preparing) in place at once, so no score call is needed after saving. */
  onScore?(result: RoleResult): void;
  /** The companies and tools answers asked for while the import was on screen, when the path opens from one. */
  prepared?: Prepared | null;
  /**
   * Opened from an import, whose screen already showed the score and the way in (owner, 27 Nov 2026): no start screen.
   * The first step shows as soon as every role is scored.
   */
  autoStart?: boolean;
};

/** A CV whose weighted average reaches this is saved as enriched. */
export const ENRICHED_AVERAGE = 80;

/** A role counts as strong at 80. One still being scored (or with no score) is below. */
export const ENRICHED_AT = 80;
export function belowTarget(s: RoleScoreState | undefined): boolean {
  return !(s?.state === "ready" && s.result?.score != null && s.result.score >= ENRICHED_AT);
}

/**
 * The CV's strength: the average of every score given (roles and volunteering with a score; projects have none), rounded;
 * null when none has one. With weights, a recent role counts more than the rest.
 */
export function averageScore(scores: ReadonlyMap<string, number | null>, weights?: ReadonlyMap<string, number>): number | null {
  let sum = 0;
  let total = 0;
  for (const [id, n] of scores) {
    if (n === null) continue;
    const w = weights?.get(id) ?? 1;
    sum += n * w;
    total += w;
  }
  return total ? Math.round(sum / total) : null;
}

/** How much each role counts in the CV's strength: the most recent role 3 times, the one before it twice, the rest once. */
export function strengthWeights(cv: Pick<CvContent, "experience">): ReadonlyMap<string, number> {
  return new Map(cv.experience.map((role, i) => [role.id, i === 0 ? 3 : i === 1 ? 2 : 1]));
}
const scoreOf = (s: RoleScoreState | undefined) => (s && s.state !== "none" ? (s.result?.score ?? null) : null);
/** A role's company and period, the line under its title on the start and end screens. */
export function roleMeta(item: { company: string; startDate: string; endDate: string; current: boolean }, locale: CvContent["locale"]): string {
  return [item.company, formatRange(item.startDate, item.endDate, item.current, locale)].filter(Boolean).join(" · ");
}
/** A score is still on its way (or not loaded yet): the start and the end wait for it. */
const pending = (s: RoleScoreState | undefined) => !s || s.state === "scoring" || s.state === "previous";

type Stage =
  | { kind: "start" } | { kind: "shape" } | { kind: "shaping" } | { kind: "companies" } | { kind: "tools" } | { kind: "budget"; items: BudgetItem[] }
  | { kind: "preparing" } | { kind: "facts"; items: HeldChange[]; failed: boolean } | { kind: "placing" }
  | { kind: "end"; held: HeldChange[]; failed: boolean };

/**
 * What a role got in this round of the path. lines: line questions answered; role: a budget question about the whole
 * role or "Rather just talk?" (its lines up to 100 may be rewritten); context: what the company does or the role was for
 * (a new description); facts: any note at all from this round (company, tools, answers); questions: the questions of
 * this round's notes, whose facts must end up on the page.
 */
type Got = { lines: Set<string>; role: boolean; context: boolean; facts: boolean; questions: Set<string> };

/**
 * A role's changes with the facts placed from its answers: a line change replaces the role's own change for that line
 * (or the text of a line it adds), a description replaces its description; the rest is added.
 */
function withPlaced(changes: readonly Change[], placed: readonly Change[]): Change[] {
  const out = [...changes];
  for (const c of placed) {
    const i = c.kind === "bullet" ? out.findIndex((x) => (x.kind === "bullet" && x.bulletId === c.bulletId) || (x.kind === "new" && x.id === c.bulletId))
      : c.kind === "description" ? out.findIndex((x) => x.kind === "description") : -1;
    const own = out[i];
    if (!own || (c.kind !== "bullet" && c.kind !== "description")) out.push(c);
    else if (own.kind === "new") out[i] = { ...own, text: c.text };
    else out[i] = { ...c, id: own.id };
  }
  return out;
}

/** The end waits this long for the new scores, then shows what it has. */
const END_WAIT_MS = 20000;

/**
 * The short enrichment path (owner, 17 Nov 2026; score/9 on 19 Nov): the CV's score, then Shape (merges the person
 * confirms), what each company does, the tools per role, the questions worth the most across the CV, each role
 * prepared as soon as it has its answers and put straight on the CV, and the end with the score again. A change that would lower a role's
 * score is held and shown at the end with Add anyway. Answers are saved as role notes as they are given.
 */
export function EnrichPath({ cv, dispatch, scores, waitForSave, onClose, onScore, prepared, autoStart = false }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  const [before, setBefore] = useState<number | null>(null);
  const [rolesBefore, setRolesBefore] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [rows, setRows] = useState<PrepRow[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  // The skills the roles show, asked for at the end of each round; a round number keeps an older answer off a newer end.
  const [skills, setSkills] = useState<readonly SkillSuggestion[] | null>(null);
  const round = useRef(0);
  // Questions already asked in this path (earlier rounds), and what each role got in the current round.
  const asked = useRef(new Set<string>());
  const got = useRef(new Map<string, Got>());
  const latest = useRef(cv);
  const latestScores = useRef(scores);
  const endShown = useRef(false);
  useEffect(() => { latest.current = cv; latestScores.current = scores; });
  // Shape's merges are checked and put on the CV while the companies and tools are answered; the questions wait for it.
  const [shapeBusy, setShapeBusy] = useState(false);

  const graded = gradedItems(cv);
  const weights = strengthWeights(cv);
  const settled = graded.every(({ item }) => !pending(scores.get(item.id)));
  const average = averageScore(new Map(graded.map(({ item }) => [item.id, scoreOf(scores.get(item.id))])), weights);

  const gotFor = (roleId: string, question: string) => {
    const entry = got.current.get(roleId) ?? { lines: new Set<string>(), role: false, context: false, facts: false, questions: new Set<string>() };
    entry.facts = true;
    entry.questions.add(question);
    got.current.set(roleId, entry);
    return entry;
  };
  // Answering the same screen again (after Back) replaces its note, as in a role's own run. One slot per screen of
  // this round: two lines with the same wording keep two notes, and a new round starts with new notes.
  const noteIds = useRef(new Map<string, string>());
  const save = (slot: string, roleId: string, question: string, answer: string, via: Via[]) => {
    const id = noteIds.current.get(slot) ?? newId();
    noteIds.current.set(slot, id);
    const note: Note = { id, question, answer: answer.trim().slice(0, MAX_LONG_TEXT), via: via.length ? via : ["type"], askedAt: new Date().toISOString() };
    dispatch({ type: "setNote", roleId, note });
  };
  const budget = (): BudgetItem[] => {
    const known = new Set([...asked.current, ...latest.current.experience.concat(latest.current.volunteering).flatMap((r) => r.notes.map((n) => questionKey(n.question)))]);
    return pickBudget({
      items: gradedItems(latest.current).map(({ item }) => {
        const entry = latestScores.current.get(item.id);
        return { id: item.id, result: entry?.state === "ready" ? entry.result : undefined };
      }),
      weights: strengthWeights(latest.current), asked: known, size: PATH_BUDGET,
    });
  };
  const toBudget = () => {
    noteIds.current = new Map();
    newRound();
    const items = budget();
    for (const item of items) asked.current.add(questionKey(item.question.text));
    if (!items.length) return void finishRound();
    setStage({ kind: "budget", items });
    // A role with no question this round already has all it will get: it is prepared while the questions are answered.
    const asking = new Set(items.map((item) => item.roleId));
    for (const { item } of gradedItems(latest.current)) if (!asking.has(item.id)) void prepareRole(item.id);
  };

  /** The scores before a round, for the end screen. */
  const markBefore = () => {
    setBefore(average);
    setRolesBefore(new Map(graded.map(({ item }) => [item.id, scoreOf(scores.get(item.id))])));
  };

  /**
   * This round's preparing: one limit for the whole CV, each role's task once it has started, and what came of them.
   * A role is prepared as soon as it has everything it will get this round (owner, 27 Nov 2026): one with no question
   * when the questions start, one with questions when the person leaves it, the rest when the questions end. So the
   * wait at the end is only for what is still running.
   */
  const prep = useRef<{ limit: Limiter; tasks: Map<string, Promise<void>>; held: HeldChange[]; failed: boolean }>(
    { limit: createLimiter(PATH_PARALLEL), tasks: new Map(), held: [], failed: false });
  const newRound = () => {
    prep.current = { limit: createLimiter(PATH_PARALLEL), tasks: new Map(), held: [], failed: false };
    setRows([]);
  };

  /**
   * One role, once per round: its changes from what it got in this round and its weak lines, then the facts its answers
   * still lack placed on the page, then the check (what would lower the score held, the new score predicted), then
   * straight onto the CV. A failed check leaves that role as it is; an outdated one (409) puts its changes on the CV
   * without a prediction, and the normal score runs. A role with no answer and no weak line is left alone.
   */
  const prepareRole = (roleId: string): Promise<void> => {
    const p = prep.current;
    const started = p.tasks.get(roleId);
    if (started) return started;
    const scoreNow = () => {
      const entry = latestScores.current.get(roleId);
      return entry?.state === "ready" ? entry.result : undefined;
    };
    const g = got.current.get(roleId);
    const first = findGraded(latest.current, roleId)?.item;
    const weak = (scoreNow()?.bullets ?? []).some((b) => b.score < CLEAR_AT);
    if (!first || !((g?.facts ?? false) || weak)) {
      const nothing = Promise.resolve();
      p.tasks.set(roleId, nothing);
      return nothing;
    }
    setRows((all) => [...all, { id: roleId, name: [first.title, first.company].filter(Boolean).join(" · "), answers: g?.questions.size ?? 0, state: "working" }]);
    const task = (async () => {
      // The server reads the role's answers from the saved CV.
      await waitForSave().catch(() => undefined);
      const now = latest.current;
      const item = findGraded(now, roleId)?.item;
      // This role failed somewhere: its piece of the ring turns red. The end screen still says some changes failed.
      let roleFailed = false;
      if (item) {
        const result = scoreNow();
        const describe = !!g && g.facts && (g.context || item.description.trim() !== "");
        const answeredRole = !!g && g.role;
        const out = await prepareRoleChanges({
          cv: now, roleId, result, answeredLines: g?.lines ?? new Set(), answeredRole,
          thinWithAnswers: !!result?.thin && answeredRole, describe, limit: p.limit,
        });
        roleFailed = out.failed;
        const print = fingerprint(item, now.locale);
        let changes = toChanges(out.changes);
        const questions = [...(g?.questions ?? [])].slice(0, 20);
        if (questions.length) {
          const placed = await p.limit(() => placeAnswersOnCv({ roleId, fingerprint: print, changes, questions }))
            .then((a) => a.changes).catch((err: unknown) => { roleFailed = true; reportFailure("use-answers", roleId, err); return []; });
          changes = withPlaced(changes, placed);
        }
        if (changes.length) {
          try {
            const answer = await p.limit(() => checkChanges({ roleId, fingerprint: print, changes, hold: true }));
            const kept = changes.filter((c) => answer.kept.includes(c.id));
            if (kept.length) dispatch({ type: "applyRoleChanges", roleId, changes: kept });
            onScore?.(answer.result);
            p.held.push(...answer.held.map((change) => ({
              roleId, change, ask: answer.asks.find((a) => a.changeId === change.id), better: answer.better.find((b) => b.changeId === change.id)?.text,
            })));
          } catch (err) {
            if (err instanceof ApiClientError && err.status === 409) dispatch({ type: "applyRoleChanges", roleId, changes });
            else { roleFailed = true; reportFailure("check-changes", roleId, err); }
          }
        }
      }
      p.failed ||= roleFailed;
      if (prep.current === p) setRows((all) => all.map((r) => (r.id === roleId ? { ...r, state: roleFailed ? "failed" : "done" } : r)));
    })();
    p.tasks.set(roleId, task);
    return task;
  };

  /** The questions are over (or there were none): every role not started yet is prepared, then the round ends. */
  const finishRound = async () => {
    // A new round: its end waits for its own scores.
    endShown.current = false;
    setTimedOut(false);
    const mine = ++round.current;
    setSkills(null);
    setStage({ kind: "preparing" });
    const p = prep.current;
    for (const { item } of gradedItems(latest.current)) void prepareRole(item.id);
    await Promise.all(p.tasks.values());
    // Every held line comes before the scores (owner, 25 Nov 2026): its question, its better version, or the line itself.
    facts.current = { chain: Promise.resolve(), failed: [] };
    setStage(p.held.length ? { kind: "facts", items: p.held, failed: p.failed } : { kind: "end", held: [], failed: p.failed });
    // The server reads the saved CV, so this round's lines are saved first. A failure shows no block (owner's call 5).
    void waitForSave().catch(() => undefined).then(() => getSkillSuggestions())
      .then((answer) => { if (round.current === mine) setSkills(answer.suggestions); })
      .catch(() => undefined);
  };

  /**
   * Shape's merges and reorders, per role: checked first (only the merged lines graded, nothing held), then put on the
   * CV, then the predicted score put in place. A failed or outdated check still puts them on the CV; the normal score
   * runs. The companies screen shows at once (owner, 27 Nov 2026): the check runs behind it, and only the questions,
   * which are picked from the new scores, wait for it.
   */
  const shaped = (list: ShapeDone) => {
    setStage({ kind: "companies" });
    if (!list.length) return;
    setShapeBusy(true);
    void (async () => {
      await waitForSave().catch(() => undefined);
      const now = latest.current;
      await Promise.all(list.map(async ({ roleId, changes }) => {
        const item = findGraded(now, roleId)?.item;
        if (!item) return;
        const result = await checkChanges({ roleId, fingerprint: fingerprint(item, now.locale), changes, hold: false })
          .then((a) => a.result).catch(() => undefined);
        dispatch({ type: "applyRoleChanges", roleId, changes });
        if (result) onScore?.(result);
      }));
      setShapeBusy(false);
    })();
  };
  // The tools are done but Shape's check is not: the questions start in the render that has its scores.
  const waitingForShape = stage.kind === "shaping" && !shapeBusy;
  useEffect(() => {
    if (waitingForShape) void waitForSave().catch(() => undefined).then(toBudget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForShape]);

  /**
   * A held line one fact away (score/12): the answer is saved as a role note like any other, then placed on that line
   * (use-answers), checked without holding (the person chose to add it) and put on the CV with its predicted score.
   * Throws when any step fails.
   */
  const placeFact = async (roleId: string, change: Change, ask: HeldAsk, answer: string, via: Via[]) => {
    // One note per line: trying again after a failure replaces the answer instead of adding a second one.
    save(`held|${roleId}|${change.id}`, roleId, ask.text, answer, via);
    await waitForSave();
    const now = latest.current;
    const item = findGraded(now, roleId)?.item;
    if (!item) throw new Error("role not found");
    const print = fingerprint(item, now.locale);
    const placed = await placeAnswersOnCv({ roleId, fingerprint: print, changes: [change], questions: [ask.text] });
    const changes = withPlaced([change], placed.changes);
    const answerOf = await checkChanges({ roleId, fingerprint: print, changes, hold: false });
    const kept = changes.filter((c) => answerOf.kept.includes(c.id));
    if (kept.length) dispatch({ type: "applyRoleChanges", roleId, changes: kept });
    onScore?.(answerOf.result);
  };
  // The answers given before the scores, placed one after another (each reads the CV the one before saved).
  const facts = useRef<{ chain: Promise<void>; failed: HeldChange[] }>({ chain: Promise.resolve(), failed: [] });

  // The end: wait for the new scores, at most END_WAIT_MS.
  const ending = stage.kind === "end";
  useEffect(() => {
    if (!ending) return;
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), END_WAIT_MS);
    return () => clearTimeout(timer);
  }, [ending]);
  const enriched = ending && settled && (average ?? 0) >= ENRICHED_AVERAGE;
  useEffect(() => {
    if (enriched) dispatch({ type: "markEnriched", at: new Date().toISOString() });
  }, [enriched, dispatch]);

  /** Leaves the start: the scores of this round's "before", then Shape if any role needs it, else the companies. */
  const begin = () => {
    markBefore();
    got.current = new Map();
    setStage({ kind: hasShapeWork(cv, scores) ? "shape" : "companies" });
  };
  const starting = autoStart && stage.kind === "start" && settled;
  useEffect(() => {
    if (starting) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting]);

  const screen = (children: ReactNode) => <PathScreen context={t("enrich.path.dialog")} onClose={onClose}>{children}</PathScreen>;

  if (stage.kind === "start") {
    // No number until every role is checked: one made from the first few scores would move as the rest arrive.
    return screen(
      <div className="rr-card" aria-busy={!settled}>
        <p className="rr-where">{t("enrich.path.dialog")}</p>
        {settled && !autoStart ? (
          <>
            <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>{average === null ? t("enrich.path.v2.noScore") : t("enrich.path.v2.score", { n: average })}</h2>
            <p className="rr-lead" role="status">{t("enrich.path.v2.lead", { k: PATH_BUDGET })}</p>
            <ScoreRows idPrefix="ep-start" rows={graded.map(({ item }) => ({
              id: item.id, title: item.title, meta: roleMeta(item, cv.locale), now: scoreOf(scores.get(item.id)),
            }))} />
          </>
        ) : (
          <>
            <div role="status"><h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.v2.checking")}</h2></div>
            <div className="ep-reading"><Skeleton width="45%" height="30px" /><Skeleton width="70%" /><Skeleton /><Skeleton width="85%" /></div>
          </>
        )}
        <div className="rr-actions">
          {!autoStart && <button type="button" className="fm-btn" disabled={!settled} onClick={begin}>{t("enrich.run.start")}</button>}
          <button type="button" className="ui-btn" onClick={onClose}>{t("enrich.path.notNow")}</button>
        </div>
      </div>,
    );
  }
  if (stage.kind === "shape") {
    return screen(<ShapeStep cv={cv} scores={scores} onDone={shaped} />);
  }
  if (stage.kind === "shaping") {
    return screen(
      <div className="fm-working" role="status">
        <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
        <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.path.shape.saving")}</h2>
      </div>,
    );
  }
  if (stage.kind === "companies") {
    return screen(
      <CompaniesStep cv={cv} prepared={prepared?.companies} onDone={(notes) => {
        for (const { roleId, note } of notes) {
          dispatch({ type: "setNote", roleId, note });
          gotFor(roleId, note.question).context = true;
        }
        setStage({ kind: "tools" });
      }} />,
    );
  }
  if (stage.kind === "tools") {
    return screen(
      <ToolsStep cv={cv} prepared={prepared?.tools} onDone={(notes) => {
        for (const { roleId, note } of notes) {
          dispatch({ type: "setNote", roleId, note });
          gotFor(roleId, note.question);
        }
        if (shapeBusy) setStage({ kind: "shaping" });
        else void waitForSave().catch(() => undefined).then(toBudget);
      }} />,
    );
  }
  if (stage.kind === "budget") {
    return screen(
      <BudgetStep cv={cv} items={stage.items}
        onAnswer={(item, text, via) => {
          save(`${item.roleId}|${item.kind === "line" ? `line:${item.question.bulletId}` : `role:${item.question.id}`}|${questionKey(item.question.text)}`, item.roleId, item.question.text, text, via);
          const g = gotFor(item.roleId, item.question.text);
          if (item.kind === "line") g.lines.add(item.question.bulletId);
          else if (item.question.topic === "purpose") g.context = true;
          else g.role = true;
        }}
        onTalk={(roleId, text, via) => {
          save(`${roleId}|talk`, roleId, BRAIN_DUMP_QUESTION, text, via);
          gotFor(roleId, BRAIN_DUMP_QUESTION).role = true;
        }}
        onRoleDone={(roleId) => void prepareRole(roleId)}
        onDone={() => void finishRound()} />,
    );
  }
  if (stage.kind === "facts") {
    const { failed } = stage;
    return screen(
      <FactsStep cv={cv} items={stage.items}
        onUse={(h, text) => {
          // A better version (or the person's edit of it): on the CV, and the normal score runs after saving.
          facts.current.chain = facts.current.chain.then(() => dispatch({ type: "applyRoleChanges", roleId: h.roleId, changes: [{ ...h.change, text } as Change] }));
        }}
        onAnswer={(h, text, via) => {
          facts.current.chain = facts.current.chain.then(() => placeFact(h.roleId, h.change, h.ask!, text, via)).catch((err: unknown) => {
            reportFailure("held-fact", h.roleId, err);
            facts.current.failed.push(h);
          });
        }}
        onDone={() => {
          // Skipped lines stay off the CV; only an answer that failed to place waits at the end, to try again.
          setStage({ kind: "placing" });
          void facts.current.chain.then(() => setStage({ kind: "end", held: facts.current.failed, failed }));
        }} />,
    );
  }
  if (stage.kind === "placing") {
    return screen(
      <div className="fm-working" role="status">
        <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
        <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.path.prep.title")}</h2>
      </div>,
    );
  }
  if (stage.kind === "preparing") {
    return screen(
      <div className="fm-working is-ring" role="status">
        <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.path.prep.title")}</h2>
        {rows.length > 0 && <PrepRing rows={rows} />}
      </div>,
    );
  }

  // The end: the score before and after, held changes, then Done or another round.
  // Once shown, the end stays up: a line added anyway is scored again without hiding the rest.
  const waiting = !settled && !timedOut && !endShown.current;
  if (!waiting) endShown.current = true;
  if (waiting) {
    return screen(
      <div className="rr-card">
        <p className="rr-where">{t("enrich.path.dialog")}</p>
        <div className="fm-working" role="status">
          <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
          <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.end.checking")}</h2>
        </div>
      </div>,
    );
  }
  const more = budget();
  return screen(
    <EndStep cv={cv} scores={scores} before={before} rolesBefore={rolesBefore} held={stage.held} failed={stage.failed}
      onAdd={(roleId, change) => {
        // Added anyway: on the CV, and the normal score runs after saving.
        dispatch({ type: "applyRoleChanges", roleId, changes: [change] });
        setStage({ ...stage, held: stage.held.filter((h) => !(h.roleId === roleId && h.change.id === change.id)) });
      }}
      onAddWithFact={async (roleId, change, ask, answer, via) => {
        await placeFact(roleId, change, ask, answer, via);
        setStage((s) => (s.kind === "end" ? { ...s, held: s.held.filter((h) => !(h.roleId === roleId && h.change.id === change.id)) } : s));
      }}
      skills={skills}
      onAddSkills={(list) => dispatch({ type: "addSkills", skills: list.map((s) => ({ id: newId(), ...s })) })}
      onDone={onClose} more={more.length}
      onMore={() => {
        got.current = new Map();
        markBefore();
        toBudget();
      }} />,
  );
}
