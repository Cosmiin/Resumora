import { useEffect, useRef, useState } from "react";
import {
  contentLocale,
  hasSubstantialLanguageNarrative,
  languageNarrative,
  languageNarrativeFingerprint,
  languageDetectionOperationId,
  type ContentLanguageDecision,
} from "@resumora/contracts/editor/content-language";
import { documentLabels } from "@resumora/contracts/editor/document-labels";
import { equalValues, type BaseDraft } from "../base/model";
import type { IntelligenceContext } from "../base/intelligence";
type Props = {
  draft: BaseDraft | null;
  saved: { id: string; revision: number; draft: BaseDraft } | null | undefined;
  enabled: boolean;
  scope: object;
  change(draft: BaseDraft): void;
  request?: (
    context: IntelligenceContext & { languageAttempt?: number },
    recoverOnly?: boolean,
  ) => Promise<ContentLanguageDecision>;
};
/** One bounded saved-narrative decision. Unknown outcomes keep the deterministic receipt. */
export function useContentLanguage(props: Props) {
  const live = useRef(props);
  live.current = props;
  const attempts = useRef(new Set<string>()),
    unresolved = useRef(new Set<string>());
  const [error, setError] = useState(""),
    [retryGeneration, setRetry] = useState(0);
  const [working, setWorking] = useState(false);
  const [languageAttempt, setLanguageAttempt] = useState(0);
  const terminal = useRef(false);
  const inputIdentity = props.draft
    ? JSON.stringify([
        props.draft.id,
        contentLocale(props.draft),
        props.draft.contentLanguage?.source,
        languageNarrative(props.draft),
      ])
    : "";
  useEffect(() => {
    unresolved.current.clear();
  }, [props.scope]);
  useEffect(() => {
    attempts.current.clear();
    setError("");
    setLanguageAttempt(0);
    setRetry(0);
    terminal.current = false;
  }, [props.scope, inputIdentity]);
  useEffect(() => {
    const p = props,
      d = p.draft,
      s = p.saved;
    if (!p.enabled || !d || !s || !p.request || !equalValues(d, s.draft))
      return;
    const decision = d.contentLanguage;
    const needsLabels = !documentLabels(d);
    if (decision?.status === "unavailable" && retryGeneration === 0) {
      terminal.current = true;
      setError("CONTENT_LANGUAGE_UNAVAILABLE");
      return;
    }
    const authoritative =
      d.translation ||
      decision?.source === "user-correction" ||
      decision?.source === "translation" ||
      (decision &&
        decision.status !== "insufficient" &&
        decision.status !== "unavailable");
    if (authoritative && !needsLabels) return;
    if (!needsLabels && !hasSubstantialLanguageNarrative(d)) return;
    let mounted = true;
    let dispatchedAttempt: string | undefined;
    let dispatchedOperation: string | undefined;
    void (async () => {
      const fingerprint = await languageNarrativeFingerprint(d);
      if (!mounted) return;
      if (
        decision?.status === "insufficient" &&
        decision.narrativeFingerprint === fingerprint &&
        (hasSubstantialLanguageNarrative(d) || !needsLabels)
      ) {
        if (hasSubstantialLanguageNarrative(d))
          setError("CONTENT_LANGUAGE_INSUFFICIENT");
        return;
      }
      const operationId = await languageDetectionOperationId(
        d,
        languageAttempt,
      );
      const attempt = `${operationId}:${s.id}:${s.revision}:${retryGeneration}`;
      if (!mounted || attempts.current.has(attempt)) return;
      attempts.current.add(attempt);
      dispatchedAttempt = attempt;
      dispatchedOperation = operationId;
      setWorking(true);
      const recover = unresolved.current.has(operationId);
      unresolved.current.add(operationId);
      const valid = () =>
        mounted &&
        live.current.scope === p.scope &&
        live.current.enabled &&
        live.current.saved?.id === s.id &&
        live.current.saved.revision === s.revision &&
        equalValues(live.current.draft, d);
      try {
        const result = await p.request!(
          {
            snapshotId: s.id,
            revision: s.revision,
            targetId: d.id,
            operationId,
            ...(languageAttempt ? { languageAttempt } : {}),
          },
          recover,
        );
        if (!valid()) return;
        unresolved.current.delete(operationId);
        if (result.status === "unavailable") {
          terminal.current = true;
          setError("CONTENT_LANGUAGE_UNAVAILABLE");
          p.change({
            ...d,
            language: result.locale,
            documentLocale: result.locale,
            contentLanguage: { ...result, narrativeFingerprint: fingerprint },
          });
          return;
        }
        const next = {
          ...d,
          language: result.locale,
          documentLocale: result.locale,
          contentLanguage: { ...result, narrativeFingerprint: fingerprint },
        };
        setError(
          result.status === "insufficient" && hasSubstantialLanguageNarrative(d)
            ? "CONTENT_LANGUAGE_INSUFFICIENT"
            : "",
        );
        p.change(next);
      } catch (cause) {
        if (valid()) {
          const code =
            cause instanceof Error
              ? cause.message
              : "CONTENT_LANGUAGE_UNAVAILABLE";
          terminal.current = [
            "AI_OUTPUT_INVALID",
            "AI_RESULT_UNAVAILABLE",
            "CONTENT_LANGUAGE_UNAVAILABLE",
          ].includes(code);
          if (
            terminal.current ||
            [
              "AI_DISABLED",
              "AI_UNCONFIGURED",
              "STALE_INPUT",
              "VERSION_CONFLICT",
              "SAVE_REQUIRED",
            ].includes(code)
          )
            unresolved.current.delete(operationId);
          setError(code);
        }
      } finally {
        if (mounted) setWorking(false);
      }
    })();
    return () => {
      mounted = false;
      if (
        dispatchedAttempt &&
        dispatchedOperation &&
        unresolved.current.has(dispatchedOperation)
      )
        attempts.current.delete(dispatchedAttempt);
      setWorking(false);
    };
  }, [
    props.draft,
    props.saved,
    props.enabled,
    props.scope,
    props.request,
    retryGeneration,
    languageAttempt,
  ]);
  const d = props.draft,
    decision = d?.contentLanguage;
  const ready =
    !props.request ||
    !d ||
    (!!documentLabels(d) &&
      decision?.status !== "unavailable" &&
      (!hasSubstantialLanguageNarrative(d) ||
        !!d.translation ||
        (!!decision && decision.status !== "insufficient")));
  return {
    ready,
    error,
    working,
    canRetry:
      error !== "CONTENT_LANGUAGE_INSUFFICIENT" &&
      (!terminal.current || languageAttempt < 3),
    retry: () => {
      if (terminal.current) {
        if (languageAttempt >= 3) return;
        setLanguageAttempt((n) => n + 1);
        terminal.current = false;
      }
      setError("");
      setRetry((n) => n + 1);
    },
    locale: props.draft ? contentLocale(props.draft) : null,
  };
}
