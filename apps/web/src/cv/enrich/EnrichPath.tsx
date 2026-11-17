import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BRAIN_DUMP_QUESTION, CLEAR_AT, PATH_BUDGET, gradedItems, newId, pickBudget, questionKey,
  type BudgetItem, type CvContent, type Note, type RoleResult,
} from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import type { CvAction } from "../edit/cvReducer.ts";
import { roleListOf } from "../edit/lists.ts";
import type { Via } from "./AnswerBox.tsx";
import { BudgetStep } from "./BudgetStep.tsx";
import { CompaniesStep } from "./CompaniesStep.tsx";
import { changeActions, prepareRoleChanges } from "./prepare.ts";
import { ReviewSheet, type ReviewGroup } from "./ReviewSheet.tsx";
import { PathScreen } from "./SectionSuggest.tsx";
import { ToolsStep } from "./ToolsStep.tsx";
import type { RoleScoreState } from "./useRoleScores.ts";

type Props = {
  cv: CvContent;
  dispatch(a: CvAction): void;
  scores: Map<string, RoleScoreState>;
  waitForSave(): Promise<void>;
  onClose(): void;
  /** Kept for the editor's call; the short path asks for no score itself. */
  onScore?(result: RoleResult): void;
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
/** A score is still on its way (or not loaded yet): the start and the end wait for it. */
const pending = (s: RoleScoreState | undefined) => !s || s.state === "scoring" || s.state === "previous";

type Stage =
  | { kind: "start" } | { kind: "companies" } | { kind: "tools" } | { kind: "budget"; items: BudgetItem[] }
  | { kind: "preparing" } | { kind: "review"; groups: ReviewGroup[]; failed: boolean } | { kind: "end" };

/** What a role got in this round of the path. */
type Got = { lines: Set<string>; role: boolean; context: boolean };

/** The end waits this long for the new scores, then shows what it has. */
const END_WAIT_MS = 20000;

/**
 * The short enrichment path (owner, 17 Nov 2026): the CV's score, then four steps whatever the number of roles —
 * what each company does, the tools per role, the questions worth the most across the CV, one review sheet — then
 * the score again. Answers are saved as role notes as they are given; nothing else on the CV changes before
 * "Apply all". The score is shown only at the start and the end.
 */
export function EnrichPath({ cv, dispatch, scores, waitForSave, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "start" });
  const [before, setBefore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  // Questions already asked in this path (earlier rounds), and what each role got in the current round.
  const asked = useRef(new Set<string>());
  const got = useRef(new Map<string, Got>());
  const latest = useRef(cv);
  useEffect(() => { latest.current = cv; });

  const graded = gradedItems(cv);
  const weights = strengthWeights(cv);
  const settled = graded.every(({ item }) => !pending(scores.get(item.id)));
  const average = averageScore(new Map(graded.map(({ item }) => [item.id, scoreOf(scores.get(item.id))])), weights);

  const gotFor = (roleId: string) => {
    const entry = got.current.get(roleId) ?? { lines: new Set<string>(), role: false, context: false };
    got.current.set(roleId, entry);
    return entry;
  };
  const save = (roleId: string, question: string, answer: string, via: Via[]) => {
    const note: Note = { id: newId(), question, answer, via: via.length ? via : ["type"], askedAt: new Date().toISOString() };
    dispatch({ type: "setNote", roleId, note });
  };
  const budget = (): BudgetItem[] => {
    const known = new Set([...asked.current, ...latest.current.experience.concat(latest.current.volunteering).flatMap((r) => r.notes.map((n) => questionKey(n.question)))]);
    return pickBudget({
      items: gradedItems(latest.current).map(({ item }) => ({ id: item.id, result: scores.get(item.id)?.state === "ready" ? scores.get(item.id)?.result : undefined })),
      weights: strengthWeights(latest.current), asked: known, size: PATH_BUDGET,
    });
  };
  const toBudget = () => {
    const items = budget();
    for (const item of items) asked.current.add(questionKey(item.question.text));
    if (items.length) setStage({ kind: "budget", items });
    else void prepare();
  };

  /** Every role's changes, from what it got in this round and its weak lines. */
  const prepare = async () => {
    setStage({ kind: "preparing" });
    await waitForSave().catch(() => undefined);
    const now = latest.current;
    const groups: ReviewGroup[] = [];
    let failed = false;
    for (const { item } of gradedItems(now)) {
      const entry = scores.get(item.id);
      const result = entry?.state === "ready" ? entry.result : undefined;
      const g = got.current.get(item.id);
      const any = !!g && (g.role || g.context || g.lines.size > 0);
      const weak = (result?.bullets ?? []).some((b) => b.score < CLEAR_AT);
      if (!any && !weak) continue;
      const describe = any && (g!.context || item.description.trim() !== "");
      const answeredRole = !!g && (g.role || g.context);
      const out = await prepareRoleChanges({
        cv: now, roleId: item.id, result, answeredLines: g?.lines ?? new Set(), answeredRole,
        thinWithAnswers: !!result?.thin && answeredRole, describe,
      });
      failed ||= out.failed;
      if (!out.changes.length) continue;
      // A line rewritten with nothing new about it or its role: worded better, no new facts.
      const tidied = new Set(out.changes.filter((c) => c.kind === "bullet" && !answeredRole && !g?.lines.has(c.bulletId)).map((c) => c.id));
      groups.push({ roleId: item.id, changes: out.changes, tidied });
    }
    setStage({ kind: "review", groups, failed });
  };

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

  const screen = (children: ReactNode) => <PathScreen context={t("enrich.path.dialog")} onClose={onClose}>{children}</PathScreen>;

  if (stage.kind === "start") {
    return screen(
      <div className="rr-card">
        <p className="rr-where">{t("enrich.path.dialog")}</p>
        <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>{average === null ? t("enrich.path.v2.noScore") : t("enrich.path.v2.score", { n: average })}</h2>
        <p className="rr-lead" role="status">{settled ? t("enrich.path.v2.lead", { k: PATH_BUDGET }) : t("enrich.path.v2.checking")}</p>
        <div className="rr-actions">
          <button type="button" className="fm-btn" disabled={!settled} onClick={() => {
            setBefore(average);
            got.current = new Map();
            setStage({ kind: "companies" });
          }}>{t("enrich.run.start")}</button>
          <button type="button" className="ui-btn" onClick={onClose}>{t("enrich.path.notNow")}</button>
        </div>
      </div>,
    );
  }
  if (stage.kind === "companies") {
    return screen(
      <CompaniesStep cv={cv} onDone={(notes) => {
        for (const { roleId, note } of notes) {
          dispatch({ type: "setNote", roleId, note });
          gotFor(roleId).context = true;
        }
        setStage({ kind: "tools" });
      }} />,
    );
  }
  if (stage.kind === "tools") {
    return screen(
      <ToolsStep cv={cv} onDone={(notes) => {
        for (const { roleId, note } of notes) {
          dispatch({ type: "setNote", roleId, note });
          gotFor(roleId).role = true;
        }
        void waitForSave().catch(() => undefined).then(toBudget);
      }} />,
    );
  }
  if (stage.kind === "budget") {
    return screen(
      <BudgetStep cv={cv} items={stage.items}
        onAnswer={(item, text, via) => {
          save(item.roleId, item.question.text, text, via);
          const g = gotFor(item.roleId);
          if (item.kind === "line") g.lines.add(item.question.bulletId);
          else if (item.question.topic === "purpose") g.context = true;
          else g.role = true;
        }}
        onTalk={(roleId, text, via) => {
          save(roleId, BRAIN_DUMP_QUESTION, text, via);
          gotFor(roleId).role = true;
        }}
        onDone={() => void prepare()} />,
    );
  }
  if (stage.kind === "preparing") {
    return screen(
      <div className="fm-working" role="status">
        <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
        <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.path.v2.preparing")}</h2>
      </div>,
    );
  }
  if (stage.kind === "review") {
    return screen(
      <>
        {stage.failed && <p className="ui-notice ui-notice--bad" role="alert">{t("enrich.path.v2.someFailed")}</p>}
        <ReviewSheet cv={cv} groups={stage.groups} busy={busy} onApply={(decisions) => {
          setBusy(true);
          const now = latest.current;
          for (const group of stage.groups) {
            const list = roleListOf(now, group.roleId);
            if (!list) continue;
            const mine = decisions.filter((d) => d.roleId === group.roleId);
            for (const action of changeActions(now, group.roleId, list, group.changes, mine).actions) dispatch(action);
          }
          setBusy(false);
          setStage({ kind: "end" });
        }} />
      </>,
    );
  }

  // The end: the score before and after, then Done or another round.
  const waiting = !settled && !timedOut;
  const more = waiting ? [] : budget();
  return screen(
    <div className="rr-card">
      <p className="rr-where">{t("enrich.path.dialog")}</p>
      {waiting ? (
        <div className="fm-working" role="status">
          <span className="fm-dots" aria-hidden="true"><i /><i /><i /></span>
          <h2 className="fm-q" id="fm-step-title" tabIndex={-1}>{t("enrich.end.checking")}</h2>
        </div>
      ) : (
        <h2 className="rr-num" id="fm-step-title" tabIndex={-1}>
          {before !== null && average !== null && before !== average ? t("enrich.path.v2.moved", { from: before, to: average })
            : average === null ? t("enrich.path.v2.noScore") : t("enrich.path.v2.score", { n: average })}
        </h2>
      )}
      <div className="rr-actions">
        <button type="button" className="fm-btn" onClick={onClose}>{t("enrich.path.v2.done")}</button>
        {more.length > 0 && (
          <button type="button" className="ui-btn" onClick={() => {
            got.current = new Map();
            setBefore(average);
            toBudget();
          }}>{more.length === 1 ? t("enrich.path.moreOne") : t("enrich.path.more", { n: more.length })}</button>
        )}
      </div>
    </div>,
  );
}
