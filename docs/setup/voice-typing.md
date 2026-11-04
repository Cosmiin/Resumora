# Guided answer voice typing

The guided experience answer field uses recorded transcription after an explicit microphone click. It uses this path even when browser speech recognition is available. On stopping, audio is sent to the authenticated API and the transcript is added to the editable answer. The user confirms the answer before it becomes enrichment evidence.

Cancel, closing the dialog or changing the question releases microphone tracks and ignores late results. Errors preserve typed answers. Overflow remains editable for manual review.

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

Audio uses the existing [configured global processing policy](cv-import-enrichment.md#setup-and-activation-boundary)
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

Synthetic tests cover recorded-input selection, microphone lifecycle, late results, overflow, size/time bounds,
one-dispatch accounting, and the mounted Worker's authentication/Origin/CSRF boundary. No
paid provider request is required for these tests. These tests do not establish a live microphone/provider round trip.
