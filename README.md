# Resumora — Discovery proposal

**Status: discovery proposal and local Base/job CV application slice.** This repository contains research, product/technical proposals, a local synthetic prototype, a [local frontend/Worker foundation](docs/setup/local-development.md), and the [approved database implementation](docs/database/README.md). It is not a production app; the local foundation does not authorize production launch, spending, real model calls, payments, or deployment. Remaining product policy decisions are tracked in [`research/strategy/publication/docs/product/decisions.md`](research/strategy/publication/docs/product/decisions.md).

## Start here

For infrastructure preparation, use the [setup guide](SETUP_GUIDE.md): verified repository readiness, account inventory, secure configuration and feature-triggered service checklists. The [authentication setup](docs/setup/authentication.md) owns the implemented email/password flows, local configuration and hosted acceptance dependencies.

1. Read the [customer-journey reference](docs/product/customer-journeys.md), [documentation index](docs/README.md), [integrated PRD](docs/product/prd.md) and [decision register](research/strategy/publication/docs/product/decisions.md).
2. Preview the [interactive Romanian-first prototype](prototype/review.html). It uses synthetic Mara Ionescu / Northstar People data and keeps state in your browser. The interface defaults to Romanian; interface and CV language have separate controls. No real AI, server, payment, or PDF service is connected.
3. Read the [A–F journeys](research/ux/journeys.md), [screenshot evidence map](research/ux/evidence-map.md), and [screen specifications](research/ux/screen-specifications.md).
4. See the [architecture snapshot](research/architecture/README.md), [versioned ATS method/demonstrator](research/ats/README.md), [cost model](research/costs/README.md), and [strategy/source package](research/strategy/README.md).

## Frontend visual reference

The [design-system adoption guide](docs/frontend/design-system-adoption.md) maps the supplied Resumora design to journeys A–F and lists the next frontend preparation tasks. The [CVizat reference package](references/design-system/cvizat/README.md) preserves the original ZIP and separate design source. This is reference preparation; production implementation remains unapproved. Current repository: [Cosmiin/Resumora](https://github.com/Cosmiin/Resumora).

## Local application foundation

For the runnable React Base CV journey, follow [Base CV review instructions](docs/frontend/base-cv.md). With the pinned Node/npm toolchain, run `npm ci --ignore-scripts` and `npm run dev`, then open `http://127.0.0.1:5173/` following the [browser verification requirements](docs/setup/authentication.md#external-setup-dependencies). Configure the existing cloud development Supabase project using [authentication setup](docs/setup/authentication.md) to create an account, confirm email, sign in, sign out or reset a password. Signed-in users can create/edit a Base CV and save content, enrichment answers and version history through the Worker. The unconfigured app stays locked; hosted authentication, save/reopen and account isolation still await controlled acceptance. No deployment is needed. See [local development](docs/setup/local-development.md) for toolchain details and `npm run check` for the [foundation checks](docs/setup/local-development.md#checks).

For SQL migrations, database command contracts and native local verification, start with the [database guide](docs/database/README.md). The [gateway contract](docs/database/gateway.md) owns the Worker’s user-scoped persistence boundary.

For optional CV photos, follow the [profile photo guide](docs/frontend/profile-photo.md), including private storage setup and remaining acceptance requirements.

For the synthetic OpenAI cost-dashboard preview and its integration limits, follow [OpenAI/admin preparation](docs/setup/openai-admin.md).

After the CV draft has saved, open **Jobs** to paste an advert and save it to your account, then review its details. In **Improve**, select an entry and use **Suggest wording**; suggestions are switched off by default. Review any proposal and its sources before **Accept wording**. See [connected vacancies and wording setup](docs/setup/connected-jobs-ai.md) for configuration and limits, and the [capture design](docs/product/vacancy-capture-design.md) for planned extension and URL intake.

Choose **Open CV for this job** in the saved vacancy to edit its CV independently of Base. Follow the [job editor guide](docs/setup/job-editor-documents.md) for supported edits, save/reopen, History/restore and setup limits.

To start from an existing document, choose **I already have a CV** and follow the [document intake and section review flow](docs/setup/cv-import-enrichment.md#customer-journey-and-saved-truth). **Improve** also offers AI questions and a whole-experience rewrite for a selected role. These AI actions are switched off by default; follow [CV import and career enrichment](docs/setup/cv-import-enrichment.md) for supported inputs, review controls and activation requirements.

The CV preview offers the five selected layouts—Folio, Meridian, Signal, Archive and Monograph—with a versioned choice saved through the existing editor history. See [template authoring and integration](docs/frontend/TEMPLATE_AUTHORING.md) for adding designs, font licenses, print checks and remaining publication/export wiring. Layout changes do not trigger inference.

## Discovery prototype preview

From the repository root, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory prototype
```

Open `http://localhost:8000/review.html`. Serve only `prototype/` on loopback so the preview does not expose application configuration elsewhere in the repository. Core styles and interaction code are bundled; the page also references version-pinned Tailwind/DaisyUI browser assets from jsDelivr, so an internet connection is needed for those enhancements. The demo has an explicit in-memory fallback if browser storage is unavailable. Use **Reia demonstrația / Reset demo** to reset local state.

The standalone `prototype/review.html` includes the same app source and is convenient for review. To rebuild it after editing the source, run `python3 prototype/build_portable.py` from the repository root. To run the deterministic interaction checks, follow [`reviews/ux/verification.md`](reviews/ux/verification.md).

## Package map

- [`docs/product/prd.md`](docs/product/prd.md) — integrated proposal, scope, five guided review choices, unresolved policy choices.
- [`prototype/`](prototype/) — original interactive mockup, source, local assets and deterministic verifier.
- [`research/ux/`](research/ux/) — 44-image inventory metadata, evidence map, states, assumptions, journeys and cross-review dispositions. Reference screenshot binaries are excluded.
- [Shared synthetic examples](docs/examples/README.md) — fixture index, bilingual job inputs and acceptance checklist.
- [`schemas/cv/v1/`](schemas/cv/v1/) — proposed canonical CV/workspace schemas, Mara synthetic fixtures, and validation scripts.
- [`research/architecture/`](research/architecture/README.md), [`research/ats/`](research/ats/README.md), [`research/costs/`](research/costs/README.md) — Firstmate-relayed versioned technical discovery artifacts and limitations.
- [`research/strategy/publication/`](research/strategy/README.md) — portable strategy evidence, options, decision cards, backlog and sources.
- [`reviews/ux/verification.md`](reviews/ux/verification.md) — browser and deterministic verification receipts, scope limits, and feedback dispositions. Local screenshot binaries and machine-specific browser tooling are excluded from the proposal package.

All candidate/job examples use synthetic data. Estimates and score methods are illustrative and uncalibrated. Production PDF export remains unimplemented; the [template guide](docs/frontend/TEMPLATE_AUTHORING.md#print-and-acceptance) owns the local print-proof limits and remaining export checks. See each artifact's version and limitations before relying on its outputs.
