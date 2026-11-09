import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TAILOR_SECTIONS, type Answer, type CvContent, type Proposal, type Steering, type TailorQuestion, type TailorRun, type TailorSection } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api.ts";
import { QuestionCard, type Draft } from "./QuestionCard.tsx";
import { SectionReview } from "./SectionReview.tsx";
import { StepBar } from "./StepBar.tsx";
import { SteeringStep } from "./SteeringStep.tsx";
import * as api from "./tailor-api.ts";
import "../styles/tailor.css";

type Phase =
  | { kind: "loading" }
  | { kind: "steer"; busy: boolean }
  | { kind: "asking" }
  /** Answers stay here, one per question (undefined = not reached yet), until the step's last question. */
  | { kind: "questions"; questions: TailorQuestion[]; index: number; answers: (Draft | undefined)[] }
  | { kind: "working" }
  | { kind: "review"; proposals: Proposal[]; busy: boolean; removed?: number }
  | { kind: "error"; message: string; retry(): void }
  | { kind: "deleted" };

const storageKey = (jobId: string) => `resumora.tailorRun.${jobId}`;
export function remember(jobId: string, runId: string | null) {
  try {
    if (runId) localStorage.setItem(storageKey(jobId), runId);
    else localStorage.removeItem(storageKey(jobId));
  } catch { /* storage is a convenience: the start route returns the job's open run anyway */ }
}
export function remembered(jobId: string): string | null {
  try { return localStorage.getItem(storageKey(jobId)); } catch { return null; }
}

