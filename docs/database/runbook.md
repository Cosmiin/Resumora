# Database operations

Use the existing Resumora hosted project. Read [the environment guide](../setup/environment.md) before operating the app; managed development commands do not apply migrations.

Create forward migrations with the installed Supabase CLI after checking its `--help`. Keep previously applied files unchanged. Inspect the current schema and dependencies, rehearse both fresh replay and populated upgrades locally, and review the exact SQL before applying it to hosted data. Use a transaction and verify retained data, ownership policies and routine dependencies after a schema change.

Native verification requires PostgreSQL 16 or newer and Python 3:

```sh
python3 scripts/db/test.py --suite all --pg-bin "$RESUMORA_PG_BIN" --pg-share "$RESUMORA_PG_SHARE" --pg-lib "$RESUMORA_PG_LIB"
```

Omit share/library arguments when using a standard PostgreSQL installation. The runner creates isolated Unix-socket clusters and removes them afterward; it accepts no hosted credentials. Each suite owns its fixture identities and worker authorization. `--suite base-only` exercises the product-reduction upgrade and fresh-schema equivalence; focused choices are listed in `--help`.

Deleting a Storage metadata row does not delete the stored file. File cleanup uses the supported Storage API and verifies absence. References must establish that no retained CV, language or history row needs an object before it is removed. Failed cleanup remains pending for retry.

After application changes, run `npm run dev:start`, `npm run dev:doctor` and `npm run smoke`. These establish local runtime/session reachability; explicit provider-flow verification is separate.
