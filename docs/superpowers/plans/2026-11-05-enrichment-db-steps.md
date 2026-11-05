# Database steps for CV enrichment (you run these)

This adds one new table (`cv_insights`) and two small database functions (migration `20261106000000`). A second migration, `20261106010000`, replaces the function that applies an imported CV so it can keep each role's notes when you import again. A third migration, `20261106020000`, adds one function that counts and records a voice session in a single step, so the limit of 20 voice answers a day cannot be passed by sending many requests at once. Nothing has been applied yet.

## 1. Open a terminal in the project

Open a terminal in the project folder (the one that contains the `supabase` folder).

## 2. Check which project you are connected to

Run:

```
npx supabase migration list
```

You should see the earlier migrations on both sides (Local and Remote), and three new ones, `20261106000000`, `20261106010000` and `20261106020000`, with a Local value only.

If it asks you to log in or link the project, do that first: run `npx supabase login`, then `npx supabase link`. The link command shows a list of projects. Pick the Resumora one (project ref `aquvhqbkvrtzhbmezkci`). It may ask for the database password, which you can find in the Supabase dashboard under Project Settings, then Database.

## 3. Apply the new migration

Run:

```
npx supabase db push
```

It lists the migrations it is about to apply (`20261106000000_enrichment.sql`, `20261106010000_apply_import_content.sql` and `20261106020000_voice_reservation.sql`). Answer `Y` to continue.

## 4. Check that it worked

Open the Supabase dashboard, go to SQL Editor, and run each of these. They only read data.

Table exists and is protected (expect one row, `rowsecurity` = true):

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'cv_insights';
```

Four policies exist (expect 4 rows, names starting with "own insights"):

```sql
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'cv_insights' order by policyname;
```

Both functions exist (expect 2 rows):

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname in ('snapshot_base_cv', 'log_ai_call');
```

The signed-out visitor cannot run the logging function (expect `false`):

```sql
select has_function_privilege('anon', 'public.log_ai_call(text,text,text,text,text,int,int,int)', 'execute');
```

The import function was replaced, not duplicated (expect exactly 1 row, with 3 arguments):

```sql
select pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'apply_import';
```

The signed-out visitor cannot run it (expect `false`):

```sql
select has_function_privilege('anon', 'public.apply_import(uuid,int,jsonb)', 'execute');
```

The voice function exists (expect 1 row):

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'reserve_voice_session';
```

The signed-out visitor cannot run it (expect `false`):

```sql
select has_function_privilege('anon', 'public.reserve_voice_session(text,int)', 'execute');
```

If all of them show the expected rows, you are done. Tell me and I will carry on with the next task.

## If something goes wrong

Copy the error message and send it to me. Do not try to fix it by hand in the SQL editor. The first migration only adds new things. The second swaps one function for a new version of itself; your CVs and imports are not touched. The third only adds a new function.
