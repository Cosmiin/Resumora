import type { TailorRun } from "@resumora/shared";
import { remembered } from "./flow-phase.ts";
import { getRun } from "./tailor-api.ts";

/**
 * The unfinished tailoring run this browser remembers for the job, or null: nothing remembered, the run is gone
 * or done, or it has no step to go back to. (The flow forgets a run when it is done.)
 */
export async function fetchOpenRun(jobId: string): Promise<TailorRun | null> {
  const stored = remembered(jobId);
  const run = stored ? await getRun(stored).catch(() => null) : null;
  return run && run.status !== "done" && run.currentSection ? run : null;
}
