import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TAILOR_SECTIONS, type Answer, type CvContent, type Proposal, type Steering, type TailorQuestion, type TailorRun, type TailorSection } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api.ts";
import { QuestionCard, type Draft } from "./QuestionCard.tsx";
import { RoleReview } from "./RoleReview.tsx";
import { SectionReview } from "./SectionReview.tsx";
import { StepBar } from "./StepBar.tsx";
import { SteeringStep } from "./SteeringStep.tsx";
import * as api from "./tailor-api.ts";
import { FinishedRoles, roleName, YourAnswers } from "./YourAnswers.tsx";
import "../styles/tailor.css";

type Phase =
  | { kind: "loading" }
  /** `resume`: changing the steering of a started run; going back returns there. */
  | { kind: "steer"; busy: boolean; resume?: Phase }
  | { kind: "confirm"; steering: Steering; busy: boolean; resume: Phase }
  /** Going back (BackA): a finished step, a finished role's answers, a redone role's review. */
  | { kind: "back"; section: TailorSection; resume: Phase }
  | { kind: "role"; roleId: string; busy: boolean; resume: Phase }
  | { kind: "redo"; roleId: string; proposals: Proposal[]; removed?: number; busy: boolean; resume: Phase }
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
  // The stored steering, read when the Tone and questions screens open on a started run.
  const [steering, setSteering] = useState<Steering | undefined>(undefined);
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
  /** A finished role's new answers: its proposals come back for review; the run stays where it was. */
  async function redo(roleId: string, answers: Answer[], resume: Phase) {
    setPhase({ kind: "role", roleId, busy: true, resume });
    try {
      const { proposals, removed } = await api.redoRole(runRef.current!.id, roleId, answers);
      // The role under review goes back to its own review, whose accept moves the run on.
      const current = runRef.current?.currentSection === "experience" && runRef.current.currentRoleId === roleId;
      setPhase(current ? { kind: "review", proposals, removed, busy: false } : { kind: "redo", roleId, proposals, removed, busy: false, resume });
    } catch (cause) { fail(cause, "experience", () => setPhase({ kind: "role", roleId, busy: false, resume })); }
  }
  async function acceptRedo(roleId: string, body: api.AcceptBody, review: Extract<Phase, { kind: "redo" }>) {
    setPhase({ ...review, busy: true });
    try {
      const result = await api.acceptRole(runRef.current!.id, roleId, body);
      setLatest(result.score.total);
      track(result.run);
      setPhase(review.resume);
    } catch (cause) { fail(cause, "experience", () => setPhase({ ...review, busy: false })); }
  }
  /** "← My answers" on the role under review: its answers, read fresh from the run. */
  async function openAnswers(review: Phase) {
    setPhase({ kind: "loading" });
    try {
      track(await api.getRun(runRef.current!.id));
      setPhase({ kind: "role", roleId: runRef.current!.currentRoleId!, busy: false, resume: review });
    } catch (cause) { fail(cause, "experience", () => setPhase(review)); }
  }
  /** The Tone and questions screens of a started run, from its stored steering (never from defaults). */
  async function openSteer(resume: Phase) {
    setPhase({ kind: "loading" });
    try {
      setSteering(await api.getSteering(runRef.current!.id));
      setPhase({ kind: "steer", busy: false, resume });
    } catch (cause) { fail(cause, null, () => setPhase(resume)); }
  }
  /** Changing the steering redoes every step with the stored answers, in a new run. */
  async function restart(steering: Steering, confirm: Extract<Phase, { kind: "confirm" }>) {
    setPhase({ ...confirm, busy: true });
    try {
      const { run: created } = await api.changeSteering(runRef.current!.id, steering);
      setSteering(steering);
      remember(jobId, created.id);
      enter(created);
    } catch (cause) { fail(cause, null, () => setPhase({ ...confirm, busy: false })); }
  }
  async function start(steering: Steering) {
    setPhase({ kind: "steer", busy: true });
    setSteering(steering);
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

  // Roles already accepted: all of them once Experience is behind the run, else the ones before the current role.
  const order = run?.roleOrder ?? [];
  const pastExperience = !!run && (run.status === "done" || !section || run.sections.indexOf(section) > run.sections.indexOf("experience"));
  const doneRoles = pastExperience ? order
    : section === "experience" && run?.currentRoleId && order.includes(run.currentRoleId) ? order.slice(0, order.indexOf(run.currentRoleId)) : [];
  // Going back opens only from a question or a review, so nothing in flight comes back over it.
  const settled = phase.kind === "questions" || phase.kind === "review";
  const reached = run && section ? run.sections.indexOf(section) : run?.sections.length ?? 0;
  const open = settled && run ? run.sections.filter((s, i) => (s === "experience" ? doneRoles.length > 0 : i < reached)) : [];
  const stepQuestions = (s: TailorSection, roleId?: string) => (run?.questions ?? [])
    .filter((q) => q.section === s && q.kind !== "flag" && (!roleId || q.roleId === roleId));
  const locale = cv?.locale ?? "en";

  let body: React.ReactNode;
  if (phase.kind === "loading") body = <p role="status">{t("tailor.loading")}</p>;
  else if (phase.kind === "steer") {
    const { resume } = phase;
    body = <SteeringStep jobId={jobId} roles={cv?.experience ?? []} busy={phase.busy} initial={resume ? steering : undefined}
      startLabel={resume ? t("tailor.steer.save") : undefined} onCancel={resume ? () => setPhase(resume) : undefined}
      onStart={(s) => (resume ? setPhase({ kind: "confirm", steering: s, busy: false, resume }) : void start(s))} />;
  } else if (phase.kind === "confirm") {
    body = <section className="tailor-card" role="alertdialog" aria-labelledby="steer-confirm" aria-describedby="steer-confirm-text">
      <h2 id="steer-confirm">{t("tailor.steer.confirm.title")}</h2>
      <p id="steer-confirm-text">{t("tailor.steer.confirm.text")}</p>
      <div className="fm-foot">
        <button type="button" className="fm-ghost" disabled={phase.busy} onClick={() => setPhase(phase.resume)}>{t("tailor.steer.confirm.cancel")}</button>
        <button type="button" className="fm-btn" disabled={phase.busy} onClick={() => void restart(phase.steering, phase)}>{t("tailor.steer.confirm.redo")}</button>
      </div>
    </section>;
  } else if (phase.kind === "back") {
    const { resume } = phase;
    body = phase.section === "experience"
      ? <FinishedRoles roles={(cv?.experience ?? []).filter((r) => doneRoles.includes(r.id))} locale={locale}
        onPick={(roleId) => setPhase({ kind: "role", roleId, busy: false, resume })} onClose={() => setPhase(resume)} />
      : <YourAnswers key={phase.section} title={t(`tailor.section.${phase.section}`)} questions={stepQuestions(phase.section)}
        answers={run?.answers ?? []} busy={false} locale={locale} onClose={() => setPhase(resume)} />;
  } else if (phase.kind === "role") {
    const { roleId, resume } = phase;
    const role = cv?.experience.find((r) => r.id === roleId);
    body = <YourAnswers key={roleId} title={role ? roleName(role, locale) : t("tailor.role.untitled")} questions={stepQuestions("experience", roleId)}
      answers={run?.answers ?? []} busy={phase.busy} locale={locale}
      onUpdate={(answers) => void redo(roleId, answers, resume)} onClose={() => setPhase(resume)} />;
  } else if (phase.kind === "redo") {
    const review = phase;
    const role = cv?.experience.find((r) => r.id === review.roleId);
    const onAccept = (accepted: api.AcceptBody) => void acceptRedo(review.roleId, accepted, review);
    body = role ? <RoleReview key={`redo-${role.id}`} role={role} proposals={review.proposals} locale={locale} busy={review.busy} onAccept={onAccept} removed={review.removed} />
      : <SectionReview key={`redo-${review.roleId}`} section="experience" proposals={review.proposals} flags={[]} confirmed={[]}
        busy={review.busy} onAccept={onAccept} cv={cv} removed={review.removed} />;
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
  } else if (section === "experience" && cv?.experience.some((r) => r.id === run?.currentRoleId)) {
    const review = phase;
    body = <RoleReview key={run!.currentRoleId!} role={cv.experience.find((r) => r.id === run!.currentRoleId)!} proposals={review.proposals} locale={locale}
      busy={review.busy} onAccept={(accepted) => void accept(section, accepted)} onAnswers={() => void openAnswers(review)} removed={review.removed} />;
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
    {run && <StepBar sections={run.sections} current={section} base={base} latest={latest} open={open}
      onOpen={(s) => setPhase({ kind: "back", section: s, resume: phase })}
      onSteer={settled ? () => void openSteer(phase) : undefined} />}
    {!run && base !== null && <StepBar sections={[...TAILOR_SECTIONS]} current={null} base={base} latest={latest} />}
    <main className="tailor-main">{body}</main>
  </div>;
}
