import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fingerprint, gradedItems, type CvContent, type Experience, type Locale, type RoleResult } from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import type { SaveStatus } from "../useAutosave.ts";
import { getLanguage } from "../../i18n/language.ts";
import { getScores, scoreAhead, scoreRole } from "./enrich-api.ts";

/** A stored score is current when it is for this text and its questions are in the language the person uses now. */
function isCurrent(result: RoleResult | undefined, print: string): result is RoleResult {
  return result?.fingerprint === print && (result.questionLanguage ?? getLanguage()) === getLanguage();
}

/** Wait this long after a save before asking for scores, so typing never races a request. */
export const RESCORE_DELAY_MS = 2000;

/**
 * none: the role has no bullets to score. scoring: a score is on its way.
 * ready: the score matches the text. previous: the score is for older text.
 * unavailable: the last request failed; any older score stays in `result`.
 */
export type RoleScoreState = {
  state: "none" | "scoring" | "ready" | "previous" | "unavailable";
  result?: RoleResult;
};

/** An import that is read but not used yet: its roles are scored ahead, so the scores are there when it is used. */
export type Ahead = { importId: string; cv: CvContent };

type Props = { cv: CvContent; status: SaveStatus; ahead?: Ahead | null };

const prints = new WeakMap<Experience, { locale: Locale; value: string }>();
/** Roles are replaced, never changed in place, so a role's fingerprint is worked out once. */
function printOf(role: Experience, locale: Locale): string {
  const known = prints.get(role);
  if (known && known.locale === locale) return known.value;
  const value = fingerprint(role, locale);
  prints.set(role, { locale, value });
  return value;
}

const hasBullets = (r: Experience) => r.bullets.some((b) => b.text.trim() !== "");

function sameEntry(a: RoleScoreState | undefined, b: RoleScoreState): boolean {
  return !!a && a.state === b.state && a.result === b.result;
}

