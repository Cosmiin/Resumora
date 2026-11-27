import { isRoleSection, stepOrder, type CvContent, type MatchScore, type TailorRun, type TailorSection } from "@resumora/shared";
import { ApiClientError } from "../lib/api.ts";

/** One step of a run: a section, or one role, project or volunteering role of a role section. */
export type Step = { section: TailorSection; roleId?: string };
export type Progress = { done: number; total: number };

type Api = {
  writeStep(id: string, section: TailorSection, roleId?: string): Promise<unknown>;
  finishRun(id: string): Promise<{ run: TailorRun; score: MatchScore }>;
};

/** Every step of the run but the layout one, which reads the tailored text and so is written after them. */
export function stepsOf(run: TailorRun, cv: CvContent): Step[] {
  return run.sections.filter((section) => section !== "layout").flatMap((section): Step[] =>
    (isRoleSection(section) ? stepOrder(run, cv, section).map((roleId) => ({ section, roleId })) : [{ section }]));
}

/** Nothing a second try can fix: the job was deleted, or the run's CV was replaced. The flow handles these itself. */
const fatal = (cause: unknown) => cause instanceof ApiClientError && (cause.code === "job_not_found" || cause.code === "base_cv_changed");

/**
 * The one wait of a tailoring: every step is written at the same time (a few requests at once), then the layout step,
 * then the run is finished with a single score. A step that fails is tried once more; one that fails again stays as
 * it was on the CV and is named in `failed`, and the run still finishes.
 */
export async function runAll(
  api: Api, run: TailorRun, cv: CvContent, onProgress: (progress: Progress) => void, atOnce = 6,
): Promise<{ run: TailorRun; score: MatchScore; failed: Step[] }> {
  const steps = stepsOf(run, cv);
  const layout = run.sections.includes("layout");
  const total = steps.length + (layout ? 1 : 0);
  const failed: Step[] = [];
  let done = 0;
  // Set by the first error nothing can fix: the steps in flight end, and no further one is started.
  let stopped = false;
  const stop = (cause: unknown) => { stopped = true; return cause; };
  const write = async (step: Step) => {
    try {
      await api.writeStep(run.id, step.section, step.roleId);
    } catch (first) {
      if (fatal(first)) throw stop(first);
      if (stopped) return;
      try {
        await api.writeStep(run.id, step.section, step.roleId);
      } catch (second) {
        if (fatal(second)) throw stop(second);
        failed.push(step);
      }
    }
    onProgress({ done: ++done, total });
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(atOnce, steps.length) }, async () => {
    while (!stopped && next < steps.length) await write(steps[next++]!);
  }));
  if (layout) await write({ section: "layout" });
  return { ...(await api.finishRun(run.id)), failed };
}
