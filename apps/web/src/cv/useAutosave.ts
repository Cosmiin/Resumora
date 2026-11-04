import { useCallback, useEffect, useRef, useState } from "react";
import type { CvContent, CvResponse, SaveResponse } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";
export type Conflict = { version: number; updatedAt: string };

const RETRY_MS = 5000;

type Options = {
  initial: CvResponse;
  save(content: CvContent, version: number): Promise<SaveResponse>;
  load(): Promise<CvResponse>;
  delayMs?: number;
};

/**
 * Autosave for one CV. Rules (kept deliberately simple):
 * - One save `delayMs` after the last change.
 * - At most one save in flight. Changes made during a save are saved right after it,
 *   using the version that save returned — so a tab never conflicts with itself.
 * - 409 → status "conflict"; autosave stops until the user picks loadLatest() or keepMine().
 * - Any other failure → status "error", retried after 5 s.
 */
export function useAutosave({ initial, save, load, delayMs = 1000 }: Options) {
  const [content, setContentState] = useState(initial.content);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<Conflict | null>(null);

  const latest = useRef(initial.content); // what the user sees now
  const lastSaved = useRef<CvContent | null>(initial.content); // what the server has (null = unknown)
  const version = useRef(initial.version); // server version `lastSaved` belongs to
  const saving = useRef(false);
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  const loadRef = useRef(load);
  useEffect(() => {
    saveRef.current = save;
    loadRef.current = load;
  });

  /** Stop autosaving and show the conflict choice (from our own save or a restore). */
  const reportConflict = useCallback((err: ApiClientError) => {
    clearTimeout(timer.current);
    paused.current = true;
    setConflict(readConflict(err.body));
    setStatus("conflict");
  }, []);

  const flush = useCallback(async function flush(): Promise<void> {
    clearTimeout(timer.current);
    if (saving.current || paused.current) return;
    if (latest.current === lastSaved.current) {
      setStatus("saved");
      return;
    }
    const sending = latest.current;
    saving.current = true;
    setStatus("saving");
    try {
      const res = await saveRef.current(sending, version.current);
      version.current = res.version;
      lastSaved.current = sending;
      saving.current = false;
      if (latest.current !== sending) return flush(); // edited while saving
      setStatus("saved");
    } catch (err) {
      saving.current = false;
      if (isConflict(err)) {
        reportConflict(err);
      } else {
        setStatus("error");
        timer.current = setTimeout(flush, RETRY_MS);
      }
    }
  }, [reportConflict]);

  const setContent = useCallback(
    (next: CvContent) => {
      latest.current = next;
      setContentState(next);
      if (paused.current) return;
      if (!saving.current) setStatus("dirty");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  /** Replace local state with a CV the server just gave us (load latest, after restore). */
  const reset = useCallback((fresh: CvResponse) => {
    clearTimeout(timer.current);
    latest.current = lastSaved.current = fresh.content;
    version.current = fresh.version;
    paused.current = false;
    setContentState(fresh.content);
    setConflict(null);
    setStatus("saved");
  }, []);

  const loadLatest = useCallback(async () => reset(await loadRef.current()), [reset]);

  const keepMine = useCallback(async () => {
    if (conflict) version.current = conflict.version;
    lastSaved.current = null; // server content differs from ours: force a save
    paused.current = false;
    setConflict(null);
    await flush();
  }, [conflict, flush]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (status === "saved") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const currentVersion = useCallback(() => version.current, []);

  return { content, setContent, status, conflict, loadLatest, keepMine, reset, reportConflict, currentVersion };
}

export function isConflict(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && err.code === "version_conflict";
}

function readConflict(body: unknown): Conflict {
  const current = (body as { current?: Partial<Conflict> } | null)?.current;
  return {
    version: typeof current?.version === "number" ? current.version : 0,
    updatedAt: typeof current?.updatedAt === "string" ? current.updatedAt : "",
  };
}
