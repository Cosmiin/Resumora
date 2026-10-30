// Optional synthetic local Chrome proof. No credentials, owner data or hosted calls.
// Start the dedicated approved local runtime via chrome-devtools-axi first.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core-browser.js";
import { exportRoute } from "../apps/api/src/export/routes.ts";
import { encodeDraft } from "@resumora/contracts/editor/transport";
import { digestPhoto } from "../apps/api/src/photos/routes.ts";
import { validateDraft } from "@resumora/contracts/editor/validation";
const root = fileURLToPath(new URL("../", import.meta.url));
const endpoint = new URL(
  process.env.RESUMORA_PDF_PROOF_BROWSER_URL ?? "http://127.0.0.1:19373",
);
if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1")
  throw new Error("Synthetic localhost browser only");
const out = process.env.RESUMORA_PDF_PROOF_OUTPUT;
if (!out)
  throw new Error(
    "Set RESUMORA_PDF_PROOF_OUTPUT to task evidence directory outside repository",
  );
await mkdir(out, { recursive: true });
const fixture = await build({
  absWorkingDir: root,
  entryPoints: ["scripts/fixtures/export-documents.ts"],
  write: false,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2023",
});
await writeFile(`${out}/fixture.mjs`, fixture.outputFiles[0].text);
const { exportFixture, cvTemplates } = await import(
  pathToFileURL(`${out}/fixture.mjs`).href
);
const { webSocketDebuggerUrl } = await (
  await fetch(new URL("/json/version", endpoint))
).json();
const browser = await puppeteer.connect({
  browserWSEndpoint: webSocketDebuggerUrl,
});
const photoBytes = await readFile(
  new URL("../apps/web/src/photo/fixtures/chrome-canvas.jpg", import.meta.url),
);
const reports = [];
const id = "11111111-1111-4111-8111-111111111111";
const photoHash = await digestPhoto(photoBytes);
const request = () =>
  new Request("http://127.0.0.1/v1/exports/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "base", versionId: id, revision: 1 }),
  });
try {
  for (let template = 0; template < cvTemplates.length; template++)
    for (const language of ["ro", "en"])
      for (const long of [false, true])
        for (const photo of [false, true]) {
          const label = `${cvTemplates[template].name}-${language}-${long ? "long" : "short"}-${photo ? "photo" : "none"}`;
          const draft = exportFixture(template, language, long, photo);
          if (validateDraft(draft).length)
            throw new Error("Synthetic accepted CV fixture is invalid");
          const row = {
            id,
            revision: 1,
            parentId: null,
            createdAt: "2026-10-30T00:00:00Z",
            reason: "save",
            payload: encodeDraft(draft),
          };
          let reads = 0;
          const gateway = {
            loadSnapshot: async () => {
              reads++;
              return row;
            },
            loadJobEditor: async () => null,
            readPhoto: async () => ({
              id,
              objectKey: "synthetic-local-photo",
              sha256: photoHash,
              width: 800,
              height: 1000,
              byteSize: photoBytes.length,
              state: "ready",
            }),
            getPhoto: async () => photoBytes,
          };
          const response = await exportRoute(
            request(),
            gateway,
            { PDF_EXPORT_ENABLED: "on" },
            () => browser.createBrowserContext(),
          );
          if (response.status !== 200)
            throw new Error(
              `${label}: ${response.status} ${await response.text()}`,
            );
          if (
            response.headers.get("X-Document-Version") !== id ||
            response.headers.get("X-Document-Revision") !== "1" ||
            reads !== 2
          )
            throw new Error("source pin/final existence fence failed");
          const bytes = new Uint8Array(await response.arrayBuffer());
          await writeFile(`${out}/${label}.pdf`, bytes);
          const report = {
            label,
            pages: Number(response.headers.get("X-PDF-Pages")),
            bytes: bytes.length,
            baseValidationIssues: [],
          };
          reports.push(report);
          console.log(JSON.stringify(report));
        }
  const deletedDraft = exportFixture(0, "ro", false, false);
  let reads = 0;
  const deleted = await exportRoute(
    request(),
    {
      loadSnapshot: async () =>
        ++reads === 1
          ? {
              id,
              revision: 1,
              reason: "save",
              parentId: null,
              createdAt: "now",
              payload: encodeDraft(deletedDraft),
            }
          : null,
      loadJobEditor: async () => null,
      readPhoto: async () => {
        throw new Error("unused");
      },
      getPhoto: async () => {
        throw new Error("unused");
      },
    },
    { PDF_EXPORT_ENABLED: "on" },
    () => browser.createBrowserContext(),
  );
  if (
    deleted.status !== 404 ||
    deleted.headers.get("Content-Type") === "application/pdf"
  )
    throw new Error("late deleted Base export was served");
  console.log("deleted Base during real rendering returns404, no PDF");
  await writeFile(
    `${out}/receipt.json`,
    JSON.stringify(
      {
        browser: endpoint.origin,
        checks:
          "actual production shared SSR/render/PDF.js/native byte path; exact text/order/links/Unicode/page/bounds/font/resource/overflow; no AI",
        reports,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.disconnect();
}
// react-dom/server.browser retains a Node MessagePort after completed SSR. All
// writes and browser-context cleanup above are awaited; this optional CLI owns its process.
process.exit(0);
