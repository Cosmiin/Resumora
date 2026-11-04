# Resumora

Resumora is a CV application with authentication, document ingestion, profile editing and enrichment. My Profile is the main workspace. Each account has one Base CV, with saved history and content-language support.

The active development app runs in Linux/WSL and uses hosted Supabase and OpenRouter/OpenAI. Follow the [environment guide](docs/setup/environment.md) before starting or diagnosing it:

```sh
nvm use
npm run dev:start
npm run dev:doctor
```

Use the pinned Node version and existing npm workspaces. Runtime configuration belongs in the ignored `apps/api/.dev.vars`; keep credentials out of source and browser variables. The usual browser address is `http://127.0.0.1:15173/#/profile`; inspect the actual checkout configuration.

For a new contributor or AI session, start with the [current-state handoff](docs/HANDOFF.md). See the [documentation index](docs/README.md), [local development](docs/setup/local-development.md), [authentication](docs/setup/authentication.md), and [CV import](docs/setup/cv-import-enrichment.md) guides. A running local process does not establish hosted-provider availability. Cloud deployment is a separate operation.
