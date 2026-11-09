---
id: 7
title: Every AI call goes through one function, with a fallback and a log
date: 2026-11-04
status: accepted
affects: [table:ai_calls, file:apps/api/src/ai/call-model.ts]
concepts: [shared-schemas]
---
## What we decided
All AI requests go through `callModel` in `apps/api/src/ai/call-model.ts`. It tries OpenRouter first and OpenAI if that fails, retries on timeouts and bad answers, checks the answer against a schema, and logs every call to `ai_calls`.

## Options we considered
- **Each feature calls the AI its own way.**
- **One gateway function (chosen).**

## Why this one
Retries, fallbacks, cost tracking and answer checks are needed everywhere. Writing them once means every new AI feature gets them for free, and `ai_calls` shows which task ran, which provider and model answered, how long it took and how many tokens it used. It never stores the prompt or CV text.

## What it means in practice
New AI features call `callModel(deps, { userId, task, schema, system, user, maxOutputTokens })` and never call a provider directly.
