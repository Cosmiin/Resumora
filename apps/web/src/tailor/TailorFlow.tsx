import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { findScored, isRoleSection, stepItems, stepOf, stepOrder, type Answer, type CvContent, type JobExtraction, type MatchScore, type Steering, type TailorLanguage, type TailorQuestion, type TailorRun, type TailorSection } from "@resumora/shared";
import { getCv } from "../cv/cv-api.ts";
import { FocusBar } from "../cv/enrich/FocusBar.tsx";
import { AppShell } from "../layout/AppShell.tsx";
import { Stepper } from "../ui/index.ts";
import { getJob, scoreJob } from "../jobs/jobs-api.ts";
import { t } from "../i18n/t.ts";
import { ApiClientError } from "../lib/api.ts";
import { QuestionCard, type Draft } from "./QuestionCard.tsx";
import { kindKey } from "./role-done.ts";
import { KeywordsStep, keywordsOf } from "./KeywordsStep.tsx";
import { LanguageStep } from "./LanguageStep.tsx";
import { RoleReview } from "./RoleReview.tsx";
import { SectionReview } from "./SectionReview.tsx";
import { SteerConfirm, SteeringStep } from "./SteeringStep.tsx";
import { DoneScreen } from "./DoneScreen.tsx";
import { FINAL_SECTIONS } from "./LayoutReview.tsx";
import { remember, remembered, type Phase } from "./flow-phase.ts";
import * as api from "./tailor-api.ts";
import { FinishedRoles, roleName, YourAnswers } from "./YourAnswers.tsx";
import "../styles/tailor.css";

export { remember, remembered } from "./flow-phase.ts";

/**
 * `/jobs/:id/tailor`: the language check and the keywords, then each section's questions (on the focus screen),
 * run and review (Experience role by role), then the finish.
 */
