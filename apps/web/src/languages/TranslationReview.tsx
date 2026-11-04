import { useWorkspaceDraft, DraftStatus } from "../workspace/context";
import { useEffect, useRef, useState } from "react";
import { Button, useCopy } from "../components/ui";
import { DocumentPreview } from "../components/DocumentPreview";
import {
  composeTranslation,
  componentFingerprint,
  translationItems,
} from "@resumora/contracts/editor/languages";
import type {
  DocumentLanguageContext,
  LanguageProposal,
  LanguageAccepted,
} from "@resumora/contracts/editor/language-transport";
import type {
  TranslationInput,
  TranslationOutput,
} from "@resumora/contracts/intelligence/translation";
import type { BaseDraft } from "../base/model";
import type { LanguageClient } from "./client";
export function TranslationReview({
  client,
  context,
  proposal: initial,
  existing,
  save,
  cancel,
}: {
  client: Pick<
    LanguageClient,
    "review" | "accept" | "cancel" | "start" | "advance"
  >;
  context: NonNullable<DocumentLanguageContext["source"]>;
  proposal: LanguageProposal;
  existing?: BaseDraft;
  save: (result: LanguageAccepted) => void;
  cancel: () => void;
}) {
  const t = useCopy(),
    [proposal, setProposal] = useState(initial),
    [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        (initial.review?.values ?? initial.output!.items).map((i) => [
          i.id,
          "text" in i ? i.text : "",
        ]),
      ),
    ),
    [confirmed, setConfirmed] = useState(initial.review?.confirmed ?? []),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<BaseDraft | null>(null),
    [previewError, setPreviewError] = useState(false);
  const reviewDraft = useWorkspaceDraft("translation-review", initial.id, {
    values,
    confirmed,
    step,
    proposalId: initial.id,
  });
  const restored = useRef(false);
  useEffect(() => {
    if (reviewDraft.ready && !restored.current) {
      restored.current = true;
      if (reviewDraft.head) {
        setValues(reviewDraft.value.values);
        setConfirmed(reviewDraft.value.confirmed);
        setStep(reviewDraft.value.step);
      }
      void reviewDraft.controller.persist();
    }
  }, [reviewDraft.ready]);
  useEffect(() => {
    if (restored.current && reviewDraft.ready)
      reviewDraft.set({ values, confirmed, step, proposalId: initial.id });
  }, [values, confirmed, step, reviewDraft.ready]);
  const active = useRef(true),
    abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current = false;
      abort.current?.abort();
    },
    [],
  );
  const items = context.items.filter(
      (i) =>
        !proposal.request.sectionIds.length ||
        proposal.request.sectionIds.includes(i.sectionId),
    ),
    sections = [...new Set(items.map((i) => i.sectionId))],
    section = sections[step];
  const label = (id: string) =>
    ({
      identity: t("Titlu profesional", "Professional title"),
      summary: t("Rezumat profesional", "Professional summary"),
      professionalSkills: t("Competențe profesionale", "Professional skills"),
      technicalSkills: t("Competențe tehnice", "Technical skills"),
      experience: t("Experiență profesională", "Work experience"),
      education: t("Studii și calificări", "Education and qualifications"),
    })[id] ??
    context.draft.optionalSections.find((s) => s.id === id)?.label ??
    t("Alte secțiuni", "Other sections");
  async function input(): Promise<TranslationInput> {
    return {
      contentType: "cv",
      sourceLocale: proposal.request.sourceLocale,
      targetLocale: proposal.request.targetLocale,
      sourceDocumentId: proposal.request.source.documentId,
      sourceVersionId: proposal.request.source.currentId,
      sourceRevision: proposal.request.source.revision,
      items,
      approvedGlossary: proposal.request.glossary,
      glossaryVersion: await componentFingerprint(proposal.request.glossary),
      translationPreferences: { regionalTerminology: "" },
    };
  }
  const output = (): TranslationOutput => ({
    ...proposal.output!,
    items: items.map((i) => ({
      id: i.id,
      fieldId: i.fieldId,
      text: values[i.id] ?? i.text,
      factIds: i.factIds,
      evidenceIds: i.evidenceIds,
    })),
  });
  useEffect(() => {
    let current = true;
    setPreview(null);
    void input()
      .then((i) => composeTranslation(context.draft, i, output(), existing))
      .then(
        (d) => {
          if (current) {
            setPreview(d);
            setPreviewError(false);
          }
        },
        () => {
          if (current) setPreviewError(true);
        },
      );
    return () => {
      current = false;
    };
  }, [values, proposal]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      if (!(await reviewDraft.flush())) throw Error("draftSaveFailed");
      const nextConfirmed = [...new Set([...confirmed, section])],
        next = await client.review(proposal.id, proposal.reviewRevision, {
          values: items.map((i) => ({
            id: i.id,
            text: values[i.id] ?? i.text,
          })),
          confirmed: nextConfirmed,
        });
      if (!active.current) return;
      setProposal(next);
      setConfirmed(nextConfirmed);
      setStep((s) => s + 1);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "languageUnavailable");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function keep() {
    if (!existing) return;
    const existingItems = await translationItems(existing),
      patch: Record<string, string> = {};
    for (const i of items.filter((i) => i.sectionId === section)) {
      const found = existingItems.find((x) => x.id === i.id);
      if (found) patch[i.id] = found.text;
    }
    setValues((v) => ({ ...v, ...patch }));
    setConfirmed((c) => c.filter((id) => id !== section));
  }
  async function regenerate() {
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    let child: LanguageProposal | undefined;
    try {
      child = await client.start(
        {
          operationId: crypto.randomUUID(),
          source: proposal.request.source,
          sourceLocale: proposal.request.sourceLocale,
          targetLocale: proposal.request.targetLocale,
          sectionIds: [section],
          glossary: proposal.request.glossary,
          expectedTargetRevision: proposal.request.targetRevision,
        },
        controller.signal,
      );
      while (child.state === "pending") {
        child = await client.advance(child.id, controller.signal);
      }
      if (child.state !== "ready" || !child.output)
        throw new Error("translationInterrupted");
      if (active.current) {
        setValues((v) => ({
          ...v,
          ...Object.fromEntries(
            child!.output!.items.map((i) => [i.id, i.text]),
          ),
        }));
        setConfirmed((c) => c.filter((id) => id !== section));
      }
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "languageUnavailable");
    } finally {
      if (child) void client.cancel(child.id).catch(() => {});
      if (active.current) setBusy(false);
    }
  }
  async function accept() {
    if (!preview || previewError) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.accept(
        proposal.id,
        crypto.randomUUID(),
        proposal.reviewRevision,
      );
      if (active.current) save(result);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "languageUnavailable");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <section
      className="translation-review"
      aria-label={t("Revizuiește traducerea", "Review translation")}
    >
      <h2>{t("Revizuiește traducerea", "Review translation")}</h2>
      <DraftStatus draft={reviewDraft} />
      <p>
        {proposal.request.sourceLocale} → {proposal.request.targetLocale}
      </p>
      {section ? (
        <>
          <h3>
            {label(section)} · {step + 1}/{sections.length}
          </h3>
          <div className="translation-comparison">
            {items
              .filter((i) => i.sectionId === section)
              .map((item, index) => (
                <div className="translation-item" key={item.id}>
                  <div>
                    <strong>{proposal.request.sourceLocale}</strong>
                    <p>{item.text}</p>
                  </div>
                  <label className="field">
                    {proposal.request.targetLocale} · {index + 1}
                    <textarea
                      className="native"
                      value={values[item.id] ?? item.text}
                      onChange={(e) => {
                        setValues((v) => ({ ...v, [item.id]: e.target.value }));
                        setConfirmed((c) => c.filter((id) => id !== section));
                      }}
                    />
                  </label>
                  {proposal.output?.warnings
                    .filter((w) => w.itemId === item.id)
                    .map((w, index) => (
                      <p role="note" key={index}>
                        {w.code === "qualification_equivalence"
                          ? t(
                              "Calificarea poate să nu aibă un echivalent direct. Verifică denumirea.",
                              "This qualification may not have a direct equivalent. Check its name.",
                            )
                          : w.code === "title_uncertain"
                            ? t(
                                "Verifică traducerea acestui titlu profesional.",
                                "Please check this professional title.",
                              )
                            : w.code === "term_preserved"
                              ? t(
                                  "Termenul a fost păstrat în limba originală.",
                                  "This term was preserved in its original language.",
                                )
                              : t(
                                  "Textul original a fost păstrat. Verifică și corectează-l înainte de confirmare.",
                                  "Original wording was retained. Check and correct it before confirming.",
                                )}
                      </p>
                    ))}
                </div>
              ))}
          </div>
          <div className="actions">
            <Button
              disabled={busy || previewError}
              onClick={() => void confirm()}
            >
              {t("Confirmă și continuă", "Confirm & Continue")}
            </Button>
            <Button disabled={busy} onClick={() => void regenerate()}>
              {t("Regenerează secțiunea", "Regenerate Section")}
            </Button>
            {existing && (
              <Button disabled={busy} onClick={() => void keep()}>
                {t(
                  "Păstrează traducerea existentă",
                  "Keep Existing Translation",
                )}
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <h3>{t("Previzualizare finală", "Final document review")}</h3>
          {preview && (
            <DocumentPreview
              draft={preview}
              asOf={{
                year: String(new Date().getUTCFullYear()),
                month: String(new Date().getUTCMonth() + 1),
              }}
            />
          )}
          <p>
            {t(
              "CV-ul în limba sursă rămâne disponibil.",
              "The source-language CV remains available.",
            )}
          </p>
          <Button
            disabled={
              busy ||
              !preview ||
              previewError ||
              sections.some((id) => !confirmed.includes(id))
            }
            onClick={() => void accept()}
          >
            {proposal.request.targetLocale === "ro-RO"
              ? t("Salvează CV în română", "Save Romanian CV")
              : t("Salvează CV în engleză", "Save English CV")}
          </Button>
        </>
      )}
      {previewError && (
        <p role="alert">
          {t(
            "Păstrează numerele și termenii tehnici din sursă. Verifică editarea.",
            "Preserve source numbers and technical terms. Check your edit.",
          )}
        </p>
      )}
      {error && (
        <p role="alert">
          {["staleSource", "targetChanged", "VERSION_CONFLICT"].includes(error)
            ? t(
                "Sursa sau versiunea salvată s-a schimbat. Modificările tale rămân afișate; redeschide versiunea curentă înainte de salvare.",
                "The source or saved document changed. Your edits remain displayed; reopen the current version before saving.",
              )
            : t(
                "Traducerea nu a putut fi finalizată. CV-urile salvate se păstrează.",
                "Translation could not be completed. Saved CVs are retained.",
              )}
        </p>
      )}
      <div className="actions">
        {step > 0 && (
          <Button disabled={busy} onClick={() => setStep((s) => s - 1)}>
            {t("Înapoi", "Back")}
          </Button>
        )}
        <Button
          onClick={() => {
            abort.current?.abort();
            void client.cancel(proposal.id).catch(() => {});
            cancel();
          }}
        >
          {t("Închide revizuirea", "Close review")}
        </Button>
      </div>
    </section>
  );
}
