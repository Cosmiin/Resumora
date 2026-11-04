# Resumora development environment

This is the current entry point for running Resumora, updated 2 November 2026. Older discovery, activation and owner-evaluation guides describe historical steps; use this page for everyday startup.

## Where things run

| Component | Location |
| --- | --- |
| Application code | Linux/WSL checkout: `/home/cosmin/.treehouse/AI-CV-Maker-V2-180668/13/AI-CV-Maker-V2` |
| Browser address | `http://127.0.0.1:15173/#/profile` |
| Frontend | Local Vite process, port 15173 |
| API | Local Wrangler process, port 8787, reached through the frontend proxy |
| CV import processor | Local Node process, managed with the frontend and API when AI is enabled |
| Login, saved data and file storage | Existing hosted Supabase project **Resumora**, `aquvhqbkvrtzhbmezkci` |
| AI generation | Existing OpenRouter configuration, with OpenAI fallback |

“Linux” describes where the app runs. “Cloud” describes the external services it calls. These are parts of the same development setup. This local URL is available while this computer's Linux/WSL session is running. It is not a deployed Cloudflare website.

## One startup path

Open a Linux/WSL terminal in the code folder above:

```sh
nvm use
npm run dev:start
npm run dev:doctor
```

`dev:start` manages **one** user service, `resumora-dev.service`, containing the frontend, API and configured background processors. It validates enabled AI configuration before restarting, checks the login endpoint, and restarts the group after an unexpected child exit. It refuses a service belonging to a different checkout or ports held by unrelated processes.

When stopping or restarting during an import, the processor is allowed up to 450 seconds to finish its current bounded import. It stops claiming new imports after the stop signal. A restart can therefore take longer while an import is active.


| Command | Purpose |
| --- | --- |
| `npm run dev:start` | Start/restart the complete local environment, including after configuration changes |
| `npm run dev:doctor` | Show code location, Node version, configuration path, local/hosted boundaries, service ownership, session reachability and import-worker process count |
| `npm run dev:status` | Short service and login-readiness check |
| `npm run dev:stop` | Stop the services and disable automatic startup |
| `journalctl --user -u resumora-dev.service -n 80` | Inspect recent operational logs |

The diagnostic check performs no generation, account creation, database mutation, or deployment. A running process is not proof of provider connectivity or import success. New checkouts default to a locked app on 5173 until configured; they are not automatically the active environment.

## One private runtime configuration

The active checkout's `apps/api/.dev.vars` is the runtime source for auth, Supabase, AI providers, models, worker authorization and matching browser origins. It is ignored by Git and readable only by its owner. Keep `APP_ORIGIN` and `API_ORIGIN` equal to `http://127.0.0.1:15173` here. Keep keys server-side; never put them in frontend `VITE_*` variables.

The launcher passes public origins to Vite and server bindings only to the processes that need them. Ambient provider/authentication variables are stripped so an old exported key cannot select another account. `AI_PAID_INFERENCE=on` explicitly enables the configured local AI services and import worker; `off` leaves manual editing, saved-data access available. Incomplete enabled AI stop startup with the missing binding names, without exposing their values or stopping an already healthy service.

Earlier launches assembled several private files from previous checkouts and activation folders. The recovered settings are now in this checkout's single file. Those older files and `.dev.vars.before-ai-restore` are recovery material, not startup inputs. Updating an old file does not update this runtime.

## Checkouts and historical previews

Other Git worktrees are development history, not additional running environments. They may contain unfinished work and are retained. The current service's ownership marker and `dev:doctor` identify the active checkout. The old option-gallery preview on 15174 is retired; its design files remain available.

For a future code-folder move, transfer the complete working tree and private configuration deliberately, reinstall the service from the chosen checkout, and verify its owner, origin, session endpoint and worker before retiring the old location. Do not switch to `main` or reconstruct credentials from old launch commands as a way of starting the app.

Cloud hosting is a separate deployment task. Supabase migrations, database resets, provider/model changes, and deployment are not performed by any `dev:*` command. Clean-checkout dependency installation and detailed test commands are in [local development](local-development.md); [authentication](authentication.md) and [background import](cv-import-background.md) explain the application flows.
