# Resumora Design System

**Domain:** https://resumora.ro

Design system for **Resumora** — an AI CV tailor that turns one trustworthy Base CV into honest, job-specific CVs, with a clear match score and gap analysis at the centre.

**Source repository:** https://github.com/Cosmiin/AI-CV-Maker-V2 (branch `main`). It contains the PRD (`docs/product/prd.md`), UX specs (`research/ux/`), architecture/ATS/cost research, CV schemas and a discovery prototype (`prototype/styles.css`, `app.js`). Explore it for deeper product rules (keyword states, scoring method, data model) before designing new flows. The repo has **no production UI, logo or brand assets**; the prototype's working name "atelier cv" is not the brand.

Full discovery (requirements vs proposals vs open questions, IA, journeys, UX departures): **[guidelines/discovery.md](guidelines/discovery.md)**.

## Product context
- **Users:** Romanian-speaking job seekers applying locally and/or in English. UI is Romanian-first with English secondary; CV language is chosen separately.
- **Surfaces:** web app first (this kit). iOS/Android later — components use 44px touch sizes on mobile and the SideNav maps to a bottom tab bar.
- **Core loop:** Base CV → add job → see your match → approve changes → download → mark sent.
- **Guardrails:** never invent facts or numbers; gaps are information, not failures; eligibility warnings persist; scores are estimates, never hiring predictions.

## CONTENT FUNDAMENTALS
- **Voice:** a calm, encouraging career coach. Plain words, short sentences, no jargon. Explain *why* and *what happens next*.
- **Person:** address the user as **you**; the product is **we** ("We only read what you paste."). Romanian uses the informal **tu** (the prototype uses "Confirmat de tine").
- **Casing:** Sentence case everywhere — headings, buttons, pills. Uppercase only for small eyebrows/section labels in CVs.
- **Buttons:** verb-first, outcome-specific: "Check my match", "Add the 3 missing things", "Save this job’s CV", "Only this job / Update Base too". Never "Submit", "OK", "Run analysis".
- **Translate system states into human ones:** verified_omitted → "You have it · not in this CV"; awaiting_confirmation → "Is this true for you?"; unsupported → "Not in your experience"; needs_verification → "Can you work in Romania? We don’t know yet."; untested → "Not tested".
- **Honesty lines** recur: "Your score doesn’t change", "Same facts, better chosen", "We won’t add things you haven’t done", "This is an estimate, not an employer’s ATS".
- **Numbers:** few, explained, never decorative. Dates at true precision ("2021 — Present", never an invented month). Prices "— RON" until decided.
- **Errors:** say how to fix: "Paste a bit more — at least a few sentences." / "Try a PDF with selectable text, or type it in."
- **Emoji:** none. Warmth comes from wording and colour, not emoji. Typographic quotes and em-dashes (“ ” — ·) are used; middle dot separates meta.
- **Romanian examples (from repo):** "Pregătește următoarea aplicare", "Extras · neconfirmat", "Confirmat de tine", "Propunere", "Reia demonstrația". Always keep diacritics (ă â î ș ț).

### Romanian (primary language)
Full guide: **[guidelines/romanian-copy.md](guidelines/romanian-copy.md)** · strings catalogue: `guidelines/copy/strings.json` (ICU, RO + EN) · cards in the **Content** group.
- **Tu**, imperative singular (*Adaugă, Încarcă, Verifică*); product is **noi** („Nu am putut citi fișierul.”). Never „dumneavoastră”, never „sistemul”.
- Diacritics mandatory with **comma-below ș ț**; „ghilimele românești”; lowercase months/languages („23 octombrie 2026”, „română”).
- Decimal comma (62,5), 24h time, „lei” in prose / RON in price tables; three plural forms with „de” from 20 („20 de cerințe”) — always ICU, never string-building.
- Errors = what happened + how to fix + one action. Toasts are active voice with **Anulează**. Cancel = **Renunță**, Undo = **Anulează**.
- Fixed glossary: CV de bază, CV pentru job, candidatură (not „aplicare”), condiție eliminatorie, Tu vs. job / CV-ul vs. job, Netestat, șablon.

