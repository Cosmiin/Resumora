import { useEffect, useRef, useState } from "react";
import {
  CONCISE_CHARS, fingerprint, gradedItems, needsShape, strongestFirst,
  type Change, type CvContent, type Experience, type ShapeAnswer,
} from "@resumora/shared";
import { t } from "../../i18n/t.ts";
import { proposeShape } from "./enrich-api.ts";
import type { RoleScoreState } from "./useRoleScores.ts";

type Merge = ShapeAnswer["merges"][number];
type Decision = { state: "open" | "merge" | "separate"; text: string; editing: boolean };
type Card = { role: Experience; merges: Merge[]; top: string | null };
export type ShapeDone = { roleId: string; changes: Change[] }[];

/** Shape calls at once. */
const AT_ONCE = 4;
const LIMIT = CONCISE_CHARS.partial;

/** Every graded item with a score, whether it may have lines to merge, and the line to move to the top. */
function candidates(cv: CvContent, scores: ReadonlyMap<string, RoleScoreState>) {
  return gradedItems(cv).flatMap(({ item }) => {
    const s = scores.get(item.id);
    if (s?.state !== "ready" || !s.result) return [];
    return [{ role: item, ask: needsShape(item, s.result), top: strongestFirst(item, s.result) }];
  });
}

/** True when some role may have lines to merge or a line to move: otherwise the path skips Shape. */
export function hasShapeWork(cv: CvContent, scores: ReadonlyMap<string, RoleScoreState>): boolean {
  return candidates(cv, scores).some((c) => c.ask || c.top !== null);
}

async function inTurns<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));
  return out;
}

const keyOf = (roleId: string, merge: Merge) => `${roleId}|${merge.ids[0]}`;
const valid = (text: string) => text.trim() !== "" && text.trim().length <= LIMIT;

/**
 * A role's Shape changes: each merge not kept separate becomes its merged text on its first line plus the removal of
 * the others, then the strongest line goes first (unless Keep order). A strongest line merged away is moved as its
 * merged line.
 */
function changesFor(card: Card, decisions: ReadonlyMap<string, Decision>, keepOrder: boolean): Change[] {
  const changes: Change[] = [];
  const mergedInto = new Map<string, string>();
  for (const merge of card.merges) {
    const d = decisions.get(keyOf(card.role.id, merge));
    if (!d || d.state === "separate") continue;
    const [first, ...rest] = merge.ids;
    changes.push({ id: `merge:${first}`, kind: "bullet", bulletId: first!, text: d.text.trim() });
    for (const id of rest) changes.push({ id: `remove:${id}`, kind: "remove", bulletId: id });
    for (const id of merge.ids) mergedInto.set(id, first!);
  }
  if (card.top && !keepOrder) changes.push({ id: "order", kind: "order", ids: [mergedInto.get(card.top) ?? card.top] });
  return changes;
}

/**
 * The path's Shape step (score/9): for each role, the lines that describe the same work, merged into one if the person
 * agrees (Merge / Edit / Keep separate, or Merge all), and the line with the clearest result moved to the top unless
 * they keep the order. With no merge anywhere the screen is not shown: the moves are handed on as they are. Nothing is
 * changed here: `onDone` gets each role's change list.
 */
