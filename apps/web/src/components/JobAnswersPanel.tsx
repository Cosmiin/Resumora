import { useContext, useEffect, useRef, useState } from "react";
import type { BaseDraft } from "../base/model";
import type { Snapshot } from "../base/adapter";
import type {
  JobAnswers,
  CareerOperation,
} from "@resumora/contracts/editor/workspace";
import { decodeDraft } from "@resumora/contracts/editor/transport";
import { currentWording } from "../base/wording";
import {
  WorkspaceContext,
  useWorkspaceDraft,
  DraftStatus,
} from "../workspace/context";
import { Button, useCopy } from "./ui";
export function JobAnswersPanel({
  jobId,
  profile,
  snapshot,
  ready,
  onProfileAccepted,
  refresh = 0,
}: {
  jobId: string;
  profile: BaseDraft | null;
  snapshot: Snapshot | null;
  ready: boolean;
  onProfileAccepted: (saved: Snapshot) => void;
  refresh?: number;
}) {
  const registry = useContext(WorkspaceContext)!,
    t = useCopy();
  const [bundle, setBundle] = useState<JobAnswers>({
      revision: 0,
      answers: [],
    }),
    [selected, setSelected] = useState<string[]>([]),
    [target, setTarget] = useState(""),
    [operation, setOperation] = useState<CareerOperation | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const answerDraft = useWorkspaceDraft("job-answer", jobId, {
    entries: {} as Record<
      string,
      {
        requirementId: string;
        targetId: string;
        questionText: string;
        text: string;
      }
    >,
    focused: "",
    integrationSelection: {
      answerIds: [] as string[],
      targetId: "",
      snapshotId: "",
      revision: 0,
      answersRevision: 0,
    },
    integrationOperationId: "",
  });
  const pendingAnswer = registry.receipt(`job-answer-command:${jobId}`);
  const restored = useRef(false);
  useEffect(() => {
    if (answerDraft.ready && !restored.current) {
      restored.current = true;
      if (answerDraft.value.integrationSelection) {
        setSelected(answerDraft.value.integrationSelection.answerIds);
        setTarget(answerDraft.value.integrationSelection.targetId);
      }
      if (answerDraft.value.integrationOperationId) {
        const s = answerDraft.value.integrationSelection;
        setOperation(
          (old) =>
            old ?? {
              id: answerDraft.value.integrationOperationId,
              kind: "integration",
              state: "unknown",
              input: {
                jobId,
                targetId: s.targetId,
                snapshotId: s.snapshotId,
                revision: s.revision,
                answersRevision: s.answersRevision,
                answerIds: s.answerIds,
              },
              result: null,
              createdAt: "",
            },
        );
      }
    }
  }, [answerDraft.ready]);
  const select = (answerIds: string[], targetId: string) => {
    setSelected(answerIds);
    setTarget(targetId);
    answerDraft.set({
      ...answerDraft.value,
      integrationSelection: {
        answerIds,
        targetId,
        snapshotId: snapshot?.id ?? "",
        revision: snapshot?.revision ?? 0,
        answersRevision: bundle.revision,
      },
    });
  };
  async function saveEdited(id: string) {
    const old = bundle.answers.find((a) => a.id === id),
      draft = answerDraft.value.entries[id];
    if (
      !old ||
      !draft ||
      (pendingAnswer.current && pendingAnswer.current.answer.id !== id)
    )
      return;
    setBusy(true);
    try {
      if (!(await answerDraft.flush())) throw Error();
      const { revision, ...answer } = old;
      const body = pendingAnswer.current ?? {
        requestId: crypto.randomUUID(),
        expectedRevision: bundle.revision,
        answer: { ...answer, text: draft.text, status: "confirmed" },
      };
      pendingAnswer.current = body;
      registry.notify();
      setBundle(await registry.json(`/v1/jobs/${jobId}/answers`, body));
      pendingAnswer.current = null;
      registry.notify();
      answerDraft.set((current) => ({
        ...current,
        focused: current.entries[id]?.text === body.answer.text ? "" : id,
      }));
      setError("");
    } catch (error) {
      if (
        error instanceof Error &&
        ["conflict", "invalidRequest", "missing"].includes(error.message)
      ) {
        pendingAnswer.current = null;
        registry.notify();
      }
      setError(
        t(
          "Răspunsul nu a fost confirmat. Ciorna este păstrată.",
          "The answer was not confirmed. Its draft is retained.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function reject() {
    if (!operation) return;
    try {
      await registry.json(
        `/v1/intelligence/operations/${operation.id}/reject`,
        {},
      );
      setOperation(null);
      answerDraft.set((current) => ({
        ...current,
        integrationOperationId: "",
      }));
    } catch {
      setError(
        t(
          "Nu am putut confirma respingerea. Profilul nu a fost modificat.",
          "Rejection is unconfirmed. Your profile was not changed.",
        ),
      );
    }
  }
  useEffect(() => {
    let active = true;
    void registry
      .json<JobAnswers & { integrations?: CareerOperation[] }>(
        `/v1/jobs/${jobId}/answers`,
      )
      .then(
        (v) => {
          if (active) {
            setBundle(v);
            const saved = v.integrations?.find((o) =>
              ["ready", "processing", "unknown"].includes(o.state),
            );
            if (saved) setOperation(saved);
          }
        },
        () => {
          if (active)
            setError(
              t(
                "Răspunsurile nu pot fi încărcate acum.",
                "Answers could not be loaded.",
              ),
            );
        },
      );
    return () => {
      active = false;
    };
  }, [registry, jobId, refresh]);
  async function check() {
    if (!operation) return;
    setBusy(true);
    try {
      setOperation(
        await registry.json(`/v1/intelligence/operations/${operation.id}`),
      );
      setError("");
    } catch {
      setError(
        t(
          "Nu putem confirma rezultatul. Păstrăm aceeași operațiune.",
          "The outcome is unconfirmed. The same operation is retained.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function propose() {
    if (!snapshot || !ready) return;
    setBusy(true);
    setError("");
    const operationId = crypto.randomUUID();
    try {
      // Keep the operation identity before awaiting a response, including a lost response.
      answerDraft.set({
        ...answerDraft.value,
        integrationOperationId: operationId,
        integrationSelection: {
          answerIds: selected,
          targetId: target,
          snapshotId: snapshot.id,
          revision: snapshot.revision,
          answersRevision: bundle.revision,
        },
      });
      if (!(await answerDraft.flush())) throw Error("draftSaveFailed");
      setOperation({
        id: operationId,
        kind: "integration",
        state: "processing",
        input: {
          jobId,
          targetId: target,
          snapshotId: snapshot.id,
          revision: snapshot.revision,
          answerIds: selected,
          answersRevision: bundle.revision,
        },
        result: null,
        createdAt: new Date().toISOString(),
      });
      setOperation(
        await registry.json(`/v1/jobs/${jobId}/profile-integrations`, {
          operationId,
          snapshotId: snapshot.id,
          revision: snapshot.revision,
          targetId: target,
          answerIds: selected,
          answersRevision: bundle.revision,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "AI_DISABLED",
          "AI_UNCONFIGURED",
          "stale",
          "invalidRequest",
          "draftSaveFailed",
          "conflict",
        ].includes(error.message)
      ) {
        setOperation(null);
        answerDraft.set((current) => ({
          ...current,
          integrationOperationId: "",
        }));
      }
      setError(
        t(
          "Nu s-a confirmat rezultatul. Verifică aceeași operațiune înainte de o nouă cerere AI.",
          "The result is unconfirmed. Check the same operation before another AI request.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function retryRequest() {
    if (!operation) return;
    setBusy(true);
    try {
      setOperation(
        await registry.json(`/v1/jobs/${jobId}/profile-integrations`, {
          operationId: operation.id,
          snapshotId: operation.input.snapshotId,
          revision: operation.input.revision,
          targetId: operation.input.targetId,
          answerIds: operation.input.answerIds,
          answersRevision: operation.input.answersRevision,
        }),
      );
      setError("");
    } catch {
      setError(
        t(
          "Cererea rămâne neconfirmată. Nu a fost creată o cerere nouă.",
          "The request remains unconfirmed. No new request was created.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    if (!operation || !ready) return;
    setBusy(true);
    setError("");
    try {
      const saved = await registry.json<Snapshot>(
        `/v1/jobs/${jobId}/profile-integrations/${operation.id}/accept`,
        { requestId: crypto.randomUUID() },
      );
      onProfileAccepted(saved);
      setOperation({ ...operation, state: "accepted" });
    } catch {
      setError(
        t(
          "Profilul sau răspunsurile s-au schimbat. Propunerea nu a fost aplicată; verifică datele înainte de o propunere nouă.",
          "The profile or answers changed. The proposal was not applied; review your information before requesting a new one.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const result = operation?.result as {
    draft?: Parameters<typeof decodeDraft>[0];
    proposal?: { text: string };
  } | null;
  const proposed = result?.draft ? decodeDraft(result.draft) : null;
  const roleId = String(operation?.input.targetId ?? target);
  const before = profile?.roles.find((r) => r.id === roleId);
  const stale =
    !!operation &&
    !!snapshot &&
    (operation.input.snapshotId !== snapshot.id ||
      operation.input.answersRevision !== bundle.revision);
  return (
    <section className="card stack">
      <h2>
        {t(
          "Întrebări și răspunsuri pentru acest job",
          "Questions and answers for this job",
        )}
      </h2>
      <p>
        {t(
          "Răspunsurile confirmate pot fi folosite la adaptarea acestui CV. Profilul meu nu se schimbă până când accepți separat integrarea.",
          "Confirmed answers can support this job’s CV. My Profile changes only when you separately accept an integration.",
        )}
      </p>
      {!bundle.answers.length && (
        <p>
          {t(
            "Întrebările relevante apar după compararea cu jobul. Poți continua fără să răspunzi.",
            "Relevant questions appear after comparing with the job. You can continue without answering.",
          )}
        </p>
      )}
      {bundle.answers.map((a) => (
        <article className="notice stack" key={a.id}>
          <label className="check-label">
            <input
              type="checkbox"
              disabled={!answerDraft.ready || busy || a.status !== "confirmed"}
              checked={selected.includes(a.id)}
              onChange={(e) =>
                select(
                  e.target.checked
                    ? [...selected, a.id]
                    : selected.filter((id) => id !== a.id),
                  target,
                )
              }
            />
            {a.questionText}
          </label>
          <p className="preserve-lines">
            {a.text ||
              t(
                a.status === "unknown" ? "Nu știu" : "Omis",
                a.status === "unknown" ? "Unknown" : "Skipped",
              )}
          </p>
          <small>{t("Păstrat pentru acest job", "Saved for this job")}</small>
          <Button
            onClick={() =>
              answerDraft.set({
                ...answerDraft.value,
                entries: {
                  ...answerDraft.value.entries,
                  [a.id]: answerDraft.value.entries[a.id] ?? {
                    requirementId: a.requirementId,
                    targetId: a.targetId,
                    questionText: a.questionText,
                    text: a.text,
                  },
                },
                focused: a.id,
              })
            }
          >
            {t("Editează răspunsul", "Edit answer")}
          </Button>
          {answerDraft.value.focused === a.id && (
            <>
              <label>
                {t("Răspunsul tău", "Your answer")}
                <textarea
                  className="native"
                  value={answerDraft.value.entries[a.id]?.text ?? a.text}
                  onChange={(e) =>
                    answerDraft.set({
                      ...answerDraft.value,
                      entries: {
                        ...answerDraft.value.entries,
                        [a.id]: {
                          ...answerDraft.value.entries[a.id],
                          text: e.target.value,
                        },
                      },
                    })
                  }
                />
              </label>
              <Button
                disabled={busy || !answerDraft.value.entries[a.id]?.text.trim()}
                onClick={() => void saveEdited(a.id)}
              >
                {t("Folosește acest răspuns", "Use this answer")}
              </Button>
            </>
          )}
        </article>
      ))}
      {!!bundle.answers.some((a) => a.status === "confirmed") && (
        <>
          <h3>
            {t(
              "Îmbunătățește un rol din Profilul meu",
              "Improve a role in My Profile",
            )}
          </h3>
          <p>
            {t(
              "AI combină răspunsurile selectate cu descrierea și contextul existente. Verifici noua formulare înainte de aplicare. Întrebările și răspunsurile originale se vor păstra în profil.",
              "AI combines selected answers with the existing description and context. Review the new wording before applying it. The original questions and answers will remain in your profile.",
            )}
          </p>
          <label>
            {t("Rolul din profil", "Profile role")}
            <select
              className="native"
              value={target}
              onChange={(e) => select(selected, e.target.value)}
            >
              <option value="">{t("Alege rolul", "Choose a role")}</option>
              {profile?.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title.value} · {r.company.value}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={
              busy ||
              !ready ||
              !target ||
              !selected.length ||
              (!!operation &&
                ["processing", "unknown"].includes(operation.state))
            }
            onClick={() => void propose()}
          >
            {t("Propune îmbunătățirea rolului", "Propose role improvement")}
          </Button>
        </>
      )}
      {operation && ["processing", "unknown"].includes(operation.state) && (
        <div className="notice">
          <p>
            {t(
              "Verificăm aceeași cerere. Profilul și CV-urile acceptate sunt păstrate.",
              "Checking the same request. Your profile and accepted CVs are retained.",
            )}
          </p>
          <Button disabled={busy} onClick={() => void check()}>
            {t("Verifică cererea", "Check request")}
          </Button>
          <Button disabled={busy} onClick={() => void retryRequest()}>
            {t("Reîncearcă aceeași cerere", "Retry the same request")}
          </Button>
          {operation.state === "unknown" && (
            <Button disabled={busy} onClick={() => void reject()}>
              {t("Renunță la această propunere", "Discard this proposal")}
            </Button>
          )}
        </div>
      )}
      {operation?.state === "ready" && proposed && (
        <section
          className="stack"
          aria-label={t(
            "Verifică integrarea în profil",
            "Review profile integration",
          )}
        >
          <h3>
            {t("Propunere pentru Profilul meu", "Proposal for My Profile")}
          </h3>
          {stale && (
            <p className="notice">
              {t(
                "Contextul s-a schimbat. Această propunere nu poate înlocui versiunea mai nouă.",
                "The context changed. This proposal cannot replace newer work.",
              )}
            </p>
          )}
          <h4>{t("Înainte", "Before")}</h4>
          <p className="preserve-lines">
            {before
              ? (currentWording(profile!, roleId) ??
                [
                  before.context.value,
                  ...before.bullets.map((b) => b.value),
                ].join("\n"))
              : ""}
          </p>
          <h4>{t("Propunere", "Proposed")}</h4>
          <p className="preserve-lines">
            {currentWording(proposed, roleId) ?? result?.proposal?.text}
          </p>
          <div className="actions">
            <Button
              variant="primary"
              disabled={busy || !ready || stale}
              onClick={() => void accept()}
            >
              {t(
                "Integrează întrebările, răspunsurile și textul în profil",
                "Integrate questions, answers and wording into my profile",
              )}
            </Button>
            <Button onClick={() => void reject()}>
              {t("Păstrează profilul actual", "Keep current profile")}
            </Button>
          </div>
        </section>
      )}
      {operation?.state === "accepted" && (
        <p role="status">
          {t(
            "Întrebările, răspunsurile și formularea aprobată sunt în Profilul meu. CV-urile pentru joburi rămân independente.",
            "The questions, answers and approved wording are in My Profile. Job CVs remain independent.",
          )}
        </p>
      )}
      <DraftStatus draft={answerDraft} />
      {pendingAnswer.current && (
        <Button
          disabled={busy}
          onClick={() => void saveEdited(pendingAnswer.current.answer.id)}
        >
          {t("Reîncearcă aceeași confirmare", "Retry the same confirmation")}
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
