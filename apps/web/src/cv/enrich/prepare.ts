import {
  CLEAR_AT, MAX_LONG_TEXT, MAX_TEXT, findScored, fingerprint, newId, type Change as PathChange, type CvContent, type RoleResult,
} from "@resumora/shared";
import type { CvAction } from "../edit/cvReducer.ts";
import type { RoleList } from "../edit/lists.ts";
import { brainDump, improveBullet, reportFailure, roleDescription } from "./enrich-api.ts";

/** One piece of the role that the answers changed: its description, one of its bullets, or a new bullet. */
export type PrepChange =
  | { id: string; kind: "description"; before: string; after: string }
  | { id: string; kind: "bullet"; bulletId: string; before: string; after: string }
  | { id: string; kind: "new"; before: ""; after: string };
/** The old name, kept for the role run and its review pieces. */
export type Change = PrepChange;

const squash = (text: string) => text.trim().replace(/\s+/g, " ");

/** At most this many line rewrites at once in a role's own run. */
const PARALLEL = 3;
/** Requests at once for the whole CV while the path prepares every role (Claude's call; tune after the real run). */
export const PATH_PARALLEL = 6;

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/** Runs tasks with at most `max` of them under way at once, in the order they were given. */
export function createLimiter(max: number): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    const run = () => {
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active--;
        waiting.shift()?.();
      });
    };
    if (active < max) run();
    else waiting.push(run);
  });
}

/** The shared change list for prepared changes (score/9). A new line gets a fresh id, never one a line may already have. */
export function toChanges(changes: readonly PrepChange[]): PathChange[] {
  return changes.map((c): PathChange => (c.kind === "description" ? { id: c.id, kind: "description", text: c.after.slice(0, MAX_LONG_TEXT) }
    : c.kind === "bullet" ? { id: c.id, kind: "bullet", bulletId: c.bulletId, text: c.after.slice(0, MAX_TEXT) }
      : { id: newId(), kind: "new", text: c.after.slice(0, MAX_TEXT) }));
}

/**
 * A role's prepared changes with the facts placed from its answers (use-answers), for a role's own run: a placed line
 * replaces the text of the role's own change for that line (or of the new line it was sent as), a placed description
 * replaces the description's; a line not changed before becomes a change, in the role's line order, before new lines.
 * `sent` is `toChanges(changes)`, as it was sent: the two lists match one to one.
 */
export function withPlacedChanges(
  changes: readonly PrepChange[], sent: readonly PathChange[], placed: readonly PathChange[],
  role: { description: string; bullets: readonly { id: string; text: string }[] },
): PrepChange[] {
  const out = [...changes];
  for (const c of placed) {
    if (c.kind === "description") {
      const i = out.findIndex((x) => x.kind === "description");
      if (i >= 0) out[i] = { ...out[i]!, after: c.text };
      else out.unshift({ id: "description", kind: "description", before: role.description, after: c.text });
    } else if (c.kind === "bullet") {
      const asNew = sent.findIndex((x) => x.kind === "new" && x.id === c.bulletId);
      const i = asNew >= 0 ? out.findIndex((x) => x.id === changes[asNew]!.id) : out.findIndex((x) => x.kind === "bullet" && x.bulletId === c.bulletId);
      const line = role.bullets.find((b) => b.id === c.bulletId);
      if (i >= 0) out[i] = { ...out[i]!, after: c.text };
      else if (line) {
        const order = role.bullets.map((b) => b.id);
        const before = out.findIndex((x) => x.kind === "new" || (x.kind === "bullet" && order.indexOf(x.bulletId) > order.indexOf(line.id)));
        out.splice(before < 0 ? out.length : before, 0, { id: `bullet:${line.id}`, kind: "bullet", bulletId: line.id, before: line.text, after: c.text });
      }
    } else if (c.kind === "new") out.push({ id: `new:${c.id}`, kind: "new", before: "", after: c.text });
  }
  return out;
}

/**
 * The changes for one role of the saved CV (the short path's preparing step): a rewrite for every line answered about
 * and every other line below CLEAR_AT (or every line below 100 when the role got an answer about the whole role, as in
 * a role's own run), new lines from the answers of a thin role, and a description when asked. The CV must be saved
 * before this is called. `failed` is true when any call failed; the changes that did come are kept. `limit` is shared
 * by every role when the whole CV is prepared at once; without it a role's line rewrites run 3 at a time, as before.
 */
