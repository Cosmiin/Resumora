# Database steps for CV tailoring (you run these)

Nothing here has been applied to the hosted database yet. Claude tested everything on the local database only.
> **Important — timing:** apply the Part 1 migrations **at the same time as you deploy the new API code** from `main` (right after the Part 1 PR is merged), **never before**. One of them (Task 5) removes the old "restore a CV version" function that the API running today still uses. If the database changes first, restoring old versions stops working until the new API is live.

Apply these **after** the earlier migrations still waiting for you (focus mode and jobs, see `2026-11-05-focus-mode-db-steps.md`), and only once the Part 1 PR (`rebuild/tailor-db`) is merged, so the files are on `main`.

## What the migrations do

- `20261108000000_tailoring.sql` (Task 1):
  - adds two columns to `jobs`: `user_thoughts` (your notes on the job, up to 2000 characters) and `application_status` (`saved`, `tailored`, `applied`, `interview`, `offer` or `rejected`; existing jobs get `saved`);
  - creates three new tables: `tailored_cvs` (one tailored CV per job and language), `tailor_runs` (each tailoring run, so it can be resumed) and `match_scores` (Score 1 and Score 2);
  - protects the three tables so that each person sees and changes only their own rows, and can only attach them to their own job;
  - lets the AI call log accept the six new tailoring tasks (`tailor_score`, `tailor_questions`, `tailor_section`, `tailor_verify`, `tailor_translate`, `tailor_letter`).
- `20261108010000_restore_keeps_notes.sql` (Task 5):
  - replaces the "restore an older CV version" database function with a new one. The API now sends the content to restore (the old text plus any notes added since), so restoring no longer throws away newer notes.
  - **Timing:** the old function is removed, so the API currently live stops being able to restore old versions until the new API is deployed. Apply this migration and deploy the API from `main` (after the Part 1 merge) one right after the other. Nothing else breaks in between, and no data is touched.
- `20261108020000_add_job_notes.sql` (Task 6):
  - adds a new database function that saves your answers to job questions as notes on the matching role, keeping the 25 newest answers per role. It doesn't create a History version for each answer. Only signed-in users can call it, and only on their own CV. Nothing existing changes.

## 1. Open a terminal in the project

Open PowerShell in the `resumora` folder (the one that contains the `supabase` folder).

## 2. Check which project you are connected to

```
npx supabase migration list
```

The new `20261108…` migrations should show a Local value only. Every earlier one should show on both sides, unless it is one of the migrations still waiting from earlier work.

If it asks you to log in or link the project, run `npx supabase login`, then `npx supabase link`, and pick the Resumora project (ref `aquvhqbkvrtzhbmezkci`).

## 3. Apply

```
npx supabase db push
```

It lists the new files. Answer `Y` to continue.

## 4. Check that it worked

In the Supabase dashboard, open SQL Editor and run each of these. They only read data.

The three tables exist and are protected (expect 3 rows, all `true`):

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('tailored_cvs', 'tailor_runs', 'match_scores');
```

Each table has its 4 owner-only policies (expect 12 rows):

```sql
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('tailored_cvs', 'tailor_runs', 'match_scores')
order by tablename, policyname;
```

Existing jobs got the `saved` status (expect `0`):

```sql
select count(*) from public.jobs where application_status <> 'saved';
```

The AI call log accepts the new tasks (expect `true`):

```sql
select pg_get_functiondef('public.log_ai_call(text,text,text,text,text,int,int,int)'::regprocedure) like '%tailor_letter%';
```

Only the new restore function is left, with three inputs (expect 1 row, ending in `p_content jsonb`):

```sql
select pg_get_function_identity_arguments(p.oid) from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'restore_base_cv';
```

The new notes function exists and only signed-in users can run it (expect `true`, `false`):

```sql
select has_function_privilege('authenticated', 'public.add_job_notes(text,jsonb)', 'execute'),
       has_function_privilege('anon', 'public.add_job_notes(text,jsonb)', 'execute');
```

## 5. Tell Claude

Say "tailoring migrations applied". Claude then runs the same read-only checks to confirm.

---

## Photo, Task 26

**Timing:** this one goes out **together with the code that uses it** (the photo upload in the CV header), not with Part 1. Apply it when the branch with Task 26 (`rebuild/tailor-photo`) has been merged and its code is being deployed. Applying it a little earlier is harmless: nothing uses the bucket until that code is live.

What `20261108030000_cv_photos.sql` does:
- creates a **private** file store called `cv-photos` for CV photos. Files can be at most 2 MB and must be JPEG, PNG or WebP;
- lets each signed-in person read, upload, replace and delete only files in their own folder (named after their user id). Nobody can see anyone else's photo, and people who aren't signed in can't see any;
- changes no tables and touches no existing data.

The photo is shown only in the CV itself. It is never sent to the AI.

**Apply:** the same steps 1–3 above (`npx supabase migration list`, then `npx supabase db push`). It should list only `20261108030000_cv_photos.sql` if Part 1 is already applied.

**Check** in SQL Editor (read-only):

The store exists and is private (expect 1 row: `false`, `2097152`, the three image types):

```sql
select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cv-photos';
```

The four owner-only rules exist (expect 4 rows):

```sql
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'own cv photos:%'
order by policyname;
```

Then say "photo migration applied".
