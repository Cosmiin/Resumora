import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { findScored, isRoleSection, type Answer, type CvContent, type JobExtraction, type MatchScore, type Steering, type TailorLanguage, type TailorQuestion, type TailorRun } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { t } from "../i18n/t.ts";
import { getJob, scoreJob } from "../jobs/jobs-api.ts";
import { AppShell } from "../layout/AppShell.tsx";
import { ApiClientError } from "../lib/api.ts";
import { roleName } from "./ChangesList.tsx";
import { DoneScreen } from "./DoneScreen.tsx";
import { remember, remembered, type Phase } from "./flow-phase.ts";
import { GapQuestions } from "./GapQuestions.tsx";
import { keywordsOf } from "./KeywordsStep.tsx";
import { Room } from "./Room.tsx";
import { runAll, stepsOf, type Step } from "./run-all.ts";
import { SteerConfirm, SteeringStep } from "./SteeringStep.tsx";
import * as api from "./tailor-api.ts";
import { getTailored } from "./tailored-api.ts";
import { Working } from "./Working.tsx";
import "../styles/tailor.css";

export { remember, remembered } from "./flow-phase.ts";

/** The answers a run holds, with the ones just sent in place of the earlier ones to the same questions. */
function withAnswers(run: TailorRun, answers: Answer[]): TailorRun {
  const sent = new Set(answers.map((answer) => answer.questionId));
  return { ...run, answers: [...(run.answers ?? []).filter((answer) => !sent.has(answer.questionId)), ...answers] };
}

/**
 * `/jobs/:id/tailor` in three screens: every question the job raises on one screen, one wait while every part of the
 * CV is written at the same time, and the final page with the match, what changed and the downloads. It starts at
 * once, in the language the person's preferences pick.
 */
