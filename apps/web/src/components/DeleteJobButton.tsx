import { useEffect, useRef, useState } from "react";
import type { AuthTransport } from "../auth/AuthShell";
import { Button, useCopy } from "./ui";

export function DeleteJobButton({
  jobId,
  title,
  transport,
  onDeleted,
  disabled = false,
}: {
  jobId: string;
  title: string;
  transport: AuthTransport;
  onDeleted: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useCopy(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<string | null>(null),
    locked = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    request.current = null;
    locked.current = false;
    setBusy(false);
    setError("");
    return () => {
      generation.current++;
    };
  }, [jobId, transport]);
  async function remove() {
    if (locked.current || disabled) return;
    if (
      !request.current &&
      !window.confirm(
        t(
          `Ștergi jobul „${title}”? Anunțul și toate CV-urile adaptate pentru acest job vor fi șterse definitiv. Profilul tău este păstrat.`,
          `Delete “${title}”? This permanently deletes the posting and all its tailored CVs. Your Profile is kept.`,
        ),
      )
    )
      return;
    request.current ??= crypto.randomUUID();
    locked.current = true;
    setBusy(true);
    setError("");
    const currentTransport = transport;
    const started = generation.current;
    try {
      const response = await currentTransport(
        `/v1/jobs/${jobId.toLowerCase()}/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: request.current }),
        },
      );
      const receipt = await response.json().catch(() => null);
      if (
        !response.ok ||
        receipt?.jobId !== jobId.toLowerCase() ||
        receipt?.deleted !== true
      )
        throw Error("unconfirmed");
      if (generation.current === started) onDeleted(jobId);
    } catch {
      if (generation.current === started)
        setError(
          t(
            "Nu am putut confirma ștergerea. Jobul rămâne afișat; reîncearcă aceeași ștergere.",
            "Deletion is unconfirmed. The job is still shown; retry the same deletion.",
          ),
        );
    } finally {
      if (generation.current === started) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="stack">
      <Button
        variant="danger"
        aria-label={`${t("Șterge jobul", "Delete job")}: ${title}`}
        disabled={disabled || busy}
        onClick={() => void remove()}
      >
        {busy ? t("Ștergem…", "Deleting…") : t("Șterge jobul", "Delete job")}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
