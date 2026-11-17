# Phones: fluid sheet and question screens (2026-11-16)

Built with `claude-build` on branch `feat/mobile-fluid`. Approved by the owner on 2026-11-16 after a code review of the phone layout.

**Goal:** on a phone, the editor's bottom panel moves with the finger and slides between its two sizes; a new question never opens the keyboard by itself and its main button stays in reach; swipes stay inside the surface they started on.

## Global constraints (every task)

- Web only (`apps/web`). No API, shared or database change.
- Desktop behaviour is unchanged: every rule is behind the existing phone breakpoints or a touch check.
- New values come from `tokens.css` where a token exists. `prefers-reduced-motion` removes the new motion.
- No new dependency.

---

## Task 1: The bottom sheet follows the finger

Goal: the phone sheet (`BottomSheet`) tracks a drag 1:1, slides to its resting size on release, and can be pulled up from anywhere on it while it is short.

- The sheet is laid out at its full size (at most 80% of the visible screen) and pushed down with `transform` while short; the change between the two sizes is a `transform` transition (`--dur-base`, `--ease-out`).
- A drag starts on the grip in either state, and anywhere on the sheet while it is short. While dragging, the sheet's offset follows the pointer, clamped between full and short, with no transition.
- On release: more than 40 px up or a fast flick up → full; more than 40 px down or a fast flick down → short; otherwise it slides back. A drag never also counts as a tap (no toggle, and no click on a control under the finger).
- A tap on the grip still toggles; Esc still goes to short; focusing a page field still brings it to short.
- Keyboard focus that lands inside a short sheet opens it (its lower part is off screen).
- The grip's touch area is at least 44 px tall.

Acceptance tests (`bottom-sheet.test.tsx`; the three existing tests stay green unchanged):
- Dragging the grip with pointer moves sets an inline `transform` on the sheet during the drag and clears it on release.
- A drag of more than 40 px that starts on the panel's content while short opens the sheet; the same drag while full does not close it.
- A drag that ends on a button inside the short sheet does not click that button.
- A small drag (under 40 px, slow) on the grip leaves the state as it was.

```
files: apps/web/src/cv/panel/BottomSheet.tsx, apps/web/src/cv/panel/bottom-sheet.test.tsx, apps/web/src/styles/editor.css
new_files: none
deps: none
size: ~120 lines
```

## Task 2: Question screens: no keyboard by itself, the main button in reach

Goal: on a touch screen a new step puts focus on its title, not in the text box; on narrow screens the step's footer (`.fm-foot`) stays at the foot of the screen.

- New helper `focusStep(pane)` in `apps/web/src/cv/enrich/focus-step.ts`: on a touch screen (`(pointer: coarse)`) it focuses `#fm-step-title` (giving it `tabindex="-1"` when it has none), else the first enabled `.fm-btn`; elsewhere it keeps today's order (text box, then title or button). `RoleRun`, `FocusMode` (both effects) and `ProjectRun` call it; `ProjectRun` keeps title-first on every screen.
- Below 900 px `.fm-foot` is `position: sticky; bottom: 0` on the desk colour, with the safe-area inset under it.

Acceptance tests (`focus-step.test.ts`):
- Mouse screen (no `matchMedia`, or not coarse): a pane with a text box and a title → the text box has focus.
- Touch screen: the same pane → the title has focus and has `tabindex="-1"`; a pane with no title → the first enabled `.fm-btn`.
- The existing focus tests (`role-run`, `focus-mode`, `project-run`, `focus-session`) stay green unchanged.

```
files: apps/web/src/cv/enrich/RoleRun.tsx, apps/web/src/cv/enrich/FocusMode.tsx, apps/web/src/cv/enrich/ProjectRun.tsx, apps/web/src/styles/focus.css
new_files: apps/web/src/cv/enrich/focus-step.ts, apps/web/src/cv/enrich/focus-step.test.ts
deps: none
size: ~70 lines
```

## Task 3: Swipes stay inside, pages fit the visible screen

Goal: a swipe that reaches the end of a focus screen, the phone sheet or the history sheet does not move the page behind; full-height pages are as tall as the visible screen, not the screen plus the address bar.

- `overscroll-behavior: contain` on `.focus-mode`, `.sheet-body` and the history panel's list.
- Page minimum heights use `100svh` with the `100vh` line kept before it as a fallback: `.ui-page`, `.tailor-room`, `.cv-start-page`. Phone sheets and dialogs use `dvh` for their maximum height: `.ui-dialog`, the history sheet (and the room it leaves on the page).
- Desktop-only rules (`.panel`, `.side-panel`, `.cv-outline`) are untouched.

Acceptance: CSS only; no unit test can see it. Checked in a phone-sized browser at the end of the part.

```
files: apps/web/src/styles/focus.css, apps/web/src/styles/editor.css, apps/web/src/styles/ui.css, apps/web/src/styles/tailor.css, apps/web/src/styles/review.css
new_files: none
deps: none
size: ~20 lines
```
