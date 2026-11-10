---
id: api-core/diagnostic-scripts
area: api-core
files: ["apps/api/scripts/check-pdf-input.ts","apps/api/scripts/check-voice-session.ts"]
depends_on: ["api-core/call-model","api-core/voice-session"]
contract: false
checked_hash: f1d4cc48
cited: [3052c5, 230191, 16443a, a3f618, 0fdf69, 3e1d0a, 65bde6, 748589, f75ac3, 43d683, 5f3e2d, 258aa9, bba02e, 706d6d, 0f4882, f9e889, d1d08b, 076ab3, 6fff2f, 54acbf, 9c110d, 9d36c1, bd1688, f75ac3, 225971, ac4b09, 921660]
decisions: ["docs/decisions/0010-cv-files-go-to-the-model-as-files.md"]
open: []
---
Probe provider PDF and voice support from manual diagnostic scripts.

- Both scripts read key=value settings from argv[2] or a default vars path and strip surrounding quotes; PDF uses OPENROUTER_API_KEY/OPENROUTER_MODEL and OPENAI_API_KEY/OPENAI_MODEL, while voice uses OPENAI_API_KEY. `apps/api/scripts/check-pdf-input.ts:22` -> `readVars`, `apps/api/scripts/check-pdf-input.ts:25` -> `OPENROUTER_API_KEY`, `apps/api/scripts/check-pdf-input.ts:26` -> `OPENAI_API_KEY`, `apps/api/scripts/check-voice-session.ts:14` -> `OPENAI_API_KEY`
- PDF diagnostic generates an in-memory sample document and skips providers without both key and model. `apps/api/scripts/check-pdf-input.ts:15` -> `makePdfBase64`, `apps/api/scripts/check-pdf-input.ts:30` -> `!p.key`
- PDF request duplicates provider privacy settings and sends a file data URI directly to chat completions; it bypasses callModel retries/schema/logging. `apps/api/scripts/check-pdf-input.ts:37` -> `p.name`, `apps/api/scripts/check-pdf-input.ts:46` -> `file_data`, `apps/api/scripts/check-pdf-input.ts:51` -> `fetch`
- PDF output prints provider/model/status and model answer or provider error message. `apps/api/scripts/check-pdf-input.ts:60` -> `answer`
- Voice diagnostic tries both client_secrets and transcription_sessions with a fixed transcription model/language. `apps/api/scripts/check-voice-session.ts:17` -> `transcription`, `apps/api/scripts/check-voice-session.ts:21` -> `client_secrets`, `apps/api/scripts/check-voice-session.ts:29` -> `transcription_sessions`
- Voice output recursively replaces strings equal to the provider key or starting with known secret prefixes and explicitly prints only secret length. `apps/api/scripts/check-voice-session.ts:35` -> `redact`, `apps/api/scripts/check-voice-session.ts:69` -> `redacted`

## Connections
- PDF probe duplicates runtime request policy; changes must keep both aligned: `apps/api/scripts/check-pdf-input.ts:38` -> `max_completion_tokens` and `apps/api/scripts/check-pdf-input.ts:39` -> `data_collection` -> `apps/api/src/ai/call-model.ts:99` -> `max_completion_tokens` and `apps/api/src/ai/call-model.ts:104` -> `data_collection`.
- Voice probe's selected endpoint/body mirrors credential creation: `apps/api/scripts/check-voice-session.ts:22` -> `client_secrets` -> `apps/api/src/ai/voice-session.ts:34` -> `ENDPOINT`; `apps/api/scripts/check-voice-session.ts:25` -> `transcription` -> `apps/api/src/ai/voice-session.ts:68` -> `transcription`.

## Assumptions
- These scripts make live provider calls without an API request user or database quota reservation. `apps/api/scripts/check-pdf-input.ts:51` -> `fetch`, `apps/api/scripts/check-voice-session.ts:55` -> `fetch`
- PDF responses are printed without redaction; voice redaction only covers the exact configured key and recognized prefixes, not arbitrary sensitive content. `apps/api/scripts/check-pdf-input.ts:61` -> `console.log`, `apps/api/scripts/check-voice-session.ts:37` -> `startsWith`
