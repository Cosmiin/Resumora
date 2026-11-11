import type { Proposal, Steering, TailorQuestion, TailorSection } from "@resumora/shared";
import type { Draft } from "./QuestionCard.tsx";

/** Where the tailoring flow stands; each kind is one screen. */
export type Phase =
  | { kind: "loading" }
  /** Before tailoring starts: the language check, then the keywords. */
  | { kind: "lang" }
  | { kind: "keywords"; busy: boolean }
  /** The optional tone and extra questions. `resume`: changing them on a started run; going back returns there. */
  | { kind: "steer"; busy: boolean; resume?: Phase }
  | { kind: "confirm"; steering: Steering; busy: boolean; resume: Phase }
  /** Going back (BackA): a finished step, a finished role's answers, a redone role's review. */
  | { kind: "back"; section: TailorSection; resume: Phase }
  | { kind: "role"; roleId: string; busy: boolean; resume: Phase }
  | { kind: "redo"; roleId: string; proposals: Proposal[]; removed?: number; busy: boolean; resume: Phase }
  | { kind: "asking" }
  /** Answers stay here, one per question (undefined = not reached yet), until the step's last question. */
  | { kind: "questions"; questions: TailorQuestion[]; index: number; answers: (Draft | undefined)[] }
  | { kind: "working" }
  | { kind: "review"; proposals: Proposal[]; busy: boolean; removed?: number }
  /** After the last step: the finish screen. */
  | { kind: "done" }
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