export function ShapeStep({ cv, scores, onDone }: { cv: CvContent; scores: Map<string, RoleScoreState>; onDone(changes: ShapeDone): void }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [decisions, setDecisions] = useState(new Map<string, Decision>());
  const [kept, setKept] = useState(new Set<string>());
  const [sent, setSent] = useState(false);
  const sentRef = useRef(false);

  useEffect(() => {
    let live = true;
    const list = candidates(cv, scores);
    void inTurns(list, async (c): Promise<Card> => {
      const merges = c.ask
        ? await proposeShape({ roleId: c.role.id, fingerprint: fingerprint(c.role, cv.locale) }).then((a) => a.merges).catch(() => [])
        : [];
      return { role: c.role, merges, top: c.top };
    }).then((all) => {
      if (!live) return;
      const shown = all.filter((c) => c.merges.length > 0 || c.top !== null);
      setDecisions(new Map(shown.flatMap((c) => c.merges.map((m) => [keyOf(c.role.id, m), { state: "open", text: m.text, editing: false } as Decision]))));
      setCards(shown);
    });
    return () => { live = false; };
    // Asked once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (list: ShapeDone) => {
    if (sentRef.current) return;
    sentRef.current = true;
    setSent(true);
    onDone(list);
  };
  // Nothing to merge or move anywhere: on to the next step.
  const empty = cards !== null && cards.length === 0;
  // Nothing to merge, only a line to move to the top: that needs no screen (owner, 27 Nov 2026). The move is made.
  const onlyMoves = cards !== null && cards.length > 0 && cards.every((c) => c.merges.length === 0);
  useEffect(() => {
    if (empty) finish([]);
    else if (onlyMoves) finish(cards.map((card) => ({ roleId: card.role.id, changes: changesFor(card, new Map(), false) })).filter((r) => r.changes.length > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty, onlyMoves]);

  const set = (key: string, change: Partial<Decision>) =>
    setDecisions((all) => new Map(all).set(key, { ...all.get(key)!, ...change }));
  const open = [...decisions.values()].some((d) => d.state === "open");

  const confirm = () => {
    // Merge all: every merge still open is merged as proposed.
    const final = new Map([...decisions].map(([k, d]) => [k, d.state === "open" ? { ...d, state: "merge" as const } : d]));
    finish((cards ?? []).map((card) => ({ roleId: card.role.id, changes: changesFor(card, final, kept.has(card.role.id)) }))
      .filter((r) => r.changes.length > 0));
  };

  const textOf = (card: Card, id: string) => {
    const merge = card.merges.find((m) => m.ids.includes(id));
    const d = merge && decisions.get(keyOf(card.role.id, merge));
    if (d && d.state !== "separate") return d.text;
    return card.role.bullets.find((b) => b.id === id)?.text ?? "";
  };

  return (
    <>
      <p className="fm-eyebrow">{t("enrich.path.step", { n: 1, total: 4 })} · {t("enrich.path.shape.name")}</p>
      <h2 className="rr-big" id="fm-step-title" tabIndex={-1}>{t("enrich.path.shape.title")}</h2>
      <p className="rr-lead">{t("enrich.path.shape.lead")}</p>
      {cards === null && <p className="fm-note" role="status">{t("enrich.path.shape.loading")}</p>}
      {cards !== null && !onlyMoves && (
        <div className="ep-rows">
          {cards.map((card) => {
            const titleId = `sh-role-${card.role.id}`;
            return (
              <section key={card.role.id} className="ep-row" aria-labelledby={titleId}>
                <h3 className="ep-row-title" id={titleId}>{[card.role.title, card.role.company].filter(Boolean).join(" · ")}</h3>
                {card.merges.map((merge) => {
                  const key = keyOf(card.role.id, merge);
                  const d = decisions.get(key)!;
                  const groupId = `sh-${key.replace(/[^a-zA-Z0-9]+/g, "-")}`;
                  const ok = valid(d.text);
                  return (
                    <div key={key} className={`sh-merge${d.state === "separate" ? " is-separate" : ""}`} role="group" aria-labelledby={groupId}>
                      <p className="sh-label" id={groupId}>{t("enrich.path.shape.group", { n: merge.ids.length })}</p>
                      <ul className="sh-lines">
                        {merge.ids.map((id) => <li key={id}>{card.role.bullets.find((b) => b.id === id)?.text}</li>)}
                      </ul>
                      <p className="sh-label">{t("enrich.path.shape.merged")}</p>
                      {d.editing ? (
                        <>
                          <textarea className="ep-input" rows={3} value={d.text} aria-label={t("enrich.path.shape.merged")}
                            aria-invalid={!ok} onChange={(e) => set(key, { text: e.target.value })} />
                          {!ok && d.text.trim() !== "" && <p className="sh-error" role="alert">{t("enrich.path.shape.tooLong", { n: LIMIT })}</p>}
                        </>
                      ) : (
                        <p className="sh-merged">{d.text}</p>
                      )}
                      <div className="sh-actions">
                        <button type="button" className="ui-btn" aria-pressed={d.state === "merge"} disabled={!ok || sent}
                          onClick={() => set(key, { state: "merge", editing: false, text: d.text.trim() })}>{t("enrich.path.shape.merge")}</button>
                        {!d.editing && (
                          <button type="button" className="ui-btn" disabled={sent} onClick={() => set(key, { editing: true })}>{t("enrich.path.shape.edit")}</button>
                        )}
                        <button type="button" className="ui-btn" aria-pressed={d.state === "separate"} disabled={sent}
                          onClick={() => set(key, { state: "separate", editing: false, text: ok ? d.text : merge.text })}>{t("enrich.path.shape.separate")}</button>
                      </div>
                    </div>
                  );
                })}
                {card.top !== null && (
                  <div className="sh-top">
                    <p><strong>{t("enrich.path.shape.top")}</strong> <span>{textOf(card, card.top)}</span></p>
                    <button type="button" className="ui-btn" aria-pressed={kept.has(card.role.id)} disabled={sent}
                      onClick={() => setKept((all) => {
                        const next = new Set(all);
                        if (!next.delete(card.role.id)) next.add(card.role.id);
                        return next;
                      })}>{t("enrich.path.shape.keepOrder")}</button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <div className="fm-foot">
        <button type="button" className="fm-btn" disabled={cards === null || sent || [...decisions.values()].some((d) => d.editing && !valid(d.text))}
          onClick={confirm}>{open ? t("enrich.path.shape.mergeAll") : t("enrich.path.shape.continue")}</button>
      </div>
    </>
  );
}
