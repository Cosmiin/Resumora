import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { findScored, isRoleSection, scoredItems, stepItems, stepOf, stepOrder, TAILOR_SECTIONS, type Answer, type CvContent, type JobExtraction, type MatchScore, type Steering, type TailorQuestion, type TailorRun, type TailorSection } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { getJob } from "../jobs/jobs-api.ts";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api.ts";
import { QuestionCard, type Draft } from "./QuestionCard.tsx";
import { keptChanges, keptTexts, kindKey, nameOf, newlyMet, roleDone } from "./role-done.ts";
import { RoleReview } from "./RoleReview.tsx";
import { SectionReview } from "./SectionReview.tsx";
import { StepBar } from "./StepBar.tsx";
import { SteerConfirm, SteeringStep } from "./SteeringStep.tsx";
import { TailorMoment } from "./TailorMoment.tsx";
import { DoneScreen } from "./DoneScreen.tsx";
import { FINAL_SECTIONS } from "./LayoutReview.tsx";
import { remember, remembered, type Phase } from "./flow-phase.ts";
import * as api from "./tailor-api.ts";
import { FinishedRoles, roleName, YourAnswers } from "./YourAnswers.tsx";
import "../styles/tailor.css";

export { remember, remembered } from "./flow-phase.ts";

