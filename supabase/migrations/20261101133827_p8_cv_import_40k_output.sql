-- A 40K-token extraction may run longer than the former two-minute worker lease.
-- Preserve every ownership, cancellation, expiry and settlement check and all grants.
DO $$
DECLARE target regprocedure; definition text;
BEGIN
 FOREACH target IN ARRAY ARRAY[
  'app.get_cv_import(uuid)'::regprocedure,
  'app.expire_cv_import_tasks(text)'::regprocedure,
  'app.cv_import_task_context(text,uuid,boolean)'::regprocedure
 ] LOOP
  definition:=pg_catalog.pg_get_functiondef(target);
  IF pg_catalog.strpos(definition, 'interval ''120 seconds''')=0 THEN
   RAISE EXCEPTION 'Expected import lease boundary is missing in %',target;
  END IF;
  EXECUTE pg_catalog.replace(definition,'interval ''120 seconds''','interval ''420 seconds''');
 END LOOP;
END $$;
