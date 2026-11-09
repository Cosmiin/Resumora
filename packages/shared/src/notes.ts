import { MAX_JOB_NOTES, MAX_NOTES, type CvContent, type Experience, type Note } from "./cv.ts";

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
  const all = [...new Map([...carried, ...own].map((note) => [note.id, note])).values()];
  const newest = [...all].sort((a, b) => Date.parse(b.askedAt) - Date.parse(a.askedAt));
  const keep = new Set([
    ...newest.filter((note) => note.jobId === undefined).slice(0, MAX_NOTES),
    ...newest.filter((note) => note.jobId !== undefined).slice(0, MAX_JOB_NOTES),
  ]);
  return all.filter((n) => keep.has(n));
}

/**
 * Copies the notes and facts of each current role onto the incoming role with the same company and title
 * (trimmed, lowercased, spaces collapsed). A role that matches more than one role on either
 * side is skipped. Incoming notes win on equal ids; the newest notes of each kind are kept.
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

/** Restores notes and newer facts from the current CV when applying a saved version. */
export function mergeNewerNotes(target: CvContent, current: CvContent): CvContent {
  const result = { ...target };
  // Roles, projects and volunteering all carry notes and facts.
  const currentRoles = new Map<string, Experience>(
    [...current.experience, ...current.projects, ...current.volunteering].map((role) => [role.id, role]),
  );
  const withNewer = <T extends Experience>(list: T[]): T[] => list.map((role) => {
    const latest = currentRoles.get(role.id);
    if (!latest) return role;
    const facts = latest.facts && (!role.facts ||
      Date.parse(latest.facts.updatedAt) > Date.parse(role.facts.updatedAt))
      ? latest.facts : role.facts;
    return { ...role, notes: merge(role.notes, latest.notes), facts };
  });
  result.experience = withNewer(target.experience);
  result.projects = withNewer(target.projects);
  result.volunteering = withNewer(target.volunteering);
  return result;
}

/** Compares CV content while ignoring every role's notes and facts. */
export function onlyNotesDiffer(a: CvContent, b: CvContent): boolean {
  const comparable = (content: CvContent) => JSON.stringify({
    ...content,
    experience: content.experience.map((role) => ({ ...role, notes: undefined, facts: undefined })),
    volunteering: content.volunteering.map((role) => ({ ...role, notes: undefined, facts: undefined })),
    projects: content.projects.map((role) => ({ ...role, notes: undefined, facts: undefined })),
  }, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
  return comparable(a) === comparable(b);
}