/** `/jobs/:id/tailor`: steering, then each section's questions, run and review (Experience role by role), full screen. */
export function TailorFlow() {
  const jobId = useParams().id ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [run, setRun] = useState<TailorRun | null>(null);
  const [base, setBase] = useState<number | null>(null);
  const [latest, setLatest] = useState<number | null>(null);
  // The Base CV the questions and proposals are made from: shows each role and the wording a change replaces.
  const [cv, setCv] = useState<CvContent | null>(null);
  // Questions may be about a role, a project or a volunteering role (same shape as a job).
  const scoredOf = (id: string | null | undefined) => (cv && id ? findScored(cv, id) : undefined);
  const roleFor = (question: TailorQuestion) => scoredOf(question.roleId)?.item;
  // The stored steering, read when the Tone and questions screens open on a started run.
  const [steering, setSteering] = useState<Steering | undefined>(undefined);
  const runRef = useRef<TailorRun | null>(null);
  // The newest score with its labels (base, then each accept's), and the job: for the role done line.
  const scoreRef = useRef<MatchScore | null>(null);
  const baseRef = useRef<MatchScore | null>(null);
  const [job, setJob] = useState<JobExtraction | null>(null);
  const started = useRef(false);
  // FinalA: final touches with nothing to change, accepted on their own; the next screen shows a tick for each.
  const [ticks, setTicks] = useState<TailorSection[]>([]);
  const section = run?.currentSection ?? null;
  const shownSection = phase.kind === "back" ? phase.section
    : phase.kind === "role" || phase.kind === "redo" ? "experience"
    : phase.kind === "questions" || phase.kind === "review" ? section : null;
  const colour = isRoleSection(shownSection) ? "bullets"
    : shownSection === "skills" ? "tools" : shownSection === "summary" ? "description" : "role";

  function track(next: TailorRun) { runRef.current = next; setRun(next); }
  /** Experience and Projects & volunteering steps name the run's current item. */
  const roleArg = (at: TailorSection) => (isRoleSection(at) ? runRef.current?.currentRoleId ?? undefined : undefined);
  function fail(cause: unknown, at: TailorSection | null, retry: () => void) {
    if (cause instanceof ApiClientError && cause.code === "job_not_found") { remember(jobId, null); setPhase({ kind: "deleted" }); return; }
    const ai = cause instanceof ApiClientError && cause.code === "ai_failed" && at;
    setPhase({ kind: "error", retry, message: ai ? t("tailor.error.ai", { section: t(`tailor.section.${at}`) }) : t("tailor.error.generic") });
  }
  /** After the last step: the done screen, for the document this run tailored (a translated copy too). */
  function finish() { remember(jobId, null); setPhase({ kind: "done" }); }

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
      if (proposals.length === 0 && FINAL_SECTIONS.includes(at)) return void pass(at);
      setPhase({ kind: "review", proposals, busy: false, removed });
    } catch (cause) { fail(cause, at, () => void work(at)); }
  }
  /** FinalA: a final touch with nothing to change is accepted on its own; once saved, the next screen shows its tick. */
  async function pass(at: TailorSection) {
    setPhase({ kind: "working" });
    try {
      const result = await api.acceptSection(runRef.current!.id, at, { decisions: [], inferred: [], flags: [] });
      scoreRef.current = result.score;
      setLatest(result.score.total);
      setTicks((list) => (list.includes(at) ? list : [...list, at]));
      enter(result.run);
    } catch (cause) { fail(cause, at, () => void pass(at)); }
  }
  async function accept(at: TailorSection, body: api.AcceptBody) {
    setPhase((current) => current.kind === "review" ? { ...current, busy: true } : current);
    try {
      const roleId = roleArg(at);
      const result = await api.acceptSection(runRef.current!.id, at, roleId ? { ...body, roleId } : body);
      const before = scoreRef.current;
      scoreRef.current = result.score;
      setLatest(result.score.total);
      const done = scoredOf(roleId);
      if (!done || phase.kind !== "review") return enter(result.run);
      const kept = keptChanges(phase.proposals, body);
      track(result.run);
      setPhase({ kind: "roleDone", from: latest ?? base, to: result.score.total, next: result.run, ...roleDone({
        names: newlyMet(before, result.score, keptTexts(done.item, kept), job), company: job?.company ?? null, changed: kept.length > 0,
        from: latest ?? base, to: result.score.total, next: result.run, kind: done.kind,
        roles: cv ? scoredItems(cv).map(({ item, kind }) => ({ ...item, kind })) : [] }) });
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
      const current = isRoleSection(runRef.current?.currentSection) && runRef.current?.currentRoleId === roleId;
      setPhase(current ? { kind: "review", proposals, removed, busy: false } : { kind: "redo", roleId, proposals, removed, busy: false, resume });
    } catch (cause) { fail(cause, "experience", () => setPhase({ kind: "role", roleId, busy: false, resume })); }
  }
  async function acceptRedo(roleId: string, body: api.AcceptBody, review: Extract<Phase, { kind: "redo" }>) {
    setPhase({ ...review, busy: true });
    try {
      const result = await api.acceptRole(runRef.current!.id, roleId, body);
      scoreRef.current = result.score;
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
      scoreRef.current = scores.tailored ?? scores.base;
      baseRef.current = scores.base;
      setBase(scores.base?.total ?? null);
      setLatest((value) => value ?? scores.tailored?.total ?? null);
    }, () => {});
    // Without it the screens fall back to the plain list; the run itself doesn't need it.
    getCv().then((response) => setCv(response.content), () => {});
    getJob(jobId).then((found) => setJob(found.extracted ?? null), () => {});
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Items already accepted (roles, then projects and volunteering, in one order): all of them once the role steps are
  // behind the run, else the ones before the current item.
  const order = run?.roleOrder ?? [];
  const lastRoleStep = run ? Math.max(...run.sections.map((s, i) => (isRoleSection(s) ? i : -1))) : -1;
  const pastRoleSteps = !!run && (run.status === "done" || !section || run.sections.indexOf(section) > lastRoleStep);
  const doneRoles = pastRoleSteps ? order
    : isRoleSection(section) && run?.currentRoleId && order.includes(run.currentRoleId) ? order.slice(0, order.indexOf(run.currentRoleId)) : [];
  const doneIn = (s: TailorSection) => (cv ? stepItems(cv, s).filter((item) => doneRoles.includes(item.id)) : []);
  // Going back opens only from a question or a review, so nothing in flight comes back over it.
  const settled = phase.kind === "questions" || phase.kind === "review";
  const reached = run && section ? run.sections.indexOf(section) : run?.sections.length ?? 0;
  // Without the CV loaded, finished roles still open Experience (as before projects were tailored).
  const anyDone = (s: TailorSection) => (cv ? doneIn(s).length > 0 : s === "experience" && doneRoles.length > 0);
  const open = settled && run ? run.sections.filter((s, i) => (isRoleSection(s) ? anyDone(s) : i < reached)) : [];
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
    body = <SteerConfirm busy={phase.busy} onCancel={() => setPhase(phase.resume)} onRedo={() => void restart(phase.steering, phase)} />;
  } else if (phase.kind === "back") {
    const { resume } = phase;
    body = isRoleSection(phase.section)
      ? <FinishedRoles roles={doneIn(phase.section)} locale={locale}
        onPick={(roleId) => setPhase({ kind: "role", roleId, busy: false, resume })} onClose={() => setPhase(resume)} />
      : <YourAnswers key={phase.section} title={t(`tailor.section.${phase.section}`)} questions={stepQuestions(phase.section)}
        answers={run?.answers ?? []} busy={false} locale={locale} onClose={() => setPhase(resume)} />;
  } else if (phase.kind === "role") {
    const { roleId, resume } = phase;
    const role = scoredOf(roleId)?.item;
    body = <YourAnswers key={roleId} title={role ? roleName(role, locale) : t("tailor.role.untitled")}
      questions={stepQuestions((cv && stepOf(cv, roleId)) || "experience", roleId)}
      answers={run?.answers ?? []} busy={phase.busy} locale={locale}
      onUpdate={(answers) => void redo(roleId, answers, resume)} onClose={() => setPhase(resume)} />;
  } else if (phase.kind === "redo") {
    const review = phase;
    const role = scoredOf(review.roleId)?.item;
    const onAccept = (accepted: api.AcceptBody) => void acceptRedo(review.roleId, accepted, review);
    body = role ? <RoleReview key={`redo-${role.id}`} role={role} kind={scoredOf(review.roleId)?.kind} proposals={review.proposals} locale={locale} busy={review.busy} onAccept={onAccept} removed={review.removed} />
      : <SectionReview key={`redo-${review.roleId}`} section="experience" proposals={review.proposals} flags={[]} confirmed={[]}
        busy={review.busy} onAccept={onAccept} cv={cv} removed={review.removed} />;
  }
  else if (phase.kind === "roleDone") {
    const done = phase;
    body = <TailorMoment from={done.from} to={done.to} title={done.title} line={done.line} button={done.button} onNext={() => enter(done.next)} />;
  } else if (phase.kind === "done") {
    body = <DoneScreen jobId={jobId} docId={run?.tailoredCvId ?? null} base={baseRef.current} final={scoreRef.current} job={job} />;
  } else if (phase.kind === "deleted") {
    body = <section className="tailor-card page-note" role="alert"><h2>{t("tailor.error.deleted")}</h2>
      <Link to="/jobs">{t("tailor.error.toJobs")}</Link></section>;
  } else if (phase.kind === "error") {
    body = <section className="tailor-card page-note" role="alert"><p>{phase.message}</p>
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
    // "Project 1 of 2 · Question 1 of 3": the current item among the step's items of its kind (roles: every role).
    const current = scoredOf(run?.currentRoleId);
    const kindOrder = !run || !isRoleSection(section) ? [] : cv && current
      ? stepOrder(run, cv, section).filter((id) => scoredOf(id)?.kind === current.kind) : section === "experience" ? run.roleOrder ?? [] : [];
    const progress = run?.currentRoleId && kindOrder.includes(run.currentRoleId)
      ? t(`tailor.question.roleProgress${kindKey(current?.kind)}`, { role: kindOrder.indexOf(run.currentRoleId) + 1, roles: kindOrder.length,
        n: phase.index + 1, total: phase.questions.length })
      : t("tailor.question.progress", { n: phase.index + 1, total: phase.questions.length });
    body = <QuestionCard key={question.id} question={question} progress={progress} initial={phase.answers[phase.index]}
      asks={question.gap ? nameOf(question.gap, job) : null}
      onNext={answerWith} onSkip={() => answerWith({ value: null, via: "skip" })}
      onBack={phase.index > 0 ? () => setPhase({ ...phase, index: phase.index - 1 }) : undefined}
      role={roleFor(question)} kind={scoredOf(question.roleId)?.kind} roles={cv?.experience ?? []} locale={cv?.locale} />;
  } else if (isRoleSection(section) && scoredOf(run?.currentRoleId)) {
    const review = phase;
    body = <RoleReview key={run!.currentRoleId!} role={scoredOf(run!.currentRoleId)!.item} kind={scoredOf(run!.currentRoleId)!.kind} proposals={review.proposals} locale={locale}
      busy={review.busy} onAccept={(accepted) => void accept(section, accepted)} onAnswers={() => void openAnswers(review)} removed={review.removed} />;
  } else {
    body = <SectionReview key={section} section={section} proposals={phase.proposals} flags={[]}
      confirmed={[]} busy={phase.busy} onAccept={(accepted) => { setTicks([]); void accept(section, accepted); }} cv={cv} removed={phase.removed} />;
  }
  const wide = phase.kind === "questions" && isRoleSection(section) && !!roleFor(phase.questions[phase.index]!);

  return <div className={wide ? "tailor-mode is-wide" : "tailor-mode"} data-section={colour}>
    <header className="tailor-head">
      <p className="tailor-eyebrow">{t("tailor.eyebrow")}</p>
      <Link to={`/jobs/${encodeURIComponent(jobId)}`}>{t("tailor.back")}</Link>
    </header>
    {run && <StepBar sections={run.sections} current={section} base={base} latest={latest} score={scoreRef.current} open={open}
      onOpen={(s) => setPhase({ kind: "back", section: s, resume: phase })}
      onSteer={settled ? () => void openSteer(phase) : undefined} />}
    {!run && (base !== null || latest !== null) && <StepBar sections={[...TAILOR_SECTIONS]} current={null} base={base} latest={latest} score={scoreRef.current} />}
    <main className="tailor-main">
      {ticks.map((s) => <p key={s} className="tailor-tick">{t("tailor.final.nothing", { section: t(`tailor.section.${s}`) })}</p>)}
      {body}
    </main>
  </div>;
}
