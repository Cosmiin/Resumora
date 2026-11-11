# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Job seekers at any career stage, from one to three roles and a thin CV to several roles across countries (owner's answer, 2026-11-11: both equally, copy stays neutral about seniority). They apply to local and international jobs, mostly from Romania. They arrive with an existing CV in PDF or Word and a specific job ad in front of them. This round's audience is the owner plus a few invited testers.

## Product Purpose

Resumora turns the CV a person already has into one strong base CV, then tailors it truthfully to each job they apply for. Success: the person exports a CV that fits the job, recognises every line as true, and did not have to write from a blank page.

## Positioning

The CV is improved by asking the person short questions per role and reusing their answers, not by inventing content. Facts that are not written but clearly follow from the CV may be inferred; every inferred fact is marked and confirmed by the person.

## Operating Context

- Upload a CV (PDF or Word), then enrich it role by role: the app asks questions and proposes better bullets and a role description.
- A Chrome extension captures a job ad from a job site and extracts the keywords an applicant tracking system will look for, plus must-have requirements.
- Tailoring runs role by role against one job: questions, then per-bullet old vs new with Keep / Use new / Edit.
- The app detects the CV language and the job ad language, shows a mismatch, and asks which language to tailor in.
- Export to PDF and Word, fitted to two pages, in one of three templates: Classic, Modern, Compact.

## Capabilities and Constraints

- One base CV per user, with history. Tailored CVs keep a snapshot of the base.
- Interface languages: English and Romanian. CV output languages: English, Romanian, German, French, Spanish.
- Questions and buttons appear in the interface language; CV text is written in the tailoring language (confirmed 2026-11-11).
- Answers belong to their role and its period ("true during this role"), never to the present-day profile.
- A role's questions use only that role's facts and answers, plus the job ad.
- No payments, marketing polish or legal pages in this round.
- Account area: profile and password, preferences, data controls (export all data, delete account), extension connection.
- Architecture decisions in `docs/decisions/0001`–`0013` are binding.

## Brand Commitments

- Name: Resumora.
- Owner's binding direction (2026-11-10): warm and friendly; rounded shapes, soft colors, encouraging copy, light illustration; it should feel like a coach, not a tool.
- Voice: a thoughtful human coach. Short, plain, one thing per question.

## Evidence on Hand

- Fictional test CVs and job ads in the private workspace (`test-cvs/`): Andrei Munteanu (English), Ioana Dumitrescu (Romanian), two job ads. Use these as demonstration content.
- No testimonials, customer names, usage numbers or pricing exist. Do not fabricate any.

## Product Principles

1. Truth first: nothing goes on the CV that the person has not written, answered or confirmed.
2. One role at a time: each step is small, scoped to one role, and finishable.
3. The person decides: every rewrite is offered, never applied silently.
4. Say why: every score change and suggestion carries a one-line reason.
5. No dead ends: each step leads to the next, with a way to skip.

## Accessibility & Inclusion

WCAG 2.1 AA: contrast, full keyboard use, visible focus, touch targets. Voice input is offered wherever free text is asked.
