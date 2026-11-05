-- Focus mode: predicted role results, cached under the fingerprint the role will have once an
-- accepted bullet is saved. Shape: [{ fingerprint, result, at }], at most 5 entries (kept by the API).
-- The score route promotes a matching entry to the main columns, so the celebrated score is the stored one.
--
-- No new policy: the table-level grants and the four owner-only policies from
-- 20261106000000_enrichment.sql already cover every column of a row.
--
-- Numbered after 20261107000000_jobs.sql (rebuild/jobs-core), which took that version first.
-- `if not exists`: safe on a database where the column was already added by hand.

alter table public.cv_insights add column if not exists pending jsonb not null default '[]'::jsonb;
