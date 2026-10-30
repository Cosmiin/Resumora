import {
  IntelligenceRequestError,
  uncertainRewriteCodes,
} from "../base/intelligence";
import { AutoTextarea } from "./AutoTextarea";
import { currentWording } from "../base/wording";
import { useEffect, useRef, useState } from "react";
import {
  careerContext,
  type CareerFact,
  type CareerContext,
} from "@resumora/contracts/intelligence/context";
import {
  validateRewrite,
  type RoleRewrite as Proposal,
  type QuestionPlan,
} from "@resumora/contracts/intelligence/model";
import { nextQuestionIndex } from "../base/enrichment";
import { clone, equalValues, type BaseDraft } from "../base/model";
import { Button, useCopy } from "./ui";
export function RoleRewrite({
  draft,
  targetId,
  request,
  accept,
  change,
  autoRequest,
  ready = true,
  onAutoRequest,
}: {
  autoRequest?: { id: string; input: CareerContext; plan: QuestionPlan };
  onAutoRequest?: () => void;
  ready?: boolean;
  draft: BaseDraft;
  targetId: string;
  request: (target: string) => Promise<Proposal>;
  accept?: (
    draft: BaseDraft,
    target: string,
    text: string,
    sources: CareerFact[],
  ) => BaseDraft;
  change: (draft: BaseDraft) => void;
}) {
  const t = useCopy(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [failure, setFailure] = useState<{
      uncertain: boolean;
      operationId?: string;
    } | null>(null);
  const current = useRef(draft),
    requestGeneration = useRef(0);
  const inFlight = useRef(false);
  current.current = draft;
  useEffect(() => {
    setBusy(false);
    inFlight.current = false;
    setFailure(null);
    setError("");
    return () => {
      requestGeneration.current++;
    };
  }, [targetId]);
  const saved = draft.roleRewriteReviews
    ?.filter((r) => r.proposal.targetId === targetId && r.status === "pending")
    .at(-1);
  let valid = false;
  try {
    valid = !!saved && equalValues(saved.input, careerContext(draft, targetId));
  } catch {
    /* Insufficient/removed evidence cannot accept. */
  }
  const role = draft.roles.find((r) => r.id === targetId),
    entry = draft.optionalSections
      .flatMap((s) => s.entries)
      .find((e) => e.id === targetId);
  const originalText = role
    ? [role.context.value, ...role.bullets.map((f) => f.value)]
        .filter(Boolean)
        .join("\n")
    : [entry?.details.value, ...(entry?.bullets ?? []).map((f) => f.value)]
        .filter(Boolean)
        .join("\n");
  const before = currentWording(draft, targetId) ?? originalText;
  function edit(text: string) {
    if (!saved) return;
    const next = clone(draft);
    next.roleRewriteReviews!.find((r) => r.id === saved.id)!.proposal.text =
      text;
    change(next);
  }
  function decide(accepted: boolean) {
    if (!saved) return;
    if (!accepted) {
      const next = clone(draft);
      next.roleRewriteReviews!.find((r) => r.id === saved.id)!.status =
        "rejected";
      change(next);
      setError("");
      return;
    }
    try {
      const proposal = validateRewrite(
        saved.proposal,
        targetId,
        saved.input.facts,
      );
      if (!valid || !accept) throw new Error("STALE");
      const next = clone(draft);
      next.roleRewriteReviews!.find((r) => r.id === saved.id)!.status =
        "accepted";
      change(
        accept(
          next,
          targetId,
          proposal.text,
          saved.input.facts.filter((f) => proposal.factIds.includes(f.id)),
        ),
      );
      setError("");
    } catch {
      setError(
        t(
          "Sursele sau textul nu mai sunt valide. Verifică afirmațiile și cere o propunere nouă.",
          "Sources or wording are no longer valid. Check claims and request a new proposal.",
        ),
      );
    }
  }
  const consumed = useRef<string | null>(null);
  async function generate() {
    if (inFlight.current || !ready || failure?.uncertain) return;
    inFlight.current = true;
    const source = current.current,
      generation = ++requestGeneration.current;
    const active = () => generation === requestGeneration.current;
    setBusy(true);
    setError("");
    setFailure(null);
    try {
      const input = careerContext(source, targetId),
        proposal = await request(targetId);
      if (!active()) return;
      if (!equalValues(current.current, source)) throw new Error("STALE");
      validateRewrite(proposal, targetId, input.facts);
      const next = clone(source);
      const history = next.roleRewriteReviews ?? [];
      const pinned = new Set(
        Object.entries(next.presentation.approvedWording ?? {})
          .filter(([, wording]) => wording.scope === "experience")
          .map(([target, wording]) =>
            history.findLast(
              (r) =>
                r.status === "accepted" &&
                r.proposal.targetId === target &&
                r.proposal.text === wording.text,
            ),
          )
          .filter((r) => r !== undefined),
      );
      const retained = new Set([
        ...pinned,
        ...history.filter((r) => !pinned.has(r)).slice(-19),
      ]);
      next.roleRewriteReviews = [
        ...history.filter((r) => retained.has(r)),
        { id: crypto.randomUUID(), input, proposal, status: "pending" },
      ];
      change(next);
    } catch (error) {
      if (active()) {
        const code =
          error instanceof IntelligenceRequestError
            ? error.code
            : error instanceof Error
              ? error.message
              : "";
        const known = [
          "AI_OUTPUT_TRUNCATED",
          "AI_OUTPUT_INVALID",
          "REWRITE_OUTPUT",
          "OUTPUT_UNSUPPORTED",
          "AI_PROVIDER_REJECTED",
          "STALE",
          "STALE_INPUT",
          "SAVE_REQUIRED",
          "VERSION_CONFLICT",
          "AI_DISABLED",
          "AI_UNCONFIGURED",
          "INVALID_SCOPED_CONTEXT",
        ].includes(code);
        const uncertain = uncertainRewriteCodes.has(code) || !known;
        setFailure({
          uncertain,
          operationId:
            error instanceof IntelligenceRequestError &&
            /^[a-f0-9-]{36}$/i.test(error.operationId ?? "")
              ? error.operationId
              : undefined,
        });
        const reason =
          code === "AI_OUTPUT_TRUNCATED"
            ? t(
                "AI s-a oprit înainte de a termina descrierea. Poți cere explicit o rescriere nouă.",
                "AI stopped before finishing the description. You can explicitly request a new rewrite.",
              )
            : [
                  "AI_OUTPUT_INVALID",
                  "REWRITE_OUTPUT",
                  "OUTPUT_UNSUPPORTED",
                ].includes(code)
              ? t(
                  "Descrierea returnată nu a trecut verificările de structură sau dovezi. Poți reîncerca explicit.",
                  "The returned description did not pass structure or evidence checks. You can explicitly retry.",
                )
              : [
                    "STALE",
                    "STALE_INPUT",
                    "SAVE_REQUIRED",
                    "VERSION_CONFLICT",
                  ].includes(code)
                ? t(
                    "Contextul s-a schimbat sau nu este încă salvat. Așteaptă salvarea și verifică răspunsurile înainte de a reîncerca.",
                    "Context changed or is not saved yet. Wait for saving and review your answers before retrying.",
                  )
                : ["AI_DISABLED", "AI_UNCONFIGURED"].includes(code)
                  ? t(
                      "Procesarea AI este dezactivată sau neconfigurată. Reîncearcă numai după activare; editarea manuală rămâne disponibilă.",
                      "AI processing is off or unconfigured. Retry only after activation; manual editing remains available.",
                    )
                  : code === "INVALID_SCOPED_CONTEXT"
                    ? t(
                        "Contextul experienței nu este eligibil. Verifică și salvează dovezile înainte de a reîncerca.",
                        "The experience context is not eligible. Review and save its evidence before retrying.",
                      )
                    : code === "AI_PROVIDER_REJECTED"
                      ? t(
                          "Serviciul AI a respins cererea. Poți reîncerca explicit mai târziu.",
                          "The AI service rejected the request. You can explicitly retry later.",
                        )
                      : code === "AI_TIMEOUT_UNKNOWN"
                        ? t(
                            "Cererea a depășit timpul de așteptare; rezultatul și costul pot fi încă necunoscute.",
                            "The request timed out; its outcome and cost may still be unknown.",
                          )
                        : t(
                            "Nu putem confirma rezultatul cererii. Aceasta poate fi încă în curs sau răspunsul s-a pierdut.",
                            "We cannot confirm the request outcome. It may still be running or its response was lost.",
                          );
        setError(
          reason +
            " " +
            t(
              "Răspunsurile și experiența salvată rămân păstrate.",
              "Your answers and saved experience are retained.",
            ) +
            (uncertain
              ? " " +
                t(
                  "Nu trimitem o cerere duplicată. Verifică propunerile salvate; dacă rezultatul lipsește, cere verificarea referinței cererii înainte de o nouă încercare. Această rută nu poate recupera automat rezultatul unei cereri necunoscute.",
                  "We do not send a duplicate request. Check saved proposals; if the result is missing, ask for the request reference to be checked before another attempt. This route cannot automatically recover an unknown request's result.",
                )
              : ""),
        );
      }
    } finally {
      if (active()) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  }
  useEffect(() => {
    if (!autoRequest || consumed.current === autoRequest.id || !ready) return;
    let cancelled = false;
    // Defer until mount effects settle so StrictMode's setup/cleanup probe cannot
    // consume a cycle and fence its only response.
    queueMicrotask(() => {
      if (cancelled || consumed.current === autoRequest.id) return;
      consumed.current = autoRequest.id;
      onAutoRequest?.();
      try {
        if (
          nextQuestionIndex(current.current, autoRequest.plan) !==
            autoRequest.plan.questions.length ||
          !equalValues(
            autoRequest.input,
            careerContext(current.current, targetId),
          )
        )
          throw new Error("STALE");
        void generate();
      } catch {
        setError(
          t(
            "Context modificat. Verifică răspunsurile și reîncearcă rescrierea.",
            "Context changed. Review your answers and retry the rewrite.",
          ),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [autoRequest?.id, ready]);
  return (
    <section className="card">
      <h3>
        {t("Rescrie întreaga experiență", "Rewrite the whole experience")}
      </h3>
      <p className="small muted">
        {t(
          "Folosim contextul actual și răspunsurile salvate. Rezultatul este o propunere: întrebările, răspunsurile și faptele originale rămân păstrate.",
          "Uses current context and saved answers. The result is a proposal: original questions, answers and facts remain saved.",
        )}
      </p>
      {autoRequest && !ready && (
        <p role="status">
          {t(
            "Salvăm răspunsurile înainte de a crea descrierea…",
            "Saving answers before creating the description…",
          )}
        </p>
      )}
      <Button
        disabled={busy || !targetId || !ready || !!failure?.uncertain}
        onClick={() => void generate()}
      >
        {busy
          ? t("Pregătim…", "Preparing…")
          : autoRequest || failure
            ? t("Reîncearcă rescrierea", "Retry rewrite")
            : t("Propune rescrierea experienței", "Propose experience rewrite")}
      </Button>
      {saved && (
        <div className="stack">
          <p>
            <strong>{t("Înainte", "Before")}</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{before}</p>
          <label>
            {t(
              "Propunere — verifică înainte de acceptare",
              "Proposal — review before acceptance",
            )}
            <AutoTextarea
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                  e.stopPropagation();
              }}
              rows={6}
              value={saved.proposal.text}
              onChange={(e) => edit(e.target.value)}
            />
          </label>
          <details>
            <summary>{t("Dovezi folosite", "Supporting evidence")}</summary>
            {saved.input.facts
              .filter((f) => saved.proposal.factIds.includes(f.id))
              .map((f) => (
                <p key={f.id}>{f.text}</p>
              ))}
          </details>
          {saved.proposal.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {!valid && (
            <p role="status">
              {t(
                "Context modificat; acceptarea este blocată.",
                "Context changed; acceptance blocked.",
              )}
            </p>
          )}
          <div className="actions">
            <Button
              disabled={!valid || !accept}
              variant="primary"
              onClick={() => decide(true)}
            >
              {t("Acceptă rescrierea", "Accept rewrite")}
            </Button>
            <Button onClick={() => decide(false)}>
              {t("Respinge propunerea", "Reject proposal")}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="status">{error}</p>}
      {failure?.operationId && (
        <p>
          {t("Referința cererii", "Request reference")}:{" "}
          <code>{failure.operationId}</code>
        </p>
      )}
    </section>
  );
}
