import { useEffect, useRef, useState } from "react";
import type { AuthTransport } from "../auth/AuthShell";
import { equalValues, type BaseDraft } from "../base/model";
import { acceptWording, currentWording, type Wording } from "../base/wording";
import { Button, useCopy } from "./ui";
export function AiSuggestions({
  draft,
  targetId,
  snapshot,
  ready,
  transport,
  change,
}: {
  draft: BaseDraft;
  targetId: string;
  snapshot: { id: string; revision: number } | null;
  ready: boolean;
  transport: AuthTransport;
  change: (d: BaseDraft) => void;
}) {
  const t = useCopy();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<{
    wording: Wording;
    draft: BaseDraft;
  } | null>(null);
  const controller = useRef<AbortController | null>(null),
    serial = useRef(0);
  useEffect(() => {
    serial.current++;
    controller.current?.abort();
    setBusy(false);
    setProposal(null);
    setMessage("");
    return () => {
      serial.current++;
      controller.current?.abort();
    };
  }, [targetId, snapshot?.id]);
  async function propose() {
    if (!ready || !snapshot || busy) return;
    const seq = ++serial.current;
    controller.current = new AbortController();
    setBusy(true);
    setProposal(null);
    setMessage("");
    const original = structuredClone(draft);
    try {
      const r = await transport("/v1/enhancement", {
        method: "POST",
        signal: controller.current.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          snapshotId: snapshot.id,
          snapshotRevision: snapshot.revision,
          targetId,
        }),
      });
      const data = await r.json();
      if (seq !== serial.current) return;
      if (!r.ok) {
        setMessage(
          data.error?.code === "enhancementDisabled"
            ? t(
                "Sugestiile AI sunt dezactivate. Poți continua manual.",
                "AI suggestions are switched off. You can continue manually.",
              )
            : t(
                "Nu am putut genera o sugestie. Răspunsurile salvate sunt păstrate.",
                "Could not generate a suggestion. Saved answers are retained.",
              ),
        );
      } else if (
        data.proposal?.status === "proposal" &&
        data.proposal.targetId === targetId &&
        typeof data.proposal.text === "string" &&
        Array.isArray(data.proposal.sources)
      ) {
        const wording = {
          text: data.proposal.text,
          sources: data.proposal.sources,
        };
        acceptWording(original, targetId, wording); // Reject mismatched sources before showing acceptance.
        setProposal({ wording, draft: original });
      } else
        setMessage(
          t(
            "Nu există o sugestie validată. Continuă manual.",
            "No validated suggestion. Continue manually.",
          ),
        );
    } catch {
      if (seq === serial.current)
        setMessage(
          t(
            "Cererea s-a oprit; rezultatul poate fi necunoscut. Răspunsurile sunt păstrate.",
            "The request stopped; its outcome may be unknown. Answers are retained.",
          ),
        );
    } finally {
      if (seq === serial.current) setBusy(false);
    }
  }
  const valid = proposal && equalValues(proposal.draft, draft);
  return (
    <section className="stack" aria-label={t("Sugestie AI", "AI suggestion")}>
      <p className="small muted">
        {t(
          "Combină până la trei fapte confirmate, cu ajustări limitate de punctuație. Verifică sensul înainte să accepți. Nu adaugă fapte sau răspunsuri.",
          "Combines up to three confirmed facts with limited sentence cleanup. Check the meaning before accepting. Does not add facts or answers.",
        )}
      </p>
      <div className="actions">
        <Button
          disabled={!ready || !targetId || busy}
          onClick={() => void propose()}
        >
          {busy
            ? t("Se pregătește…", "Preparing…")
            : t("Propune formulare", "Suggest wording")}
        </Button>
        {busy && (
          <Button
            onClick={() => {
              serial.current++;
              controller.current?.abort();
              setBusy(false);
              setMessage(
                t(
                  "Cerere oprită; costul poate rămâne necunoscut.",
                  "Request stopped; cost may remain unknown.",
                ),
              );
            }}
          >
            {t("Oprește", "Stop")}
          </Button>
        )}
      </div>
      {!ready && (
        <p className="small">
          {t(
            "Așteaptă salvarea ciornei înainte de a cere o sugestie.",
            "Wait for the draft to save before requesting a suggestion.",
          )}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {proposal && (
        <div className="saved-answer">
          <p style={{ whiteSpace: "pre-wrap" }}>{proposal.wording.text}</p>
          <details>
            <summary>{t("Surse originale", "Original sources")}</summary>
            {proposal.wording.sources.map((s) => (
              <p key={s.id}>{s.text}</p>
            ))}
          </details>
          {!valid && (
            <p role="status">
              {t(
                "Ciorna s-a schimbat. Cere o sugestie nouă.",
                "The draft changed. Request a new suggestion.",
              )}
            </p>
          )}
          <Button
            disabled={!valid}
            onClick={() => {
              if (valid) {
                change(acceptWording(draft, targetId, proposal.wording));
                setProposal(null);
              }
            }}
          >
            {t("Acceptă formularea", "Accept wording")}
          </Button>
          <Button onClick={() => setProposal(null)}>
            {t("Renunță", "Dismiss")}
          </Button>
        </div>
      )}
      {draft.presentation.approvedWording?.[targetId] && (
        <>
          <p>
            {currentWording(draft, targetId)
              ? t(
                  "Formulare acceptată în previzualizare.",
                  "Accepted wording in preview.",
                )
              : t(
                  "Sursele sau vizibilitatea s-au schimbat; previzualizarea folosește faptele vizibile actuale.",
                  "Sources or visibility changed; preview uses current visible facts.",
                )}
          </p>
          <Button
            onClick={() => {
              const next = structuredClone(draft);
              delete next.presentation.approvedWording![targetId];
              change(next);
            }}
          >
            {t("Elimină formularea", "Remove wording")}
          </Button>
        </>
      )}
    </section>
  );
}
