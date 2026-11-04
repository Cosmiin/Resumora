# Resumora setup

The [current environment guide](docs/setup/environment.md) owns startup, shutdown, service ownership and configuration. Read it first.

Use Node from `.nvmrc`, install the existing npm workspaces with `npm ci`, and configure the ignored owner-only `apps/api/.dev.vars` for the existing hosted Supabase project and AI providers. Do not put credentials in frontend variables.

Run `npm run dev:start`, followed by `npm run dev:doctor`. `npm run dev:stop` stops the managed environment; allow an active CV import to finish its bounded shutdown. `npm run smoke` inspects the configured running app without starting another frontend or API.

[Authentication](docs/setup/authentication.md), [background import](docs/setup/cv-import-background.md), [voice input](docs/setup/voice-typing.md), and [database operation](docs/database/runbook.md) have their own setup and verification details. Local configuration, a running process, and verified end-to-end provider behavior are separate states.