export function TailorFlow() {
  const jobId = useParams().id ?? "";
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [run, setRun] = useState<TailorRun | null>(null);
  // The language picked on the language step; a run continued later no longer knows it.
  const [language, setLanguage] = useState<TailorLanguage | undefined>(undefined);
  // The base CV's match with the job, for the keywords before tailoring starts.
  const [baseScore, setBaseScore] = useState<MatchScore | null>(null);
  // The Base CV the questions and proposals are made from: shows each role and the wording a change replaces.
  const [cv, setCv] = useState<CvContent | null>(null);
  // Questions may be about a role, a project or a volunteering role (same shape as a job).
  const scoredOf = (id: string | null | undefined) => (cv && id ? findScored(cv, id) : undefined);
  const roleFor = (question: TailorQuestion) => scoredOf(question.roleId)?.item;
  // The tone and extra questions: chosen before the start (optional), or read from a started run.
  const [steering, setSteering] = useState<Steering | undefined>(undefined);
  const runRef = useRef<TailorRun | null>(null);
  // The newest score with its labels (base, then each accept's), and the job: for the role done line.
  const scoreRef = useRef<MatchScore | null>(null);
  const baseRef = useRef<MatchScore | null>(null);
  const [job, setJob] = useState<JobExtraction | null>(null);
  const started = useRef(false);
  // FinalA: final touches with nothing to change, accepted on their own; the next screen shows a tick for each.
  const [ticks, setTicks] = useState<TailorSection[]>([]);
  // A change inside these screens never needs the newest score on screen, only on the next one.
  const noteScore = (score: MatchScore) => { scoreRef.current = score; };
  const section = run?.currentSection ?? null;

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
      noteScore(result.score);
      setTicks((list) => (list.includes(at) ? list : [...list, at]));
      enter(result.run);
    } catch (cause) { fail(cause, at, () => void pass(at)); }
  }
  async function accept(at: TailorSection, body: api.AcceptBody) {
    setPhase((current) => current.kind === "review" ? { ...current, busy: true } : current);
    try {
      const roleId = roleArg(at);
      const result = await api.acceptSection(runRef.current!.id, at, roleId ? { ...body, roleId } : body);
      noteScore(result.score);
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
  /** "Skip this role" while its questions are open: the role stays as it is on the CV and the run moves on. */
  async function skipRole(at: TailorSection) {
    setPhase({ kind: "working" });
    try {
      const roleId = roleArg(at);
      const result = await api.acceptSection(runRef.current!.id, at, { decisions: [], inferred: [], flags: [], ...(roleId ? { roleId } : {}) });
      noteScore(result.score);
      enter(result.run);
    } catch (cause) { fail(cause, at, () => void ask(at)); }
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
      noteScore(result.score);
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
  async function start() {
    setPhase({ kind: "keywords", busy: true });
    try {
      const { run: created } = await api.startTailoring(jobId, steering ?? {}, language);
      remember(jobId, created.id);
      enter(created);
    } catch (cause) { fail(cause, null, () => setPhase({ kind: "keywords", busy: false })); }
  }
  async function load() {
    const stored = remembered(jobId);
    if (!stored) return setPhase({ kind: "lang" });
    setPhase({ kind: "loading" });
    try { enter(await api.getRun(stored)); } catch (cause) { fail(cause, null, () => void load()); }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The match with the base CV is worked out on the job page; someone who lands here first gets it now.
    api.getScores(jobId).then((scores) => (scores.base ? scores : scoreJob(jobId))).then((scores) => {
      scoreRef.current ??= scores.tailored ?? scores.base;
      baseRef.current = scores.base;
      setBaseScore(scores.base);
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
  else if (phase.kind === "lang") {
    body = <LanguageStep jobId={jobId} picked={language} onContinue={(picked) => { setLanguage(picked); setPhase({ kind: "keywords", busy: false }); }} />;
  } else if (phase.kind === "keywords") {
    body = <KeywordsStep score={baseScore} roles={cv?.experience ?? []} locale={locale} busy={phase.busy}
      onBack={() => setPhase({ kind: "lang" })} onStart={() => void start()} onSteer={() => setPhase({ kind: "steer", busy: false })} />;
  } else if (phase.kind === "steer") {
    const { resume } = phase;
    // Before the start the choices are only kept; on a started run they redo every step, so that asks first.
    const keywords = (): void => setPhase({ kind: "keywords", busy: false });
    body = <SteeringStep jobId={jobId} roles={cv?.experience ?? []} busy={phase.busy} initial={steering}
      startLabel={t(resume ? "tailor.steer.save" : "tailor.steer.keep")} onCancel={resume ? () => setPhase(resume) : keywords}
      onStart={(s) => { if (resume) return setPhase({ kind: "confirm", steering: s, busy: false, resume }); setSteering(s); keywords(); }} />;
  } else if (phase.kind === "confirm") {
    body = <SteerConfirm busy={phase.busy} onCancel={() => setPhase(phase.resume)} onRedo={() => void restart(phase.steering, phase)} />;
  } else if (phase.kind === "back") {
    const { resume } = phase;
    body = isRoleSection(phase.section)
      // From the finish every finished item is offered (roles, then projects and volunteering); from a step, that step's.
      ? <FinishedRoles roles={resume.kind === "done" ? [...doneIn("experience"), ...doneIn("projects")] : doneIn(phase.section)} locale={locale}
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
  else if (phase.kind === "done") {
    body = <DoneScreen jobId={jobId} docId={run?.tailoredCvId ?? null} base={baseRef.current} final={scoreRef.current} job={job}
      onAnswers={anyDone("experience") || anyDone("projects") ? () => setPhase({ kind: "back", section: "experience", resume: phase }) : undefined} />;
  } else if (phase.kind === "deleted") {
    body = <section className="ui-stack tailor-narrow" role="alert"><h1 className="ui-title">{t("tailor.error.deleted")}</h1>
      <p><Link className="ui-btn" to="/jobs">{t("tailor.error.toJobs")}</Link></p></section>;
  } else if (phase.kind === "error") {
    body = <section className="ui-stack tailor-narrow"><p role="alert" className="ui-notice ui-notice--bad">{phase.message}</p>
      <p><button type="button" className="ui-btn" onClick={phase.retry}>{t("tailor.retry")}</button></p></section>;
  } else if (!section) body = null;
  else if (phase.kind === "asking" || phase.kind === "working") {
    body = <p role="status" className="ui-coach tailor-working">
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
    body = <QuestionCard key={question.id} question={question} progress={progress} index={phase.index} total={phase.questions.length}
      job={job} score={baseRef.current} initial={phase.answers[phase.index]}
      onNext={answerWith} onSkip={() => answerWith({ value: null, via: "skip" })}
      onBack={phase.index > 0 ? () => setPhase({ ...phase, index: phase.index - 1 }) : undefined}
      role={roleFor(question)} kind={scoredOf(question.roleId)?.kind} roles={cv?.experience ?? []} locale={cv?.locale} />;
  } else if (isRoleSection(section) && scoredOf(run?.currentRoleId)) {
    const review = phase;
    const current = scoredOf(run!.currentRoleId)!;
    // "Role 1 of 2": the item among the step's items of its kind.
    const kindOrder = cv ? stepOrder(run!, cv, section).filter((id) => scoredOf(id)?.kind === current.kind) : [];
    const position = kindOrder.includes(current.item.id)
      ? t(`tailor.roleReview.position${kindKey(current.kind)}`, { n: kindOrder.indexOf(current.item.id) + 1, total: kindOrder.length }) : undefined;
    const words = keywordsOf(scoreRef.current);
    body = <RoleReview key={run!.currentRoleId!} role={current.item} kind={current.kind} proposals={review.proposals} locale={locale}
      position={position} keywords={{ has: words.has.length, total: words.has.length + words.missing.length }}
      busy={review.busy} onAccept={(accepted) => void accept(section, accepted)} onAnswers={() => void openAnswers(review)} removed={review.removed} />;
  } else {
    body = <SectionReview key={section} section={section} proposals={phase.proposals} flags={[]}
      confirmed={[]} busy={phase.busy} onAccept={(accepted) => { setTicks([]); void accept(section, accepted); }} cv={cv} removed={phase.removed} />;
  }
  const jobName = [job?.title.trim(), job?.company?.trim()].filter(Boolean).join(", ");
  const toJob = `/jobs/${encodeURIComponent(jobId)}`;

  // Questions are answered on the focus screen: no app navigation, the role beside the question.
  if (section && (phase.kind === "questions" || phase.kind === "asking")) {
    return <div className="ui-page focus-mode tailor-focus">
      <FocusBar context={t("tailor.for")} name={jobName || undefined} closeLabel={t("tailor.back")} onClose={() => void navigate(toJob)}
        skip={phase.kind === "questions" && isRoleSection(section)
          ? { label: t(`tailor.roleReview.skip${kindKey(scoredOf(run?.currentRoleId)?.kind)}`), onSkip: () => void skipRole(section) } : undefined} />
      {phase.kind === "asking" ? <div className="fm-grid">{body}</div> : body}
    </div>;
  }

  const step = phase.kind === "lang" ? 0 : !run ? 1 : phase.kind === "done" || run.status === "done" || !section ? 4 : isRoleSection(section) ? 2 : 3;
  return <AppShell>
    <main className="ui-page tailor-page">
      <div className="ui-wrap ui-main">
        <Stepper label={t("tailor.steps")} current={step}
          steps={[t("tailor.step.language"), t("tailor.step.keywords"), t("tailor.step.roles"), t("tailor.step.summary"), t("tailor.step.finish")]} />
        {jobName && <p className="ui-small ui-muted tailor-for">{t("tailor.for")}: <Link to={toJob}>{jobName}</Link></p>}
        {run && settled && <p className="tailor-links">
          <span className="ui-muted">{t("tailor.lookBack")}</span>
          {open.map((s) => <button key={s} type="button" onClick={() => setPhase({ kind: "back", section: s, resume: phase })}>{t(`tailor.section.${s}`)}</button>)}
          <button type="button" onClick={() => void openSteer(phase)}>{t("tailor.steps.steering")}</button>
        </p>}
        {ticks.map((s) => <p key={s} className="ui-small ui-muted tailor-tick">{t("tailor.final.nothing", { section: t(`tailor.section.${s}`) })}</p>)}
        {body}
      </div>
    </main>
  </AppShell>;
}
