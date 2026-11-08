import type { CvContent, MatchScore } from "@resumora/shared";
import type { ModelDeps } from "../ai/call-model.ts";
import type { LogFn } from "../errors.ts";
import { scoreMatch } from "../tailor/score.ts";
import { processJob } from "./process.ts";
import type { JobAdmin, JobMessage } from "./repo.ts";

/** Give up after three deliveries, including the first attempt. */
const MAX_ATTEMPTS = 3;

export async function handleJobMessage(
  deps: {
    admin: JobAdmin; model: ModelDeps; log: LogFn;
    baseCv(userId: string): Promise<CvContent | null>;
    tailorRepo(userId: string): {
      getScore(jobId: string): Promise<MatchScore | null>;
      saveScore(jobId: string, score: MatchScore): Promise<void>;
    };
  },
  msg: Pick<Message<JobMessage>, "body" | "attempts" | "ack" | "retry">,
): Promise<void> {
  const { admin } = deps;
  const id = msg.body.jobId;
  try {
    const work = await admin.start(id);
    if (!work) return msg.ack();

    const result = await processJob({ model: deps.model }, work);
    if (result.ok) {
      await admin.finish(work.id, result.extracted);
      try {
        const scores = deps.tailorRepo(work.userId);
        if (!(await scores.getScore(work.id))) {
          const cv = await deps.baseCv(work.userId);
          if (cv) {
            const score = await scoreMatch({ model: deps.model }, {
              userId: work.userId, cv, job: result.extracted, keptInferred: new Set(),
            });
            await scores.saveScore(work.id, score);
          } else {
            deps.log({ msg: "job score skipped: no base CV", jobId: work.id });
          }
        }
      } catch {
        deps.log({ msg: "job score failed", jobId: work.id });
      }
    } else {
      await admin.fail(work.id, result.code);
    }
    msg.ack();
  } catch {
    // Errors from storage can contain page text; log only the job and attempt.
    deps.log({ msg: "job failed", jobId: id, attempt: msg.attempts });
    if (msg.attempts < MAX_ATTEMPTS) return msg.retry({ delaySeconds: 10 });
    await admin.fail(id, "ai_failed");
    msg.ack();
  }
}
