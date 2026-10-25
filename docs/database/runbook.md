# P0–P3 verification, development apply and recovery

Approval covers architecture **2.0.0 P0–P3**, local implementation and staged apply only to development project **`aquvhqbkvrtzhbmezkci`**, after target/schema/history/drift/backup preflight and passing local tests. Synthetic acceptance and cleanup are included. This is existing execution authorization; another blanket approval is unnecessary. Production, real personal data, paid/provider activation, P4–P7, DNS and deployment are excluded. A wrong target, unexpected real data, destructive conflict, drift or missing access/recovery capability stops hosted execution for concrete review.

Current evidence is local only. There is no hosted schema inventory or apply receipt. Access and the actual recovery baseline remain prerequisites, not assumptions of emptiness or free-tier backup availability.

## 1. Review a stable migration head locally

Complete review/no-mistakes on the branch, integrate current main through the normal pipeline, then record the exact clean Git commit and migration SHA-256 manifest. Never edit an already-applied migration: add a forward correction. If review changes SQL, rerun affected checks before hosted execution. Preserve prior receipts.

Run as a non-root user with Python 3 and PostgreSQL 16+ server/client binaries:

```sh
python3 scripts/db/test.py --pg-bin /usr/lib/postgresql/16/bin --receipt /tmp/resumora-db-tests.json
python3 -m unittest discover -s supabase/tests -p test_preflight.py -v
```

For relocated verified official binaries, use `--pg-share <share/postgresql/16>` and `--pg-lib <lib/x86_64-linux-gnu>`. The runner never installs anything, inherits hosted PG/Supabase defaults or uses TCP. It initializes UTF-8/C.UTF-8, creates synthetic subjects and product data, executes real SQL/RLS/concurrent sessions and populated upgrades, stops its own cluster and deletes only its temporary files. Its `fsync=off` is restricted to this disposable synthetic cluster; never copy that setting to a hosted project. Failure returns nonzero. Do not redirect test bootstrap or `behavior.py` to a hosted URL: bootstrap replaces managed Auth with doubles.

CI's separate database job runs these checks using native PostgreSQL 16 on Ubuntu 24.04. Existing application CI remains independent. A hosted project may use a different server version/collation; capture that in preflight and check compatibility rather than assuming equality.

## 2. Establish exact-target access without secret exposure

Use the supported CLI login/link workflow in an owner-controlled private terminal, with recording and shell tracing off. CLI login is a separate first step using `--no-browser`; any manual login URL must be opened only in the verified `cosmin@emedi.ro` Chrome profile. A reachable bridge or signed-in site is not proof of the browser profile. No auth-store extraction, cookie copy or new browser bridge. Do not share the session URL/code in chat.

For verified CLI **2.122.0**, use builtin `--profile supabase`. Other profile strings are interpreted as configuration-file paths; `resumora-db-architecture` is not a named login profile and fails here. Pin a clean child environment: `HOME=/home/cosmin`, `PATH=/usr/bin:/bin`, `TERM=xterm`, `SUPABASE_HOME=/home/cosmin/.supabase`, `SUPABASE_EXPERIMENTAL_STACK=0`, `DO_NOT_TRACK=1`. This selects official endpoints and the legacy `supabase/.temp/project-ref` and `pooler-url` layout consumed by preflight. Do not inherit alternate endpoints, tokens, experimental stack or PG defaults. One credential-free login example is:

```sh
umask 077
env -i HOME=/home/cosmin PATH=/usr/bin:/bin TERM=xterm SUPABASE_HOME=/home/cosmin/.supabase SUPABASE_EXPERIMENTAL_STACK=0 DO_NOT_TRACK=1 /path/to/verified/supabase login --no-browser --profile supabase
```

Keep CLI state current-owner directory0700. On this WSL installation the CLI uses the shared fallback `SUPABASE_HOME/access-token` (regular0600), not a token file named after the task; do not read/copy its value. `umask 077` protects new files but does not tighten an existing directory. Before linking, validate and restrict the exact task's existing `.temp` directory to0700 and its owned regular cache files to0600; reject symlinks, unexpected owners/types or another project. Official same-target linking may refresh its own metadata. Keep link/cache state ignored by Git, including the staging copy used later.

Only after nonsecret login confirmation should the owner run the separately reviewed private link/password helper supplied through Firstmate. Its link command uses `link --project-ref aquvhqbkvrtzhbmezkci --workdir <explicit task directory> --profile supabase` under that same clean environment. Link fetches management metadata and may internally retrieve existing API credentials; it does **not** prove a SQL connection, consume the DB password or create its password file. Do not enable debug output or log raw CLI/key output. Pooler discovery can fail even when link reports success: require supported official `project-ref`/`pooler-url` files afterward. Do not use `--skip-pooler`, switch to stack-format `.link.json`, or fabricate metadata by hand.

