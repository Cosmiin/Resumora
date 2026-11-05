# Database steps for focus mode (you run these)

Two migrations:
- `20261107010000` adds one column, `pending`, to the existing `cv_insights` table. It holds up to 5 predicted role scores per role, so the score shown in the celebration is the score that gets stored. Existing rows get an empty list. No policy changes: the table's four owner-only policies already cover the new column.
- `20261107020000` lets the AI call log accept focus mode's three new tasks (`enrich_improve_bullet`, `enrich_brain_dump`, `enrich_role_facts`) and job capture's `job_extract`. Without it, those calls work but are never recorded in `ai_calls`. The function is replaced with the same body, security and grants; only its list of allowed tasks grows.

These come after `20261107000000_jobs.sql` from the jobs work, which took that number first. Apply them after (or together with) the jobs migration.

Nothing has been applied yet.

## 1. Open a terminal in the project

Open a terminal in the project folder (the one that contains the `supabase` folder).

## 2. Check which project you are connected to

Run:

```
npx supabase migration list
```

You should see every earlier migration on both sides (Local and Remote), and two new ones, `20261107010000` and `20261107020000`, with a Local value only.

If it asks you to log in or link the project, do that first: run `npx supabase login`, then `npx supabase link`, and pick the Resumora project (ref `aquvhqbkvrtzhbmezkci`).

## 3. Apply the new migration

Run:

```
npx supabase db push
```

It lists `20261107010000_insights_pending.sql` and `20261107020000_focus_ai_tasks.sql`. Answer `Y` to continue.

## 4. Check that it worked

In the Supabase dashboard, open SQL Editor and run each of these. They only read data.

The column exists, is required and defaults to an empty list (expect one row: `jsonb`, `NO`, `'[]'::jsonb`):

```sql
select data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'cv_insights' and column_name = 'pending';
```

Existing rows got the empty list (expect `0`):

```sql
select count(*) from public.cv_insights where pending <> '[]'::jsonb;
```

The policies are unchanged (expect 4 rows, names starting with "own insights"):

```sql
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'cv_insights' order by policyname;
```

The AI call log accepts the new tasks (expect `true`; this only reads the function's text):

```sql
select pg_get_functiondef('public.log_ai_call(text,text,text,text,text,int,int,int)'::regprocedure) like '%enrich_improve_bullet%';
```

The table is still protected (expect `rowsecurity` = true):

```sql
select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'cv_insights';
```

## 5. Tell Claude

Say "migration applied". Claude then runs the same read-only checks to confirm.
