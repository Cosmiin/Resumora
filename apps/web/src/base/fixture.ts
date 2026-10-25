import { maraProjection } from "./mara-review";
import { clone, type BaseDraft } from "./model";
// Explicit projection of journey-mara-base1.json + extracted-before-confirmation
// recipe in docs/examples/review-scenarios.json. Never canonical/database UUIDs.
// Original fixture stays untouched. Shared source claims can back distinct editable fields.
export function maraReviewDraft(): BaseDraft {
  return clone(maraProjection);
}
