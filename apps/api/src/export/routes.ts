import type { DraftSnapshot } from "@resumora/contracts/editor/transport";
import { decodeDraft } from "@resumora/contracts/editor/transport";
import { validateDraft } from "@resumora/contracts/editor/validation";
import type { CurrentJobDocument } from "@resumora/contracts/jobs/current-document";
import { isUuid } from "@resumora/contracts/jobs/connected";
import type { BaseDraft } from "@resumora/contracts/editor/model";
import type { PhotoGateway } from "../photos/routes.ts";
import { digestPhoto } from "../photos/routes.ts";
import { readBody } from "../cv/routes.ts";
import { renderAndValidatePdf } from "./browser.ts";
import type { Browser } from "@cloudflare/puppeteer";
export interface ExportGateway extends Pick<
  PhotoGateway,
  "readPhoto" | "getPhoto"
> {
  loadSnapshot(id: string): Promise<DraftSnapshot | null>;
  loadBaseLanguage?(variantId:string,snapshotId?:string):Promise<DraftSnapshot|null>;
  loadCurrentJobDocument(
    jobId: string,
    locale?: string,
  ): Promise<CurrentJobDocument | null>;
}
export type ExportConfig = {
  PDF_EXPORT_ENABLED?: string;
  PDF_BROWSER?: Fetcher;
};
const response = (code: string, status: number) =>
  Response.json(
    { error: { code } },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
export function exportFilename(draft: BaseDraft, employer = ""): string {
  const parts = [
    draft.name.value,
    draft.titles[0].value,
    employer,
    draft.language.toUpperCase(),
  ].filter(Boolean);
  const name = parts
    .join("_")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 160);
  return `${name || "CV"}.pdf`;
}
/** Shared authenticated/Origin/CSRF boundary mounts this route. Client supplies
 * only an owned accepted pin (a current-only CAS pin for jobs); no HTML, contact bytes, URLs, template overrides or
 * arbitrary browser navigation crosses the export request boundary.
 */
export async function exportRoute(
  request: Request,
  gateway: ExportGateway,
  config: ExportConfig,
  launch?: () => Promise<Browser>,
): Promise<Response> {
  if (request.method !== "POST") return response("method", 405);
  const input = await readBody(request);
  if (input instanceof Response) return input;
  if (
    !["base", "job"].includes(String(input.kind)) ||
    !isUuid(input.versionId) ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 1 ||
    Object.keys(input).some(
      (k) =>
        ![
          "kind",
          "versionId",
          "revision",
          ...(input.kind==="base"?["variantId"]:[]),
          ...(input.kind === "job"
            ? ["jobId", "documentId", "locale", "fingerprint"]
            : []),
        ].includes(k),
    )
  )
    return response("invalidRequest", 400);
  let draft: BaseDraft,
    employer = "";
  try {
    if (input.kind === "base") {
      const row = input.variantId ? typeof input.variantId==="string"&&/^lang_[a-f0-9]{64}$/.test(input.variantId) ? await gateway.loadBaseLanguage?.(input.variantId,input.versionId) : null : await gateway.loadSnapshot(input.versionId);
      if (!row || row.revision !== input.revision)
        return response("missing", 404);
      if (row.reason === "autosave")
        return response("acceptedVersionRequired", 409);
      draft = decodeDraft(row.payload);
      if (!input.variantId && validateDraft(draft).length)
        return response("acceptedVersionRequired", 409);
    } else {
      if (
        !isUuid(input.jobId) ||
        !isUuid(input.documentId) ||
        !["ro", "en"].includes(String(input.locale)) ||
        typeof input.fingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(input.fingerprint)
      )
        return response("invalidRequest", 400);
      const row = await gateway.loadCurrentJobDocument(
        input.jobId,
        String(input.locale),
      );
      if (
        !row ||
        row.id !== input.versionId ||
        row.documentId !== input.documentId ||
        row.revision !== input.revision ||
        row.locale !== input.locale ||
        row.fingerprint !== input.fingerprint
      )
        return response("missing", 404);
      draft = decodeDraft(row.payload);
    }
    // Never launch a hosted resource merely because a binding happens to exist.
    if (config.PDF_EXPORT_ENABLED !== "on" || (!config.PDF_BROWSER && !launch))
      return response("pdfExportUnavailable", 503);
    let photo: { dataUrl: string; width: number; height: number } | undefined;
    const settings = draft.presentation.photo;
    if (settings?.visible) {
      const asset = await gateway.readPhoto(settings.assetId);
      if (asset.state !== "ready") return response("photoUnavailable", 409);
      const bytes = await gateway.getPhoto(asset.objectKey);
      if (
        bytes.length !== asset.byteSize ||
        (await digestPhoto(bytes)) !== asset.sha256
      )
        return response("photoUnavailable", 409);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      photo = {
        dataUrl: `data:image/jpeg;base64,${btoa(binary)}`,
        width: asset.width,
        height: asset.height,
      };
    }
    const { renderPrintHtml, css } =
      await import("../../.generated/print-assets.mjs");
    const html = renderPrintHtml(draft, css, photo);
    const browser = await (launch
      ? launch()
      : import("@cloudflare/puppeteer").then(({ default: p }) =>
          p.launch(config.PDF_BROWSER!, { recording: false }),
        ));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void browser.close();
          reject(new Error("PDF_TIMEOUT"));
        }, 25000);
      });
      const { bytes, report } = await Promise.race([
        renderAndValidatePdf(browser, html),
        timeout,
      ]);
      // A deletion/revocation during rendering must not resurrect an old Base
      // or a deleted job through a late download response.
      if (input.kind === "base") {
        const current = input.variantId ? await gateway.loadBaseLanguage?.(String(input.variantId),input.versionId as string) : await gateway.loadSnapshot(input.versionId as string);
        if (!current || current.revision !== input.revision)
          return response("missing", 404);
      } else {
        const current = await gateway.loadCurrentJobDocument(
          input.jobId as string,
          String(input.locale),
        );
        if (
          !current ||
          current.id !== input.versionId ||
          current.revision !== input.revision ||
          current.documentId !== input.documentId ||
          current.fingerprint !== input.fingerprint
        )
          return response("missing", 404);
      }
      if (settings?.visible) {
        const current = await gateway.readPhoto(settings.assetId);
        if (current.state !== "ready") return response("photoUnavailable", 409);
      }
      return new Response(bytes.slice().buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${exportFilename(draft, employer)}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-PDF-Pages": String(report.pages),
          "X-Document-Version": input.versionId,
          "X-Document-Revision": String(input.revision),
        },
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      await browser.close();
    }
  } catch {
    return response("pdfValidationFailed", 422);
  }
}
