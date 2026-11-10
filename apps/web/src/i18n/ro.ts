import type { MessageKey } from "./en.ts";
import { uiRo } from "./ro-ui.ts";

/**
 * Romanian UI copy. Each rebuilt flow adds its own `ro-<flow>.ts` with exactly the keys of its
 * `en-<flow>.ts`. Screens of the old look are English only until they are replaced, so this is partial.
 */
export const ro: Partial<Record<MessageKey, string>> = {
  ...uiRo,
};
