import { contentLocale } from "@resumora/contracts/editor/content-language";
import { usePreparedExperienceQuestions } from "./usePreparedExperienceQuestions";
import { createContext, useEffect, useRef, useState } from "react";
import { clone, type BaseDraft } from "../base/model";
import type { IntelligenceClient } from "../base/intelligence";
import {
  currentExperienceAssessment,
  experienceTarget,
  experienceTargets,
  experienceScoreIdentity,
  experienceScoreFingerprint,
  experienceScoreOperationId,
  experienceText,
  type ExperienceSession,
} from "@resumora/contracts/intelligence/experience";
import { experiencePolicy } from "@resumora/contracts/intelligence/experience-policy";
import {
  experienceDefiniteFailures,
  experienceErrorCode,
  experienceRecoveryDelays,
} from "../base/experience-requests";

export type ExperienceScoreController = {
  queue: (base?: BaseDraft, force?: boolean) => Promise<void>;
  check: () => Promise<void>;
  running: boolean;
  preparing: boolean;
  lastCheck?: { before?: number; after: number };
  pending?: ExperienceSession["scorePending"];
  error?: ExperienceSession["scoreError"];
  current?: boolean;
  automatic?: boolean;
};
export type ProfileExperienceScores = {
  forRole: (id: string) => ExperienceScoreController;
};
export const ExperienceScoresContext =
  createContext<ProfileExperienceScores | null>(null);

type Props = {
  draft: BaseDraft | null;
  feedbackLocale?: string;
  enabled: boolean;
  ready: boolean;
  priority?: string;
  change: (draft: BaseDraft, roleId: string, kind?: "questions") => void;
  request?: NonNullable<IntelligenceClient["experience"]>;
};
const stateOf = (draft: BaseDraft, id: string): ExperienceSession =>
  draft.experienceEnrichment?.[id] ?? { version: 1 };

