import { contentLocale } from "@resumora/contracts/editor/content-language";
import { useContext, useEffect, useRef, useState } from "react";
import { clone, localId, type BaseDraft } from "../base/model";
import {
  currentExperienceAssessment,
  experienceScoreIdentity,
  type CoachingQuestion,
  experienceFingerprint,
  experienceIdentity,
  experienceText,
  type ExperienceRequest,
  type PointRef,
  type ExperienceSession,
} from "@resumora/contracts/intelligence/experience";
import {
  applyExperienceRole,
  confirmExperienceDetail,
  undoExperiencePoint,
} from "../base/experience";
import {
  experienceDefiniteFailures,
  experienceErrorCode,
  experienceRecoveryDelays,
} from "../base/experience-requests";
import type { IntelligenceClient } from "../base/intelligence";
import { LanguageContext } from "./ui";

export type GuidedExperienceProps = {
  draft: BaseDraft;
  targetId: string;
  change: (draft: BaseDraft) => void;
  ready: boolean;
  saveFailed: boolean;
  retrySave?: () => void;
  request: NonNullable<IntelligenceClient["experience"]>;
  transcribe?: (audio: Blob, signal: AbortSignal) => Promise<string>;
  close?: () => void;
};
const stateOf = (d: BaseDraft, id: string): ExperienceSession =>
  d.experienceEnrichment?.[id] ?? { version: 1 };
