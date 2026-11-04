import { RoleText } from "./RoleText";
import { ArrowLeft, Pencil } from "lucide-react";
import {
  careerBlocks,
  stripListMarker,
} from "@resumora/contracts/editor/content";
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
  validateRoleSummary,
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
  purpose,
  compact = false,
  inlineSummary = false,
  onDecision,
  onBusyChange,
  onPurposeChange,
  onAutoRequest,
  modal = false,
  backToDetails,
  saveFailed = false,
}: {
  saveFailed?: boolean;
  modal?: boolean;
  backToDetails?: () => void;
  compact?: boolean;
  inlineSummary?: boolean;
  onDecision?: (accepted: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onPurposeChange?: (purpose?: "summary") => void;
  purpose?: "summary";
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
  const validate =
    purpose === "summary" ? validateRoleSummary : validateRewrite;
  const t = useCopy(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [failure, setFailure] = useState<{
      uncertain: boolean;
      operationId?: string;
    } | null>(null);
  const [editingProposal, setEditingProposal] = useState(false);
  const busyNotify = useRef(onBusyChange);
  const summaryHint = t(
    "Contextul și aria rolului în 1–2 propoziții scurte: domeniul, echipele, clienții sau responsabilitatea, pe baza detaliilor confirmate.",
    "Your role's scope and context in 1–2 short sentences: business area, teams, customers or ownership, based on confirmed details.",
  );
  busyNotify.current = onBusyChange;
  useEffect(() => {
    busyNotify.current?.(busy);
    return () => busyNotify.current?.(false);
  }, [busy]);
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
  }, [targetId, purpose]);
  const saved = draft.roleRewriteReviews
    ?.filter(
      (r) =>
        r.proposal.targetId === targetId &&
        r.status === "pending" &&
        r.purpose === purpose,
    )
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
    ? [
        role.context.value,
        ...role.bullets.map((f) => "- " + stripListMarker(f.value)),
      ]
        .filter(Boolean)
        .join("\n")
    : [
        entry?.details.value,
        ...(entry?.bullets ?? []).map((f) => "- " + stripListMarker(f.value)),
      ]
        .filter(Boolean)
        .join("\n");
  const fullBefore = currentWording(draft, targetId) ?? originalText;
  const first = careerBlocks(fullBefore)[0];
  const before =
    purpose === "summary"
      ? first?.kind === "paragraph"
        ? first.text
        : (role?.context.value ?? "")
      : fullBefore;
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
      onDecision?.(false);
      return;
    }
    try {
      const proposal = validate(saved.proposal, targetId, saved.input.facts);
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
      onDecision?.(true);
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
    setFailure(null);
    try {
      const input = careerContext(source, targetId),
        proposal = await request(targetId);
      if (!active()) return;
      if (purpose === "summary"
        ? !equalValues(careerContext(current.current, targetId), input)
        : !equalValues(current.current, source)) throw new Error("STALE");
      validate(proposal, targetId, input.facts);
      const next = clone(purpose === "summary" ? current.current : source);
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
        {
          id: crypto.randomUUID(),
          input,
          proposal,
          status: "pending",
          ...(purpose ? { purpose } : {}),
        },
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
                  "Verifică aceeași cerere pentru a recupera rezultatul salvat. O verificare nu pornește o nouă generare.",
                  "Check the same request to recover its saved result. Checking does not start another generation.",
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
  const generateControl = (
    <Button
      disabled={busy || !targetId || !ready}
      variant={inlineSummary && !saved ? "ghost" : !saved ? "primary" : "secondary"}
      onClick={() => void generate()}
    >
      {busy
        ? t("Pregătim propunerea…", "Preparing proposal…")
        : failure?.uncertain
          ? t("Verifică cererea anterioară", "Check earlier request")
          : purpose === "summary"
            ? t(
                "Generează rezumatul rolului cu AI",
                "Generate role summary with AI",
              )
            : saved
              ? t("Generează o altă propunere", "Regenerate proposal")
              : t("Creează propunerea", "Create proposal")}
    </Button>
  );
  if (modal)
    return (
      <section
        className="role-proposal modal-proposal"
        aria-label={t("Propunere pentru rol", "Role proposal")}
      >
        <div className="experience-modal-scroll">
          <h3 tabIndex={-1} data-modal-stage-focus>
            {purpose === "summary"
              ? t(
                  "Verifică introducerea rolului",
                  "Review your role introduction",
                )
              : t("Verifică descrierea", "Review your description")}
          </h3>
          <p className="experience-modal-intro">
            {purpose === "summary"
              ? summaryHint
              : t(
                  "Verifică formularea și fă orice ajustări înainte de a o aplica în profil.",
                  "Review the wording and make any edits before applying it to your profile.",
                )}
          </p>
          {!saved && (
            <p role="status" className="experience-modal-status">
              {busy
                ? t(
                    "Pregătim descrierea din experiența și răspunsurile tale…",
                    "Preparing a description from your experience and answers…",
                  )
                : !ready
                  ? t(
                      "Salvăm detaliile înainte de generare…",
                      "Saving your details before generation…",
                    )
                  : t(
                      "Detaliile tale sunt pregătite. Creează o propunere pentru a o verifica.",
                      "Your details are ready. Create a proposal to review.",
                    )}
            </p>
          )}
          {saved && (
            <>
              {editingProposal ? (
                <label className="field">
                  {t("Editează formularea", "Edit wording")}
                  <AutoTextarea
                    autoFocus
                    className="native"
                    value={saved.proposal.text}
                    onChange={(e) => edit(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                        e.stopPropagation();
                    }}
                  />
                </label>
              ) : (
                <div
                  className="role-text rewrite-formatted-preview"
                  aria-label={t(
                    "Previzualizarea propunerii",
                    "Formatted proposal preview",
                  )}
                >
                  <RoleText text={saved.proposal.text} />
                </div>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setEditingProposal((v) => !v)}
              >
                {!editingProposal && <Pencil size={16} aria-hidden="true" />}
                {editingProposal
                  ? t("Vezi propunerea", "Preview wording")
                  : t("Editează formularea", "Edit wording")}
              </Button>
              {!valid && (
                <p role="status">
                  {t(
                    "Detaliile s-au schimbat. Creează o propunere nouă înainte de a o aplica.",
                    "Your details changed. Create a new proposal before applying it.",
                  )}
                </p>
              )}
              {saved.proposal.warnings.map((warning, i) => (
                <p className="small muted" key={i}>
                  {warning}
                </p>
              ))}
            </>
          )}
          <details className="experience-current-wording">
            <summary>{t("Vezi textul actual", "View current wording")}</summary>
            <div className="role-text">
              <RoleText text={before} />
            </div>
          </details>
          {(saved || onPurposeChange) && (
            <details className="experience-more-options">
              <summary>{t("Mai multe opțiuni", "More options")}</summary>
              <div className="actions">
                {saved && generateControl}
                {onPurposeChange && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      onPurposeChange(
                        purpose === "summary" ? undefined : "summary",
                      )
                    }
                  >
                    {purpose === "summary"
                      ? t("Rescrie întregul rol", "Rewrite the whole role")
                      : t(
                          "Doar introducerea scurtă",
                          "Short introduction only",
                        )}
                  </Button>
                )}
                {saved && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => decide(false)}
                  >
                    {t("Păstrează textul actual", "Keep current wording")}
                  </Button>
                )}
              </div>
            </details>
          )}
          {error && <p role="status">{error}</p>}
          {failure?.operationId && (
            <p className="small muted">
              {t("Referința cererii", "Request reference")}:{" "}
              {failure.operationId}
            </p>
          )}
          {busy && saved && (
            <p role="status">
              {t("Pregătim o propunere nouă…", "Preparing a new proposal…")}
            </p>
          )}
        </div>
        <footer className="experience-modal-footer">
          <Button variant="ghost" disabled={busy} onClick={backToDetails}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t("Înapoi la detalii", "Back to details")}
          </Button>
          <p>
            {t(
              "CV-ul se modifică doar când aplici această descriere.",
              "Your CV changes only when you apply this description.",
            )}
          </p>
          {saved ? (
            <Button
              variant="primary"
              disabled={busy || !valid || !accept || saveFailed}
              onClick={() => decide(true)}
            >
              {t("Folosește această descriere", "Use this description")}
            </Button>
          ) : (
            generateControl
          )}
        </footer>
      </section>
    );
  if (inlineSummary && !saved) return <div className="profile-role-summary">
    {generateControl}
    <p className="small muted">{summaryHint}</p>
    {busy && <p role="status">{t("Pregătim contextul rolului din detaliile confirmate…", "Preparing role context from your confirmed details…")}</p>}
    {!ready && <p className="small" role="status">{t("Descrierea poate fi generată după salvare.", "You can generate the description after saving.")}</p>}
    {error && <p role="status">{error}</p>}
  </div>;
  if (compact)
    return (
      <section
        className="role-proposal stack"
        aria-label={t("Propunere pentru rol", "Role proposal")}
      >
        <div>
          <h3>
            {purpose === "summary"
              ? t("Rezumatul rolului", "Role introduction")
              : t("Verifică formularea propusă", "Review the proposed wording")}
          </h3>
          <p className="small muted">
            {t(
              "Propunerea nu modifică CV-ul până când o accepți.",
              "The proposal changes your CV only after you accept it.",
            )}
            {purpose === "summary" ? " " + summaryHint : ""}
          </p>
        </div>
        {!saved && (
          <>
            {generateControl}
            {!ready && (
              <p role="status">
                {t(
                  "Salvăm detaliile înainte de generare…",
                  "Saving details before generation…",
                )}
              </p>
            )}
          </>
        )}
        {saved && (
          <>
            {editingProposal ? (
              <label className="field">
                {t("Editează formularea", "Edit wording")}
                <AutoTextarea
                  className="native"
                  value={saved.proposal.text}
                  onChange={(e) => edit(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                      e.stopPropagation();
                  }}
                />
              </label>
            ) : (
              <div
                className="role-text rewrite-formatted-preview"
                aria-label={t(
                  "Previzualizarea propunerii",
                  "Formatted proposal preview",
                )}
              >
                <RoleText text={saved.proposal.text} />
              </div>
            )}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setEditingProposal((v) => !v)}
            >
              {editingProposal
                ? t("Vezi propunerea", "Preview wording")
                : t("Editează formularea", "Edit wording")}
            </Button>
            {!valid && (
              <p role="status">
                {t(
                  "Context modificat; acceptarea este blocată. Cere o propunere nouă.",
                  "Context changed; acceptance blocked. Request a new proposal.",
                )}
              </p>
            )}
            {saved.proposal.warnings.map((w, i) => (
              <p className="small muted" key={i}>
                {w}
              </p>
            ))}
            <div className="actions">
              <Button
                variant="primary"
                disabled={busy || !valid || !accept}
                onClick={() => decide(true)}
              >
                {t("Acceptă modificările", "Accept changes")}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => decide(false)}
              >
                {t("Păstrează textul actual", "Keep current wording")}
              </Button>
            </div>
          </>
        )}
        <details>
          <summary>{t("Ajustează cu AI", "Adjust with AI")}</summary>
          <div className="actions">
            {saved && generateControl}
            {onPurposeChange && (
              <Button
                disabled={busy}
                onClick={() =>
                  onPurposeChange(purpose === "summary" ? undefined : "summary")
                }
              >
                {purpose === "summary"
                  ? t("Rescrie întregul rol", "Rewrite the whole role")
                  : t("Doar introducerea scurtă", "Short introduction only")}
              </Button>
            )}
          </div>
        </details>
        <details>
          <summary>
            {t("Textul actual și dovezile", "Current wording and evidence")}
          </summary>
          <div className="role-text">
            <RoleText text={before} />
          </div>
          {saved?.input.facts
            .filter((f) => saved.proposal.factIds.includes(f.id))
            .map((f) => (
              <p key={f.id} className="small muted">
                {f.text}
              </p>
            ))}
        </details>
        {error && <p role="status">{error}</p>}
        {failure?.operationId && (
          <p className="small muted">
            {t("Referința cererii", "Request reference")}: {failure.operationId}
          </p>
        )}
      </section>
    );
  return (
    <section className="card">
      <h3>
        {purpose === "summary"
          ? t("Rezumatul rolului", "Role summary")
          : t("Rescrie întreaga experiență", "Rewrite the whole experience")}
      </h3>
      <p className="small muted">
        {purpose === "summary"
          ? summaryHint +
            " " +
            t(
              "Contribuțiile se păstrează; verifici și accepți propunerea.",
              "Contributions stay; you review and accept the proposal.",
            )
          : t(
              "Folosim contextul actual și răspunsurile confirmate. AI poate propune paragrafe sau liste când ajută la claritate. Întrebările, răspunsurile și faptele originale rămân păstrate.",
              "Uses current context and confirmed answers. AI can propose paragraphs or lists when they improve clarity. Original questions, answers and facts remain saved.",
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
          : failure?.uncertain
            ? t("Verifică cererea anterioară", "Check earlier request")
            : autoRequest || failure
              ? t("Reîncearcă rescrierea", "Retry rewrite")
              : purpose === "summary"
                ? t(
                    "Generează rezumatul rolului cu AI",
                    "Generate role summary with AI",
                  )
                : t(
                    "Propune rescrierea experienței",
                    "Propose experience rewrite",
                  )}
      </Button>
      {saved && (
        <div className="stack">
          <p>
            <strong>{t("Înainte", "Before")}</strong>
          </p>
          <div className="role-text">
            <RoleText text={before} />
          </div>
          <label className="field rewrite-proposal-field">
            {t(
              "Propunere — verifică înainte de acceptare",
              "Proposal — review before acceptance",
            )}
            <AutoTextarea
              className="native rewrite-proposal-input"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter")
                  e.stopPropagation();
              }}
              rows={6}
              value={saved.proposal.text}
              onChange={(e) => edit(e.target.value)}
            />
          </label>
          <div
            className="role-text rewrite-formatted-preview"
            aria-label={t(
              "Previzualizarea propunerii",
              "Formatted proposal preview",
            )}
          >
            <RoleText text={saved.proposal.text} />
          </div>
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
              {purpose === "summary"
                ? t("Acceptă rezumatul rolului", "Accept role summary")
                : t("Acceptă rescrierea", "Accept rewrite")}
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
