import { useEffect, useRef, useState } from "react";
import { MAX_LONG_TEXT, newId, type CvContent, type ProjectQuestion, type ProjectWriteAnswer } from "@resumora/shared";
import type { CvAction } from "../edit/cvReducer.ts";
import type { Via } from "./AnswerBox.tsx";
import { projectQuestions, projectWrite } from "./enrich-api.ts";

export type ProjectStep =
  | { kind: "start" }
  | { kind: "question"; index: number }
  | { kind: "working" }
  | { kind: "approve"; answer: ProjectWriteAnswer }
  | { kind: "empty" }
  | { kind: "failed" }
  | { kind: "done" };

/** What the person kept on the approval screen: the description (null = leave it), the bullets and the tools. */
export type ProjectDecision = { description: string | null; bullets: string[]; tools: string[] };

type Opts = { cv: CvContent; projectId: string; dispatch(a: CvAction): void; waitForSave(): Promise<void>; onClose(): void };

/**
 * One project's run: its questions (asked once on open), one per screen, each answer saved to the project's notes
 * at Next; then the writer, after the save, and one approval that replaces the description and every bullet.
 */
export function useProjectRun({ projectId, dispatch, waitForSave, onClose }: Opts) {
  const [questions, setQuestions] = useState<ProjectQuestion[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [step, setStep] = useState<ProjectStep>({ kind: "start" });
  const [busy, setBusy] = useState(false);
  /** Each answered question's note id and text, so Back shows it again and a new answer replaces the note. */
  const [answers, setAnswers] = useState<Record<string, { noteId: string; text: string; via: Via[] }>>({});
  const alive = useRef(true);
  const closed = useRef(false);

  const load = () => {
    setLoadFailed(false);
    setQuestions(null);
    // A project added or renamed a moment ago must be saved before the server can find it.
    waitForSave().catch(() => undefined).then(() => projectQuestions(projectId)).then(
      (a) => alive.current && setQuestions(a.questions),
      () => alive.current && setLoadFailed(true),
    );
  };
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const write = async () => {
    setStep({ kind: "working" });
    setBusy(true);
    try {
      await waitForSave();
      const answer = await projectWrite(projectId);
      if (!alive.current) return;
      const nothing = answer.description.trim() === "" && answer.bullets.length === 0 && answer.extraTools.length === 0;
      setStep(nothing ? { kind: "empty" } : { kind: "approve", answer });
    } catch {
      if (alive.current) setStep({ kind: "failed" });
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const list = questions ?? [];
  const after = (index: number) => (index + 1 < list.length ? setStep({ kind: "question", index: index + 1 }) : void write());

  return {
    step,
    questions: list,
    ready: questions !== null,
    loadFailed,
    busy,
    answers,
    reload: load,
    start() {
      if (questions === null) return;
      if (list.length) setStep({ kind: "question", index: 0 });
      else void write();
    },
    answer(text: string, via: Via[]) {
      if (step.kind !== "question") return;
      const q = list[step.index]!;
      const value = text.trim().slice(0, MAX_LONG_TEXT);
      if (!value) return;
      const noteId = answers[q.id]?.noteId ?? newId();
      dispatch({ type: "setNote", roleId: projectId, note: { id: noteId, question: q.text, answer: value, via: via.length ? via : ["type"], askedAt: new Date().toISOString() } });
      setAnswers((a) => ({ ...a, [q.id]: { noteId, text: value, via } }));
      after(step.index);
    },
    skip() {
      if (step.kind === "question") after(step.index);
    },
    canBack: step.kind === "question" && step.index > 0,
    back() {
      if (step.kind === "question" && step.index > 0) setStep({ kind: "question", index: step.index - 1 });
    },
    retry() {
      void write();
    },
    apply(d: ProjectDecision) {
      if (d.description !== null && d.description.trim() !== "") {
        dispatch({ type: "setItemField", list: "projects", itemId: projectId, field: "description", value: d.description.trim() });
      }
      const bullets = d.bullets.map((b) => b.trim()).filter(Boolean);
      if (bullets.length) dispatch({ type: "setProjectLines", itemId: projectId, texts: bullets });
      const tools = d.tools.map((s) => s.trim()).filter(Boolean);
      if (tools.length) dispatch({ type: "addSkills", skills: tools.map((name) => ({ id: newId(), name, group: "technicalSkills" as const })) });
      setStep({ kind: "done" });
    },
    close(then?: () => void) {
      if (closed.current) return;
      closed.current = true;
      // Answers saved at Next are in the CV already; leaving waits for nothing else.
      (then ?? onClose)();
    },
  };
}
