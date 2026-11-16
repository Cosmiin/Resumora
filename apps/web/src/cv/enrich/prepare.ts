import { CLEAR_AT, MAX_LONG_TEXT, MAX_TEXT, findScored, fingerprint, type CvContent, type RoleResult } from "@resumora/shared";
import type { CvAction } from "../edit/cvReducer.ts";
import type { RoleList } from "../edit/lists.ts";
import { brainDump, improveBullet, roleDescription } from "./enrich-api.ts";

/** One piece of the role that the answers changed: its description, one of its bullets, or a new bullet. */
export type Change =
  | { id: string; kind: "description"; before: string; after: string }
  | { id: string; kind: "bullet"; bulletId: string; before: string; after: string }
  | { id: string; kind: "new"; before: ""; after: string };

const squash = (text: string) => text.trim().replace(/\s+/g, " ");

/** At most this many requests at once while a CV's changes are prepared. */
const PARALLEL = 3;

async function limited<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]!();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, tasks.length) }, worker));
  return out;
}

/**
 * The changes for one role of the saved CV (the short path's review sheet): a rewrite for every line answered about
 * and every other line below CLEAR_AT (or every line below 100 when the role got an answer about the whole role, as in
 * a role's own run), new lines from the answers of a thin role, and a description when asked. The CV must be saved
 * before this is called. `failed` is true when any call failed; the changes that did come are kept.
 */
export async function prepareRoleChanges(input: {
  cv: CvContent; roleId: string; result: RoleResult | undefined;
  answeredLines: ReadonlySet<string>; answeredRole: boolean; thinWithAnswers: boolean; describe: boolean;
}): Promise<{ changes: Change[]; failed: boolean }> {
  const role = findScored(input.cv, input.roleId)?.item;
  if (!role) return { changes: [], failed: false };
  const print = fingerprint(role, input.cv.locale);
  const grades = new Map(input.result?.bullets.map((b) => [b.id, b.score]));
  const upTo = input.answeredRole ? 100 : CLEAR_AT;
  const lines = role.bullets.filter((b) => b.text.trim() !== "" && (input.answeredLines.has(b.id) || (grades.get(b.id) ?? 0) < upTo));
  let failed = false;
  const fail = () => { failed = true; return undefined; };

  const rewrites = limited(lines.map((b) => () => improveBullet({ roleId: role.id, bulletId: b.id, fingerprint: print })
    .then((a) => ("proposal" in a ? a.proposal.text : undefined)).catch(fail)));
  const added = input.thinWithAnswers
    ? brainDump({ roleId: role.id, fingerprint: print, source: "answers" }).then((a) => a.proposals).catch(() => fail() ?? [])
    : Promise.resolve([]);
  const description = input.describe
    ? roleDescription({ roleId: role.id, fingerprint: print }).then((a) => a.text).catch(() => fail() ?? "")
    : Promise.resolve("");
  const [texts, fresh, written] = await Promise.all([rewrites, added, description]);

  const changes: Change[] = [];
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
