import { contentLocale } from "@resumora/contracts/editor/content-language";
import { useContext, useEffect, useRef, useState } from "react";
import {
  ExperienceScoresContext,
  type ExperienceScoreController,
} from "./useProfileExperienceScores";
import { clone, type BaseDraft } from "../base/model";
import {
  experienceText,
  experienceFingerprint,
  experienceIdentity,
  currentExperienceAssessment,
  type ExperienceSession,
} from "@resumora/contracts/intelligence/experience";
import { LanguageContext } from "./ui";
import type { IntelligenceClient } from "../base/intelligence";
import {
  experienceDefiniteFailures,
  experienceRecoveryDelays,
  experienceErrorCode,
} from "../base/experience-requests";
type Props = {
  draft: BaseDraft;
  targetId: string;
  change: (d: BaseDraft) => void;
  ready: boolean;
  request: NonNullable<IntelligenceClient["experience"]>;
};
const stateOf = (d: BaseDraft, id: string) =>
  d.experienceEnrichment?.[id] ?? { version: 1 };
/** Scores are advisory. Their requests, errors, and recovery cannot lock the editor. */
export function useExperienceScore(props: Props): ExperienceScoreController {
  const shared = useContext(ExperienceScoresContext);
  const feedbackLocale = contentLocale(props.draft);
  const local = useLocalExperienceScore({ ...props, feedbackLocale }, !shared);
  return shared ? shared.forRole(props.targetId) : local;
}
function useLocalExperienceScore(
  props: Props & { feedbackLocale: string },
  enabled: boolean,
) {
  const live = useRef(props);
  live.current = props;
  const alive = useRef(true),
    inFlight = useRef(false),
    queueing = useRef(false),
    armed = useRef(new Set<string>()),
    attempted = useRef(new Set<string>()),
    polls = useRef(new Map<string, number>()),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queued = useRef<{ base: BaseDraft; force: boolean } | undefined>(
    undefined,
  );
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [lastCheck, setLastCheck] = useState<{
    before?: number;
    after: number;
  }>();
  const id = props.targetId,
    session = stateOf(props.draft, id),
    pending = session.scorePending;
  const change = (mutate: (s: ExperienceSession) => void) => {
    const p = live.current,
      next = clone(p.draft);
    mutate(((next.experienceEnrichment ??= {})[id] ??= { version: 1 }));
    p.change(next);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  // Older saved drafts used the foreground lane for scoring. Resume the same ID, never create work on mount.
  useEffect(() => {
    if (!enabled) return;
    if (session.pending?.request.intent !== "score" || pending) return;
    const original = session.pending;
    void experienceFingerprint(props.draft, id).then((fingerprint) => {
      if (
        !alive.current ||
        stateOf(live.current.draft, id).pending?.id !== original.id
      )
        return;
      change((s) => {
        s.scorePending = {
          ...original,
          body:
            fingerprint === original.request.fingerprint
              ? experienceText(live.current.draft, id)
              : "",
        };
        delete s.pending;
      });
    });
  }, [session.pending?.id, pending?.id]);
  async function queue(base = live.current.draft, force = false) {
    if (queueing.current) {
      queued.current = { base, force };
      return;
    }
    queueing.current = true;
    setPreparing(true);
    setLastCheck(undefined);
    try {
      const body = experienceText(base, id),
        identity = experienceIdentity(base, id),
        s = stateOf(base, id);
      if (!body.trim() || (!force && !!currentExperienceAssessment(base, id)))
        return;
      if (s.scorePending?.body === body) {
        if (force) void execute(true);
        return;
      }
      const fingerprint = await experienceFingerprint(base, id);
      if (
        !alive.current ||
        queued.current ||
        experienceIdentity(live.current.draft, id) !== identity
      )
        return;
      const request = {
        id: crypto.randomUUID(),
        request: {
          intent: "score" as const,
          fingerprint,
          feedbackLocale: live.current.feedbackLocale,
        },
        body,
      };
      armed.current.add(request.id);
      clearTimeout(timer.current);
      change((s) => {
        s.scorePending = request;
        delete s.scoreError;
      });
    } finally {
      queueing.current = false;
      if (alive.current) setPreparing(false);
      const next = queued.current;
      queued.current = undefined;
      if (next && alive.current) void queue(next.base, next.force);
    }
  }
  async function execute(recover: boolean) {
    const p = stateOf(live.current.draft, id).scorePending;
    if (!p || inFlight.current || (!recover && !live.current.ready)) return;
    inFlight.current = true;
    setRunning(true);
    clearTimeout(timer.current);
    attempted.current.add(p.id);
    try {
      const result = await live.current.request(
        {
          snapshotId: "",
          revision: 0,
          targetId: id,
          operationId: p.id,
          experience: p.request,
        },
        recover,
      );
      if (
        !alive.current ||
        stateOf(live.current.draft, id).scorePending?.id !== p.id
      )
        return;
      if (
        result.intent === "score" &&
        experienceText(live.current.draft, id) === p.body
      ) {
        const previous = stateOf(live.current.draft, id).assessment;
        setLastCheck({
          before:
            previous?.value.rubric === "experience-quality/3" &&
            previous.value.feedbackLocale ===
              (p.request.feedbackLocale ?? live.current.draft.language)
              ? previous.value.score
              : undefined,
          after: result.assessment.score,
        });
      }
      change((s) => {
        delete s.scorePending;
        delete s.scoreError;
        if (
          result.intent === "score" &&
          experienceText(live.current.draft, id) === p.body
        )
          s.assessment = {
            fingerprint: result.fingerprint,
            body: p.body,
            value: result.assessment,
          };
      });
    } catch (error) {
      if (
        !alive.current ||
        stateOf(live.current.draft, id).scorePending?.id !== p.id
      )
        return;
      const code = experienceErrorCode(error);
      if (experienceDefiniteFailures.has(code))
        change((s) => {
          delete s.scorePending;
          s.scoreError = "failed";
        });
      else {
        const missing = code === "MISSING" || code === "NOT_FOUND";
        change((s) => {
          s.scoreError = missing ? "not_started" : "unknown";
        });
        const count = polls.current.get(p.id) ?? 0;
        if (!missing && count < experienceRecoveryDelays.length) {
          polls.current.set(p.id, count + 1);
          timer.current = setTimeout(
            () => void execute(true),
            experienceRecoveryDelays[count],
          );
        }
      }
    } finally {
      inFlight.current = false;
      if (alive.current) setRunning(false);
    }
  }
  useEffect(() => {
    if (!enabled) return;
    if (!pending || running || attempted.current.has(pending.id)) return;
    if (armed.current.has(pending.id) && !props.ready) return;
    void execute(!armed.current.has(pending.id));
  }, [pending?.id, props.ready, running]);
  return {
    queue,
    current: !!currentExperienceAssessment(props.draft, id),
    running,
    preparing,
    lastCheck,
    pending,
    error: session.scoreError,
    check: () =>
      pending
        ? execute(session.scoreError !== "not_started")
        : queue(live.current.draft, true),
  };
}
