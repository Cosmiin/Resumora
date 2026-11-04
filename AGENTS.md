# Working on Resumora

Read [the current environment guide](docs/setup/environment.md) before starting, restarting, or diagnosing this app. It supersedes historical launch recipes in discovery/activation notes for everyday local operation.

- Use Node from `.nvmrc` and the existing npm workspaces.
- The active development app runs in Linux/WSL. Supabase and OpenRouter/OpenAI are hosted dependencies, not alternative copies of the app.
- Use `npm run dev:doctor` to identify the checkout, configuration, service owner and import processor. The usual browser origin is `http://127.0.0.1:15173`; inspect actual configuration instead of assuming the clean-checkout default of 5173.
- Use `npm run dev:start`, `dev:status`, and `dev:stop` for the complete environment. Avoid a second manual frontend/API/import process alongside the managed service.
- Runtime bindings belong to this checkout's ignored `apps/api/.dev.vars`. Do not reconstruct a launch from historical credential files. Keep values out of output, source control and frontend variables.
- Preserve unfinished changes and other worktrees. Runtime cleanup is distinct from deleting worktrees, resetting data, or deploying.
- After startup changes, run `npm run test:dev-config` and the live read-only `npm run dev:doctor`. When changing frontend exposure or environment handling, also run `npm run test:dev-secrets`.
- Distinguish configured, process-running, and end-to-end-verified states in reports. A local health check does not establish hosted provider availability.
