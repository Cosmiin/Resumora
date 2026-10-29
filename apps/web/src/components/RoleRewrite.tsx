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
} from "@resumora/contracts/intelligence/model";
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
  autoRequest?: { id: string; input: CareerContext };
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
    [error, setError] = useState("");
  const current = useRef(draft),
    requestGeneration = useRef(0);
  const inFlight = useRef(false);
  current.current = draft;
  useEffect(() => {
    setBusy(false);
    inFlight.current = false;
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
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    const source = current.current,
      generation = ++requestGeneration.current;
    const active = () => generation === requestGeneration.current;
    setBusy(true);
    setError("");
    try {
      const input = careerContext(source, targetId),
        proposal = await request(targetId);
      if (!active()) return;
      if (current.current !== source) throw new Error("STALE");
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
    } catch {
      if (active())
        setError(
          t(
            "Propunerea nu este disponibilă sau contextul s-a schimbat. Răspunsurile sunt păstrate; continuă manual.",
            "Proposal unavailable or context changed. Answers are retained; continue manually.",
          ),
        );
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
        disabled={busy || !targetId || !ready}
        onClick={() => void generate()}
      >
        {busy
          ? t("Pregătim…", "Preparing…")
          : autoRequest
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
            <textarea
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
    </section>
  );
}
