# Local browser test — findings (2026-11-06)

Tested on `main` at `ba8a190`, local Supabase, in Chrome at http://127.0.0.1:5173.
Flows covered: sign up / in / out, wrong password, password reset (via Mailpit), My CV editing of every
default section, autosave + reload, history + restore (both ways), two-tab conflict, PDF import (two-column),
Word import (tables), import mapping ("Move to…"), import cancel, role tips, Focus mode, `/jobs` paste + job page.
Server log: no errors. Browser console: only the error in H1.

## High

**H1. Typing loses characters in the CV editor.**
Real keystrokes in text areas, bullets and item fields sometimes throw `Maximum update depth exceeded`
and React drops that keystroke. Seen: "apps"→"pps", "payment"→"paymet", "completion"→"compltion",
"kk11"→"kk". Stack: `PageField.tsx` onChange → `SummaryEdit`/`BulletList`/`ItemField` → `Editor.tsx` →
`useAutosave.ts` setContent. Header single-line inputs were not affected.
- Synthetic input events (15–70 ms apart) did not trigger it; real keyboard events did. Whether a person
  typing by hand hits it is not yet confirmed.
- A read-only Codex trace of `apps/web/src/cv/**` found no confirmed cause (session `01a1add5…`).
  `useAutosave.setContent` itself sets state once per call, so the loop is elsewhere.

## Medium

**M1. "Needs attention" says "Nothing missing" when sections exist but are empty.**
After restoring an early version (all sections empty) and after an import that added an empty
Key achievements section, the panel said "Every key section is filled in."

**M2. Job deadline: AI returned `applyBy: "3011-11-30"` for "Apply by 30 November 2026".**
`packages/shared/src/jobs.ts:24` only checks it is a valid ISO date, so it was stored and shown.
The job page also shows the raw ISO string ("Apply by 3011-11-30") instead of a readable date.

**M3. Focus mode rewrite changed meaning.** "Set up Salesforce and HubSpot reporting shared by sales and
marketing." → "Implement Salesforce and HubSpot reporting to align data visibility between sales and
marketing teams." Present tense for a done thing, plus a goal the original never claimed.

## Low

- **L1.** After a password reset the page says "Password updated." followed by a small unstyled purple link
  "Resumora"; the heading still says "Choose a new password". A clear "Go to your CV" button would help.
- **L2.** Import "Move to…": moving "Driving licence" to Certifications leaves just "Category B", losing what it
  is. The "Sections" counter stayed at 6 after the move (should be 7).
- **L3.** After sign-up the CV flags **Email** as missing, though the account email is known.
- **L4.** The "Add section" dropdown defaults to "Custom section" rather than the first unused standard one.
- **L5 (unconfirmed).** Typing immediately after Enter in a bullet list put the text into the previous bullet.
  With a normal pause the cursor moves correctly, so this is probably a test-speed artifact.

## Fixed during the session (tooling, outside the git repo)

- `tools/dev-worktree.ps1`: crashed on start under Windows PowerShell 5.1, because `supabase status` writes
  "Stopped services: …" to stderr and `$ErrorActionPreference = 'Stop'` turned it into a fatal error.
- `.claude/launch.json`: opened `localhost:5173`, but the API only allows the `127.0.0.1:5173` origin, so every
  API call would fail CORS. Now opens `127.0.0.1`.

## What worked well

Sign-up, sign-in, wrong-password message, neutral reset message, reset email + new password; autosave with
reload (20/20 fields kept); history snapshots incl. "Before restore"; two-tab conflict banner with
Load latest / Keep my version; PDF and Word import with heading mapping (5–6 s via the queue); role scores
and Focus mode end to end; job extraction incl. must-have / nice-to-have highlighting in the ad text.
