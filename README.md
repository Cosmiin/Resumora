# Resumora — Discovery proposal

**Status: integrated discovery proposal for review.** This repository contains research, product/technical proposals, and a local synthetic prototype. It is not a production app and does not authorize implementation, spending, real model calls, payments, or deployment. Product policy decisions D-01–14 remain open in [`research/strategy/publication/docs/product/decisions.md`](research/strategy/publication/docs/product/decisions.md).

## Start here

For infrastructure preparation before implementation, use the [setup guide](SETUP_GUIDE.md): verified repository readiness, account inventory, secure configuration and feature-triggered service checklists. The [authentication preparation](docs/setup/authentication.md) specifies email/password login/reset with Google later; it is documentation and credential-ignore preparation, not working authentication.

1. Read the [integrated PRD](docs/product/prd.md) and [decision register](research/strategy/publication/docs/product/decisions.md).
2. Preview the [interactive Romanian-first prototype](prototype/review.html). It uses synthetic Mara Ionescu / Northstar People data and keeps state in your browser. The interface defaults to Romanian; interface and CV language have separate controls. No real AI, server, payment, or PDF service is connected.
3. Read the [A–F journeys](research/ux/journeys.md), [screenshot evidence map](research/ux/evidence-map.md), and [screen specifications](research/ux/screen-specifications.md).
4. See the [architecture snapshot](research/architecture/README.md), [versioned ATS method/demonstrator](research/ats/README.md), [cost model](research/costs/README.md), and [strategy/source package](research/strategy/README.md).

## Frontend visual reference

The [design-system adoption guide](docs/frontend/design-system-adoption.md) maps the supplied Resumora design to journeys A–F and lists the next frontend preparation tasks. The [CVizat reference package](references/design-system/cvizat/README.md) preserves the original ZIP and separate design source. This is reference preparation; production implementation remains unapproved. Current repository: [Cosmiin/Resumora](https://github.com/Cosmiin/Resumora).

## Local preview

From the repository root, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/prototype/review.html`. Core styles and interaction code are bundled; the page also references version-pinned Tailwind/DaisyUI browser assets from jsDelivr, so an internet connection is needed for those enhancements. The demo has an explicit in-memory fallback if browser storage is unavailable. Use **Reia demonstrația / Reset demo** to reset local state.

The standalone `prototype/review.html` includes the same app source and is convenient for review. To rebuild it after editing the source, run `python3 prototype/build_portable.py` from the repository root. To run the deterministic interaction checks, follow [`reviews/ux/verification.md`](reviews/ux/verification.md).

## Package map

- [`docs/product/prd.md`](docs/product/prd.md) — integrated proposal, scope, five guided review choices, unresolved policy choices.
- [`prototype/`](prototype/) — original interactive mockup, source, local assets and deterministic verifier.
- [`research/ux/`](research/ux/) — 44-image inventory metadata, evidence map, states, assumptions, journeys and cross-review dispositions. Reference screenshot binaries are excluded.
- [`schemas/cv/v1/`](schemas/cv/v1/) — proposed canonical CV/workspace schemas, Mara synthetic fixtures, and validation scripts.
- [`research/architecture/`](research/architecture/README.md), [`research/ats/`](research/ats/README.md), [`research/costs/`](research/costs/README.md) — Firstmate-relayed versioned technical discovery artifacts and limitations.
- [`research/strategy/publication/`](research/strategy/README.md) — portable strategy evidence, options, decision cards, backlog and sources.
- [`reviews/ux/verification.md`](reviews/ux/verification.md) — browser and deterministic verification receipts, scope limits, and feedback dispositions. Local screenshot binaries and machine-specific browser tooling are excluded from the proposal package.

All candidate/job examples use synthetic data. Estimates and score methods are illustrative and uncalibrated. PDF readability remains untested until an actual exported PDF is inspected. See each artifact's version and limitations before relying on its outputs.