## VISUAL FOUNDATIONS
- **Colour:** Pine green (`--pine-600` #17695d actions, `--pine-800` #173b39 ink) on a sage wash page (`--sage-50` #f4f7f4) with white cards — taken directly from the prototype. Marigold adds warmth: focus ring (#b87a24), badges, "new" highlights in the CV preview. Status: good = pine tint, warn = marigold tint, bad = rose tint (confirmed strict gaps only), info = sky tint ("you have this elsewhere"), neutral = sage (absent experience, untested). Colour is always paired with words + icon.
- **Type:** Bricolage Grotesque (display: page titles, verdicts, score numbers, tight −0.045em tracking); Figtree (UI/body, 0.92rem body, 650 labels); Source Serif 4 for the Clar CV template; JetBrains Mono rarely for version refs. *All are Google Fonts substitutes — no brand fonts exist; the prototype used Inter/Georgia.*
- **Spacing:** prototype values retained (7, 9, 15, 25, 38). Cards pad 25px; hero 38px; page 36/44px; grid gap 24px. Generous whitespace; one idea per block.
- **Backgrounds:** flat colour only. No gradients, textures, photos or illustrations. The single decorative motif is the **tilted paper** (white CV sheet rotated 2° with a soft shadow) in the Home hero.
- **Corner radii:** 3px CV paper, 6px pills, 7px inputs, 8px buttons, 10px segmented/alerts, 14px cards, 15px dialogs, 18px hero. Soft, never bubble-shaped panels.
- **Forms:** 48px fields with a soft sage-25 fill and 1.5px sage-200 border, 12px radius; on hover they turn white, on focus white + pine border + 4px pine-100 ring. Leading Lucide icon turns pine on focus. Errors: rose border + icon + a sentence saying how to fix. Success: pine check. Labels 0.86rem/650 above the field, "Optional" on the right — required is the default. Dropdowns are custom (never the native menu): same trigger as fields, a floating white 14px-radius menu with soft shadow, 32px icon tiles, one-line descriptions, pine-50 selected row with a check, optional diacritic-insensitive search. Custom 22px checkboxes (7px radius) fill pine with the same 2px tactile under-shadow as primary buttons; radios and checkboxes come as plain or **card** rows that tint pine-50 when chosen. Upload uses a dashed 16px-radius dropzone.
- **Cards:** white, 1px sage border (#d8e3df), 14px radius, **no shadow** at rest. Selected = 2px pine border. Hero = pine-100 fill. Never coloured left-border cards.
- **Borders:** 1px everywhere; dividers are sage-200 lines between rows rather than nested boxes.
- **Shadows:** flat by default. Shadow only for lifted things: CV paper, dialogs, toasts. Primary button has a 2px solid ink under-shadow — the tactile signature.
- **Hover:** secondary buttons darken background slightly (#f1f5f1); primary goes pine-700; nav items get sage wash; cards' border darkens to sage-400.
- **Press:** buttons translate down 2px and lose their under-shadow (120ms). No scale/shrink.
- **Focus:** 3px marigold outline, 3px offset — high-visibility, on everything.
- **Motion:** purposeful and quick: 120ms press, 200ms expand/collapse, 360ms bar fills, 700ms score-ring rise on the "after" score (the one celebratory moment). ease-out curves; no bounce loops; respects reduced motion.
- **Transparency/blur:** only the dialog backdrop (ink at 33%). No glassmorphism.
- **Imagery:** none yet. If photography is added later: warm, natural, real people at work; never stock "success" clichés.
- **Layout:** desktop = 218px SideNav + content max 1440px; guided flows go full-screen with a TopBar + Stepper and Exit. Two-column work/preview layouts with a sticky preview. ≤760px: stacked, 44px controls.
- **Data viz:** one ring, thin bars (7px). Neutral grey for gaps; dashed ring for "Not tested".

## ICONOGRAPHY
- The repo ships **no icons** (the prototype used a letter in a rounded square as the brandmark and text-only nav). **Substitution:** Lucide (https://lucide.dev), 2px stroke, rounded joins — friendly yet precise. Loaded per-icon from CDN (`lucide-static@0.460.0`) via the `Icon` component (CSS mask, inherits `currentColor`).
- Sizes: 16px in small buttons/pills, 18px default, 20–26px in empty states and task cards (inside a 40–56px tinted rounded square).
- Core set: house, file-user, briefcase, sparkles (ready to add), circle-check, circle-help (to check), circle-alert, archive (have it elsewhere), languages (RO/EN equivalent), minus (not in experience), shield-check (confirmed by you), upload, download, send, arrow-right (next step), undo-2, history.
- No emoji, no unicode glyphs as icons (· and — are punctuation, not icons). No hand-drawn SVGs.

## Logo
Created for Resumora (Oct 2026) — not from the source repo.
- **Mark:** an **open door** with sunrise light (marigold #f9d67a → soft peach #ffb38a) and three soft rays spilling out — a new opportunity, the next job. Pine rounded square, 64-unit grid, 16 radius. Rays are dropped below 24px (16px favicon). Chosen after earlier “r” marks read as a bowing figure.
- **Wordmark:** “Resumora”, capital R, Bricolage Grotesque 800, outlined to paths (no font dependency).
- **Files:** `assets/logo/` — resumora-logo.svg (lockup), -logo-inverse.svg, -mark.svg, -mark-inverse.svg, -mark-mono.svg, -wordmark.svg. `assets/favicon/` — favicon.svg, favicon-16/32/48.png, apple-touch-icon.png (180, full-bleed), icon-192/512.png, icon-maskable-512.png, site.webmanifest. `assets/brand/og-image.png` (1200×630).
- **Every HTML page** links favicon.svg + favicon-32.png + apple-touch-icon + manifest + theme-color #17695d. Copy that `<head>` block into new pages.
- **Rules:** min mark 16px, lockup 20px tall; clear space = door width; inverse version on pine-600/800; never recolour the light or flatten its gradient in colour versions, stretch, or add effects. Use the `Logo` component in React.

## Components
Namespace: `window.ResumoraDesignSystem_0f8e2e`.
- **core/** — Button, IconButton, Icon, Pill, Card, Logo
- **forms/** — Field, Select (custom listbox: icons, descriptions, groups, search, keyboard), Checkbox, RadioGroup, Segmented, Dropzone (shared FieldShell)
- **feedback/** — Alert, Toast, Spinner, Dialog, EmptyState
- **progress/** — Stepper, ProgressBar, ScoreRing
- **match/** — MatchVerdict, FindingGroup, KeywordRow, ChangeCard
- **document/** — CVDocument, PlanCard, TaskCard
- **navigation/** — SideNav, TopBar

Inventory is modelled on the prototype's CSS primitives (btn, pill, panel, field, check, alert-box, tabs-row, step-list, score-circle, metric/bar, keyword, document, journey-card, plan, dialog, notice, loading-ring, aside/top).
**Intentional additions:** Icon (Lucide wrapper — no icon set in source), Logo (brand created on request), RadioGroup + Dropzone (enrichment questions and CV upload need them), MatchVerdict and FindingGroup (the redesigned match report), ChangeCard (per-change approval from spec UX13, unstyled in prototype), IconButton (compact repeated actions).

## UI kits
- **ui_kits/web-app/** — interactive: Home → Add job → Match report → Improve CV → Download → back to Home. Proposed design (see discovery §5), synthetic Mara Ionescu / Northstar People data.

## Index
- `styles.css` — entry point (imports only) → `tokens/fonts.css, colors.css, typography.css, spacing.css, effects.css, base.css`
- `guidelines/` — discovery.md, **romanian-copy.md**, `copy/strings.json`, foundation + content specimen cards (colours, type, spacing, radii, elevation, motion, brand, voice, icons)
- `components/<group>/` — JSX + d.ts + prompt.md + one card per group
- `ui_kits/web-app/` — click-through kit
- `thumbnail.html`, `SKILL.md`, `github.md`
