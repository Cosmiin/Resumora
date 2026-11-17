import type { CvRepo } from "../cv/repo.ts";
import { ApiError } from "../errors.ts";
import type { ImportRepo } from "../imports/repo.ts";

/**
 * An import that is read but not used yet, read as if it were the saved CV: its roles can be scored and its
 * companies and tools looked up while the person still looks at what was found. 409 `not_saved` when the import
 * isn't this user's or isn't ready (also once it is used: from then on the saved CV is asked).
 */
export function importAsCv(cv: CvRepo, imports: ImportRepo, importId: string): CvRepo {
  return {
    ...cv,
    async get() {
      const found = await imports.get(importId);
      if (!found?.result) throw new ApiError(409, "not_saved", "This import can't be read (it isn't ready, or was already used).");
      return { content: found.result.content, version: 0, updatedAt: found.createdAt };
    },
  };
}
