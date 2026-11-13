-- The application status says only how the application is going. "Tailored" is no longer one of
-- its values: whether a job has a tailored CV comes from its tailoring runs.
-- Release order: the API that no longer writes 'tailored' must be live before this runs.
update public.jobs set application_status = 'saved' where application_status = 'tailored';

alter table public.jobs
  drop constraint jobs_application_status_check,
  add constraint jobs_application_status_check
    check (application_status in ('saved', 'applied', 'interview', 'offer', 'rejected'));
