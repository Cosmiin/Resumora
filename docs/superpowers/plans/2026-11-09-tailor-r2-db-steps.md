# Tailoring round 2 · database steps for the owner

This block belongs with "R2 steering" in `docs/superpowers/plans/2026-11-08-tailoring-db-steps.md`. That file is an uncommitted file in the main `resumora` folder, so the build session didn't edit it; copy this block there if you want one list.

## R2 steering (`20261109200000_tailor_r2.sql`)

What it does:
- adds `steering` to tailored CVs: your tone and steering answers (empty to start);
- adds `role_order` and `current_role_id` to tailoring runs, so Experience goes role by role;
- adds `tone_examples` to jobs: the cached tone examples for the steering screen;
- lets the new AI task `tailor_tone_examples` be logged.

It changes no existing data and no access rules.

**Apply locally** (from the worktree folder, with the local stack running):

```bash
npx supabase migration up
```

Never `npm run db:reset`: it wipes the local data.

**Check:** `npm run db:test` passes (the file `tailor_r2.test.sql` covers the new columns and that another user can't read them).

The hosted database gets it later, together with the code that uses it, with the same steps as the earlier parts (`npx supabase migration list`, then `npx supabase db push`).
