# Progress: photo-and-export-menu (group E, manual testing 2026-11-10)

Part base: 564001c (origin/main). Claude weekly at start: 62%.

## Lanes

| lane | worktree | tasks | current task | last commit | last step |
|---|---|---|---|---|---|
| menu | resumora-e-menu (fix/e-photo-export-menu-menu) | 1 | 1 | 564001c | risk |
| photo | resumora-e-photo (fix/e-photo-export-menu) | 2-6 | 2 | 564001c | risk |

## Rulings

- Task 2 scope: added export/pdf.tsx, docx.ts, export-files.ts for the one-line `showsPhoto` → `photo` rename so the task compiles (Task 4 does the real export change).
- Task 2 risk: 3 of 3 kept (negated showsPhoto rename in export-files, photo-only header, editable name width vs floated photo); cv-page.css added to scope.
- Task 1 risk: the Review button closes the menu by design (ExportMenu.tsx:78, guided-review.test.tsx:109); brief corrected, 1 of 2 kept as a wording fix, the missing-file finding dropped.

## Task 1: Export menu closes on outside click and Escape — done
commit: df3b9b0 (lane menu) · codex: risk 1, build 1, review 1 · fix rounds: 1 core + 3 map-only (overhead) · guard denials: 0
risk: 1 of 2 kept · map: used 1, gaps 2 (fixed in round 1), misses 0
open: size estimate was low (tests); map rounds 3-4 were one-line citation fixes (line 35→34, symbol without closing paren), past the 2-round limit because they were mechanical map-only fixes.

## Task 2: Tailored CV shows the photo read-only, where its template puts it — done
commit: fd1ee98 · codex: risk 2 (1 rerun after my own files tripped the read-only check), build 1, review 1 · fix rounds: 0 core + 1 map-only (overhead) · guard denials: 0
risk: 3 of 3 kept · map: used 9, gaps 0, misses 0
open: none
- Task 3 risk: 2 of 7 kept (no replace control: adapt the replace-error test; X must work without a preview). 5 missing-file findings were map entries: dropped (map files are never in scope).

## Task 3: My CV photo picker: styled button, Save, small X, click to edit — done
commit: (see git log) · codex: risk 1, build 1, review 3 · fix rounds: 2 map-only + 1 escalation (map-only, all citations into the 3 changed files) · guard denials: 0
risk: 2 of 7 kept (5 were map files) · map: used 8, gaps 0, misses 0
open: reviews flag off-by-one map citations the -Test map gate tolerates (window ±5); worth a map.ps1 follow-up (workspace tools). pdf.test.tsx "stops at the classic minimum of 10pt" timed out once at 5s (flaky, unrelated).
- Task 4 risk: 1 of 10 kept (Word table vs Paragraph[]: use a floating image); 9 map-file findings dropped.

## Task 4: PDF and Word place the photo in the template slot — done
commit: (git log) · codex: risk 1 (+1 follow-up), build 1, review 1 · fix rounds: 1 map-only · guard denials: 0
risk: 1 of 10 kept · map: used 10, gaps 0, misses 0
open: none

## Task 5: exports use the photo crop, and WebP works — done
commit: (git log) · codex: risk 1, build 1, review 1 · fix rounds: 0 · guard denials: 0
risk: 0 of 0 (map-file findings only) · map: used 6, gaps 1 (INDEX names tools/map.ps1, which lives in the workspace repo: not a gap), misses 0
open: none
- Task 6 risk: 1 of 1 kept (shrink-photo.ts + test added to scope, size 80→110).
- From Task 6 on: interim map-gate rule from the map-tools session (owner OK there): `map.ps1 check -Fix` before a map fix round; after a docs/map-only round, check/stamp/stale/coverage instead of the full -Test.

## Task 6: Square or round photo, picked on My CV — done
commit: (git log) · codex: risk 1 (+1 rerun: brief too long for the command line, trimmed), build 1, review 1 · fix rounds: 0 · guard denials: 0
risk: 1 of 1 kept · map: used ~25, gaps 0, misses 0
open: none

## Part end
- Lane menu merged into the part branch (1734690); conflicting map entries export-menu/export-files kept the photo lane's text and were refreshed from the merged code by a map fix job; full -Test -WithDb PASS.
- Whole-branch review: pass. Bug hunt (Astra heavy): no findings. One whole-branch review used. No security test (no migrations, routes, auth or RLS touched).
- Map upkeep: check OK (249 entries), coverage OK, index regenerated (1c54fdb, reviewed).
- Extra: slow PDF fit test given a 15 s timeout (bc0b7a3): it timed out at 5 s in two full runs under load.
- Merged main (PR #55, group D) into the branch (5b146df): web-app/i18n conflict kept ours and re-stamped; full -Test -WithDb PASS; review pass.
- Cost: Claude weekly 62% → 65%. Codex 22.0M tokens, 150 min over 7 tagged task ids; overhead 21%; median fix rounds 0, map rounds 1, review fix rate 0%, slice misses 0. Claude context used ~31%. Guard denials today: 2 (log-wide, none from this run's steps that I saw).
- Open: map citations that are off by one pass the -Test gate (±5-line window) but fail Astra reviews; that cost Task 3 three extra rounds. Worth a map.ps1 exact-line check (workspace tools, group F's area).
