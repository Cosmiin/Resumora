import { useContext, useEffect, useRef, useState } from "react";
import type { ImportReview as Review } from "@resumora/contracts/intelligence/model";
import {
  importedDraft,
  confirmImported,
} from "@resumora/contracts/editor/import";
import type { BaseDraft } from "../base/model";
import type { IntelligenceClient } from "../base/intelligence";
import { useWorkspaceDraft, DraftStatus } from "../workspace/context";
import { ImportReview } from "./ImportReview";
import { LanguageContext, useCopy } from "./ui";
/** A new Profile is staged independently; autosaving this review cannot publish it. */
export function InitialImportReview({
  review,
  client,
  disabled,
  start,
  cancel,
}: {
  review: Review;
  client: IntelligenceClient;
  disabled: boolean;
  start: (draft: BaseDraft) => void;
  cancel: () => void;
}) {
  const locale = useContext(LanguageContext);
  const t = useCopy(),
    [submitting, setSubmitting] = useState(false);
  const active = useRef(true),
    published = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [review.id]);
  const [initialDraft] = useState(() => importedDraft(review, locale));
  const staged = useWorkspaceDraft("import-review", review.id, {
    draft: initialDraft,
  });
  const valid =
    staged.value.draft?.importReview?.id === review.id &&
    staged.value.draft?.importReview?.sourceHash === review.sourceHash;
  async function confirm(ids: string[]) {
    if (published.current || submitting || disabled || !staged.ready || !valid)
      return;
    setSubmitting(true);
    try {
      const next = confirmImported(
        staged.controller.snapshot().value.draft,
        ids,
      );
      staged.set({ draft: next });
      if ((await staged.flush()) && active.current) {
        published.current = true;
        start(next);
      }
    } finally {
      setSubmitting(false);
    }
  }
  if (!staged.ready || !valid)
    return (
      <section className="card">
        <p role="status">
          {!valid
            ? t(
                "Această ciornă nu corespunde documentului. Redeschide importul corect.",
                "This draft does not match the document. Reopen the correct import.",
              )
            : t("Deschidem verificarea CV-ului…", "Opening your CV review…")}
        </p>
        <DraftStatus draft={staged} />
      </section>
    );
  return (
    <ImportReview
      draft={staged.value.draft}
      client={client}
      disabled={disabled || submitting || published.current}
      change={(draft) => staged.set({ draft })}
      confirm={(ids) => void confirm(ids)}
      forceOverview
      onCancel={cancel}
      cancelLabel={t("Renunță la verificare", "Discard review")}
      draftStatus={<DraftStatus draft={staged} />}
      primaryLabel={
        submitting
          ? t("Pregătim profilul…", "Preparing your profile…")
          : t("Finalizează verificarea", "Finish review")
      }
    />
  );
}
