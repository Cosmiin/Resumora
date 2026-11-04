# Resumora verification

Verify authentication, Profile editing, CV import/review and enrichment together. Preserve tenant isolation, Origin/CSRF checks, revision/replay behavior, pending-work recovery and Base removal fences.

Run `npm run check`, `npm test --workspace @resumora/api`, the native PostgreSQL `scripts/db/test.py --suite all`, and canonical schema validation. The read-only `npm run smoke` checks an already running managed environment; use [the environment guide](docs/setup/environment.md) for startup.

Use synthetic transports for rendered desktop/mobile checks of import review, contextual questions, accepted wording, skills, language versions, photos, templates, PDF controls and history. Synthetic results do not establish hosted provider quality or authorize processing an owner's CV.

Current behavior and the latest bounded verification evidence are recorded in the [handoff](docs/HANDOFF.md). Dated records under `docs/archive/` apply only to their recorded checkpoints and do not define the active task list.