/** One queue for the entire profile. Metadata writes never change assessment identity. */
export function useProfileExperienceScores(
  props: Props,
): ProfileExperienceScores {
  usePreparedExperienceQuestions(props);
  const live = useRef(props);
  live.current = props;
  const mounted = useRef(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const armed = useRef(new Set<string>());
  const attempted = useRef(new Set<string>());
  const polls = useRef(new Map<string, number>());
  const retryAt = useRef(new Map<string, number>());
  const requestedChecks = useRef(new Set<string>());
  const [activity, setActivity] = useState<{
    id: string;
    preparing: boolean;
  }>();
  const [lastChecks, setLastChecks] = useState<
    Record<string, { before?: number; after: number }>
  >({});
  const [, wake] = useState(0);
  const scope = props.draft?.id;
  useEffect(() => {
    mounted.current = true;
    epoch.current++;
    armed.current.clear();
    attempted.current.clear();
    polls.current.clear();
    retryAt.current.clear();
    requestedChecks.current.clear();
    setActivity(undefined);
    setLastChecks({});
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, [scope, props.enabled]);

  function mutate(id: string, edit: (s: ExperienceSession) => void) {
    const p = live.current;
    if (
      !mounted.current ||
      !p.enabled ||
      !p.draft ||
      !experienceTarget(p.draft, id)
    )
      return;
    const next = clone(p.draft);
    edit(((next.experienceEnrichment ??= {})[id] ??= { version: 1 }));
    // Publish synchronously so two completed actions cannot merge into an older render.
    live.current = { ...p, draft: next };
    p.change(next, id);
  }
  function valid(id: string, profileId: string, capturedEpoch: number) {
    return (
      mounted.current &&
      epoch.current === capturedEpoch &&
      live.current.enabled &&
      live.current.draft?.id === profileId &&
      !!experienceTarget(live.current.draft, id)
    );
  }
  async function queue(id: string, force = false) {
    const p = live.current;
    if (!p.enabled || !p.draft || !p.request || inFlight.current) return;
    const identity = experienceScoreIdentity(
      p.draft,
      id,
      p.feedbackLocale ?? contentLocale(p.draft),
    );
    const s = stateOf(p.draft, id);
    const current = currentExperienceAssessment(p.draft, id);
    if (!experienceText(p.draft, id).trim() || (!force && current)) return;
    const samePending = s.scorePending?.scoreIdentity === identity;
    if (samePending && !(force && s.scoreError === "failed")) return;
    const attempt =
      samePending && s.scoreError === "failed"
        ? (s.scorePending!.request.scoreAttempt ?? 0) + 1
        : force && current && s.assessment?.scoreIdentity === identity
          ? (s.assessment.scoreAttempt ?? 0) + 1
          : 0;
    if (attempt > 100) return;
    const profileId = p.draft.id,
      capturedEpoch = epoch.current;
    inFlight.current = true;
    setActivity({ id, preparing: true });
    try {
      const [fingerprint, operationId] = await Promise.all([
        experienceScoreFingerprint(
          p.draft,
          id,
          p.feedbackLocale ?? contentLocale(p.draft),
        ),
        experienceScoreOperationId(
          p.draft,
          id,
          attempt,
          p.feedbackLocale ?? contentLocale(p.draft),
        ),
      ]);
      if (
        !valid(id, profileId, capturedEpoch) ||
        experienceScoreIdentity(
          live.current.draft!,
          id,
          p.feedbackLocale ?? contentLocale(p.draft),
        ) !== identity
      )
        return;
      armed.current.add(operationId);
      mutate(id, (s) => {
        s.scorePending = {
          id: operationId,
          body: experienceText(live.current.draft!, id),
          scoreIdentity: identity,
          request: {
            intent: "score",
            fingerprint,
            feedbackLocale: p.feedbackLocale ?? contentLocale(p.draft!),
            ...(attempt ? { scoreAttempt: attempt } : {}),
          },
        };
        delete s.scoreError;
      });
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setActivity(undefined);
        wake((n) => n + 1);
      }
    }
  }
  async function execute(id: string, manual = false) {
    const p = live.current,
      pending = p.draft && stateOf(p.draft, id).scorePending;
    if (!p.enabled || !p.request || !p.draft || !pending || inFlight.current)
      return;
    const recovery =
      attempted.current.has(pending.id) || !armed.current.has(pending.id);
    if (!recovery && !p.ready) return;
    const profileId = p.draft.id,
      capturedEpoch = epoch.current;
    let posted = !recovery;
    let retryFailedReceipt = false;
    inFlight.current = true;
    setActivity({ id, preparing: false });
    attempted.current.add(pending.id);
    retryAt.current.delete(pending.id);
    try {
      const context = {
        snapshotId: "",
        revision: 0,
        targetId: id,
        operationId: pending.id,
        experience: pending.request,
      };
      let result;
      try {
        result = await p.request(context, recovery);
      } catch (error) {
        // The pending identity was saved before dispatch. A refresh may find it never sent.
        // Reuse that exact UUID; the server's atomic claim protects a concurrent tab.
        const code = experienceErrorCode(error);
        if (
          !recovery ||
          !["MISSING", "NOT_FOUND"].includes(code) ||
          !valid(id, profileId, capturedEpoch) ||
          !live.current.ready ||
          stateOf(live.current.draft!, id).scorePending?.id !== pending.id ||
          (pending.scoreIdentity &&
            pending.scoreIdentity !==
              experienceScoreIdentity(
                live.current.draft!,
                id,
                stateOf(live.current.draft!, id).scorePending?.request
                  .feedbackLocale ??
                  live.current.feedbackLocale ??
                  live.current.draft!.language,
              ))
        )
          throw error;
        posted = true;
        result = await live.current.request!(context, false);
      }
      if (
        !valid(id, profileId, capturedEpoch) ||
        stateOf(live.current.draft!, id).scorePending?.id !== pending.id
      )
        return;
      if (
        result.intent !== "score" ||
        result.fingerprint !== pending.request.fingerprint ||
        result.targetId !== id
      )
        throw Error("AI_OUTPUT_INVALID");
      const current = live.current.draft!;
      const matches = pending.scoreIdentity
        ? experienceScoreIdentity(
            current,
            id,
            pending.request.feedbackLocale ?? current.language,
          ) === pending.scoreIdentity
        : experienceText(current, id) === pending.body;
      if (matches) {
        const previous = stateOf(current, id).assessment;
        setLastChecks((checks) => ({
          ...checks,
          [id]: {
            before:
              previous?.value.rubric === "experience-quality/3" &&
              previous.value.feedbackLocale ===
                (pending.request.feedbackLocale ?? current.language)
                ? previous.value.score
                : undefined,
            after: result.assessment.score,
          },
        }));
      }
      mutate(id, (s) => {
        delete s.scorePending;
        delete s.scoreError;
        if (matches)
          s.assessment = {
            fingerprint: result.fingerprint,
            body: pending.body,
            value: result.assessment,
            scoreAttempt: pending.request.scoreAttempt ?? 0,
            scoreIdentity:
              pending.scoreIdentity ??
              experienceScoreIdentity(
                current,
                id,
                pending.request.feedbackLocale ?? current.language,
              ),
          };
      });
    } catch (error) {
      if (
        !valid(id, profileId, capturedEpoch) ||
        stateOf(live.current.draft!, id).scorePending?.id !== pending.id
      )
        return;
      const code = experienceErrorCode(error);
      const failed =
        experienceDefiniteFailures.has(code) ||
        code === "AI_RESULT_UNAVAILABLE";
      retryFailedReceipt =
        manual &&
        recovery &&
        !posted &&
        stateOf(live.current.draft!, id).scoreError === "failed" &&
        [
          "AI_RESULT_UNAVAILABLE",
          "AI_OUTPUT_INVALID",
          "AI_OUTPUT_TRUNCATED",
          "AI_PROVIDER_REJECTED",
          "AI_REQUEST_FAILED",
          "INVALID_SCOPED_CONTEXT",
          "AI_UNCONFIGURED",
          "AI_DISABLED",
        ].includes(code);
      mutate(id, (s) => {
        s.scoreError = failed
          ? "failed"
          : ["MISSING", "NOT_FOUND"].includes(code)
            ? "not_started"
            : "unknown";
      });
      const count = manual ? 0 : (polls.current.get(pending.id) ?? 0);
      if (!failed && count < experienceRecoveryDelays.length) {
        polls.current.set(pending.id, count + 1);
        retryAt.current.set(
          pending.id,
          Date.now() + experienceRecoveryDelays[count],
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setActivity(undefined);
        wake((n) => n + 1);
      }
      if (retryFailedReceipt && valid(id, profileId, capturedEpoch))
        void queue(id, true);
    }
  }
  async function check(id: string) {
    const p = live.current;
    if (!p.enabled || !p.draft || !experienceTarget(p.draft, id)) return;
    if (inFlight.current) {
      requestedChecks.current.add(id);
      return;
    }
    const s = stateOf(p.draft, id);
    if (
      s.scorePending &&
      (!s.scorePending.scoreIdentity ||
        s.scorePending.scoreIdentity ===
          experienceScoreIdentity(
            p.draft,
            id,
            s.scorePending.request.feedbackLocale ?? contentLocale(p.draft),
          ))
    )
      await execute(id, true);
    else await queue(id, true);
  }

  // Only semantic inputs restart the edit-settling timer. Autosaves and scoring writes do not.
  const inputs = props.draft
    ? JSON.stringify(
        experienceTargets(props.draft).map((r) => [
          r.id,
          experienceScoreIdentity(props.draft!, r.id),
        ]),
      )
    : "";
  const settled = useRef("");
  useEffect(() => {
    settled.current = "";
    const timer = setTimeout(() => {
      settled.current = inputs;
      wake((n) => n + 1);
    }, experiencePolicy.settleMs);
    return () => clearTimeout(timer);
  }, [inputs, props.enabled]);
  useEffect(() => {
    const p = live.current;
    if (!p.enabled || !p.draft || !p.request || inFlight.current) return;
    const relevant = new Set(
      experienceTargets(p.draft).flatMap((role) => {
        const pending = stateOf(p.draft!, role.id).scorePending;
        return pending &&
          (!pending.scoreIdentity ||
            pending.scoreIdentity ===
              experienceScoreIdentity(
                p.draft!,
                role.id,
                pending?.request.feedbackLocale ?? contentLocale(p.draft!),
              ))
          ? [pending.id]
          : [];
      }),
    );
    for (const id of retryAt.current.keys())
      if (!relevant.has(id)) retryAt.current.delete(id);
    const roles = experienceTargets(p.draft).sort(
      (a, b) => Number(b.id === p.priority) - Number(a.id === p.priority),
    );
    const foreground = roles.some((role) => {
      const request = stateOf(p.draft!, role.id).pending?.request;
      return request && request.intent !== "score";
    });
    const requested = roles.find((role) =>
      requestedChecks.current.has(role.id),
    );
    if (requested && !foreground) {
      requestedChecks.current.delete(requested.id);
      void check(requested.id);
      return;
    }
    // Recover already-dispatched requests even while unrelated edits await saving.
    for (const role of roles) {
      const s = stateOf(p.draft, role.id),
        pending = s.scorePending;
      if (!pending || s.scoreError === "failed") continue;
      if (
        pending.scoreIdentity &&
        pending.scoreIdentity !==
          experienceScoreIdentity(
            p.draft,
            role.id,
            s.scorePending?.request.feedbackLocale ?? contentLocale(p.draft),
          )
      )
        continue;
      if (s.scoreError && attempted.current.has(pending.id)) {
        const at = retryAt.current.get(pending.id);
        if (!at) continue;
        if (at > Date.now()) continue;
      }
      if (
        !attempted.current.has(pending.id) ||
        retryAt.current.has(pending.id)
      ) {
        if (
          armed.current.has(pending.id) &&
          (!p.ready || foreground) &&
          !attempted.current.has(pending.id)
        )
          continue;
        void execute(role.id);
        return;
      }
    }
    if (p.ready && !foreground && settled.current === inputs) {
      for (const role of roles) {
        const s = stateOf(p.draft, role.id);
        if (currentExperienceAssessment(p.draft, role.id)) {
          // Adopt valid legacy saved results without another paid request.
          if (s.assessment && !s.assessment.scoreIdentity) {
            mutate(role.id, (s) => {
              s.assessment!.scoreIdentity = experienceScoreIdentity(
                live.current.draft!,
                role.id,
                s.assessment!.value.rubric === "experience-quality/3"
                  ? s.assessment!.value.feedbackLocale
                  : live.current.draft!.language,
              );
            });
            return;
          }
          continue;
        }
        if (!experienceText(p.draft, role.id).trim()) continue;
        if (
          s.scorePending &&
          (s.scorePending.scoreIdentity ===
            experienceScoreIdentity(
              p.draft,
              role.id,
              s.scorePending?.request.feedbackLocale ?? contentLocale(p.draft),
            ) ||
            (!s.scorePending.scoreIdentity &&
              s.scorePending.body === experienceText(p.draft, role.id)))
        )
          continue;
        void queue(role.id);
        return;
      }
    }
    const next = Math.min(...retryAt.current.values());
    if (Number.isFinite(next)) {
      const timer = setTimeout(
        () => wake((n) => n + 1),
        Math.max(1, next - Date.now()),
      );
      return () => clearTimeout(timer);
    }
  });

  return {
    forRole: (id) => {
      const s =
        props.draft && !!experienceTarget(props.draft, id)
          ? stateOf(props.draft, id)
          : ({ version: 1 } as ExperienceSession);
      const exists = !!props.draft && !!experienceTarget(props.draft, id);
      const current = exists && !!currentExperienceAssessment(props.draft!, id);
      const relevant =
        s.scorePending &&
        props.draft &&
        (!s.scorePending.scoreIdentity ||
          s.scorePending.scoreIdentity ===
            experienceScoreIdentity(
              props.draft,
              id,
              s.scorePending.request.feedbackLocale ??
                contentLocale(props.draft),
            ));
      return {
        queue: async (_base, force) => {
          await queue(id, force);
        },
        check: () => check(id),
        running: activity?.id === id && !activity.preparing,
        preparing:
          (activity?.id === id && activity.preparing) ||
          (exists &&
            !!experienceText(props.draft!, id).trim() &&
            !current &&
            !(relevant && s.scoreError)),
        lastCheck: lastChecks[id],
        pending: relevant ? s.scorePending : undefined,
        error: relevant ? s.scoreError : undefined,
        current,
        automatic: true,
      };
    },
  };
}
