import { contentLocale } from "@resumora/contracts/editor/content-language";
import { useEffect, useRef, useState } from "react";
import { clone, type BaseDraft } from "../base/model";
import type { IntelligenceClient } from "../base/intelligence";
import {
  currentExperienceAssessment,
  experienceFingerprint,
  experienceIdentity,
  experienceText,
  experienceTargets,
  type ExperienceSession,
} from "@resumora/contracts/intelligence/experience";
import {
  experienceDefiniteFailures,
  experienceErrorCode,
} from "../base/experience-requests";

type Props = {
  draft: BaseDraft | null;
  feedbackLocale?: string;
  enabled: boolean;
  ready: boolean;
  priority?: string;
  change: (draft: BaseDraft, roleId: string, kind?: "questions") => void;
  request?: NonNullable<IntelligenceClient["experience"]>;
};
/** At most three missing diagnostic questions per role, one saved request at a time. */
export function usePreparedExperienceQuestions(props: Props) {
  const live = useRef(props);
  live.current = props;
  const mounted = useRef(false),
    busy = useRef(false),
    epoch = useRef(0);
  const [, wake] = useState(0);
  const armed = useRef(new Set<string>()),
    attempted = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    epoch.current++;
    armed.current.clear();
    attempted.current.clear();
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, [props.draft?.id, props.enabled]);
  function mutate(id: string, edit: (s: ExperienceSession) => void) {
    const p = live.current;
    if (!mounted.current || !p.draft) return;
    const next = clone(p.draft);
    edit(((next.experienceEnrichment ??= {})[id] ??= { version: 1 }));
    live.current = { ...p, draft: next };
    p.change(next, id, "questions");
  }
  const foreground = (p: Props) =>
    !!p.draft &&
    experienceTargets(p.draft).some(
      (r) => !!p.draft!.experienceEnrichment?.[r.id]?.pending,
    );
  async function prepare() {
    const p = live.current;
    if (
      busy.current ||
      !p.enabled ||
      !p.ready ||
      !p.draft ||
      !p.request ||
      foreground(p)
    )
      return;
    busy.current = true;
    const profileId = p.draft.id,
      locale = p.feedbackLocale ?? contentLocale(p.draft),
      capturedEpoch = epoch.current;
    let dispatched = false;
    const valid = (id?: string) =>
      mounted.current &&
      epoch.current === capturedEpoch &&
      live.current.enabled &&
      live.current.draft?.id === profileId &&
      (!id || experienceTargets(live.current.draft).some((r) => r.id === id));
    try {
      const roles = experienceTargets(p.draft).sort(
        (a, b) => Number(b.id === p.priority) - Number(a.id === p.priority),
      );
      // Each finished assessment can prepare independently; another role's slow score is not a barrier.
      for (const role of roles) {
        const assessment = currentExperienceAssessment(
          p.draft,
          role.id,
          locale,
        );
        const saved =
          live.current.draft!.experienceEnrichment?.[role.id]
            ?.questionPreparations ?? [];
        const pendingPoints = saved
          .filter(
            (e) =>
              e.status === "pending" &&
              e.request.feedbackLocale === locale &&
              !attempted.current.has(e.id),
          )
          .map((e) => ({ point: e.request.point! }));
        const freshPoints =
          assessment?.rubric === "experience-quality/3" && assessment.score < 80
            ? assessment.points
                .filter(
                  (point) =>
                    point.score < 80 &&
                    point.issue !== "duplicate" &&
                    !point.suggestedQuestion,
                )
                .slice(0, 3)
            : [];
        const candidates = [...pendingPoints, ...freshPoints];
        if (!candidates.length) continue;
        const identity = experienceIdentity(p.draft, role.id),
          fingerprint = await experienceFingerprint(p.draft, role.id);
        if (
          !valid() ||
          (live.current.feedbackLocale ??
            contentLocale(live.current.draft!)) !== locale ||
          !live.current.ready ||
          foreground(live.current) ||
          experienceIdentity(live.current.draft!, role.id) !== identity
        )
          return;
        const entries =
          live.current.draft!.experienceEnrichment?.[role.id]
            ?.questionPreparations ?? [];
        for (const candidate of candidates) {
          const session = live.current.draft!.experienceEnrichment?.[role.id];
          if (
            [session?.round, ...(session?.rounds ?? [])].some(
              (round) =>
                round?.fingerprint === fingerprint &&
                round.feedbackLocale === locale &&
                round.point?.start === candidate.point.start &&
                round.point.text === candidate.point.text,
            )
          )
            continue;
          const existing = entries.find(
            (e) =>
              e.request.fingerprint === fingerprint &&
              e.request.feedbackLocale === locale &&
              e.request.point?.start === candidate.point.start &&
              e.request.point.text === candidate.point.text,
          );
          if (existing) {
            if (
              existing.status !== "pending" ||
              attempted.current.has(existing.id)
            )
              continue;
            attempted.current.add(existing.id);
            const recover = !armed.current.has(existing.id);
            try {
              dispatched = true;
              const result = await live.current.request!(
                {
                  snapshotId: "",
                  revision: 0,
                  targetId: role.id,
                  operationId: existing.id,
                  experience: existing.request,
                },
                recover,
              );
              if (!valid(role.id)) return;
              if (
                result.intent !== "questions" ||
                result.targetId !== role.id ||
                result.fingerprint !== fingerprint ||
                result.point?.start !== candidate.point.start ||
                result.point?.text !== candidate.point.text
              )
                throw Error("AI_OUTPUT_INVALID");
              mutate(role.id, (s) => {
                const entry = s.questionPreparations?.find(
                  (e) => e.id === existing.id,
                );
                if (entry) {
                  entry.status = "ready";
                  entry.questions = result.questions;
                }
              });
            } catch (error) {
              if (!valid(role.id)) return;
              mutate(role.id, (s) => {
                const entry = s.questionPreparations?.find(
                  (e) => e.id === existing.id,
                );
                if (entry)
                  entry.status = experienceDefiniteFailures.has(
                    experienceErrorCode(error),
                  )
                    ? "failed"
                    : "unknown";
              });
            }
            return;
          }
          // A stale saved receipt is never silently replaced with a new paid operation.
          if (
            !freshPoints.some(
              (p) =>
                p.point.start === candidate.point.start &&
                p.point.text === candidate.point.text,
            )
          )
            continue;
          const keep = entries.filter(
            (e) =>
              e.status === "pending" ||
              e.status === "unknown" ||
              (e.request.fingerprint === fingerprint &&
                e.request.feedbackLocale === locale),
          );
          if (keep.length >= 3) break;
          const id = crypto.randomUUID();
          armed.current.add(id);
          mutate(role.id, (s) => {
            s.questionPreparations = [
              ...keep,
              {
                id,
                status: "pending",
                request: {
                  intent: "questions",
                  fingerprint,
                  feedbackLocale: locale,
                  point: candidate.point,
                },
              },
            ];
          });
          return;
        }
      }
    } catch {
      // Hashing or a removed role must not leave an unhandled background rejection.
      // A later semantic edit or explicit foreground action can try again.
    } finally {
      busy.current = false;
      if (mounted.current && (dispatched || capturedEpoch !== epoch.current))
        wake((n) => n + 1);
      // A pending request is dispatched only on a later render after the receipt is saved.
    }
  }
  useEffect(() => {
    if (
      !props.enabled ||
      !props.ready ||
      !props.draft ||
      busy.current ||
      foreground(props)
    )
      return;
    const timer = setTimeout(() => void prepare(), 400);
    return () => clearTimeout(timer);
  });
}
