# Resumora design system: Coach's Page

Chosen by the owner on 2026-11-11 (variant B of three). The reference mockup lives in the private workspace (`mockups/phase1/variant-b-coach.html`).
Tokens are defined once, in `apps/web/src/styles/tokens.css`. Components live in `apps/web/src/ui/`. No component may hard-code a color, size, radius, shadow or duration.

## 1. The idea

A sunny desk with white sheets of paper on it. Your CV is always a sheet. The coach speaks in blue ink. A yellow highlighter marks what changed. A red pencil strikes what was replaced.

Four things carry the look, and only these:

| Thing | Where it appears | Never |
|---|---|---|
| **Desk** (yellow ground) | Page background | Behind long text |
| **Sheet** (white paper, soft shadow, small radius) | The CV, lists of decisions, dialogs | Nested inside another sheet |
| **Blue ink** (handwriting face) | The coach's voice: questions, reasons, short encouragement | Buttons, labels, CV text, anything longer than two lines |
| **Highlighter and red pencil** | Changed text, selected answers; struck-out replaced text | Decoration |

## 2. Principles

1. **A coach, not a tool.** One question at a time reads like a person asking. Controls stay standard: buttons, radio options, inputs.
2. **The CV is the hero.** The sheet is visible while you answer, and it changes as you answer.
3. **Nothing changes silently.** Every change is highlighted, every replaced line stays visible and struck out until you move on.
4. **Say why.** Every suggestion carries one line of reason, in the coach's ink.
5. **Calm screens.** One primary button per screen. Yellow owns the ground; everything else is black, white and a little blue.

## 3. Color

| Token | Value | Use |
|---|---|---|
| `--color-desk` | `#FFF0A8` | Page ground |
| `--color-desk-soft` | `#FFF7CC` | Hover on white controls |
| `--color-paper` | `#FFFFFF` | Sheets, controls, dialogs |
| `--color-paper-veil` | `rgb(255 255 255 / 0.55)` | Unanswered question blocks on the desk |
| `--color-ink` | `#24272E` | Text, borders of controls, primary button |
| `--color-ink-hover` | `#3A3F4A` | Primary button hover |
| `--color-muted` | `#535966` | Secondary text (6.1:1 on desk, 7.0:1 on paper) |
| `--color-line` | `#E4E0CF` | Hairlines inside sheets |
| `--color-coach` | `#2446B0` | Coach's ink, links, focus ring, progress fill |
| `--color-coach-soft` | `#E6ECFB` | Hover behind quiet buttons |
| `--color-highlight` | `#FFE14D` | Highlighter: changed text, selected option |
| `--color-strike` | `#C7323A` | Red pencil: strike-through, recording, destructive |
| `--color-good` | `#1F7A4D` | Saved / done text, keyword bar |
| `--color-good-soft` | `#DDF2E6` | Success backgrounds |
| `--color-warn-soft` | `#FFE9C7` | Warning backgrounds (text stays ink) |
| `--color-bad-soft` | `#FBE3E4` | Error backgrounds (text `--color-strike` darkened to `#A3262D`) |

Rules: text is ink or muted, never gray on yellow. State is never color alone: a selected option also shows a check, a decision also shows a status line. The CV document itself (templates, export) keeps its own document tokens and is not themed.

## 4. Type

| Role | Face | Token |
|---|---|---|
| Display: page titles, hero, role names | Bricolage Grotesque, 800 | `--font-display` |
| Body and controls | Atkinson Hyperlegible Next, 400 / 600 / 700 | `--font-body` |
| Coach's voice | Shantell Sans, 500 / 600 | `--font-coach` |
| CV document | unchanged (template fonts) | `--font-document` |

All three support Romanian diacritics and are self-hosted through `@fontsource`.

| Token | Size / line height | Use |
|---|---|---|
| `--text-hero` | `clamp(2.3rem, 5.4vw, 4.4rem)` / 1.0 | Homepage headline |
| `--text-title` | `clamp(1.7rem, 3.2vw, 2.5rem)` / 1.08 | Page title |
| `--text-heading` | `1.375rem` / 1.2 | Section and card headings |
| `--text-coach` | `1.3125rem` / 1.35 | Coach question |
| `--text-coach-sm` | `1.0625rem` / 1.4 | Coach reason, status |
| `--text-lead` | `1.1875rem` / 1.45 | Lead paragraph, the suggested bullet |
| `--text-body` | `1.0625rem` / 1.55 | Body |
| `--text-small` | `0.9375rem` / 1.45 | Notes, captions |
| `--text-label` | `0.875rem` / 1.3, weight 700 | Field labels, column labels |

Display tracking is `-0.025em` (hero `-0.035em`). Line length stays under 65 characters. No all-caps labels.

## 5. Space, radius, shadow

