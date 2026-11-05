// Probes OpenAI's realtime transcription ephemeral-key endpoints. Never prints secrets.
// Usage: node check.mjs [path to .dev.vars]   (default: apps/api/.dev.vars from the repo root)
import { readFileSync } from "node:fs";

function readVars(path: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) vars[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
  return vars;
}

const key = readVars(process.argv[2] ?? "apps/api/.dev.vars").OPENAI_API_KEY;
if (!key) throw new Error("OPENAI_API_KEY missing");

const transcription = { model: "gpt-4o-mini-transcribe", language: "ro" };
const vad = { type: "server_vad" };
const attempts = [
  {
    name: "POST /v1/realtime/client_secrets",
    url: "https://api.openai.com/v1/realtime/client_secrets",
    body: {
      expires_after: { anchor: "created_at", seconds: 60 },
      session: { type: "transcription", audio: { input: { transcription, turn_detection: vad } } },
    },
  },
  {
    name: "POST /v1/realtime/transcription_sessions",
    url: "https://api.openai.com/v1/realtime/transcription_sessions",
    body: { input_audio_transcription: transcription, turn_detection: vad },
  },
];

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value === key || value.startsWith("ek_") || value.startsWith("sk-") ? `<redacted, ${value.length} chars>` : value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  }
  return value;
}

type ProbeResponse = {
  error?: unknown;
  value?: string;
  expires_at?: number;
  client_secret?: { value?: string; expires_at?: number };
  session?: Record<string, unknown>;
};

for (const a of attempts) {
  const res = await fetch(a.url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(a.body),
  });
  const json = (await res.json().catch(() => null)) as ProbeResponse | null;
  console.log(`\n${a.name}: HTTP ${res.status}`);
  console.log("top-level keys:", json ? Object.keys(json).join(", ") : "(none)");
  if (!res.ok) {
    console.log("error:", JSON.stringify(redact(json?.error ?? json)));
    continue;
  }
  const secret = json?.value ?? json?.client_secret?.value;
  const expires = json?.expires_at ?? json?.client_secret?.expires_at;
  console.log("secret:", typeof secret === "string" ? `<redacted, ${secret.length} chars>` : "(absent)");
  console.log("expires_at:", expires, typeof expires === "number" ? new Date(expires * 1000).toISOString() : "");
  console.log("session keys:", json?.session ? Object.keys(json.session).join(", ") : "(none)");
  console.log("session (redacted):", JSON.stringify(redact(json?.session ?? { ...json, client_secret: undefined })));
}
