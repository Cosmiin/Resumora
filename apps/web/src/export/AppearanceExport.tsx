import { useEffect, useRef, useState } from "react";
import type { BaseDraft } from "../base/model";
import type { Snapshot } from "../base/adapter";
import type { AuthTransport } from "../auth/AuthShell";
import { DocumentPreview } from "../components/DocumentPreview";
import { TemplateChooser } from "../templates/TemplateChooser";
import { chooseTemplate } from "../templates/registry";
import { Button, useCopy } from "../components/ui";
import { validatePdf } from "./pdf";
export type ExportPin =
  | { kind: "base"; versionId: string; revision: number; variantId?: string }
  | {
      kind: "job";
      jobId: string;
      documentId: string;
      locale: string;
      fingerprint: string;
      versionId: string;
      revision: number;
    };
export function safePdfFilename(value: string) {
  const name = value
    .replace(/\.pdf$/i, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
  return `${name || "CV"}.pdf`;
}
async function pdfBytes(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("pdfValidationFailed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 10_000_000) {
        await reader.cancel();
        throw new Error("pdfValidationFailed");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
export function AppearanceExport({
  draft,
  snapshot,
  pin,
  ready,
  transport,
  change,
  asOf,
  ensurePin,
}: {
  ensurePin?: () => Promise<ExportPin>;
  draft: BaseDraft;
  snapshot: Snapshot | null;
  pin: ExportPin | null;
  ready: boolean;
  transport?: AuthTransport;
  change: (draft: BaseDraft) => void;
  asOf: { year: string; month: string };
}) {
  const t = useCopy();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [url, setUrl] = useState(""),
    [pages, setPages] = useState(0),
    [zoom, setZoom] = useState(100),
    [filename, setFilename] = useState(() =>
      safePdfFilename(
        `${draft.name.value}_${draft.titles[0].value}_${draft.language.toUpperCase()}`,
      ),
    );
  const preview = useRef<HTMLDivElement>(null),
    generation = useRef(0),
    abort = useRef<AbortController | null>(null);
  const key = JSON.stringify(pin);
  useEffect(() => {
    generation.current++;
    abort.current?.abort();
    setBusy(false);
    setError("");
    setUrl("");
    setPages(0);
  }, [key, ready]);
  useEffect(
    () => () => {
      abort.current?.abort();
      generation.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function prepare() {
    if (!ready || !pin || !transport || !preview.current) return;
    let selectedPin = pin;
    try {
      if (ensurePin) {
        selectedPin = await ensurePin();
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "validation");
      return;
    }
    const article =
      preview.current.querySelector<HTMLElement>("article.document");
    if (!article) return;
    const mine = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const result = await transport("/v1/exports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedPin),
        signal: controller.signal,
      });
      if (!result.ok) {
        const body = await result.json().catch(() => null);
        throw new Error(body?.error?.code ?? "pdfValidationFailed");
      }
      if (
        result.headers.get("Content-Type")?.split(";")[0] !==
          "application/pdf" ||
        result.headers.get("X-Document-Version") !== selectedPin.versionId ||
        result.headers.get("X-Document-Revision") !==
          String(selectedPin.revision)
      )
        throw new Error("pdfValidationFailed");
      const bytes = await pdfBytes(result);
      const report = await validatePdf(bytes, {
        text: article.textContent ?? "",
        links: [...article.querySelectorAll<HTMLAnchorElement>("a[href]")].map(
          (a) => a.href,
        ),
        paper: "A4",
      });
      if (mine !== generation.current || controller.signal.aborted) return;
      setPages(report.pages);
      setUrl(
        URL.createObjectURL(
          new Blob([bytes.slice().buffer], { type: "application/pdf" }),
        ),
      );
    } catch (error) {
      if (mine === generation.current && !controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "pdfValidationFailed",
        );
    } finally {
      if (mine === generation.current) setBusy(false);
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {t("Aspect și export", "Appearance & Export")}
      </Button>
      {open && (
        <section
          className="export-panel"
          aria-label={t("Aspect și export", "Appearance & Export")}
        >
          <div className="actions">
            <h2>{t("Aspect și export", "Appearance & Export")}</h2>
            <Button
              onClick={() => {
                setOpen(false);
                abort.current?.abort();
                generation.current++;
                setBusy(false);
              }}
            >
              {t("Închide", "Close")}
            </Button>
          </div>
          <TemplateChooser
            value={draft.presentation.templateVersionId}
            onChange={(id) => change(chooseTemplate(draft, id))}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={!!draft.presentation.photo?.visible}
              disabled={!draft.presentation.photo}
              onChange={(e) => {
                if (draft.presentation.photo)
                  change({
                    ...draft,
                    presentation: {
                      ...draft.presentation,
                      photo: {
                        ...draft.presentation.photo,
                        visible: e.target.checked,
                      },
                    },
                  });
              }}
            />
            {t("Include fotografia", "Include photo")}
          </label>
          <p>
            {t(
              "A4 · Șablonul și fotografia se salvează pentru acest CV. Fără solicitări AI.",
              "A4 · Template and photo settings are saved for this CV. No AI requests.",
            )}
          </p>
          <label className="field">
            {t("Zoom", "Zoom")}{" "}
            <select
              className="native"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[75, 100, 125, 150].map((z) => (
                <option key={z} value={z}>
                  {z}%
                </option>
              ))}
            </select>
          </label>
          <div
            ref={preview}
            className="export-document"
            style={{ zoom: `${zoom}%` }}
          >
            <DocumentPreview draft={draft} asOf={asOf} />
          </div>
          {(!ready || snapshot?.reason === "autosave") && (
            <p role="status">
              {t(
                "Apasă Salvează acum înainte de a pregăti PDF-ul.",
                "Choose Save now before preparing the PDF.",
              )}
            </p>
          )}
          {error && (
            <p role="alert">
              {error === "pdfExportUnavailable"
                ? t(
                    "Exportul PDF nu este încă disponibil. CV-ul salvat se păstrează.",
                    "PDF export is not available yet. Your saved CV is retained.",
                  )
                : error === "photoUnavailable"
                  ? t(
                      "Fotografia nu este disponibilă. Înlocuiește-o sau alege Fără fotografie.",
                      "Photo unavailable. Replace it or choose No Photo.",
                    )
                  : t(
                      "PDF-ul nu a trecut verificarea. Verifică aspectul și încearcă din nou; CV-ul salvat se păstrează.",
                      "PDF validation failed. Check the layout and try again; your saved CV is retained.",
                    )}
            </p>
          )}
          <Button
            disabled={
              !ready ||
              !transport ||
              !pin ||
              busy ||
              snapshot?.reason === "autosave"
            }
            onClick={() => void prepare()}
          >
            {busy
              ? t("Se verifică PDF-ul…", "Checking PDF…")
              : t("Pregătește PDF", "Prepare PDF")}
          </Button>
          {url && (
            <>
              <p role="status">
                {t("PDF verificat", "PDF validated")} · {pages}{" "}
                {t("pagini", "pages")}
              </p>
              <iframe
                title={t("Previzualizare PDF complet", "Complete PDF preview")}
                src={url}
                className="export-pdf"
              />
              <label className="field">
                {t("Numele fișierului", "Filename")}
                <input
                  className="native"
                  value={filename}
                  maxLength={180}
                  onChange={(e) => setFilename(e.target.value)}
                />
              </label>
              <a
                className="btn btn-primary"
                href={url}
                download={safePdfFilename(filename)}
              >
                {t("Descarcă PDF", "Download PDF")}
              </a>
            </>
          )}
        </section>
      )}
    </>
  );
}
