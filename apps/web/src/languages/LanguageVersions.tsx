import { useEffect, useMemo, useRef, useState } from "react";
import { Button, useCopy } from "../components/ui";
import { documentLocales } from "@resumora/contracts/intelligence/translation";
import {
  staleTranslationComponents,
  isTranslationLineage,
} from "@resumora/contracts/editor/languages";
import type {
  DocumentLanguageContext,
  LanguageProposal,
  LanguageAccepted,
  LanguageVersionInfo,
} from "@resumora/contracts/editor/language-transport";
import type { BaseDraft } from "../base/model";
import type { AuthTransport } from "../auth/AuthShell";
import { languageClient } from "./client";
import { TranslationReview } from "./TranslationReview";
export function LanguageVersions({
  transport,
  jobId,
  currentLocale,
  ready,
  revisionKey,
  open,
}: {
  transport: AuthTransport;
  jobId?: string;
  currentLocale: string;
  ready: boolean;
  revisionKey: string;
  open: (value: { locale: string; variantId?: string }) => void;
}) {
  const t = useCopy(),
    client = useMemo(() => languageClient(transport), [transport]),
    [context, setContext] = useState<DocumentLanguageContext | null>(null),
    [target, setTarget] = useState(currentLocale),
    [proposal, setProposal] = useState<LanguageProposal | null>(null),
    [reviewContext, setReviewContext] =
      useState<DocumentLanguageContext["source"]>(null),
    [existing, setExisting] = useState<BaseDraft>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stale, setStale] = useState<Record<string, string[]>>({});
  const active = useRef(true),
    controller = useRef<AbortController | null>(null),
    operation = useRef<string | null>(null);
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    void client.context(jobId, currentLocale, abort.signal).then(
      async (ctx) => {
        if (!active.current) return;
        setContext(ctx);
        const changed: Record<string, string[]> = {};
        if (ctx.source)
          for (const version of ctx.versions)
            if (isTranslationLineage(version.translation))
              changed[version.locale] = await staleTranslationComponents(
                version.translation,
                ctx.source.draft,
              );
        if (active.current) setStale(changed);
      },
      () => {
        if (!abort.signal.aborted) setError("languageUnavailable");
      },
    );
    return () => {
      active.current = false;
      abort.abort();
      controller.current?.abort();
    };
  }, [client, jobId, currentLocale, revisionKey]);
  const version = context?.versions.find(
    (v) =>
      v.locale === target ||
      (v.locale === "ro" && target === "ro-RO") ||
      (v.locale === "en" && target === "en-GB"),
  );
  const name = (locale: string) =>
    documentLocales.find((l) => l.code === locale)?.label ?? locale;
  async function translate(sectionIds: string[] = []) {
    if (!context?.source || !ready) return;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const id = crypto.randomUUID();
    operation.current = id;
    try {
      const acceptedTarget = version
        ? await client.read(version, jobId, abort.signal)
        : null;
      if (acceptedTarget && acceptedTarget.revision !== version?.revision)
        throw new Error("targetChanged");
      let result = await client.start(
        {
          operationId: id,
          source: context.source.pin,
          sourceLocale: context.source.locale,
          targetLocale: target,
          sectionIds,
          glossary: [],
          expectedTargetRevision: version?.revision ?? 0,
        },
        abort.signal,
      );
      while (result.state === "pending") {
        result = await client.advance(id, abort.signal);
      }
      if (result.state !== "ready" || !result.output)
        throw new Error(
          result.state === "processing"
            ? "translationInterrupted"
            : result.state,
        );
      if (active.current) {
        setExisting(acceptedTarget?.draft);
        setReviewContext(context.source);
        setProposal(result);
      }
    } catch (e) {
      if (active.current && !abort.signal.aborted)
        setError(e instanceof Error ? e.message : "languageUnavailable");
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function refresh() {
    if (
      !context?.source ||
      !version ||
      !isTranslationLineage(version.translation)
    )
      return;
    const changed = stale[version.locale] ?? [],
      sections = [
        ...new Set(
          [...context.source.items, ...version.translation.components]
            .filter((i) => changed.includes(i.id))
            .map((i) => i.sectionId),
        ),
      ];
    if (!sections.length || sections.some(id=>!context.source!.items.some(i=>i.sectionId===id))) {
      setError("sourceStructureChanged");
      return;
    }
    await translate(sections);
  }
  function saved(value: LanguageAccepted) {
    setProposal(null);
    operation.current = null;
    open({
      locale: target,
      ...(value.variantId ? { variantId: value.variantId } : {}),
    });
  }
  return (
    <section
      className="language-versions"
      aria-label={t("Limba CV-ului", "CV language")}
    >
      <label>
        {t("Limba CV-ului", "CV language")}
        <select
          value={target}
          disabled={busy || !ready}
          onChange={(e) => setTarget(e.target.value)}
        >
          {documentLocales.map((locale) => (
            <option key={locale.code} value={locale.code}>
              {locale.label}
              {locale.code === currentLocale
                ? " · " + t("Curentă", "Current")
                : context?.versions.some((v) => v.locale === locale.code)
                  ? " · " + t("Disponibilă", "Available")
                  : ""}
            </option>
          ))}
        </select>
      </label>
      {target !== currentLocale &&
      context?.source?.locale === target &&
      !jobId ? (
        <Button
          disabled={!ready || busy}
          onClick={() => open({ locale: target })}
        >
          {t("Deschide CV-ul sursă", "Open source CV")}
        </Button>
      ) : target !== currentLocale && version ? (
        <div className="actions">
          <Button
            disabled={!ready || busy}
            onClick={() =>
              open({ locale: target, variantId: version.variantId })
            }
          >
            {t("Deschide versiunea salvată", "Open saved version")}
          </Button>
          {!!stale[version.locale]?.length && (
            <Button
              disabled={!ready || busy || !context?.source?.accepted}
              onClick={() => void refresh()}
            >
              {t("Actualizează traducerea", "Update Translation")}
            </Button>
          )}
          <Button
            disabled={!ready || busy || !context?.source?.accepted}
            onClick={() => void translate()}
          >
            {t("Propune o traducere nouă", "Propose new translation")}
          </Button>
        </div>
      ) : (
        target !== currentLocale && (
          <Button
            disabled={!ready || busy || !context?.source?.accepted}
            onClick={() => void translate()}
          >
            {busy
              ? t("Se traduce…", "Translating…")
              : t("Tradu CV-ul", "Translate CV")}
          </Button>
        )
      )}
      {!context?.source?.accepted && target !== currentLocale && (
        <p>
          {t(
            "Salvează mai întâi CV-ul sursă acceptat.",
            "Save the accepted source CV first.",
          )}
        </p>
      )}
      {version && isTranslationLineage(version.translation) && version.translation.linguistic && <aside>{version.translation.linguistic.warnings.map((w,i)=><p key={'w'+i}>{w.code}: {w.message}</p>)}{version.translation.linguistic.ambiguousTerms.map((w,i)=><p key={'a'+i}>{w.term}</p>)}{version.translation.linguistic.suggestedGlossary.map((w,i)=><p key={'g'+i}>{w.originalTerm} → {w.preferredTranslation}</p>)}</aside>}
      {!!stale[version?.locale??target]?.length && (
        <p role="status">
          {t(
            "Unele secțiuni din sursă s-au schimbat. Traducerea salvată rămâne disponibilă.",
            "Some source sections changed. Your saved translation remains available.",
          )}
        </p>
      )}
      {error && (
        <p role="alert">
          {error === "AI_DISABLED"
            ? t(
                "Traducerea AI nu este activată. Versiunile salvate și editarea manuală rămân disponibile.",
                "AI translation is not enabled. Saved versions and manual editing remain available.",
              )
            : error === "sourceStructureChanged"
              ? t(
                  "Structura sursei s-a schimbat. Compară versiunile înainte de a propune o traducere nouă.",
                  "The source structure changed. Compare versions before proposing a new translation.",
                )
              : t(
                  "Traducerea nu a putut fi finalizată. CV-urile salvate se păstrează.",
                  "Translation could not be completed. Saved CVs are retained.",
                )}
        </p>
      )}
      {busy && (
        <Button
          onClick={() => {
            controller.current?.abort();
            if (operation.current)
              void client.cancel(operation.current).catch(() => {});
            setBusy(false);
          }}
        >
          {t("Anulează traducerea", "Cancel translation")}
        </Button>
      )}
      {proposal && reviewContext && (
        <TranslationReview
          key={proposal.id}
          client={client}
          context={reviewContext}
          proposal={proposal}
          existing={existing}
          save={saved}
          cancel={() => {
            setProposal(null);
            operation.current = null;
          }}
        />
      )}
    </section>
  );
}
