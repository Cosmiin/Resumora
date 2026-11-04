# Guided answer voice typing

The guided experience answer field offers dictation beside the answer after an explicit
microphone click. When `SpeechRecognition` or `webkitSpeechRecognition` is available, live
dictation shows interim words and appends final segments once to the latest editable answer,
using the CV's content language. A timer and animated indicator show recording state.
Unfinished or overflowing speech remains in an editable transcript with Add/Discard actions;
later final segments arriving during shutdown are retained in order. Errors preserve typed
answers. Permission, recording and stop waits are bounded to 15 seconds, two minutes and
five seconds respectively; leaving the question aborts recognition and ignores late events.

The UI discloses that live dictation uses the browser's speech service, which may process
audio online. Browser support and service/network availability vary; see
[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
There is an explicit **Use recording instead** option. Unsupported browsers use that path
automatically. Live dictation and recorded transcription never run simultaneously.

The recorded fallback sends audio to the authenticated API only after stopping, then appends
the transcript to the current answer. Cancel, closing the dialog, or changing the question
releases microphone tracks and discards late results. Overflow remains editable for manual
review. The following endpoint, format, accounting and provider details apply to this fallback.

Recordings stop automatically at two minutes. Both browser and API reject uploads over
4 MiB. The API also bounds upload time to 15 seconds, provider time to 30 seconds, and the
provider response to 128 KiB. The server does not parse audio duration; its resource bound
is upload size and request duration. Browser formats are WebM, MP4, or Ogg, depending on
MediaRecorder support. Unsupported browsers retain manual text input.

`POST /v1/intelligence/transcriptions` uses the existing session/account, same-origin and
CSRF checks. It verifies the requested experience target in an owned saved snapshot before
reserving a durable operation. It requires `AI_PAID_INFERENCE=on`, `OPENAI_API_KEY`, a valid
`AI_WORKER_SECRET`, and the existing configured `AI_PROCESSING_POLICY`. Key presence never
turns on paid inference. No new secret, external configuration, or database migration is
introduced.

Audio uses the existing [configured global processing policy](cv-import-enrichment.md#owner-configuration-paid-mode-remains-off)
and the fixed `https://api.openai.com/v1/audio/transcriptions` endpoint. The policy value is
an opaque owner reference, as in the other configured live routes; it is not a geographic
allowlist or proof of EU-only processing. This route makes no EU processing or provider
retention claim.

The model is explicitly `whisper-1`, using multipart `file`, `model`, and
`response_format=json`. The [official transcription reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
documents this request. The [official guide](https://developers.openai.com/api/docs/guides/speech-to-text)
currently marks Whisper deprecated with shutdown on February 26, 2027; a later model
migration requires a deliberate review, not an automatic substitution.

Audio and raw transcripts are not persisted or logged by the API. The usual answer save
persists only text the user retains. The existing usage ledger records operation metadata,
an audio hash, and provider outcome, without audio or transcript content. Whisper text-token
usage and cost are unavailable in this token-based ledger and remain unknown, not zero.
Each operation permits one dispatch. Unknown outcomes are recorded and never automatically
resent; starting another recording is an explicit user action. A cancellation after dispatch
cannot guarantee the provider stopped processing or charging.

Synthetic tests cover interim/final recognition, microphone lifecycle, late results, overflow, size/time bounds,
one-dispatch accounting, and the mounted Worker's authentication/Origin/CSRF boundary. No
paid provider request is required for these tests. A real microphone/provider round trip
must be checked by the owner with the existing configured local server.