/** Only an explicit action arms generation. Mount and uncertain outcomes read existing receipts. */
export function useGuidedExperience(props: GuidedExperienceProps) {
  const locale = contentLocale(props.draft),
    id = props.targetId;
  const live = useRef(props);
  live.current = props;
  const mounted = useRef(false),
    epoch = useRef(0),
    armed = useRef(new Set<string>()),
    attempted = useRef(new Set<string>());
  const scope = useRef(`${props.draft.id}:${id}`),
    accepting = useRef(false);
  const active = useRef(false),
    queueing = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const polls = useRef(new Map<string, number>());
  const timings = useRef(new Map<string, { began: number; first: boolean }>());
  const observe = (operationId: string, phase: "first_draft" | "ready") => {
    const timing = timings.current.get(operationId);
    if (!timing || (phase === "first_draft" && timing.first)) return;
    if (phase === "first_draft") timing.first = true;
    try {
      console.debug("experience-timing", {
        domain: "browser",
        operationId,
        phase,
        elapsedMs: Math.round(performance.now() - timing.began),
      });
    } catch {
      /* Best effort, no content. */
    }
  };
  const [working, setWorking] = useState(false),
    [preparing, setPreparing] = useState(false);
  const [stream, setStream] = useState(""),
    [error, setError] = useState("");
  const [streamOperationId, setStreamOperationId] = useState("");
  const receivedDraft = useRef(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [awaitingPreparation, setAwaitingPreparation] = useState<string>();
  const cachedFingerprint = useRef<
    { identity: string; fingerprint: string } | undefined
  >(undefined);
  const confirmedRound = useRef<{ id: string; identity: string } | undefined>(
    undefined,
  );
  const liveLocale = useRef(locale);
  liveLocale.current = locale;
  const questionScope = experienceScoreIdentity(props.draft, id, locale);
  const experienceInput = experienceIdentity(props.draft, id);
  const [proposalPin, setProposalPin] = useState<{
    identity: string;
    fingerprint: string;
  }>();
  const proposalFingerprint = stateOf(props.draft, id).roleProposal
    ?.fingerprint;
  useEffect(() => {
    if (!proposalFingerprint) return;
    let active = true;
    void experienceFingerprint(props.draft, id).then((fingerprint) => {
      if (active) setProposalPin({ identity: experienceInput, fingerprint });
    });
    return () => {
      active = false;
    };
  }, [experienceInput, proposalFingerprint]);
  useEffect(() => {
    setQuestionsOpen(false);
    setAwaitingPreparation(undefined);
  }, [questionScope]);
  const [acceptedHere, setAcceptedHere] = useState(false);
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    mounted.current = true;
    const nextScope = `${props.draft.id}:${id}`;
    if (scope.current !== nextScope) {
      scope.current = nextScope;
      epoch.current++;
      armed.current.clear();
      attempted.current.clear();
    }
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, [props.draft.id, id]);
  const publish = (next: BaseDraft) => {
    if (!mounted.current || next.id !== live.current.draft.id) return;
    live.current = { ...live.current, draft: next };
    props.change(next);
  };
  const edit = (
    fn: (s: ExperienceSession, d: BaseDraft) => void,
    base = live.current.draft,
  ) => {
    const next = clone(base),
      state = ((next.experienceEnrichment ??= {})[id] ??= { version: 1 });
    state.guided = true;
    fn(state, next);
    publish(next);
    return next;
  };
  async function queue(
    intent: ExperienceRequest["intent"],
    base = live.current.draft,
    point?: PointRef,
  ) {
    if (queueing.current || stateOf(base, id).pending || active.current) return;
    queueing.current = true;
    const began = performance.now();
    setPreparing(true);
    setError("");
    const generation = epoch.current;
    try {
      const identity = experienceIdentity(base, id),
        fingerprint = await experienceFingerprint(base, id);
      if (
        !mounted.current ||
        generation !== epoch.current ||
        identity !== experienceIdentity(live.current.draft, id)
      )
        return;
      const candidate = stateOf(base, id).candidate;
      if (
        intent === "preview" &&
        (!candidate?.trim() ||
          candidate !== stateOf(live.current.draft, id).candidate)
      )
        return;
      if (intent === "questions") {
        const prepared = stateOf(
          live.current.draft,
          id,
        ).questionPreparations?.find(
          (p) =>
            p.request.fingerprint === fingerprint &&
            p.request.feedbackLocale === locale &&
            p.request.point?.start === point?.start &&
            p.request.point?.text === point?.text,
        );
        if (prepared?.status === "ready") {
          openQuestions(fingerprint, prepared.questions!, point);
          return;
        }
        if (prepared?.status === "pending") {
          setAwaitingPreparation(prepared.id);
          return;
        }
        if (prepared?.status === "unknown") {
          edit((s) => {
            s.pending = { id: prepared.id, request: prepared.request };
          });
          return;
        }
      }
      const pending = {
        id: crypto.randomUUID(),
        request: {
          intent,
          fingerprint,
          feedbackLocale: locale,
          ...(point ? { point } : {}),
          ...(intent === "preview" ? { candidate } : {}),
        },
      };
      armed.current.add(pending.id);
      if (timings.current.size >= 64)
        timings.current.delete(timings.current.keys().next().value!);
      timings.current.set(pending.id, { began, first: false });
      edit((s) => {
        s.pending = pending;
        delete s.previewFailed;
      });
    } finally {
      queueing.current = false;
      if (mounted.current) setPreparing(false);
    }
  }
  async function execute(recover: boolean) {
    const p = stateOf(live.current.draft, id).pending;
    if (!p || active.current || (!recover && !live.current.ready)) return;
    active.current = true;
    attempted.current.add(p.id);
    clearTimeout(timer.current);
    const generation = epoch.current;
    setWorking(true);
    setError("");
    if (!recover) {
      setStream("");
      setStreamOperationId(p.id);
      receivedDraft.current = false;
    }
    const current = () =>
      mounted.current &&
      generation === epoch.current &&
      stateOf(live.current.draft, id).pending?.id === p.id;
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
        p.request.intent === "role" && !recover
          ? (text) => {
              if (current()) {
                if (text) observe(p.id, "first_draft");
                receivedDraft.current = !!text;
                setStream(text);
              }
            }
          : undefined,
      );
      if (!current()) return;
      const identity = experienceIdentity(live.current.draft, id),
        fingerprint = await experienceFingerprint(live.current.draft, id);
      if (!current()) return;
      if (
        identity !== experienceIdentity(live.current.draft, id) ||
        fingerprint !== result.fingerprint ||
        result.intent !== p.request.intent ||
        result.targetId !== id
      ) {
        setStream("");
        edit((s) => {
          delete s.pending;
        });
        setError("STALE_INPUT");
        if (p.request.intent === "questions") setQuestionsOpen(false);
        return;
      }
      edit((s, d) => {
        delete s.pending;
        if (result.intent === "role") {
          s.roleProposal = result;
          s.candidate = result.text;
          delete s.preview;
          delete s.previewFailed;
          delete s.acceptedText;
          delete s.round;
        }
        if (result.intent === "preview" && s.candidate === result.candidate)
          s.preview = result;
        if (result.intent === "questions") {
          if (s.round) {
            s.rounds = [
              ...(s.rounds ?? []).filter((r) => r.id !== s.round!.id),
              s.round,
            ].slice(-100);
          }
          s.round = {
            id: p.id,
            fingerprint,
            feedbackLocale: p.request.feedbackLocale,
            ...(p.request.point ? { point: p.request.point } : {}),
            questions: result.questions,
            answerIds: result.questions.map(() => localId()),
          };
          for (const [i, q] of result.questions.entries())
            d.answers.push({
              id: s.round.answerIds[i],
              targetId: id,
              question: q.dimension,
              questionText: q.text,
              text: "",
              status: "draft",
            });
        }
        if (result.intent === "skills") {
          s.skills = result;
          s.skillsIdentity = identity;
        }
      });
      if (result.intent === "role")
        setStream(receivedDraft.current ? result.text : "");
      observe(p.id, "ready");
      timings.current.delete(p.id);
      if (result.intent === "questions") {
        if (!result.questions.length) {
          setNotice("no_questions");
          setQuestionsOpen(false);
        }
      }
    } catch (e) {
      if (!current()) return;
      const code = experienceErrorCode(e);
      setError(code);
      if (p.request.intent !== "preview") setStream("");
      if (experienceDefiniteFailures.has(code)) {
        if (p.request.intent === "questions") setQuestionsOpen(false);
        edit((s) => {
          delete s.pending;
          if (p.request.intent === "preview") s.previewFailed = true;
        });
      } else {
        const count = polls.current.get(p.id) ?? 0;
        if (
          !["AI_RESULT_UNAVAILABLE", "MISSING"].includes(code) &&
          count < experienceRecoveryDelays.length
        ) {
          polls.current.set(p.id, count + 1);
          timer.current = setTimeout(
            () => void execute(true),
            experienceRecoveryDelays[count],
          );
        }
      }
    } finally {
      active.current = false;
      if (mounted.current && generation === epoch.current) setWorking(false);
    }
  }
  const storedState = stateOf(props.draft, id);
  const proposalCompatible =
    !storedState.roleProposal ||
    (proposalPin?.identity === experienceInput &&
      proposalPin.fingerprint === storedState.roleProposal.fingerprint);
  const state = proposalCompatible
    ? storedState
    : {
        ...storedState,
        roleProposal: undefined,
        candidate: undefined,
        preview: undefined,
      };
  const pending = state.pending;
  useEffect(() => {
    if (
      !pending ||
      attempted.current.has(pending.id) ||
      (armed.current.has(pending.id) && !props.ready)
    )
      return;
    void execute(!armed.current.has(pending.id));
  }, [pending?.id, props.ready]);
  useEffect(() => {
    if (
      !props.ready ||
      pending ||
      !state.roleProposal ||
      !state.candidate?.trim() ||
      state.previewFailed ||
      state.preview?.candidate === state.candidate
    )
      return;
    const timeout = setTimeout(() => void queue("preview"), 1500);
    return () => clearTimeout(timeout);
  }, [
    props.ready,
    pending?.id,
    state.candidate,
    state.roleProposal,
    state.preview,
    state.previewFailed,
  ]);
  const foreground = !!pending && pending.request.intent !== "preview";
  useEffect(() => {
    setElapsed(0);
    if (!foreground || !working) return;
    const start = Date.now(),
      tick = setInterval(
        () => setElapsed(Math.floor((Date.now() - start) / 1000)),
        1000,
      );
    return () => clearInterval(tick);
  }, [foreground, working]);
  const qIndex =
    state.round?.answerIds.findIndex(
      (answerId) =>
        !props.draft.answers.some(
          (a) =>
            a.id === answerId &&
            ["confirmed", "skipped", "unknown"].includes(a.status),
        ),
    ) ?? -1;
  const question =
    (state.round?.feedbackLocale ??
      (props.draft.contentLanguage?.source !== "user-correction"
        ? props.draft.language
        : undefined)) === locale && qIndex >= 0
      ? state.round?.questions[qIndex]
      : undefined;
  const answer = question
    ? props.draft.answers.find((a) => a.id === state.round!.answerIds[qIndex])
    : undefined;
  function answerText(text: string) {
    if (!answer) return;
    edit((_s, d) => {
      const a = d.answers.find((a) => a.id === answer.id);
      if (a?.status === "draft") a.text = text.slice(0, 4000);
    });
  }
  function appendAnswerText(text: string): boolean {
    const current = live.current.draft.answers.find((a) => a.id === answer?.id);
    if (!current || current.status !== "draft") return false;
    const merged = [current.text.trimEnd(), text].filter(Boolean).join("\n");
    if (merged.length > 4000) return false;
    answerText(merged);
    return true;
  }
  async function advance(skip = false, propose = false) {
    if (!question || !answer || (!skip && !answer.text.trim())) return;
    let next = live.current.draft;
    if (skip) {
      next = clone(next);
      next.answers.find((a) => a.id === answer.id)!.status = "skipped";
    } else
      next = confirmExperienceDetail(
        next,
        id,
        answer.text,
        question.text,
        question.dimension,
        answer.id,
      );
    const roundId = state.round!.id;
    const identity = experienceIdentity(next, id);
    if (!skip) confirmedRound.current = { id: roundId, identity };
    publish(next);
    if (qIndex === state.round!.questions.length - 1) {
      setQuestionsOpen(false);
      setNotice("saved");
      if (propose && !skip) void queue("role", next);
    }
    if (!skip) {
      const generation = epoch.current;
      try {
        const fingerprint = await experienceFingerprint(next, id);
        if (
          !mounted.current ||
          generation !== epoch.current ||
          identity !== experienceIdentity(live.current.draft, id)
        )
          return;
        cachedFingerprint.current = { identity, fingerprint };
        edit((s) => {
          const round = [s.round, ...(s.rounds ?? [])].find(
            (r) => r?.id === roundId,
          );
          if (round) round.fingerprint = fingerprint;
        });
      } catch {
        // The in-memory identity still permits revisiting this round; no generation is retried.
      }
    }
  }
  function editCandidate(text: string) {
    edit((s) => {
      s.candidate = text.slice(0, 12000);
      delete s.preview;
      delete s.previewFailed;
    });
  }
  async function accept() {
    if (accepting.current) return;
    accepting.current = true;
    try {
      const before = live.current.draft,
        s = stateOf(before, id);
      if (!s.roleProposal || !s.candidate?.trim()) return;
      const identity = experienceIdentity(before, id),
        fingerprint = await experienceFingerprint(before, id);
      if (
        !mounted.current ||
        identity !== experienceIdentity(live.current.draft, id) ||
        fingerprint !== s.roleProposal.fingerprint ||
        s.candidate !== stateOf(live.current.draft, id).candidate
      ) {
        setError("STALE_INPUT");
        return;
      }
      setAcceptedHere(true);
      publish(
        applyExperienceRole(
          live.current.draft,
          id,
          s.candidate,
          s.candidate === s.roleProposal.text
            ? "ai_generated"
            : "user_authored",
        ),
      );
      setError("");
      setStream("");
    } finally {
      accepting.current = false;
    }
  }
  function openQuestions(
    fingerprint: string,
    questions: CoachingQuestion[],
    point?: PointRef,
  ) {
    setError("");
    setAwaitingPreparation(undefined);
    if (!questions.length) {
      setQuestionsOpen(false);
      setNotice("no_questions");
      return;
    }
    edit((s, d) => {
      if (s.round) s.rounds = [...(s.rounds ?? []), s.round].slice(-100);
      s.round = {
        id: crypto.randomUUID(),
        fingerprint,
        feedbackLocale: locale,
        ...(point ? { point } : {}),
        questions,
        answerIds: questions.map(() => localId()),
      };
      questions.forEach((q, i) =>
        d.answers.push({
          id: s.round!.answerIds[i],
          targetId: id,
          question: q.dimension,
          questionText: q.text,
          text: "",
          status: "draft",
        }),
      );
    });
  }
  async function ask(point?: PointRef) {
    if (
      active.current ||
      queueing.current ||
      stateOf(live.current.draft, id).pending
    )
      return;
    const base = live.current.draft,
      identity = experienceIdentity(base, id);
    const fingerprint =
      cachedFingerprint.current?.identity === identity
        ? cachedFingerprint.current.fingerprint
        : await experienceFingerprint(base, id);
    if (
      !mounted.current ||
      locale !== liveLocale.current ||
      identity !== experienceIdentity(live.current.draft, id)
    )
      return;
    cachedFingerprint.current = { identity, fingerprint };
    setNotice("");
    setError("");
    setQuestionsOpen(true);
    const s = stateOf(live.current.draft, id);
    const rounds = [s.round, ...(s.rounds ?? [])];
    const compatible = (r: NonNullable<typeof s.round>) =>
      (r.fingerprint === fingerprint ||
        (confirmedRound.current?.id === r.id &&
          confirmedRound.current.identity === identity)) &&
      r.feedbackLocale === locale;
    function resume(round: NonNullable<typeof s.round>) {
      if (s.round?.id !== round.id)
        edit((s) => {
          s.rounds = [
            ...(s.rounds ?? []).filter((r) => r.id !== round.id),
            ...(s.round ? [s.round] : []),
          ].slice(-100);
          s.round = round;
        });
    }
    // The main action must keep older whole-role rounds (and their typed
    // answers) reachable, even after scoring adds point-specific guidance.
    const unfinished =
      !point &&
      rounds.find(
        (r) =>
          r &&
          compatible(r) &&
          r.answerIds.some((answerId) =>
            live.current.draft.answers.some(
              (a) => a.id === answerId && a.status === "draft",
            ),
          ),
      );
    if (unfinished) {
      resume(unfinished);
      return;
    }
    const assessment = currentExperienceAssessment(
      live.current.draft,
      id,
      locale,
    );
    if (!point && assessment?.rubric === "experience-quality/3") {
      // The main guided action enters the same cached point workflow as clicking a diagnosis.
      const candidates = assessment.points
        .filter((p) => p.score < 80 && p.issue !== "duplicate")
        .sort((a, b) => a.score - b.score);
      point = candidates.find(
        (p) =>
          ![s.round, ...(s.rounds ?? [])].some(
            (r) =>
              r?.fingerprint === fingerprint &&
              r.feedbackLocale === locale &&
              r.point?.start === p.point.start &&
              r.point.text === p.point.text &&
              r.answerIds.length > 0 &&
              r.answerIds.every((answerId) =>
                live.current.draft.answers.some(
                  (a) => a.id === answerId && a.status === "confirmed",
                ),
              ),
          ),
      )?.point;
      if (candidates.length && !point) {
        setQuestionsOpen(false);
        setNotice("no_questions");
        return;
      }
    }
    const round = rounds.find(
      (r) =>
        r &&
        compatible(r) &&
        r.point?.start === point?.start &&
        r.point?.end === point?.end &&
        r.point?.text === point?.text,
    );
    if (round) {
      resume(round);
      return;
    }
    const diagnostic =
      assessment?.rubric === "experience-quality/3" && point
        ? assessment.points.find(
            (p) => p.point.start === point.start && p.point.text === point.text,
          )
        : undefined;
    if (diagnostic?.suggestedQuestion) {
      openQuestions(
        fingerprint,
        [
          {
            id: localId(),
            text: diagnostic.suggestedQuestion,
            dimension:
              diagnostic.issue === "methods"
                ? "tools"
                : diagnostic.issue === "scope"
                  ? "scale"
                  : diagnostic.issue === "outcome"
                    ? "impact"
                    : "ownership",
          },
        ],
        point,
      );
      return;
    }
    const prepared = s.questionPreparations?.find(
      (p) =>
        p.request.fingerprint === fingerprint &&
        p.request.feedbackLocale === locale &&
        p.request.point?.start === point?.start &&
        p.request.point?.text === point?.text,
    );
    if (prepared?.status === "ready") {
      openQuestions(fingerprint, prepared.questions!, point);
    } else if (prepared?.status === "pending") {
      setAwaitingPreparation(prepared.id);
    } else if (prepared?.status === "unknown") {
      // Recover the existing receipt; only an explicit resume can dispatch a missing receipt.
      edit((s) => {
        s.pending = { id: prepared.id, request: prepared.request };
      });
    } else void queue("questions", live.current.draft, point);
  }
  useEffect(() => {
    if (!awaitingPreparation) return;
    const prepared = state.questionPreparations?.find(
      (p) => p.id === awaitingPreparation,
    );
    if (!prepared || prepared.request.feedbackLocale !== locale) {
      setAwaitingPreparation(undefined);
      setQuestionsOpen(false);
      return;
    }
    if (prepared.status !== "pending") {
      setAwaitingPreparation(undefined);
      if (prepared.status === "failed") {
        setQuestionsOpen(false);
        setError("AI_REQUEST_FAILED");
      } else void ask(prepared.request.point);
    }
  }, [awaitingPreparation, state.questionPreparations, locale]);
  return {
    state,
    questionsOpen,
    activeQuestionPoint:
      state.questionPreparations?.find((p) => p.id === awaitingPreparation)
        ?.request.point ??
      state.pending?.request.point ??
      state.round?.point,
    notice,
    question,
    answer,
    qIndex,
    queue,
    working,
    preparing: preparing || !!awaitingPreparation,
    foreground,
    stream,
    streamOperationId,
    error,
    elapsed,
    answerText,
    appendAnswerText,
    advance,
    editCandidate,
    accept,
    check: () => execute(true),
    resume: () => {
      const pending = stateOf(live.current.draft, id).pending;
      if (error !== "MISSING" || !pending || active.current) return;
      armed.current.add(pending.id);
      attempted.current.delete(pending.id);
      if (live.current.ready) void execute(false);
    },
    back: () => {
      setQuestionsOpen(false);
      setAwaitingPreparation(undefined);
    },
    ask,
    retry: () => {
      const pending = stateOf(live.current.draft, id).pending;
      if (error !== "AI_RESULT_UNAVAILABLE" || !pending || active.current)
        return;
      const next = edit((s) => {
        delete s.pending;
        // The user explicitly requests a new attempt after recovery found no usable result.
        const preparation = s.questionPreparations?.find(
          (p) => p.id === pending.id,
        );
        if (preparation?.status === "unknown") preparation.status = "failed";
      });
      if (pending.request.intent === "questions") setQuestionsOpen(true);
      void queue(pending.request.intent, next, pending.request.point);
    },
    undo: () => {
      const next = undoExperiencePoint(live.current.draft, id);
      delete next.experienceEnrichment?.[id]?.acceptedText;
      setAcceptedHere(false);
      publish(next);
    },
    saving:
      acceptedHere &&
      !!state.acceptedText &&
      state.acceptedText === experienceText(props.draft, id),
    saved:
      acceptedHere &&
      !!state.acceptedText &&
      state.acceptedText === experienceText(props.draft, id) &&
      props.ready &&
      !props.saveFailed,
  };
}
