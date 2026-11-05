import { useCallback, useEffect, useRef, useState } from "react";
import { CvContentSchema, MAX_CV_BYTES, type CvContent, type CvResponse, type SaveResponse } from "@resumora/shared";
import { ApiClientError } from "../lib/api-error.ts";
import { setUnsavedChanges } from "./unsaved.ts";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict" | "invalid";
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
 * - Content that can never be saved as-is (fails the schema, too large, or the server says
 *   400/413) → status "invalid" with a readable `problem`; not retried until the next edit.
 * - Any other failure → status "error", retried after 5 s.
 */
export function useAutosave({ initial, save, load, delayMs = 1000 }: Options) {
  const [content, setContentState] = useState(initial.content);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

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
  const reportConflict = useCallback((current: Conflict) => {
    clearTimeout(timer.current);
    paused.current = true;
    setConflict(current);
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
    const invalid = checkContent(sending, version.current);
    if (invalid) {
      setProblem(invalid);
      setStatus("invalid");
      return;
    }
    saving.current = true;
    setStatus("saving");
    try {
      const res = await saveRef.current(sending, version.current);
      version.current = res.version;
      lastSaved.current = sending;
      saving.current = false;
      setProblem(null);
      if (latest.current !== sending) return flush(); // edited while saving
      setStatus("saved");
    } catch (err) {
      saving.current = false;
      if (isConflict(err)) {
        reportConflict(conflictFrom(err));
      } else if (err instanceof ApiClientError && (err.status === 400 || err.status === 413)) {
        setProblem(err.message);
        setStatus("invalid");
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
    setProblem(null);
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
    setUnsavedChanges(status !== "saved");
    return () => setUnsavedChanges(false);
  }, [status]);

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

  return { content, setContent, status, conflict, problem, loadLatest, keepMine, reset, reportConflict, currentVersion };
}

export function isConflict(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && err.code === "version_conflict";
}

/** Returns a readable problem if this content can never be saved as-is, else null. */
function checkContent(content: CvContent, version: number): string | null {
  const parsed = CvContentSchema.safeParse(content);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `${issue?.path.join(".") ?? "CV"}: ${issue?.message ?? "invalid"}`;
  }
  const bytes = new TextEncoder().encode(JSON.stringify({ content, version })).length;
  return bytes > MAX_CV_BYTES ? "This CV is too large to save (limit 256 KB)." : null;
}

export function conflictFrom(err: ApiClientError): Conflict {
  const current = (err.body as { current?: Partial<Conflict> } | null)?.current;
  return {
    version: typeof current?.version === "number" ? current.version : 0,
    updatedAt: typeof current?.updatedAt === "string" ? current.updatedAt : "",
  };
}
