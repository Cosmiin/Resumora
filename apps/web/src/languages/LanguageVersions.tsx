import { WorkspaceContext } from "../workspace/context";
import type { WorkspaceDraft } from "@resumora/contracts/editor/workspace";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button, useCopy } from "../components/ui";
import { contentLanguageChoices } from "./catalog";
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
  currentLocale,
  ready,
  revisionKey,
  open,
  ensureReady,
}: {
  ensureReady?: () => Promise<void>;
  transport: AuthTransport;
  currentLocale: string;
  ready: boolean;
  revisionKey: string;
  open: (value: { locale: string; variantId?: string }) => void;
}) {
  const registry = useContext(WorkspaceContext);
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
    operation = useRef<string | null>(null),
    receiptKey = useRef<string | null>(null);
  const receipt = (key: string, id: string | null) => {
    try {
      if (id) sessionStorage.setItem(key, id);
      else sessionStorage.removeItem(key);
    } catch {
      /* Only operation identifiers are cached. */
    }
  };
  const forget = () => {
    if (receiptKey.current) receipt(receiptKey.current, null);
    operation.current = null;
  };
  useEffect(
    () => () => {
      active.current = false;
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    void client.context(abort.signal).then(
      async (ctx) => {
        if (!active.current) return;
        setContext(ctx);
        if (ctx.source) {
          const key = `resumora:translation:profile:${ctx.source.pin.currentId}:${currentLocale}`;
          receiptKey.current = key;
          let saved: string | null = null;
          try {
            saved = sessionStorage.getItem(key);
          } catch {}
          if (saved) {
            operation.current = saved;
            void client.get(saved).then(
              (result) => {
                if (!active.current) return;
                if (result.state === "ready" && result.output) {
                  setTarget(result.request.targetLocale);
                  setReviewContext(ctx.source);
                  setProposal(result);
                } else if (
                  ["cancelled", "accepted", "failed", "stale"].includes(
                    result.state,
                  )
                )
                  forget();
                else setError("translationInterrupted");
              },
              () => {
                if (active.current) setError("translationInterrupted");
              },
            );
          }
        }

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
    };
  }, [client, currentLocale, revisionKey]);
  useEffect(() => {
    let current = true;
    if (!registry?.transport || !context?.source) return;
    void registry
      .json<WorkspaceDraft[]>("/v1/workspace-drafts")
      .then(async (rows) => {
        for (const row of rows.filter((r) => r.kind === "translation-review")) {
          const saved = await client.get(row.id);
          if (!current) return;
          if (
            saved.state === "ready" &&
            saved.output &&
            saved.request.source.kind === "base" &&
            saved.request.source.currentId === context.source!.pin.currentId &&
            saved.request.sourceLocale === currentLocale
          ) {
            setReviewContext(context.source);
            setProposal(saved);
            break;
          }
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [registry, context?.source?.pin.currentId, currentLocale]);
  const version = context?.versions.find(
    (v) =>
      v.locale === target ||
      (v.locale === "ro" && target === "ro-RO") ||
      (v.locale === "en" && target === "en-GB"),
  );
  const name = (locale: string) =>
    contentLanguageChoices([locale]).find((l) => l.code === locale)?.label ??
    locale;
  async function resume() {
    if (!operation.current || !context?.source) return;
    setBusy(true);
    try {
      let result = await client.get(operation.current);
      while (result.state === "pending")
        result = await client.advance(result.id);
      if (result.state === "ready" && result.output) {
        setTarget(result.request.targetLocale);
        setReviewContext(context.source);
        setProposal(result);
        setError("");
      } else if (
        ["cancelled", "accepted", "failed", "stale"].includes(result.state)
      ) {
        forget();
        setError(result.state);
      } else setError("translationInterrupted");
    } catch {
      setError("translationInterrupted");
    } finally {
      setBusy(false);
    }
  }
  async function translate(sectionIds: string[] = []) {
    if (operation.current) {
      await resume();
      return;
    }
    if ((!context?.source && !ensureReady) || !ready) return;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const id = crypto.randomUUID();
    operation.current = id;
    try {
      if (ensureReady) await ensureReady();
      const sourceContext = ensureReady
        ? await client.context(abort.signal)
        : context;
      if (!sourceContext?.source?.accepted)
        throw Error("acceptedVersionRequired");
      const acceptedTarget = version
        ? await client.read(version, abort.signal)
        : null;
      if (acceptedTarget && acceptedTarget.revision !== version?.revision)
        throw new Error("targetChanged");
      receiptKey.current = `resumora:translation:profile:${sourceContext.source.pin.currentId}:${currentLocale}`;
      receipt(receiptKey.current, id);
      let result = await client.start(
        {
          operationId: id,
          source: sourceContext.source.pin,
          sourceLocale: sourceContext.source.locale,
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
        setReviewContext(sourceContext.source);
        setProposal(result);
      }
    } catch (e) {
      if (
        e instanceof Error &&
        [
          "AI_DISABLED",
          "AI_UNCONFIGURED",
          "staleSource",
          "acceptedVersionRequired",
          "validation",
          "invalidRequest",
        ].includes(e.message)
      )
        forget();
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
    if (
      !sections.length ||
      sections.some(
        (id) => !context.source!.items.some((i) => i.sectionId === id),
      )
    ) {
      setError("sourceStructureChanged");
      return;
    }
    await translate(sections);
  }
  function saved(value: LanguageAccepted) {
    setProposal(null);
    forget();
    open({
      locale: target,
      ...(value.variantId ? { variantId: value.variantId } : {}),
    });
  }
  return (
    <section
      className="language-versions"
      aria-label={t("Versiuni de limbă", "Language versions")}
    >
      <label>
        {t("Tradu CV-ul în", "Translate CV into")}
        <select
          className="native"
          value={target}
          disabled={busy || !ready}
          onChange={(e) => setTarget(e.target.value)}
        >
          {contentLanguageChoices([
            currentLocale,
            ...(context?.versions.map((v) => v.locale) ?? []),
          ]).map((locale) => (
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
      true ? (
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
              disabled={
                !ready || busy || (!context?.source?.accepted && !ensureReady)
              }
              onClick={() => void refresh()}
            >
              {t("Actualizează traducerea", "Update Translation")}
            </Button>
          )}
          <Button
            disabled={
              !ready || busy || (!context?.source?.accepted && !ensureReady)
            }
            onClick={() => void translate()}
          >
            {t("Propune o traducere nouă", "Propose new translation")}
          </Button>
        </div>
      ) : (
        target !== currentLocale && (
          <Button
            disabled={
              !ready || busy || (!context?.source?.accepted && !ensureReady)
            }
            onClick={() => void translate()}
          >
            {busy
              ? t("Se traduce…", "Translating…")
              : t("Tradu CV-ul", "Translate CV")}
          </Button>
        )
      )}
      {!context?.source?.accepted &&
        !ensureReady &&
        target !== currentLocale && (
          <p>
            {t(
              "Salvează mai întâi CV-ul sursă acceptat.",
              "Save the accepted source CV first.",
            )}
          </p>
        )}
      {version &&
        isTranslationLineage(version.translation) &&
        version.translation.linguistic && (
          <aside>
            {version.translation.linguistic.warnings.map((w, i) => (
              <p key={"w" + i}>
                {w.code}: {w.message}
              </p>
            ))}
            {version.translation.linguistic.ambiguousTerms.map((w, i) => (
              <p key={"a" + i}>{w.term}</p>
            ))}
            {version.translation.linguistic.suggestedGlossary.map((w, i) => (
              <p key={"g" + i}>
                {w.originalTerm} → {w.preferredTranslation}
              </p>
            ))}
          </aside>
        )}
      {!!stale[version?.locale ?? target]?.length && (
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
      {!busy && operation.current && !proposal && (
        <Button onClick={() => void resume()}>
          {t("Reia traducerea salvată", "Resume saved translation")}
        </Button>
      )}
      {busy && (
        <Button
          onClick={() => {
            controller.current?.abort();
            if (operation.current)
              void client.cancel(operation.current).then(
                () => {
                  forget();
                  setError("");
                },
                () => setError("translationInterrupted"),
              );
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
            forget();
          }}
        />
      )}
    </section>
  );
}
