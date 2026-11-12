-- True while a tailored CV was changed since its last score: the job page then offers Re-check.
-- Nothing re-scores by itself.
alter table public.tailored_cvs add column score_stale boolean not null default false;
