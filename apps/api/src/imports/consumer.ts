import type { ModelDeps } from "../ai/call-model.ts";
import type { LogFn } from "../errors.ts";
import { ImportFailure } from "./extract-text.ts";
import { processImport } from "./process.ts";
import { formatOf, type ImportAdmin, type ImportJob, type ImportMessage } from "./repo.ts";

/** Give up after this many deliveries of the same message. */
export const MAX_ATTEMPTS = 3;

export type QueueMessage = Pick<Message<ImportMessage>, "body" | "attempts" | "ack" | "retry">;

/**
 * Processes one import. A known failure (not a CV, no text, AI down…) is final: it is recorded
 * and the message acknowledged. Anything else is retried, and recorded as "internal" on the last
 * attempt. The uploaded file is deleted whenever the import ends, so it's never kept longer than needed.
 */
export async function handleImportMessage(
  deps: { admin: ImportAdmin; model: ModelDeps; log: LogFn },
  msg: QueueMessage,
): Promise<void> {
  const { admin } = deps;
  const job = await admin.start(msg.body.importId);
  if (!job) return msg.ack(); // already finished (e.g. a re-delivered message)

  try {
    const bytes = await admin.download(job);
    const result = await processImport({ model: deps.model }, { userId: job.userId, bytes, format: formatOf(job.storagePath) });
    await admin.finish(job.id, result);
    await cleanUp(deps, job);
    msg.ack();
  } catch (err) {
    if (err instanceof ImportFailure) {
      await admin.fail(job.id, err.code);
      await cleanUp(deps, job);
      return msg.ack();
    }
    deps.log({ msg: "import failed", importId: job.id, attempt: msg.attempts, error: String(err) });
    if (msg.attempts < MAX_ATTEMPTS) return msg.retry({ delaySeconds: 10 });
    await admin.fail(job.id, "internal");
    await cleanUp(deps, job);
    msg.ack();
  }
}

/** A file that can't be deleted is logged, not retried: the import itself is already settled. */
async function cleanUp(deps: { admin: ImportAdmin; log: LogFn }, job: ImportJob) {
  await deps.admin.deleteFile(job).catch((err: unknown) =>
    deps.log({ msg: "import file delete failed", importId: job.id, error: String(err) }),
  );
}
