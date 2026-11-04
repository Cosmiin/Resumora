# Automatic CV content language

The base CV determines generated content language. Interface navigation, buttons and operational errors keep the user's Romanian/English preference. Content locale supports validated language tags beyond those two interface languages.

Initial import detects the dominant narrative language and saves its confidence. English technology names and common business terms do not override the surrounding narrative. Manual profiles begin in the interface language; meaningful saved prose triggers bounded detection. Names, contact details, skill lists and foreign answers alone do not establish or replace that decision.

Only low/medium confidence exposes **Correct language**. A correction preserves accepted wording and original answers. High confidence has no routine base language selector. Explicit **Translate CV into** remains a separate action, and that version's locale governs subsequent generation.

Questions, examples, hints, skills, assessments, feedback, summaries, rewrites, matching explanations and tailoring use the owned document locale. A vacancy or answer in another language cannot change it. Source quotations and typed/recorded answers remain exact evidence; newly generated enrichment expresses their meaning in the CV language. Recorded speech permits automatic language detection instead of forcing the CV locale on the speaker.

Old questions, feedback and unaccepted proposals become incompatible when the locale/policy changes and refresh when needed. Historical receipts and accepted prose remain stored. Interrupted detection recovers its existing operation; terminal failures permit bounded explicit retry. An unresolved substantial narrative cannot start content generation. Insufficient or unavailable detection does not silently generate in another language.

Document headings and placeholders use persisted localized labels, with built-in Romanian/English labels. Dates use the full locale where supported; unavailable date formatting does not silently fall back to English. Preview/export respects right-to-left script direction. Missing labels make export unavailable until resolved. Arbitrary-language support remains subject to provider fluency, OCR/transcription capability and available font glyphs.

There is exactly one base CV. **Update from a CV** is removed. Another upload requires deleting the existing base; database admission also enforces this under concurrency. Initial import review/recovery remains possible. Deletion clears base data, answers and base language versions while preserving saved jobs and tailored job CVs. Retained job documents keep their own language after base deletion or replacement.

The implementation requires the additive `p8_multilingual_content_single_base` migration. It widens document locale handling, fences initial import identity against deletion generation, and preserves accepted historical import updates. Tests use disposable PostgreSQL clusters and mocked providers; they do not establish every language's live provider quality.