export function TailorFlow() {
  const jobId = useParams().id ?? "";
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [run, setRun] = useState<TailorRun | null>(null);
  const runRef = useRef<TailorRun | null>(null);
  // The language the run's CV is written in: from the start, or read from the tailored CV of a run continued later.
  const [language, setLanguage] = useState<TailorLanguage | undefined>(undefined);
  // The match with the base CV, and with the tailored CV once it has one.
  const [baseScore, setBaseScore] = useState<MatchScore | null>(null);
  const [score, setScore] = useState<MatchScore | null>(null);
  // The Base CV: the roles the questions are ticked for, and the parts the wait writes.
  const [cv, setCv] = useState<CvContent | null>(null);
  const cvLoad = useRef<Promise<CvContent> | null>(null);
  const [job, setJob] = useState<JobExtraction | null>(null);
  // The tone and extra questions of a started run, read when Adjust opens.
  const [steering, setSteering] = useState<Steering | undefined>(undefined);
  const started = useRef(false);

  function track(next: TailorRun) { runRef.current = next; setRun(next); }
  /** The Base CV, loaded once (again after it was replaced). */
  function baseCv(): Promise<CvContent> {
    cvLoad.current ??= getCv().then((response) => { setCv(response.content); return response.content; },
      (cause: unknown) => { cvLoad.current = null; throw cause; });
    return cvLoad.current;
  }
  function fail(cause: unknown, retry: () => void) {
    if (cause instanceof ApiClientError && cause.code === "job_not_found") { remember(jobId, null); setPhase({ kind: "deleted" }); return; }
    // The run was made from a CV that was replaced since: start again (the start rebuilds it from the current CV).
    if (cause instanceof ApiClientError && cause.code === "base_cv_changed") { remember(jobId, null); cvLoad.current = null; void start(); return; }
    setPhase({ kind: "error", retry, message: t("tailor.error.generic") });
  }

  /** Continues a run where it stands: a finished one on the final page, any other at its questions. */
  function enter(next: TailorRun) {
    track(next);
    if (next.status === "done") return setPhase({ kind: "done", failed: [] });
    void ask(next);
  }
  /** Every question at once. None to ask, or all of them answered before: straight to the wait. */
  async function ask(current: TailorRun) {
    setPhase({ kind: "asking" });
    try {
      // The questions are about the roles, so a run that redoes only other sections asks none.
      const questions = current.sections.some(isRoleSection) ? await api.askGaps(current.id) : [];
      const known = new Set(questions.map((question) => question.id));
      const asked = { ...current, questions: [...(current.questions ?? []).filter((question) => !known.has(question.id)), ...questions] };
      track(asked);
      const answered = new Set((current.answers ?? []).map((answer) => answer.questionId));
      if (questions.every((question) => answered.has(question.id))) return void wait(asked);
      setPhase({ kind: "questions", questions, busy: false });
    } catch (cause) { fail(cause, () => void ask(current)); }
  }
  /**
   * Sends the answers and tailors. From the final page (`resume`) the run is finished, so every part is first put
   * back to the person's own wording, in a new run that carries the questions and the tone over.
   */
  async function submit(questions: TailorQuestion[], answers: Answer[], resume?: Phase) {
    setPhase({ kind: "questions", questions, busy: true, resume });
    try {
      let current = runRef.current!;
      if (current.status === "done") {
        const stored = await api.getSteering(current.id);
        current = (await api.changeSteering(current.id, stored)).run;
        remember(jobId, current.id);
        setScore(null);
        track(current);
      }
      await api.sendAnswers(current.id, answers);
      const next = withAnswers(current, answers);
      track(next);
      await wait(next);
    } catch (cause) { fail(cause, () => void submit(questions, answers, resume)); }
  }
  /** The one wait: every part written at the same time, then one score, then the final page. */
  async function wait(current: TailorRun) {
    setPhase({ kind: "working", done: 0, total: 0 });
    try {
      const base = await baseCv();
      const total = stepsOf(current, base).length + (current.sections.includes("layout") ? 1 : 0);
      setPhase({ kind: "working", done: 0, total });
      const result = await runAll(api, current, base, (progress) => setPhase({ kind: "working", ...progress }));
      // The questions and answers stay at hand for "Change my answers".
      track({ ...result.run, questions: result.run.questions ?? current.questions, answers: result.run.answers ?? current.answers });
      setScore(result.score);
      remember(jobId, null);
      const name = (step: Step) => {
        const role = step.roleId ? findScored(base, step.roleId)?.item : undefined;
        return role ? roleName(role) || t("tailor.role.untitled") : t(`tailor.section.${step.section}`);
      };
      setPhase({ kind: "done", failed: result.failed.map(name) });
    } catch (cause) { fail(cause, () => void wait(current)); }
  }

  /** The Adjust screen of a started run, from its stored steering (never from defaults). */
  async function openSteer(resume: Phase) {
    setPhase({ kind: "loading" });
    try {
      setSteering(await api.getSteering(runRef.current!.id));
      setPhase({ kind: "steer", busy: false, resume });
    } catch (cause) { fail(cause, () => setPhase(resume)); }
  }
  /** Changing the steering tailors every part again with the stored answers, in a new run. */
  async function restart(next: Steering, confirm: Extract<Phase, { kind: "confirm" }>) {
    setPhase({ ...confirm, busy: true });
    try {
      const { run: created } = await api.changeSteering(runRef.current!.id, next);
      setSteering(next);
      setScore(null);
      remember(jobId, created.id);
      enter(created);
    } catch (cause) { fail(cause, () => setPhase({ ...confirm, busy: false })); }
  }
  /** `picked`: another language from the bar's menu; without it the person's default decides. */
  async function start(picked?: TailorLanguage) {
    setPhase({ kind: "loading" });
    try {
      const { run: created, restarted, language: written } = await api.startTailoring(jobId, steering ?? {}, picked);
      setLanguage(written);
      remember(jobId, created.id);
      // A start over a replaced CV worked out the job's match again: show that one.
      if (restarted) {
        try {
          const { base } = await api.getScores(jobId);
          if (base) setBaseScore(base);
        } catch { /* the run doesn't need it */ }
      }
      enter(created);
    } catch (cause) { fail(cause, () => void start(picked)); }
  }
  async function load() {
    const stored = remembered(jobId);
    if (!stored) return void start();
    setPhase({ kind: "loading" });
    try {
      const found = await api.getRun(stored);
      // The bar's language; without it the bar just leaves the language out.
      if (found.tailoredCvId) getTailored(found.tailoredCvId).then((doc) => setLanguage((known) => known ?? doc.language), () => {});
      enter(found);
    } catch (cause) { fail(cause, () => void load()); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The match with the base CV is worked out on the job page; someone who lands here first gets it now.
    api.getScores(jobId).then((scores) => (scores.base ? scores : scoreJob(jobId))).then((scores) => {
      setBaseScore((known) => known ?? scores.base);
      setScore((known) => known ?? scores.tailored);
    }, () => {});
    // The roles on the questions screen; the wait loads it again itself when this fails.
    baseCv().catch(() => {});
    getJob(jobId).then((found) => setJob(found.extracted ?? null), () => {});
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each screen starts at its top (the questions are long, and the result opens where they were left).
  useEffect(() => { document.querySelector(".tailor-room-bar")?.scrollIntoView?.({ block: "start" }); }, [phase.kind]);

  // The questions a finished run can be asked again: the ones about every role.
  const gaps = (run?.questions ?? []).filter((question) => question.scope === "all");
  const locale = cv?.locale ?? "en";

  let body: React.ReactNode;
  if (phase.kind === "loading") body = <p role="status">{t("tailor.loading")}</p>;
  else if (phase.kind === "asking") body = <p role="status" className="ui-coach tailor-working">{t("tailor.gaps.asking")}</p>;
  else if (phase.kind === "steer") {
    const { resume } = phase;
    // New choices tailor every part again, so that asks first.
    body = <SteeringStep jobId={jobId} busy={phase.busy} initial={steering}
      startLabel={t("tailor.steer.save")} onCancel={() => setPhase(resume)}
      onStart={(next) => setPhase({ kind: "confirm", steering: next, busy: false, resume })} />;
  } else if (phase.kind === "confirm") {
    body = <SteerConfirm busy={phase.busy} onCancel={() => setPhase(phase.resume)} onRedo={() => void restart(phase.steering, phase)} />;
  } else if (phase.kind === "questions") {
    const { questions, resume } = phase;
    body = <GapQuestions questions={questions} roles={cv?.experience ?? []} locale={locale} answers={run?.answers ?? []} busy={phase.busy}
      onSubmit={(answers) => void submit(questions, answers, resume)} onCancel={resume ? () => setPhase(resume) : undefined} />;
  } else if (phase.kind === "working") body = <Working done={phase.done} total={phase.total} />;
  else if (phase.kind === "done") {
    body = <DoneScreen jobId={jobId} docId={run?.tailoredCvId ?? null} base={baseScore} final={score ?? baseScore} job={job} failed={phase.failed}
      onAnswers={gaps.length > 0 ? () => setPhase({ kind: "questions", questions: gaps, busy: false, resume: phase }) : undefined} />;
  } else if (phase.kind === "deleted") {
    body = <section className="ui-stack tailor-narrow" role="alert"><h1 className="ui-title">{t("tailor.error.deleted")}</h1>
      <p><Link className="ui-btn" to="/jobs">{t("tailor.error.toJobs")}</Link></p></section>;
  } else {
    body = <section className="ui-stack tailor-narrow"><p role="alert" className="ui-notice ui-notice--bad">{phase.message}</p>
      <p><button type="button" className="ui-btn" onClick={phase.retry}>{t("tailor.retry")}</button></p></section>;
  }
  const jobName = [job?.title.trim(), job?.company?.trim()].filter(Boolean).join(", ");
  const toJob = `/jobs/${encodeURIComponent(jobId)}`;

  // A started run happens in the room: one bar over the screen of the moment, from the questions to the result.
  if (run && phase.kind !== "deleted") {
    const shown = score ?? baseScore;
    const words = keywordsOf(shown);
    // Another language starts again, so it is offered only until the answers are sent. Adjust tailors again too, so it
    // is offered where nothing is in flight: on the questions and on the final page.
    const asking = phase.kind === "questions" && !phase.busy && !phase.resume;
    const settled = (phase.kind === "questions" && !phase.busy) || phase.kind === "done";
    return <Room jobName={jobName || undefined} onExit={() => void navigate(toJob)} base={baseScore?.total ?? null} now={score?.total ?? null}
      keywords={words.has.length + words.missing.length > 0 ? { has: words.has.length, total: words.has.length + words.missing.length } : undefined}
      language={language && { value: language, onPick: asking ? (picked) => void start(picked) : undefined }}
      onAdjust={settled ? () => void openSteer(phase) : undefined}>
      {body}
    </Room>;
  }

  return <AppShell>
    <main className="ui-page tailor-page">
      <div className="ui-wrap ui-main">
        {jobName && <p className="ui-small ui-muted tailor-for">{t("tailor.for")}: <Link to={toJob}>{jobName}</Link></p>}
        {body}
      </div>
    </main>
  </AppShell>;
}