Spacing scale (`--space-1` … `--space-10`): 4, 8, 12, 16, 20, 24, 32, 40, 56, 72 px. Groups are tight (8–12), blocks are separated generously (32–56), and there is more space above a heading than below it.

| Token | Value | Use |
|---|---|---|
| `--radius-sheet` | 6px | Sheets of paper |
| `--radius-field` | 10px | Text areas, small surfaces |
| `--radius-block` | 16px | Question blocks, cards, dialogs |
| `--radius-band` | 28px | Top corners of full-width bands |
| `--radius-pill` | 999px | Buttons, options, chips |
| `--shadow-sheet` | `0 1px 2px rgb(60 50 0 / .08), 0 10px 28px rgb(60 50 0 / .12)` | Anything that is paper |
| `--shadow-pop` | `0 2px 6px rgb(60 50 0 / .10), 0 18px 44px rgb(60 50 0 / .18)` | Menus, dialogs, toasts |

Elevation is declared once: a sheet has a shadow and no border; a control has a 2px ink border and no shadow.

Controls: height 48px (`--control-h`), small 40px (`--control-h-sm`, never below 44px touch area), border 2px ink. Layout: content max 1180px, side gutter 16px minimum, breakpoint at 900px where two columns stack with the CV sheet first.

## 6. Motion

| Token | Value |
|---|---|
| `--dur-fast` | 150ms (hover, press) |
| `--dur-base` | 250ms (state change, highlight appearing) |
| `--dur-slow` | 350ms (progress bars) |
| `--ease-out` | `cubic-bezier(.2, .8, .2, 1)` |

Motion answers an action: the highlighter sweeps in when a bullet changes, a bar grows, a block lifts onto paper when answered. Nothing animates on its own. `prefers-reduced-motion` removes all of it.

## 7. Illustration

Shapes only, drawn in code: highlighter strokes, a pencil strike, a tilted sheet (at most 1.4°, homepage only), the yellow underline under the wordmark. No drawn scenes or characters until real illustration is commissioned; no emoji as icons. Icons are 2px-stroke line icons from one set (`lucide-react`), 18–20px, always with a text label or an accessible name.

## 8. Voice and tone

The coach is a thoughtful person sitting next to you. Short, plain, one thing per sentence.

| Do | Don't |
|---|---|
| "About how many automations do you keep running today?" | "Please quantify your automation portfolio." |
| "It looks like you connected apps through their APIs, since you built integrations in Make. Is that right?" | "We think you know APIs because of Make. Correct?" |
| "This bullet already fits the job. No change suggested." | Offering a rewrite that only swaps words |
| "Saved. Next role: IT Support." | "Awesome job!!! 🎉" |

Romanian uses the informal singular ("tu"), no diminutives, no English calques where a plain Romanian word exists:

| English | Romanian |
|---|---|
| Upload your CV | Încarcă CV-ul |
| Type or speak your own | Scrie sau dictează răspunsul tău |
| Keep / Use new / Edit | Păstrez / Folosesc propunerea / Editez |
| Inferred from your CV | Dedus din CV |
| Skip this role for now | Sari peste rolul acesta |

Rules:
- Buttons name the action, and the confirmation uses the same word ("Save this role" → "Saved").
- Errors say what happened and what to do next. No apologies, no blame.
- Never an "Other" option: every question has "Type or speak your own".
- Questions and buttons are in the interface language. CV text is in the CV's or the tailoring language and is marked with its own `lang` attribute.
- Gendered Romanian forms are avoided ("o reparam eu", not "singur/singură").

## 9. Accessibility

- WCAG 2.1 AA. Text contrast at least 4.5:1; borders of controls at least 3:1 (ink on paper and on desk both pass).
- Everything works by keyboard. Answer options are real radio inputs in a `fieldset` with the question as `legend`.
- Focus ring: 3px `--color-coach`, 3px offset, on every interactive element.
- Touch targets at least 44×44px.
- Status changes ("2 of 4 answered", "Kept") are announced through a live region that stays in the page; it is never re-created on update.
- CV text inside a Romanian interface carries `lang="en"` (or the CV's language), so screen readers pronounce it correctly.
- The handwriting face is used at 17px or larger, for at most two lines, never for input or for text the person must act on precisely.
- Each page has one `main`, labelled navigation, and one `h1`.

## 10. Components

In `apps/web/src/ui/`, each with tests and an entry in the dev gallery at `/dev/ui`:

Button (primary, secondary, quiet, danger; sizes md, sm; loading), Input, Textarea, Select, Checkbox, Radio, Chip (answer option, tag), Dialog, Menu, Card (Sheet, Block), Tabs, Toast, Progress, Stepper, EmptyState, DiffRow (old vs new with Keep / Use new / Edit), CoachNote (the blue-ink voice), VoiceInput (text field with microphone).