/** `/jobs/:id/tailor`: steering, then each section's questions, run and review (Experience role by role), full screen. */
export function TailorFlow() {
  const jobId = useParams().id ?? "";
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [run, setRun] = useState<TailorRun | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [latest, setLatest] = useState<number | null>(null);
  // The Base CV the questions and proposals are made from: shows each role and the wording a change replaces.
  const [cv, setCv] = useState<CvContent | null>(null);
  // Questions may also be about a volunteering role (same shape as a job).
  const roleFor = (question: TailorQuestion) => [...cv?.experience ?? [], ...cv?.volunteering ?? []].find((role) => role.id === question.roleId);
  const runRef = useRef<TailorRun | null>(null);
  const started = useRef(false);
  const section = run?.currentSection ?? null;

  function track(next: TailorRun) { runRef.current = next; setRun(next); }
  /** Experience steps name the run's current role. */
  const roleArg = (at: TailorSection) => (at === "experience" ? runRef.current?.currentRoleId ?? undefined : undefined);
  function fail(cause: unknown, at: TailorSection | null, retry: () => void) {
    if (cause instanceof ApiClientError && cause.code === "job_not_found") { remember(jobId, null); setPhase({ kind: "deleted" }); return; }
    const ai = cause instanceof ApiClientError && cause.code === "ai_failed" && at;
    setPhase({ kind: "error", retry, message: ai ? t("tailor.error.ai", { section: t(`tailor.section.${at}`) }) : t("tailor.error.generic") });
  }
  /** Opens the document this run tailored (a translated copy too, not only the job's original). */
  function finish() {
    remember(jobId, null);
    const doc = runRef.current?.tailoredCvId;
    void navigate(`/jobs/${encodeURIComponent(jobId)}/cv${doc ? `?cv=${encodeURIComponent(doc)}` : ""}`);
  }

  /** Continues the run where it stands: a section with a finished pass goes back to its run, otherwise to its questions. */
  function enter(next: TailorRun) {
    track(next);
    const current = next.currentSection;
    if (next.status === "done" || !current) return finish();
    if (next.status === "waiting_user" || current === "layout") return void work(current);
    void ask(current);
  }
  async function ask(at: TailorSection) {
    setPhase({ kind: "asking" });
    try {
      const questions = await api.askQuestions(runRef.current!.id, at, roleArg(at));
      if (questions.length === 0) return void work(at);
      setPhase({ kind: "questions", questions, index: 0, answers: questions.map(() => undefined) });
    } catch (cause) { fail(cause, at, () => void ask(at)); }
  }
  async function submit(at: TailorSection, answers: Answer[]) {
    setPhase({ kind: "working" });
    try {
      await api.sendAnswers(runRef.current!.id, answers);
      await work(at);
    } catch (cause) { fail(cause, at, () => void submit(at, answers)); }
  }
  async function work(at: TailorSection) {
    setPhase({ kind: "working" });
    try {
      const { proposals, removed } = await api.runSection(runRef.current!.id, at, roleArg(at));
      setPhase({ kind: "review", proposals, busy: false, removed });
    } catch (cause) { fail(cause, at, () => void work(at)); }
  }
  async function accept(at: TailorSection, body: api.AcceptBody) {
    setPhase((current) => current.kind === "review" ? { ...current, busy: true } : current);
    try {
      const roleId = roleArg(at);
      const result = await api.acceptSection(runRef.current!.id, at, roleId ? { ...body, roleId } : body);
      setLatest(result.score.total);
      enter(result.run);
    } catch (cause) {
      setPhase((current) => current.kind === "review" ? { ...current, busy: false } : current);
      if (cause instanceof ApiClientError && cause.code === "job_not_found") fail(cause, at, () => {});
      else {
        const review = phase;
        fail(cause, at, () => setPhase(review.kind === "review" ? { ...review, busy: false } : review));
      }
    }
  }
  async function start(steering: Steering) {
    setPhase({ kind: "steer", busy: true });
    try {
      const { run: created } = await api.startTailoring(jobId, steering);
      remember(jobId, created.id);
      enter(created);
    } catch (cause) { fail(cause, null, () => setPhase({ kind: "steer", busy: false })); }
  }
  async function load() {
    const stored = remembered(jobId);
    if (!stored) return setPhase({ kind: "steer", busy: false });
    setPhase({ kind: "loading" });
    try { enter(await api.getRun(stored)); } catch (cause) { fail(cause, null, () => void load()); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.getScores(jobId).then((scores) => {
      setBase(scores.base?.total ?? null);
      setLatest((value) => value ?? scores.tailored?.total ?? null);
    }, () => {});
    // Without it the screens fall back to the plain list; the run itself doesn't need it.
    getCv().then((response) => setCv(response.content), () => {});
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  let body: React.ReactNode;
  if (phase.kind === "loading") body = <p role="status">{t("tailor.loading")}</p>;
  else if (phase.kind === "steer") {
    body = <SteeringStep jobId={jobId} roles={cv?.experience ?? []} busy={phase.busy} onStart={(s) => void start(s)} />;
  }
  else if (phase.kind === "deleted") {
    body = <section className="tailor-card" role="alert"><h2>{t("tailor.error.deleted")}</h2>
      <Link to="/jobs">{t("tailor.error.toJobs")}</Link></section>;
  } else if (phase.kind === "error") {
    body = <section className="tailor-card" role="alert"><p>{phase.message}</p>
      <button type="button" className="primary" onClick={phase.retry}>{t("tailor.retry")}</button></section>;
  } else if (!section) body = null;
  else if (phase.kind === "asking" || phase.kind === "working") {
    body = <p role="status" className="tailor-working">
      {t(phase.kind === "asking" ? "tailor.asking" : "tailor.working", { section: t(`tailor.section.${section}`) })}</p>;
  } else if (phase.kind === "questions") {
    const question = phase.questions[phase.index]!;
    // Next or Skip stores the answer; after the last question the step's answers go together.
    const answerWith = (answer: Draft) => {
      const answers = phase.answers.map((given, i) => (i === phase.index ? answer : given));
      if (phase.index + 1 < phase.questions.length) return setPhase({ ...phase, index: phase.index + 1, answers });
      void submit(section, phase.questions.map((q, i): Answer => ({ ...(answers[i] ?? { value: null, via: "skip" }), questionId: q.id })));
    };
    const order = run?.roleOrder ?? [];
    const progress = section === "experience" && run?.currentRoleId && order.includes(run.currentRoleId)
      ? t("tailor.question.roleProgress", { role: order.indexOf(run.currentRoleId) + 1, roles: order.length, n: phase.index + 1, total: phase.questions.length })
      : t("tailor.question.progress", { n: phase.index + 1, total: phase.questions.length });
    body = <QuestionCard key={question.id} question={question} progress={progress} initial={phase.answers[phase.index]}
      onNext={answerWith} onSkip={() => answerWith({ value: null, via: "skip" })}
      onBack={phase.index > 0 ? () => setPhase({ ...phase, index: phase.index - 1 }) : undefined}
      role={roleFor(question)} roles={cv?.experience ?? []} locale={cv?.locale} />;
  } else {
    body = <SectionReview key={section} section={section} proposals={phase.proposals} flags={[]}
      confirmed={[]} busy={phase.busy} onAccept={(accepted) => void accept(section, accepted)} cv={cv} removed={phase.removed} />;
  }
  const wide = phase.kind === "questions" && section === "experience" && !!roleFor(phase.questions[phase.index]!);

  return <div className={wide ? "tailor-mode is-wide" : "tailor-mode"}>
    <header className="tailor-head">
      <p className="tailor-eyebrow">{t("tailor.eyebrow")}</p>
      <Link to={`/jobs/${encodeURIComponent(jobId)}`}>{t("tailor.back")}</Link>
    </header>
    {run && <StepBar sections={run.sections} current={section} base={base} latest={latest} />}
    {!run && base !== null && <StepBar sections={[...TAILOR_SECTIONS]} current={null} base={base} latest={latest} />}
    <main className="tailor-main">{body}</main>
  </div>;
}
