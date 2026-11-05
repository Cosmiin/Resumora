-- Users can write their own rows directly through Supabase (RLS allows it), skipping the API's
-- checks. Keep stored content to a JSON object of sane size so it can't break loading.
-- 512 KB is twice the API limit, leaving room for jsonb's own formatting.

alter table public.base_cvs
  add constraint base_cvs_content_shape
  check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 524288);

alter table public.base_cv_versions
  add constraint base_cv_versions_content_shape
  check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 524288);
