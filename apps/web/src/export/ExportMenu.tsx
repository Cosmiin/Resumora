import { useEffect, useRef, useState } from "react";
import type { JobExtraction, TailoredCv } from "@resumora/shared";
import type { TemplateId } from "../cv/page/templates.ts";
import { t } from "../i18n/t.ts";
import { exportFile, unreviewedItems, type ExportFormat, type ExportKind } from "./export-files.ts";

type Props = {
  /** The newest saved row (the editor autosaves), read when the menu opens. */
  load(): Promise<TailoredCv>;
  job: JobExtraction | null;
  template: TemplateId;
  /** Opens the menu on arrival (the done screen's Export link). */
  startOpen?: boolean;
};

const CHOICES: { kind: ExportKind; format: ExportFormat; label: "export.cvPdf" | "export.cvDocx" | "export.letterPdf" | "export.letterDocx" }[] = [
  { kind: "cv", format: "pdf", label: "export.cvPdf" },
  { kind: "cv", format: "docx", label: "export.cvDocx" },
  { kind: "letter", format: "pdf", label: "export.letterPdf" },
  { kind: "letter", format: "docx", label: "export.letterDocx" },
];

/** Export ▾: warns about inferred items still unreviewed (export is allowed anyway), then downloads the file. */
export function ExportMenu({ load, job, template, startOpen = false }: Props) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<TailoredCv | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "busy" | "loadError" | "error">("idle");

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setRow(null);
    setState("loading");
    try {
      setRow(await load());
      setState("idle");
    } catch {
      setState("loadError");
    }
  }

  async function run(kind: ExportKind, format: ExportFormat) {
    if (!row || state === "busy") return;
    setState("busy");
    try {
      await exportFile(kind, format, { cv: row, job, template });
      setState("idle");
    } catch {
      setState("error");
    }
  }

  const opened = useRef(false);
  useEffect(() => {
    if (!startOpen || opened.current) return;
    opened.current = true;
    void toggle();
  }, [startOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreviewed = row ? unreviewedItems(row.review) : [];
  return (
    <div className="tailored-menu">
      <button type="button" className="secondary" aria-expanded={open} onClick={() => void toggle()}>{t("tailored.export")}</button>
      {open && (
        <div className="tailored-menu-pop export-menu">
          {state === "loading" && <p role="status">{t("tailor.loading")}</p>}
          {state === "loadError" && <p role="alert" className="form-error">{t("export.loadError")}</p>}
          {row && (
            <>
              {unreviewed.length > 0 && (
                <div role="note" className="export-warning">
                  <p>{t("export.unreviewed", { count: unreviewed.length })}</p>
                  <ul>{unreviewed.map((text, index) => <li key={index}>{text}</li>)}</ul>
                </div>
              )}
              <div className="export-choices">
                {CHOICES.map((choice) => (
                  <button key={choice.label} type="button" className="btn" disabled={state === "busy" || (choice.kind === "letter" && !row.coverLetter)}
                    onClick={() => void run(choice.kind, choice.format)}>{t(choice.label)}</button>
                ))}
              </div>
              {state === "busy" && <p role="status">{t("export.working")}</p>}
              {state === "error" && <p role="alert" className="form-error">{t("export.error")}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
