import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fingerprint, type CvContent, type Experience, type Locale, type RoleResult } from "@resumora/shared";
import { ApiClientError } from "../../lib/api-error.ts";
import type { SaveStatus } from "../useAutosave.ts";
import { getScores, scoreRole } from "./enrich-api.ts";

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

type Props = { cv: CvContent; status: SaveStatus };

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

export function useRoleScores({ cv, status }: Props): {
  scores: Map<string, RoleScoreState>;
  retry(roleId: string): void;
} {
  const { experience, locale } = cv;
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
  const roleIds = useRef(new Set<string>());
  useEffect(() => {
    roleIds.current = new Set(experience.map((r) => r.id));
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

  const request = useCallback(async (roleId: string, print: string) => {
    busy.current = true;
    setInFlight({ roleId, fingerprint: print });
    try {
      const result = await scoreRole(roleId, print);
      if (!alive.current) return;
      if (roleIds.current.has(roleId)) setResults((m) => new Map(m).set(roleId, result));
      setFailed((m) => (m.has(roleId) ? new Map([...m].filter(([k]) => k !== roleId)) : m));
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiClientError && err.status === 409) waiting.current.add(roleId);
      else setFailed((m) => new Map(m).set(roleId, print)); // 502, 503 and anything else
    } finally {
      busy.current = false;
      if (alive.current) {
        setInFlight(null);
        setRound((n) => n + 1);
      }
    }
  }, []);

  // One request at a time: the first role whose score is missing or out of date.
  useEffect(() => {
    if (!loaded || status !== "saved" || busy.current) return;
    const next = experience.find((r) => {
      if (!hasBullets(r) || waiting.current.has(r.id)) return false;
      const print = printOf(r, locale);
      return results.get(r.id)?.fingerprint !== print && failed.get(r.id) !== print;
    });
    if (!next) return;
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
  }, [loaded, status, experience, locale, results, failed, round, request]);

  const retry = useCallback((roleId: string) => {
    waiting.current.delete(roleId);
    setFailed((m) => (m.has(roleId) ? new Map([...m].filter(([k]) => k !== roleId)) : m));
  }, []);

  const last = useRef<Map<string, RoleScoreState>>(new Map());
  return {
    scores: useMemo(() => {
      const next = new Map<string, RoleScoreState>();
      for (const role of experience) {
        const print = printOf(role, locale);
        const result = results.get(role.id);
        let entry: RoleScoreState;
        if (!hasBullets(role) || (result?.fingerprint === print && result.score === null)) entry = { state: "none" };
        else if (inFlight?.roleId === role.id && inFlight.fingerprint === print) entry = { state: "scoring", result };
        else if (failed.get(role.id) === print) entry = { state: "unavailable", result };
        else if (result?.fingerprint === print) entry = { state: "ready", result };
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
  };
}
