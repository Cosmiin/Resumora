# Resumora database

The application uses the existing hosted Supabase project `aquvhqbkvrtzhbmezkci` for authentication, PostgreSQL and private file storage. The local Worker accesses owned data through the `app` schema using the signed-in user's identity. Privileged worker capabilities remain server-side.

Retained data covers tenants/memberships/settings, Base CV facts and provenance, immutable editor/canonical history, import sessions and processing tasks, language proposals, photos, workspace recovery, enrichment operations and usage accounting. Row ownership, revision checks, idempotency and Base-removal generations fence writes and late results.

Applied migration files are immutable history. Fresh databases replay the full migration chain. Native tests run against disposable PostgreSQL with local Auth/Storage doubles; they do not prove hosted connectivity.

See the [API boundary](api.md), [gateway](gateway.md), and [runbook](runbook.md).
