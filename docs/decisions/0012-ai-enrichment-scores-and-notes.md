---
id: 12
title: AI enrichment scores and notes
date: 2026-11-05
status: accepted
affects: [table:cv_insights, file:packages/shared/src/enrich.ts, file:apps/api/src/enrich/routes.ts, file:packages/shared/src/notes.ts]
concepts: [cache, notes, realtime-voice]
---
## What we decided
Answers the user gives during enrichment are stored as notes inside the CV. Each role holds at most 10 notes. Each note records how it was given: picked from options, typed, or spoken. These notes are source data. History, restore and job tailoring will read them later.

Scores live in `cv_insights`, keyed by user and role. A score is valid only while a fingerprint of the role's text, the locale and the policy `score/1` all match. When any of them changes, the score is recomputed. Because scores are a cache, they never take part in autosave and cannot conflict with it.

The model grades the bullets. The app computes the numbers. Rewrites are checked for invented facts: the numbers check drops any proposal that contains a number not found in the person's own text or answers. Rewrites stream from the server as server-sent events, in the `### <id>` line format. They appear live as they arrive, but the user can accept one only after it passes the checks.

Voice input uses a short-lived key from OpenAI's `POST /v1/realtime/client_secrets`. The key lasts 60 seconds. Recording is capped at 60 seconds. Each user gets 20 voice sessions a day, counted from successful `enrich_voice` rows. Audio goes straight from the browser to OpenAI. Our own API key never reaches the browser, and we do not store audio.

When a CV is re-imported, a role keeps its notes if its company and title match exactly one new role. Otherwise the notes are not carried over.

## Options we considered
- **Everything inside the CV.** Simple to keep in sync, but scores would then trigger a save and could conflict with autosave.
- **Everything in separate tables.** Clean separation, but notes would not travel with the CV in History or tailoring.
- **Nothing stored.** No storage to manage, but answers would be lost and the user would have to answer again.
- **Voice through our Worker.** Our server would relay the audio, which adds cost and delay, and puts audio through our own systems.
- **Browser dictation.** Free and built in, but the quality and language support vary a lot between browsers.

## Why this one
Notes inside the CV keep the user's answers with the CV they describe. Scores in their own table can be thrown away and rebuilt at any time, so they never fight with autosave. Checking numbers in the app means a made-up figure is caught even when the model gets it wrong. A short-lived key lets voice go straight to OpenAI without our key or our audio touching the browser.

## What it means in practice
Notes are stored in `packages/shared/src/notes.ts`. Enrichment logic and scoring are in `packages/shared/src/enrich.ts`. The enrichment routes, including the streaming rewrites and the voice key request, are in `apps/api/src/enrich/routes.ts`. Scores are in the `cv_insights` table. The fingerprint covers each bullet's id as well as its text, because a result points at bullets by id: a bullet deleted and typed again is a new bullet. Changing the score policy or the fingerprint inputs makes every stored score stale; the editor scores a stale role again a moment (2 s) after the next save, not when scores are read. When the model's answer still doesn't match the expected shape after its retries, `callModel` reports the AI as unavailable, so the score route answers 503, not 502.
