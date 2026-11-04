// Builds the 12 evaluation CVs: for each case an answer key (expected.json) and the file.
// Run from the repo root: npm run eval:generate -w apps/api
// (the script bundles this file with esbuild into node_modules/.cache and runs it with node, from apps/api).
// Needs Chrome: set CHROME_PATH if it is not at the default Windows location.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { case01, case02, case03, case04 } from "./data-a.ts";
import { case05, case06, case07, case08, case09 } from "./data-b.ts";
import { case11, case12 } from "./data-c.ts";
import { renderHtml } from "./render.ts";
import { buildDocx } from "./templates/docx-tables.ts";
import { expectedFlags, type Case } from "./types.ts";

const ROOT = resolve(process.cwd(), "eval/import");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const work = mkdtempSync(join(tmpdir(), "resumora-eval-"));

const SCAN_CASE: Case = { ...case04, id: "10-scan" };
const CASES: Case[] = [case01, case02, case03, case04, case05, case06, case07, case08, case09, SCAN_CASE, case11, case12];

function chrome(args: string[]): void {
  const r = spawnSync(CHROME, ["--headless", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${join(work, "profile")}`, ...args], { stdio: "pipe" });
  if (r.error) throw r.error;
}

async function pageCount(pdf: Buffer): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}

function writeKey(k: Case, dir: string): void {
  const key = { content: k.content, headings: k.sections.map(({ heading, category }) => ({ heading, category })), flags: expectedFlags(k.content, k.sections) };
  writeFileSync(join(dir, "expected.json"), `${JSON.stringify(key, null, 2)}\n`);
}

async function printPdf(k: Case, dir: string): Promise<void> {
  const html = join(ROOT, "templates", `${k.id}.html`);
  writeFileSync(html, renderHtml(k));
  const out = join(dir, "cv.pdf");
  chrome(["--no-pdf-header-footer", `--print-to-pdf=${out}`, pathToFileURL(html).href]);
  if (!existsSync(out)) throw new Error(`Chrome made no PDF for ${k.id}`);
  const pages = await pageCount(readFileSync(out));
  const want = k.pages ?? (k.variant === "sidebar" ? 1 : undefined);
  if (want !== undefined && pages !== want) throw new Error(`${k.id}: ${pages} pages, expected ${want}`);
  console.log(`${k.id}: cv.pdf (${pages} page${pages === 1 ? "" : "s"})`);
}

/** The sidebar CV as a picture inside a PDF: no text layer, like a scan. */
async function scanPdf(k: Case, dir: string): Promise<void> {
  const html = join(work, "scan.html");
  writeFileSync(html, renderHtml(case04).replace("</style>", "body{zoom:1.5}</style>"));
  const png = join(work, "scan.png");
  chrome([`--screenshot=${png}`, "--window-size=1240,1754", pathToFileURL(html).href]);
  if (!existsSync(png)) throw new Error("Chrome made no screenshot");
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(readFileSync(png));
  doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  writeFileSync(join(dir, "cv.pdf"), await doc.save());
  console.log(`${k.id}: cv.pdf (image only)`);
}

try {
  for (const k of CASES) {
    const dir = join(ROOT, "cases", k.id);
    mkdirSync(dir, { recursive: true });
    writeKey(k, dir);
    if (k.variant === "docx") {
      writeFileSync(join(dir, "cv.docx"), await buildDocx(k));
      console.log(`${k.id}: cv.docx`);
    } else if (k.id === SCAN_CASE.id) await scanPdf(k, dir);
    else await printPdf(k, dir);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
