-- Read-only preflight for the authorized, inspected Resumora cutover.
-- Never emit CV payloads, tokens, object names or user identifiers.
-- Values requiring reconciliation must be zero before proceeding.
SELECT 'jobs' AS item,count(*) AS value FROM app.jobs
UNION ALL SELECT 'job_documents',count(*) FROM app.job_editor_documents
UNION ALL SELECT 'canonical_documents',count(*) FROM app.cv_documents
UNION ALL SELECT 'photo_manifests',count(*) FROM app.photo_assets
UNION ALL SELECT 'embedded_snapshot_provenance',count(*) FROM app.editor_draft_snapshots WHERE jsonb_path_exists(payload,'$.answers[*].origin') OR payload::text ~ '("jobId"|"job_capture"|job_source_|job_local_|job:[0-9a-f-]+:answer:)' OR payload#>>'{content,translation,source,kind}'='job'
UNION ALL SELECT 'embedded_profile_provenance',count(*) FROM app.profile_versions WHERE canonical_json::text ~ '("jobId"|"job_capture"|job_source_|job_local_|job:[0-9a-f-]+:answer:)'
UNION ALL SELECT 'mixed_sources',count(*) FROM app.source_documents WHERE (job_id IS NOT NULL OR source_kind='job') AND profile_id IS NOT NULL
UNION ALL SELECT 'attributed_claims',count(*) FROM app.claim_provenance p JOIN app.source_spans sp ON sp.tenant_id=p.tenant_id AND sp.id=p.source_span_id JOIN app.source_documents s ON s.tenant_id=sp.tenant_id AND s.id=sp.source_document_id WHERE s.job_id IS NOT NULL OR s.source_kind='job'
UNION ALL SELECT 'integration_results',count(*) FROM app.career_operation_results WHERE kind='integration'
UNION ALL SELECT 'retired_language_proposals',count(*) FROM app.document_language_proposals WHERE request#>>'{source,kind}'='job'
UNION ALL SELECT 'retained_receipt_provenance',count(*) FROM app.idempotency_requests WHERE command_kind !~ '(job|capture|tailor|application|analysis|readiness|target|integration|intake|mark_sent|retract_sent|next_action)' AND result_refs::text ~ 'job_local_|job_source_|"jobId"|"kind": "job"'
UNION ALL SELECT 'retained_career_provenance',count(*) FROM app.career_operation_results t WHERE kind!='integration' AND to_jsonb(t)::text ~ 'job_local_|job_source_|"jobId"|"kind": "job"'
UNION ALL SELECT 'retained_workspace_provenance',count(*) FROM app.workspace_drafts WHERE kind IN ('resume','import-review','translation-review') AND value::text ~ 'job_local_|job_source_|"jobId"|"kind": "job"'
UNION ALL SELECT 'retained_ai_provenance',count(*) FROM app.ai_enhancement_attempts a JOIN app.ai_enhancement_operations o ON o.id=a.operation_id WHERE o.job_id IS NULL AND o.policy!='deleted-job' AND o.policy NOT LIKE '%:integration' AND coalesce(a.start_data->>'operation','') NOT IN ('job_parse','cv_tailor') AND (a.start_data::text||a.result_data::text) ~ 'job_local_|job_source_|"jobId"|"kind": "job"'
UNION ALL SELECT 'active_import_tasks',count(*) FROM app.cv_import_tasks WHERE state IN ('queued','processing')
UNION ALL SELECT 'storage_objects',count(*) FROM storage.objects
UNION ALL SELECT 'job_parse_attempts',count(*) FROM app.ai_enhancement_attempts WHERE start_data->>'operation' IN ('job_parse','cv_tailor')
UNION ALL SELECT 'retired_operations',count(*) FROM app.ai_enhancement_operations WHERE job_id IS NOT NULL OR policy='deleted-job' OR policy LIKE '%:integration'
UNION ALL SELECT 'job_audit',count(*) FROM app.audit_events WHERE action ~ '(job|capture|tailor|application|analysis|readiness|target|integration|intake|mark_sent|retract_sent|next_action)'
UNION ALL SELECT 'capture_connections',count(*) FROM app.capture_connections;

-- These digests must match the tested predecessor. Also compare the complete
-- shared-routine digest list embedded in the migration and applied versions.
SELECT 'columns' item,md5(string_agg(table_name||':'||column_name||':'||data_type||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,''),E'\n' ORDER BY table_name,ordinal_position)) digest FROM information_schema.columns WHERE table_schema='app'
UNION ALL SELECT 'constraints',md5(string_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid),E'\n' ORDER BY conrelid::regclass::text,conname)) FROM pg_constraint WHERE connamespace='app'::regnamespace
UNION ALL SELECT 'policies',md5(string_agg(tablename||':'||policyname||':'||roles::text||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''),E'\n' ORDER BY tablename,policyname)) FROM pg_policies WHERE schemaname='app';
