-- Read-only postflight. Every residual count must be zero.
SELECT 'retired_tables' AS check_name, count(*) AS failures FROM pg_class WHERE relnamespace='app'::regnamespace AND relname ~ '(job|capture|tailor|application|analysis|recommendation|readiness|requirement|match_evidence|evidence_mapping|rule_version|next_action)'
UNION ALL SELECT 'retired_routines',count(*) FROM pg_proc WHERE pronamespace='app'::regnamespace AND (proname ~ '(job|capture|tailor|application|analysis|readiness|integration|intake|sent_count|mark_sent|retract_sent|next_action)' OR prosrc ~ 'app\.(jobs|job_|capture_|analysis_|applications|recommendation|readiness|rule_versions|target_job)')
UNION ALL SELECT 'retired_columns',count(*) FROM information_schema.columns WHERE table_schema='app' AND column_name ~ '(job|tailor|capture)'
UNION ALL SELECT 'retired_constraints',count(*) FROM pg_constraint WHERE connamespace='app'::regnamespace AND pg_get_constraintdef(oid) ~ '(job|tailor|capture|integration|intake)'
UNION ALL SELECT 'retired_policies',count(*) FROM pg_policies WHERE schemaname IN ('app','storage') AND (coalesce(qual,'')||coalesce(with_check,'')) ~ 'app\.(jobs|job_|capture_|analysis_|applications|recommendation|readiness|rule_versions|target_job)'
UNION ALL SELECT 'disabled_triggers',count(*) FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='app'::regnamespace) AND tgenabled='D'
UNION ALL SELECT 'retired_ai_attempts',count(*) FROM app.ai_enhancement_attempts WHERE start_data->>'operation' IN ('job_parse','cv_tailor')
UNION ALL SELECT 'retired_ai_operations',count(*) FROM app.ai_enhancement_operations WHERE policy='deleted-job' OR policy LIKE '%:integration'
UNION ALL SELECT 'retired_audit',count(*) FROM app.audit_events WHERE action ~ '(job|capture|tailor|application|analysis|readiness|target|integration|intake|mark_sent|retract_sent|next_action)'
UNION ALL SELECT 'invalid_workspace',count(*) FROM app.workspace_drafts WHERE kind NOT IN ('resume','import-review','translation-review') OR (kind='resume' AND value->>'route' !~ '^#/profile($|/)')
UNION ALL SELECT 'missing_language_grant',CASE WHEN has_function_privilege('authenticated','app.document_language_context()','EXECUTE') AND NOT has_function_privilege('anon','app.document_language_context()','EXECUTE') THEN 0 ELSE 1 END;
