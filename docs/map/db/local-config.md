---
id: db/local-config
area: db
files: ["supabase/config.toml", "supabase/.gitignore"]
depends_on: ["db/imports", "db/cv-photos"]
contract: false
checked_hash: 7643d953
cited: [c0cf62, c0aaaf, 783f56, 6b4ca7, a4c3ac, f84ebd, d77cf5, 28cca7, 5bd96d, f78054, c4aa24, 56ba64, ba7006, 2cab68, 7d2eab, f03498, e25035, 0d27f6, 1db908, ca2b45, feeafa, e3c0a5, 011e1f, ed608b, 79c9d7, 7f5466, b81c71, b81c71, 8a2e3f, 0edc63, 102bbd, c0cf62, 6b4ca7, 4643b5, 366e3d, c12e74, 2cab68, feeafa, 5bd96d]
decisions: ["docs/decisions/0008-every-database-change-is-a-new-migration.md"]
open: []
---
Configure local Supabase services and exclude generated local state from version control.

- The local project is resumora; Data API runs on 54321, exposes public/graphql_public, adds public/extensions to search path and limits responses to 1000 rows. `supabase/config.toml:5` -> `project_id`, `supabase/config.toml:10` -> `port = 54321`, `supabase/config.toml:18` -> `max_rows`
- Local database and shadow ports are 54322/54320, with Postgres major version 17; the pooler is disabled. `supabase/config.toml:34` -> `port = 54322`, `supabase/config.toml:41` -> `major_version`, `supabase/config.toml:46` -> `enabled = false`
- Migrations are enabled with no declarative schema_paths; seed execution is configured with ./seed.sql. `supabase/config.toml:62` -> `enabled = true`, `supabase/config.toml:65` -> `schema_paths`, `supabase/config.toml:72` -> `sql_paths`
- Storage is enabled with a global 50MiB file limit; individual CV import/photo bucket migrations impose smaller limits. `supabase/config.toml:117` -> `enabled = true`, `supabase/config.toml:119` -> `file_size_limit`, `supabase/migrations/20261105000000_imports.sql:35` -> `5242880`, `supabase/migrations/20261108030000_cv_photos.sql:3` -> `2097152`
- Auth site and redirect URLs point to the local web app on 5173; tokens expire after 3600 seconds, with refresh-token rotation enabled and a 10-second reuse interval. `supabase/config.toml:160` -> `site_url`, `supabase/config.toml:164` -> `additional_redirect_urls`, `supabase/config.toml:166` -> `jwt_expiry`, `supabase/config.toml:172` -> `enable_refresh_token_rotation`
- Signups are enabled, anonymous sign-ins disabled, and local password minimum is six characters; email confirmation is disabled. `supabase/config.toml:177` -> `enable_signup`, `supabase/config.toml:179` -> `enable_anonymous_sign_ins`, `supabase/config.toml:183` -> `minimum_password_length`, `supabase/config.toml:228` -> `enable_confirmations`
- Local TLS and network restriction management are disabled. `supabase/config.toml:25` -> `[api.tls]`, `supabase/config.toml:27` -> `enabled = false`, `supabase/config.toml:74` -> `[db.network_restrictions]`, `supabase/config.toml:76` -> `enabled = false`
- Supabase's ignore rules exclude .branches/.temp and local environment/key-file patterns from version control. `supabase/.gitignore:2` -> `.branches`, `supabase/.gitignore:3` -> `.temp`, `supabase/.gitignore:6` -> `.env.keys`, `supabase/.gitignore:8` -> `.env.*.local`

## Connections

- Used by local database start/test scripts: `package.json:17` -> `supabase start`, `package.json:19` -> `supabase test db` -> `supabase/config.toml:5` -> `project_id`, `supabase/config.toml:34` -> `port = 54322`.
- Storage configuration enables the service used by bucket migrations: `supabase/config.toml:116` -> `[storage]` -> `supabase/migrations/20261105000000_imports.sql:33` -> `storage.buckets`, `supabase/migrations/20261108030000_cv_photos.sql:2` -> `storage.buckets`.

## Assumptions

- Local sign-in behavior deliberately permits unconfirmed accounts; this file alone is not evidence of hosted authentication settings. `supabase/config.toml:160` -> `127.0.0.1`, `supabase/config.toml:228` -> `enable_confirmations = false`
- Seed configuration references a separate file; no claims about its contents follow from this map. `supabase/config.toml:72` -> `sql_paths`