export function useRoleScores({ cv, status, ahead = null }: Props): {
  scores: Map<string, RoleScoreState>;
  retry(roleId: string): void;
  /** Takes a score asked for elsewhere (a role's run), so every place shows the same number. */
  put(result: RoleResult): void;
  /** Each role's score for the import not used yet (null: nothing to score), once every one of them is in; null until then. */
  aheadScores?: ReadonlyMap<string, number | null> | null;
} {
  const { locale } = cv;
  // Roles and volunteering are scored, in that order (one list, kept stable between renders). Projects are not.
  const experience = useMemo(() => gradedItems(cv).map((s) => s.item), [cv.experience, cv.volunteering]); // eslint-disable-line react-hooks/exhaustive-deps
  const aheadItems = useMemo(() => (ahead ? gradedItems(ahead.cv).map((s) => s.item) : []), [ahead]);
  /** Import roles already asked for (`importId/roleId`): each is asked once; after a failure the saved CV's turn comes. */
  const asked = useRef(new Set<string>());
  const [loaded, setLoaded] = useState(false);
  const [results, setResults] = useState<ReadonlyMap<string, RoleResult>>(new Map());
  const [inFlight, setInFlight] = useState<{ roleId: string; fingerprint: string } | null>(null);
  /** Roles whose last request failed, with the fingerprint that failed. */
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(new Map());
  /** Roles the server called "not saved": left alone until the next save. */
  const waiting = useRef(new Set<string>());
  const [round, setRound] = useState(0);
  const quiet = useRef(false);
  const alive = useRef(false);
  const loadStarted = useRef(false);
  const busy = useRef(false);
  /** The roles as they are now, for answers that come back after the text moved on. */
  const current = useRef({ experience, locale, aheadItems });
  useEffect(() => {
    current.current = { experience, locale, aheadItems };
  });

  useEffect(() => {
    alive.current = true;
    if (!loadStarted.current) {
      loadStarted.current = true;
      getScores()
        .then((items) => {
          if (alive.current) setResults(new Map(items.map((r) => [r.roleId, r])));
        })
        .catch(() => undefined) // scoring still works without the saved scores
        .finally(() => {
          if (alive.current) setLoaded(true);
        });
    }
    return () => {
      alive.current = false;
    };
  }, []);

  // Leaving "saved" restarts the 2 s quiet time; coming back to "saved" lets waiting roles try again.
  useEffect(() => {
    if (status === "saved") {
      waiting.current.clear();
      setRound((n) => n + 1);
    } else quiet.current = false;
  }, [status]);

  const request = useCallback(async (roleId: string, print: string, importId?: string) => {
    busy.current = true;
    setInFlight({ roleId, fingerprint: print });
    try {
      const result = await (importId ? scoreAhead(importId, roleId, print) : scoreRole(roleId, print));
      if (!alive.current) return;
      // The import may have become the CV while this was on its way: the role is then one of the CV's.
      const { experience: now, aheadItems: coming } = current.current;
      if (now.some((r) => r.id === roleId) || coming.some((r) => r.id === roleId)) setResults((m) => new Map(m).set(roleId, result));
      setFailed((m) => (m.has(roleId) ? new Map([...m].filter(([k]) => k !== roleId)) : m));
    } catch (err) {
      if (!alive.current) return;
      // Scoring ahead is a head start only: a failure shows nowhere, and the role is asked again once it is saved.
      if (importId) return;
      if (err instanceof ApiClientError && err.status === 409) {
        // Park the role until the next save only if its text is still what was sent. If it moved on,
        // that newer text may already be saved, and no other save would come to wake it up.
        const now = current.current.experience.find((r) => r.id === roleId);
        if (now && printOf(now, current.current.locale) === print) waiting.current.add(roleId);
      } else setFailed((m) => new Map(m).set(roleId, print)); // 502, 503 and anything else
    } finally {
      busy.current = false;
      if (alive.current) {
        setInFlight(null);
        setRound((n) => n + 1);
      }
    }
  }, []);

  // One request at a time: the first role whose score is missing or out of date.
  // The saved CV's roles come first; then the roles of an import not used yet, with no wait (nobody is typing in it).
  useEffect(() => {
    if (!loaded || busy.current) return;
    const next = status !== "saved" ? undefined : experience.find((r) => {
      if (!hasBullets(r) || waiting.current.has(r.id)) return false;
      const print = printOf(r, locale);
      return !isCurrent(results.get(r.id), print) && failed.get(r.id) !== print;
    });
    if (!next) {
      if (!ahead) return;
      const key = (r: Experience) => `${ahead.importId}/${r.id}`;
      const coming = aheadItems.find((r) => hasBullets(r) && !asked.current.has(key(r)) && !isCurrent(results.get(r.id), printOf(r, ahead.cv.locale)));
      if (!coming) return;
      asked.current.add(key(coming));
      // The rest carry on without the 2 s wait once the import is used.
      quiet.current = true;
      void request(coming.id, printOf(coming, ahead.cv.locale), ahead.importId);
      return;
    }
    const go = () => {
      quiet.current = true;
      void request(next.id, printOf(next, locale));
    };
    if (quiet.current) {
      go();
      return;
    }
    const timer = setTimeout(go, RESCORE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, status, experience, locale, results, failed, round, request, ahead, aheadItems]);

  const retry = useCallback((roleId: string) => {
    waiting.current.delete(roleId);
    setFailed((m) => (m.has(roleId) ? new Map([...m].filter(([k]) => k !== roleId)) : m));
  }, []);

  const put = useCallback((result: RoleResult) => {
    if (current.current.experience.some((r) => r.id === result.roleId)) setResults((m) => new Map(m).set(result.roleId, result));
  }, []);

  const last = useRef<Map<string, RoleScoreState>>(new Map());
  return {
    scores: useMemo(() => {
      const next = new Map<string, RoleScoreState>();
      for (const role of experience) {
        const print = printOf(role, locale);
        const result = results.get(role.id);
        let entry: RoleScoreState;
        if (!hasBullets(role) || (isCurrent(result, print) && result.score === null)) entry = { state: "none" };
        else if (inFlight?.roleId === role.id && inFlight.fingerprint === print) entry = { state: "scoring", result };
        else if (failed.get(role.id) === print) entry = { state: "unavailable", result };
        else if (isCurrent(result, print)) entry = { state: "ready", result };
        else if (result) entry = { state: "previous", result };
        else entry = { state: "scoring" };
        const old = last.current.get(role.id);
        next.set(role.id, sameEntry(old, entry) ? old! : entry);
      }
      // Same entries as before: hand back the same Map, so nothing downstream re-renders.
      const prev = last.current;
      const same = prev.size === next.size && [...next].every(([id, e]) => prev.get(id) === e);
      if (!same) last.current = next;
      return last.current;
    }, [experience, locale, results, failed, inFlight]),
    retry,
    put,
    aheadScores: useMemo(() => {
      if (!ahead) return null;
      const out = new Map<string, number | null>();
      for (const role of aheadItems) {
        const result = results.get(role.id);
        if (!hasBullets(role)) out.set(role.id, null);
        else if (isCurrent(result, printOf(role, ahead.cv.locale))) out.set(role.id, result.score);
        else return null;
      }
      return out;
    }, [ahead, aheadItems, results]),
  };
}
