import type { MessageKey } from "./en.ts";
import { uiRo } from "./ro-ui.ts";
import { publicRo } from "./ro-public.ts";
import { accountRo } from "./ro-account.ts";
import { basecvRo } from "./ro-basecv.ts";
import { jobsRo } from "./ro-jobs.ts";

/**
 * Romanian UI copy. Each rebuilt flow adds its own `ro-<flow>.ts` with exactly the keys of its
 * `en-<flow>.ts`. Screens of the old look are English only until they are replaced, so this is partial.
 */
export const ro: Partial<Record<MessageKey, string>> = {
  ...uiRo,
  ...publicRo,
  ...accountRo,
  ...basecvRo,
  ...jobsRo,
};
