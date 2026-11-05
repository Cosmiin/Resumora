import { MAX_NOTES, type CvContent, type Note } from "./cv.ts";

function key(company: string, title: string): string {
  const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return `${clean(company)}\u0000${clean(title)}`;
}

/** Unique keys only: a company and title that appear on more than one role match nothing. */
function uniqueRoles<T extends { company: string; title: string }>(roles: T[]): Map<string, T> {
  const seen = new Map<string, T[]>();
  for (const role of roles) {
    const k = key(role.company, role.title);
    seen.set(k, [...(seen.get(k) ?? []), role]);
  }
  const unique = new Map<string, T>();
  for (const [k, list] of seen) if (list.length === 1) unique.set(k, list[0]!);
  return unique;
}

function merge(carried: Note[], own: Note[]): Note[] {
  const ownIds = new Set(own.map((n) => n.id));
  const all = [...carried.filter((n) => !ownIds.has(n.id)), ...own];
  if (all.length <= MAX_NOTES) return all;
  const keep = new Set(
    [...all].sort((a, b) => (a.askedAt < b.askedAt ? 1 : a.askedAt > b.askedAt ? -1 : 0)).slice(0, MAX_NOTES),
  );
  return all.filter((n) => keep.has(n));
}

/**
 * Copies the notes and facts of each current role onto the incoming role with the same company and title
 * (trimmed, lowercased, spaces collapsed). A role that matches more than one role on either
 * side is skipped. Incoming notes win on equal ids; at most MAX_NOTES are kept, newest first.
 */
export function carryNotes(current: CvContent, incoming: CvContent): CvContent {
  const before = uniqueRoles(current.experience);
  const after = uniqueRoles(incoming.experience);
  return {
    ...incoming,
    experience: incoming.experience.map((role) => {
      const k = key(role.company, role.title);
      const old = before.get(k);
      if (!old || after.get(k) !== role) return role;
      return { ...role, notes: merge(old.notes, role.notes), facts: role.facts ?? old.facts };
    }),
  };
}
