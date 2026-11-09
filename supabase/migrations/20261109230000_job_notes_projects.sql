-- E6 Task 9: tailoring answers about a project are saved on that project (projects are tailored like roles).
-- Same body, security and grants as 20261108020000_add_job_notes.sql; only 'projects' is added to the searched sections.
create or replace function public.add_job_notes(p_role_id text, p_notes jsonb)
returns table (version int, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row     public.base_cvs%rowtype;
  v_section text;
  v_index   int;
  v_notes   jsonb;
begin
  select * into v_row from public.base_cvs b where b.user_id = auth.uid() for update;
  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;

  foreach v_section in array array['experience', 'projects', 'volunteering'] loop
    select (ordinality - 1)::int into v_index
      from jsonb_array_elements(v_row.content -> v_section) with ordinality as roles(role, ordinality)
      where role ->> 'id' = p_role_id;
    exit when found;
  end loop;
  if v_index is null then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;

  v_notes := coalesce(v_row.content #> array[v_section, v_index::text, 'notes'], '[]'::jsonb) || p_notes;
  -- Keep MAX_JOB_NOTES (packages/shared/src/cv.ts) newest job answers; enrichment notes stay.
  select coalesce(jsonb_agg(note order by ordinality), '[]'::jsonb) into v_notes
    from (
      select note, ordinality, row_number() over (
        partition by (note ? 'jobId')
        order by (note ->> 'askedAt')::timestamptz desc, ordinality desc
      ) as note_rank
      from jsonb_array_elements(v_notes) with ordinality as notes(note, ordinality)
    ) ranked
    where not (note ? 'jobId') or note_rank <= 25;

  v_row.content := jsonb_set(v_row.content, array[v_section, v_index::text, 'notes'], v_notes);
  -- Match MAX_CV_BYTES for the next autosave body, including its version.
  if octet_length(jsonb_build_object('content', v_row.content, 'version', v_row.version + 1)::text) > 262144 then
    raise exception 'content_too_large' using errcode = '54000';
  end if;

  update public.base_cvs b
    set content = v_row.content,
        version = b.version + 1, updated_at = now()
    where b.user_id = auth.uid()
    returning * into v_row;
  return query select v_row.version, v_row.updated_at;
end;
$$;

revoke execute on function public.add_job_notes(text, jsonb) from public, anon;
grant execute on function public.add_job_notes(text, jsonb) to authenticated;
