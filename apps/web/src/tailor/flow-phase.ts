import type { Steering, TailorQuestion } from "@resumora/shared";

/** Where the tailoring flow stands; each kind is one screen. */
export type Phase =
  | { kind: "loading" }
  /** While the job is compared with the CV to find what to ask. */
  | { kind: "asking" }
  /** The optional tone and extra questions of a started run. `resume`: where going back returns. */
  | { kind: "steer"; busy: boolean; resume: Phase }
  | { kind: "confirm"; steering: Steering; busy: boolean; resume: Phase }
  /** The one questions screen. `resume`: the final page it was opened from, to change the answers of a finished run. */
  | { kind: "questions"; questions: TailorQuestion[]; busy: boolean; resume?: Phase }
  /** The one wait: how many of the CV's parts are written. */
  | { kind: "working"; done: number; total: number }
  /** The final page. `failed`: the parts that could not be tailored, by name. */
  | { kind: "done"; failed: string[] }
  | { kind: "error"; message: string; retry(): void }
  | { kind: "deleted" };

const storageKey = (jobId: string) => `resumora.tailorRun.${jobId}`;
export function remember(jobId: string, runId: string | null) {
  try {
    if (runId) localStorage.setItem(storageKey(jobId), runId);
    else localStorage.removeItem(storageKey(jobId));
  } catch { /* storage is a convenience: the start route returns the job's open run anyway */ }
}
export function remembered(jobId: string): string | null {
  try { return localStorage.getItem(storageKey(jobId)); } catch { return null; }
}