export async function prepareRoleChanges(input: {
  cv: CvContent; roleId: string; result: RoleResult | undefined;
  answeredLines: ReadonlySet<string>; answeredRole: boolean; thinWithAnswers: boolean; describe: boolean; limit?: Limiter;
}): Promise<{ changes: PrepChange[]; failed: boolean }> {
  const role = findScored(input.cv, input.roleId)?.item;
  if (!role) return { changes: [], failed: false };
  const print = fingerprint(role, input.cv.locale);
  const grades = new Map(input.result?.bullets.map((b) => [b.id, b.score]));
  const upTo = input.answeredRole ? 100 : CLEAR_AT;
  const lines = role.bullets.filter((b) => b.text.trim() !== "" && (input.answeredLines.has(b.id) || (grades.get(b.id) ?? 0) < upTo));
  let failed = false;
  const fail = (step: string) => (err: unknown) => { failed = true; reportFailure(step, role.id, err); return undefined; };

  // A shared limit holds every request; a role's own run limits only its line rewrites, as before.
  const limitLines = input.limit ?? createLimiter(PARALLEL);
  const limitOther: Limiter = input.limit ?? ((task) => task());
  const rewrites = Promise.all(lines.map((b) => limitLines(() => improveBullet({ roleId: role.id, bulletId: b.id, fingerprint: print }))
    .then((a) => ("proposal" in a ? a.proposal.text : undefined)).catch(fail("improve-bullet"))));
  const added = input.thinWithAnswers
    ? limitOther(() => brainDump({ roleId: role.id, fingerprint: print, source: "answers" })).then((a) => a.proposals).catch((err) => fail("brain-dump")(err) ?? [])
    : Promise.resolve([]);
  const description = input.describe
    ? limitOther(() => roleDescription({ roleId: role.id, fingerprint: print })).then((a) => a.text).catch((err) => fail("role-description")(err) ?? "")
    : Promise.resolve("");
  const [texts, fresh, written] = await Promise.all([rewrites, added, description]);

  const changes: PrepChange[] = [];
  if (written && squash(written) !== squash(role.description)) changes.push({ id: "description", kind: "description", before: role.description, after: written });
  lines.forEach((b, i) => {
    const text = texts[i];
    if (text && squash(text) !== squash(b.text)) changes.push({ id: `bullet:${b.id}`, kind: "bullet", bulletId: b.id, before: b.text, after: text });
  });
  for (const p of fresh) changes.push({ id: `new:${p.id}`, kind: "new", before: "", after: p.text });
  return { changes, failed };
}

/**
 * What "Looks good" / "Apply all" does for one role: the description set, each line replaced, the new lines added
 * at once. A decision whose text is empty or the same as the page is left out.
 */
export function changeActions(
  cv: CvContent, roleId: string, list: RoleList, changes: readonly Change[], decisions: readonly { id: string; text: string }[],
): { actions: CvAction[]; applied: number; changedBullets: string[] } {
  const role = findScored(cv, roleId)?.item;
  if (!role) return { actions: [], applied: 0, changedBullets: [] };
  const texts = new Map(decisions.map((d) => [d.id, d.text.trim()]));
  const actions: CvAction[] = [];
  const fresh: string[] = [];
  const changedBullets: string[] = [];
  for (const change of changes) {
    const text = texts.get(change.id);
    if (!text) continue;
    if (change.kind === "description") {
      if (squash(text) === squash(role.description)) continue;
      actions.push({ type: "setItemField", list, itemId: roleId, field: "description", value: text.slice(0, MAX_LONG_TEXT) });
    } else if (change.kind === "bullet") {
      const bullet = role.bullets.find((b) => b.id === change.bulletId);
      if (!bullet || squash(text) === squash(bullet.text)) continue;
      actions.push({ type: "replaceBullet", roleId, bulletId: change.bulletId, text: text.slice(0, MAX_TEXT) });
      changedBullets.push(change.bulletId);
    } else fresh.push(text.slice(0, MAX_TEXT));
  }
  if (fresh.length) actions.push({ type: "addBullets", roleId, texts: fresh });
  return { actions, applied: actions.length - (fresh.length ? 1 : 0) + fresh.length, changedBullets };
}