The private helper then uses masked `getpass` and exclusive/no-follow creation to store the existing database password only in ignored `.env.db.local`, current-owner regular0600, as one single-line POSIX-shlex-quoted `SUPABASE_DB_PASSWORD=...` assignment. Preserve any pre-existing credential path, including symlinks; never overwrite it or reset an unknown password. Do not hand-quote a password into a shell command. Preflight parses the file as data; never `source` or `eval` it. No secret belongs in arguments, history, debug output, receipts or chat. Do not use secret-valued `--password`, `--token`, `--db-url`, role/seed inclusion or remote reset. Helper/CLI login and linking are owner actions, not pipeline tests. Report only a nonsecret completion/missing-step message to Firstmate; access setup is separate from SQL/recovery readiness.

The task verified Supabase CLI 2.122.0 against the official release checksum and PostgreSQL 16.15 packages against APT metadata in task-private directories. No global install, service start, Docker administration or shared PATH change occurred. Operators may use equivalent verified supported tooling; record its version/help before relying on a flag. Supabase CLI [database command documentation](https://supabase.com/docs/reference/cli/supabase-db-push) describes the supported migration path.

## 3. Read-only target, history, drift and data classification

After access setup, run:

```sh
python3 scripts/db/preflight.py --pg-bin /path/to/postgresql/bin --receipt /private/task-data/preflight-before-P0.json
```

Use `--pg-lib` if the relocated client needs it. Before reading values, the helper requires the password and official link metadata to be current-owner regular0600 files under a current-owner .temp directory0700; unsafe modes/types/symlinks are rejected without repair. It binds ignored CLI metadata to the exact project, allows only direct/session pooler connections for that ref, verifies TLS hostname/system CA, removes inherited connection defaults, forces read-only transactions and bounded statement/lock timeouts. It collects version/collation, custom table presence/RLS/column hashes, constraints, policy/function hashes/ACLs, migration versions/names, aggregate Auth/Storage counts and whether custom tables contain rows. It emits no row contents, migration SQL bodies, function bodies, URI or password. Receipts are owner-only. Failure diagnostics intentionally suppress raw connection details. The helper cannot apply and always records `can_apply:false`.

Review the receipt alongside an authoritative project identity/name/development-purpose check. Link metadata binds the requested transport but does not prove the owner's project-purpose classification. Confirm PostgreSQL compatibility, extensions/managed schema prerequisites and Auth UID semantics. Compare actual schema/history with the **stable reviewed prefix**, not only with a table count. Record migration names/hashes and any existing objects. RLS/constraint/function hashes are inventory, not automatic drift approval. The helper observes across several read-only transactions; it is not a consistent snapshot. Coordinate a quiet change window and repeat immediately before apply if other writers or migrations could have changed the target.

Nonempty Auth/Storage or unknown custom data requires classification before any mutation; do not read personal rows to demonstrate a problem or assume they are disposable. Existing `app` objects, conflicting migration versions, failed/inconsistent history or an unknown extension/function require reconciliation. Do not repair migration history merely to make the CLI accept it. Unexpected target/data/drift is a stop condition for Firstmate review.

## 4. Recovery baseline before DDL

Record the existing baseline timestamp, retained location/owner, database schema+data restore capability, object byte recovery (if any), required version/rule artifacts and who can perform recovery. Review access and a feasible restore procedure. Do not infer a backup from project tier or a dashboard label; do not enable paid backups/providers. If the target is confirmed empty, document a recoverable schema/history baseline and an isolated restore check; emptiness alone is not a substitute for recovery evidence.

Before real data, recovery must also account for deletion tombstones and backup expiry. Restoring old data must not resurrect erased accounts or replay already-performed external effects. This P0–P3 scope has no external dispatch, but future outbox recovery must pause dispatch and reconcile provider receipts/status before reactivation. Real-data retention durations and erasure policy remain unselected product/legal inputs.

## 5. Prepare and apply one named phase prefix

The CLI version used here has `db push --dry-run` and `--skip-vault`; no phase-selection flag is assumed. Prepare an owner-only **task-local staging directory** per phase and stable commit. Copy `supabase/config.toml`, the exact reviewed migration prefix through the named phase, and the exact-target official link metadata into it. Preserve all earlier migration files byte-for-byte; omit later files when constructing the staging copy. Do not remove, rename or edit files in the Git worktree to select a phase. Use its explicit `--workdir` so the CLI cannot discover another checkout.

| Named phase | Complete prefix ending with | Expected cumulative tables |
|---|---|---|
| P0 | `20261025011000_p0_commands.sql` | 7 |
| P1 | `20261025022000_p1_publication.sql` | 26 |
| P2 | `20261025031000_p2_commands.sql` | 34 |
| P3 | `20261025042000_p3_analysis.sql` | 43 |

Record Git head, phase, filename/hash manifest and target ref for each copy; verify them again before apply. Require staging/cache directories0700 and metadata files0600. Use a clean child environment with the same official home/builtin profile and legacy-stack controls described above, adding only `SUPABASE_DB_PASSWORD` parsed as data from the private file; never put the password in an argument, `env NAME=value` command, shell evaluation or log. The commands below describe the CLI arguments invoked by that private environment launcher, not a password-entry recipe. For the prepared phase directory:

```sh
/path/to/verified/supabase db push --linked --skip-vault --dry-run --workdir /private/stage-directory --profile supabase
/path/to/verified/supabase db push --linked --skip-vault --workdir /private/stage-directory --profile supabase
```

`--skip-vault` is material: this CLI otherwise updates Vault configuration before migrations. Do not include `--include-roles`, `--include-seed`, `--include-all`, `--yes` or reset. Inspect the dry-run's exact pending versions against the named manifest. The interactive migration confirmation must match that list. Each SQL file is transactional under the migration runner; the whole multi-file phase is not claimed atomic. Stop on a failure and inventory committed history before deciding what to retry. No concurrent migration runners.

After each phase, capture read-only history/schema/grants/FKs/RLS and the phase's synthetic acceptance evidence before advancing. Rerun the same prefix dry-run; it must report no pending migrations. A lost CLI connection may mean commit succeeded: inspect supported history and actual schema before retrying unchanged files. Never mark history applied just because a client timed out.

## 6. Scoped hosted synthetic acceptance and cleanup

Use two uniquely named synthetic test identities through supported Supabase Auth administration, without email sending, real PII or paid/provider activation. Admin capability and cleanup ownership must be confirmed before creating them. Do not INSERT/DELETE managed `auth.users` directly or install the native test bootstrap on the hosted project. Existing real users are not test fixtures. Keep generated test passwords/tokens private and use nonrouting synthetic addresses.

For database-only acceptance, use the real managed subject rows with transaction-local authenticated role/verified test subject context in an administrator-controlled **single rollback transaction**. Run targeted phase commands and reads: P0 provision/replay/mismatch/two-tenant denial; P1 minimal canonical publication and exact profile lineage; P2 reviewed job branch/Base isolation and explicit sent/retraction; P3 pinned zero/full-evidence explanation, strict eligibility and current revocation. Inspect expected assertions and end with `ROLLBACK`, including on failure. Record only synthetic IDs, assertions, phase/head/hash and rollback outcome. This validates hosted SQL prerequisites/privileges, not JWT validation or the unexposed HTTP API. Real concurrency/race behavior remains covered locally; do not run the fresh-cluster bootstrap against a hosted schema.

Then remove the scoped synthetic Auth identities through supported administration and verify no product rows, Auth subjects or Storage objects remain for the recorded IDs. No Storage object is needed in this scope. If product data unexpectedly committed, stop and use a reviewed ID-scoped child-first cleanup with administrator ownership; immutable triggers/RESTRICT FKs intentionally prevent casual deletes. Never disable triggers globally, truncate shared tables, widen deletion to unknown records, or drop `app` as cleanup. Cleanup failure blocks further phases and real-data admission. Full managed Auth/JWT/API acceptance belongs to the later application integration scope, not a claim made by native test doubles.

## 7. Failure, rollback and recovery

An uncommitted SQL-file failure rolls back that file; previous files may remain. Reinventory before continuing. Prefer a reviewed forward migration on the same approved feature scope for an additive defect. Revert application callers independently if needed. Do not edit applied files or run destructive down scripts. SQL restores create new historical product versions; they do not rewrite prior user facts.

If a committed migration requires destructive rollback, stop for concrete recovery review rather than expanding this additive authorization. Restore the reviewed baseline into an isolated target first, compare history/schema/rules and tenant isolation, then follow the approved recovery procedure for the development project. Keep external dispatch disabled (none exists in this scope). Before serving restored real data in any future scope, reapply erasure/tombstone changes after the baseline and verify object checksums, UID ownership and replay identities.

Keep an execution receipt per phase with exact target and purpose evidence, stable commit/file hashes, baseline reference, local checks, dry-run/pending list, actual apply history, postflight/schema checks, synthetic assertions and cleanup outcome. Redact connection details and keep all secrets out. This repository currently supplies implementation and local evidence; an execution receipt must come from an actual observed run.
