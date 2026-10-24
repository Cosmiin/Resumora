# Resumora frontend design-system adoption

The supplied CVizat export is the visual reference for Resumora's future frontend. This change preserves the reference package and prepares the handoff; it does not implement an application or authorize production work. The [PRD](../product/prd.md), [canonical CV/workspace contracts](../../schemas/cv/v1/README.md), [journeys A–F](../../research/ux/journeys.md) and [D-01–14 decision register](../../research/strategy/publication/docs/product/decisions.md) retain their product/data authority. The brand name is now Resumora; historical discovery evidence and the supplied export remain unchanged.

## What the team supplied

The [reference receipt](../../references/design-system/cvizat/README.md) records archive provenance, SHA-256 and extraction checks. Paths below refer to its unmodified `source/` tree.

| Material | Representative source | Reuse |
|---|---|---|
| Foundations | [styles.css](../../references/design-system/cvizat/source/styles.css), [tokens/colors.css](../../references/design-system/cvizat/source/tokens/colors.css), [tokens/typography.css](../../references/design-system/cvizat/source/tokens/typography.css), [tokens/spacing.css](../../references/design-system/cvizat/source/tokens/spacing.css), [tokens/effects.css](../../references/design-system/cvizat/source/tokens/effects.css) | Pine actions (#17695d), sage surfaces, marigold focus, semantic statuses, spacing, type, radii, shadows and motion. |
| Typography | [tokens/fonts.css](../../references/design-system/cvizat/source/tokens/fonts.css) | Bricolage Grotesque display, Figtree UI, Source Serif 4 document, JetBrains Mono references. Google Fonts imports; no font binaries supplied. |
| Components | [components/](../../references/design-system/cvizat/source/components/), e.g. [Field.jsx](../../references/design-system/cvizat/source/components/forms/Field.jsx), [ChangeCard.jsx](../../references/design-system/cvizat/source/components/match/ChangeCard.jsx) | React JSX modules, `.d.ts` interfaces, usage prompts and HTML specimen cards across core, forms, feedback, progress, match, document and navigation. |
| Brand assets | [assets/logo/](../../references/design-system/cvizat/source/assets/logo/), [assets/favicon/](../../references/design-system/cvizat/source/assets/favicon/), [og-image.png](../../references/design-system/cvizat/source/assets/brand/og-image.png) | Resumora lockup, mark, inverse/mono variants, outlined wordmark, PNG/SVG favicons, app icons, manifest and social image. |
| Copy | [romanian-copy.md](../../references/design-system/cvizat/source/guidelines/romanian-copy.md), [strings.json](../../references/design-system/cvizat/source/guidelines/copy/strings.json) | RO/EN catalogue with ICU plural examples; Romanian diacritics, glossary, formats, errors and voice. |
| Example screens | [web-app/README.md](../../references/design-system/cvizat/source/ui_kits/web-app/README.md), [discovery.md](../../references/design-system/cvizat/source/guidelines/discovery.md) | Home → Add job → Match report → Improve CV → Download, synthetic Mara/Northstar content, plus proposed navigation simplification. |

The kit is React 18.3.1 with ReactDOM and Babel standalone 7.29.0 loaded by CDN in [index.html](../../references/design-system/cvizat/source/ui_kits/web-app/index.html). Icons use CDN `lucide-static@0.460.0` via [Icon.jsx](../../references/design-system/cvizat/source/components/core/Icon.jsx). There is no package manifest, lockfile or application build setup. The prebundled `_ds_bundle.js` exports `window.CVizatDesignSystem_0f8e2e`; the supplied readme instead documents a Resumora namespace. Keep this discrepancy visible during a future integration rather than assuming the readme identifier works.

## How to use it

Read the source and specimen cards as the visual/component specification. After separate implementation approval, establish a frontend workspace, map semantic tokens and adapt the JSX through application-owned components. Keep this source snapshot intact; imports from `references/` and the demo's global bundle/localStorage are not a production integration plan. Existing `prototype/` remains discovery evidence.

Adapters must consume stable canonical fact/claim/version IDs and preserve provenance, unknown dates, confirmation and generated-prose approval. Presentation templates must not change facts. Per-change approval, explicit append/replace, Undo/history and separate Base promotion remain required. Avoid treating the demo's plain section arrays as the canonical CV model.

Keep Candidate–Job Fit, CV–Job Match, eligibility and actual PDF readability distinct and versioned. A verdict/ring may prioritize the document match visually, but cannot merge these meanings. Readiness stays five qualitative checks, with no extra aggregate score. Preserve RO-first UI, secondary English and independent CV language. Route grouping, score hierarchy, capture scope, access gates, template breadth and budgets remain subject to the decision register; the supplied flow is a proposal.

## Map components to journeys

| Journey | Supplied starting point | Preparation still needed |
|---|---|---|
| A · Account/import/Base | Field, Select, Dropzone, Checkbox, Stepper, Alert, Dialog | Account screens, extraction/provenance confirmation, structured Base editor, partial dates and immutable save/history states. |
| B · Enrichment | Field, RadioGroup, ChangeCard, Dialog | Section questions, safe skip/unknown, evidence-linked answer review, destination/append/replace and Undo. No enrichment screen supplied. |
| C · Job capture | AddJob.jsx, TopBar, Stepper | Structured required/preferred review, explicit capture consent and recoverable paste/manual fallback. URL control is visual demo scope. |
| D · ATS/evidence | MatchReport.jsx, MatchVerdict, FindingGroup, KeywordRow, ScoreRing, ProgressBar | Canonical status mapping, method/evidence/version links, stale assessment and all eligibility states. |
| E · Compare/edit/export | Improve.jsx, ChangeCard, CVDocument, Download.jsx | Compare against pinned versions, structured editing/history, correct Base promotion, PDF rendering/readability/error states. Clar/Contur are HTML presentations. |
| F · Subscription/account | PlanCard, Field, Dialog, feedback components | Account/access/cancel/pending/declined screens; no checkout/account screen supplied. Prices, policies and integration require approval. |
| Return/application loop | Home.jsx, TaskCard, SideNav | Search, latest CV tailored state, submitted snapshot, contact and next action/date; explicit sent attestation independent of export. |

Screen references are under [ui_kits/web-app/](../../references/design-system/cvizat/source/ui_kits/web-app/); component groups are under [components/](../../references/design-system/cvizat/source/components/). These are starting points, not evidence of journey completion.

## Concrete gaps to resolve

- **Demo state is illustrative.** [MatchReport.jsx](../../references/design-system/cvizat/source/ui_kits/web-app/MatchReport.jsx) uses 62 and a fixed 3× required weighting; [Download.jsx](../../references/design-system/cvizat/source/ui_kits/web-app/Download.jsx) always shows 90 regardless of accepted changes and simulates PDF completion with a timeout. The repository's shared fixture is 62.5 → 90 with Fit 90; use the versioned method/fixtures, never these constants or timing claims. No real PDF/readability proof exists.
- **Eligibility and approval need real state models.** MatchReport's yes/no/unsure dialog only sets a boolean for yes; no does not create a confirmed gap. [App.jsx](../../references/design-system/cvizat/source/ui_kits/web-app/App.jsx) starts with all change IDs accepted, and its save/Undo messages do not implement canonical versioning or restoration. Do not carry these behaviors forward.
- **Responsive intent exceeds code.** The supplied readme describes ≤760px stacking, mobile navigation and 44px targets. Screen code uses fixed side columns (300/320px), a desktop sidebar and inline grids; the only CSS media query in the `.css`/`.jsx` files handles reduced motion. Mobile navigation, stacking and touch sizing need actual layouts and checks. Form dimensions also differ between guidelines, tokens and field CSS; reconcile them before implementation.
- **Language assets are not localized screens.** The catalogue provides RO/EN pairs, but the kit has `lang="en"`, hard-coded English labels and no wired locale switch. Its CV language selector does not translate preview content. Connect message IDs, Romanian plurals/diacritics and independent language state later.
- **Accessibility is unfinished.** Focus tokens and reduced-motion CSS exist, but [Dialog.jsx](../../references/design-system/cvizat/source/components/feedback/Dialog.jsx) has no focus trap, focus restoration or Escape handler. Custom Select, upload, announcements, keyboard paths, contrast and zoom need focused review; no accessibility conformance is established.
- **Distribution prerequisites are missing.** No standalone license/attribution file was supplied. Confirm brand/source rights, font licenses and Lucide attribution obligations before shipping; document approved vendoring/dependency choices. Font, React/Babel and icon CDN references make the export non-self-contained. No external resources were fetched or executed during intake.

## Ordered frontend preparation backlog

1. Review the above journey mapping against the PRD and D-01–14; record decisions affecting navigation, scoring hierarchy, capture, export breadth and access without treating the kit as approval.
2. Define the eventual frontend workspace/dependency and font/icon asset plan, resolve rights/attributions, token/form dimension discrepancies and the bundle namespace mismatch. Keep reference source separate.
3. Specify canonical-to-view adapters and component contracts for facts, confirmation, evidence/assessments, versions, approvals/Undo, and application records using the existing synthetic fixtures.
4. Complete missing A/B/F screens and C–E recovery/eligibility/history states; wireframe desktop/mobile layouts and RO/EN message coverage with independent document language.
5. Define the later implementation acceptance checklist: keyboard/dialog/select behavior, mobile/zoom/contrast, truthful version transitions, independent assessment states and real PDF extraction/pagination. Request a separately bounded implementation task once requirements, architecture, scope and budget are approved.

Intake validation was limited to archive integrity/safety, extracted-byte comparison and local documentation links. No bundled scripts, dependency installation, build, application test suite, deployment or connected services were run.
