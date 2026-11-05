// Checks that each AI provider accepts a PDF as a file part, with the same privacy routing as call-model.ts.
// Usage: node check.mjs [path to .dev.vars]   (default: apps/api/.dev.vars from the repo root)
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

function readVars(path: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) vars[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  return vars;
}

async function makePdfBase64(): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText("Ana Pop, Product Designer, ana@example.com", { x: 50, y: 700, size: 14, font });
  return doc.saveAsBase64();
}

const vars = readVars(process.argv[2] ?? "apps/api/.dev.vars");
const pdf = await makePdfBase64();
const providers = [
  { name: "openrouter", url: "https://openrouter.ai/api/v1", key: vars.OPENROUTER_API_KEY, model: vars.OPENROUTER_MODEL },
  { name: "openai", url: "https://api.openai.com/v1", key: vars.OPENAI_API_KEY, model: vars.OPENAI_MODEL },
];

for (const p of providers) {
  if (!p.key || !p.model) {
    console.log(`${p.name}: skipped (not configured)`);
    continue;
  }
  const body = {
    model: p.model,
    temperature: 0,
    ...(p.name === "openai"
      ? { max_completion_tokens: 200, store: false }
      : { max_tokens: 200, provider: { data_collection: "deny", zdr: true, require_parameters: true } }),
    messages: [
      { role: "system", content: "Answer briefly." },
      {
        role: "user",
        content: [
          { type: "text", text: "Return the email in this PDF." },
          { type: "file", file: { filename: "cv.pdf", file_data: `data:application/pdf;base64,${pdf}` } },
        ],
      },
    ],
  };
  const res = await fetch(`${p.url}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | null } }[];
    error?: { message?: string };
  } | null;
  const answer = res.ok ? json?.choices?.[0]?.message?.content : `error: ${json?.error?.message ?? "(no message)"}`;
  console.log(`${p.name} (${p.model}): HTTP ${res.status} -> ${answer}`);
}
