-- Forward-only reduction to authentication and Base CV. Run inside one transaction.
-- Application writers must be stopped; locks also serialize already-running database calls.
SET LOCAL lock_timeout = '15s';
LOCK TABLE app.ai_enhancement_attempts, app.ai_enhancement_operations, app.ai_worker_authorization, app.analysis_components, app.analysis_runs, app.application_events, app.applications, app.audit_events, app.base_cv_lifecycle, app.base_removal_objects, app.capture_connections, app.capture_operations, app.capture_session_fences, app.capture_worker_authorization, app.career_entities, app.career_operation_results, app.career_profiles, app.claim_provenance, app.claim_relations, app.claims, app.confirmation_events, app.consent_events, app.cv_documents, app.cv_import_sessions, app.cv_import_tasks, app.cv_items, app.cv_photo_references, app.cv_sections, app.cv_versions, app.deletion_requests, app.document_language_proposals, app.editor_draft_snapshots, app.editor_photo_references, app.entity_revision_claims, app.entity_revision_entities, app.entity_revisions, app.evidence_mappings, app.idempotency_requests, app.job_answers, app.job_captures, app.job_deletion_fences, app.job_editor_documents, app.job_editor_versions, app.job_purge_rows, app.job_request_links, app.job_requirements, app.job_versions, app.job_workflow_operations, app.job_workflows, app.jobs, app.match_evidence, app.next_actions, app.photo_assets, app.photo_worker_config, app.profile_version_claims, app.profile_version_entities, app.profile_version_relations, app.profile_versions, app.readiness_runs, app.recommendation_claims, app.recommendation_requirements, app.recommendations, app.requirement_atoms, app.rule_versions, app.source_documents, app.source_spans, app.target_job_contexts, app.tenant_memberships, app.tenants, app.user_profiles, app.workspace_drafts IN ACCESS EXCLUSIVE MODE;

DO $schema$ BEGIN IF EXISTS (SELECT 1 FROM (VALUES ('app.canonical_cv_schema()','85ba285d63c27012bbfec1c449c423cd'),
('app.begin_request(uuid,text,uuid,jsonb,boolean)','4587b55eddc2cafac0b0186c8be792ab'),
('app.validate_canonical(jsonb)','5cc1ba0dcbcfabc71f04368641cd8509'),
('app.restore_cv_version(uuid,uuid,bigint,uuid)','404d12c28add95ce52bd30a1a705f9b7'),
('app.canonical_for_cv(uuid,uuid,uuid,uuid,bigint,uuid,text,jsonb)','55734ffb35efb113b8902b175cfc196b'),
('app.save_profile_checkpoint_before_base_removal(uuid,uuid,bigint,bigint,jsonb,uuid[],date)','c0b6b1c9dbcb3bbf5806791c765a51c6'),
('app.insert_cv_version(uuid,uuid,uuid,uuid,jsonb,text)','11b14ad8a69e6ed7ac530fbd87e5b84d'),
('app.protect_immutable()','df8cac22c36e65a5d03e5c80c32f332a'),
('app.remove_base_cv_before_workspace(uuid,bigint,bigint)','b46c8b166ea457cc8405c643ca67b035'),
('app.pin_cv_photo()','32321d9b95ead2c430a65310145796d6'),
('app.expire_photo_uploads(text)','97e7c1b43af1a1f59c2c0a001df663c1'),
('app.save_workspace_draft(uuid,text,uuid,bigint,jsonb,bigint)','3274f90c09ea8d87092f52cc48a7b042'),
('app.translation_source_current(uuid,jsonb,text)','4bf85c8faee036b2e91af516b1b42402'),
('app.document_language_context(uuid)','70b375f2f8faabefb863884c32b21d8b'),
('app.accept_language_proposal(uuid,uuid,bigint,jsonb,text)','a95fe0a88f4255484b535d0e500edf85'),
('app.language_proposal_command(text,uuid,jsonb,text)','e875eb8d53e56b213bb0caae67abef14'),
('app.workspace_draft_json(app.workspace_drafts)','bcbb5e6efbfdc6ca64a5fcf8dbf3617c'),
('app.list_workspace_drafts()','9994a40c44e2ccc1b60ef22063295611'),
('app.assert_workspace_resource(text,uuid)','0c857c4045d2e1dc3b7a45244a50c056'),
('app.save_workspace_draft_before_generation(uuid,text,uuid,bigint,jsonb)','6aec5c3c194bfbfe8f6d993a7556b1df'),
('app.begin_workspace_operation(uuid,text,jsonb)','ede938f2718c238dfc3df7adb07a9cf7'),
('app.remove_base_cv(uuid,bigint,bigint)','e43c12b52b8d0d9db126fb8094c989a8')) expected(signature,digest) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature))) IS DISTINCT FROM digest) THEN RAISE EXCEPTION 'UNEXPECTED_SHARED_ROUTINE_SCHEMA'; END IF; END $schema$;


DO $guard$
BEGIN
 -- A mixed source cannot be removed without deciding which user-authored facts to keep.
 IF EXISTS(SELECT 1 FROM app.source_documents WHERE (job_id IS NOT NULL OR source_kind='job') AND profile_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM app.editor_draft_snapshots s WHERE
   jsonb_path_exists(s.payload,'$.answers[*].origin') OR s.payload::text ~ '("jobId"|"job_capture"|job_source_|job:[0-9a-f-]+:answer:)' OR
   s.payload#>>'{content,translation,source,kind}'='job' OR
   jsonb_path_exists(s.payload,'$.content.sources[*] ? (@.kind == "job_capture" || @.kind == "job")'))
 OR EXISTS(SELECT 1 FROM app.profile_versions p WHERE p.canonical_json::text ~ '("jobId"|"job_capture"|job_source_|job:[0-9a-f-]+:answer:)')
 OR EXISTS(SELECT 1 FROM app.claim_provenance p JOIN app.source_spans sp ON sp.tenant_id=p.tenant_id AND sp.id=p.source_span_id JOIN app.source_documents s ON s.tenant_id=sp.tenant_id AND s.id=sp.source_document_id WHERE s.job_id IS NOT NULL OR s.source_kind='job')
 THEN RAISE EXCEPTION 'BASE_PROVENANCE_REQUIRES_RECONCILIATION'; END IF;
END $guard$;
CREATE TEMP TABLE removal_operations ON COMMIT DROP AS
 SELECT id FROM app.ai_enhancement_operations WHERE job_id IS NOT NULL OR policy='deleted-job' OR policy LIKE '%:integration' OR id IN (SELECT id FROM app.career_operation_results WHERE kind='integration')
 UNION SELECT operation_id FROM app.ai_enhancement_attempts WHERE start_data->>'operation' IN ('job_parse','cv_tailor');
CREATE TEMP TABLE removal_requests ON COMMIT DROP AS
 SELECT request_id AS id FROM app.job_request_links
 UNION SELECT id FROM app.idempotency_requests WHERE command_kind ~ '(job|capture|tailor|application|analysis|readiness|target|integration|intake|mark_sent|retract_sent|next_action)'
 OR result_refs->>'kind' IN ('job-review','job-answer','tailor-review','intake')
 OR (command_kind='save_workspace_draft' AND result_refs#>>'{value,route}' ~ '^#?/?jobs');
CREATE TEMP TABLE removal_documents ON COMMIT DROP AS SELECT id FROM app.cv_documents WHERE document_kind='job';
CREATE TEMP TABLE removal_photos ON COMMIT DROP AS
 SELECT DISTINCT p.id FROM app.photo_assets p WHERE
 (EXISTS(SELECT 1 FROM app.job_editor_versions v WHERE v.tenant_id=p.tenant_id AND v.photo_asset_id=p.id)
 OR EXISTS(SELECT 1 FROM app.cv_photo_references r JOIN app.cv_versions v ON v.id=r.cv_version_id WHERE r.asset_id=p.id AND v.document_id IN (SELECT id FROM removal_documents)))
 AND NOT EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.asset_id=p.id)
 AND NOT EXISTS(SELECT 1 FROM app.cv_photo_references r JOIN app.cv_versions v ON v.id=r.cv_version_id WHERE r.asset_id=p.id AND v.document_id NOT IN (SELECT id FROM removal_documents));


ALTER TABLE app.ai_enhancement_attempts DISABLE TRIGGER USER;

ALTER TABLE app.ai_enhancement_operations DISABLE TRIGGER USER;

ALTER TABLE app.audit_events DISABLE TRIGGER USER;

ALTER TABLE app.source_spans DISABLE TRIGGER USER;

ALTER TABLE app.cv_photo_references DISABLE TRIGGER USER;

ALTER TABLE app.cv_items DISABLE TRIGGER USER;

ALTER TABLE app.cv_sections DISABLE TRIGGER USER;

ALTER TABLE app.cv_versions DISABLE TRIGGER USER;

ALTER TABLE app.cv_documents DISABLE TRIGGER USER;

ALTER TABLE app.profile_versions DISABLE TRIGGER USER;

ALTER TABLE app.jobs DROP CONSTRAINT ck_jobs_0;

ALTER TABLE app.jobs DROP CONSTRAINT ck_jobs_1;

ALTER TABLE app.jobs DROP CONSTRAINT ck_jobs_canonical_url_hash_sha256;

ALTER TABLE app.job_captures DROP CONSTRAINT ck_job_captures_0;

ALTER TABLE app.job_captures DROP CONSTRAINT ck_job_captures_source_hash_sha256;

ALTER TABLE app.job_versions DROP CONSTRAINT ck_job_versions_0;

ALTER TABLE app.applications DROP CONSTRAINT ck_applications_2;

ALTER TABLE app.job_versions DROP CONSTRAINT ck_job_versions_1;

ALTER TABLE app.job_versions DROP CONSTRAINT ck_job_versions_2;

ALTER TABLE app.job_versions DROP CONSTRAINT ck_job_versions_3;

ALTER TABLE app.job_versions DROP CONSTRAINT ck_job_versions_content_hash_sha256;

ALTER TABLE app.job_requirements DROP CONSTRAINT ck_job_requirements_0;

ALTER TABLE app.applications DROP CONSTRAINT ck_applications_0;

ALTER TABLE app.job_requirements DROP CONSTRAINT ck_job_requirements_1;

ALTER TABLE app.job_requirements DROP CONSTRAINT ck_job_requirements_2;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT ck_requirement_atoms_0;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT ck_requirement_atoms_1;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT ck_requirement_atoms_2;

ALTER TABLE app.applications DROP CONSTRAINT ck_applications_1;

ALTER TABLE app.application_events DROP CONSTRAINT ck_application_events_0;

ALTER TABLE app.application_events DROP CONSTRAINT ck_application_events_1;

ALTER TABLE app.application_events DROP CONSTRAINT ck_application_events_2;

ALTER TABLE app.application_events DROP CONSTRAINT ck_application_events_3;

ALTER TABLE app.next_actions DROP CONSTRAINT ck_next_actions_0;

ALTER TABLE app.next_actions DROP CONSTRAINT ck_next_actions_1;

ALTER TABLE app.next_actions DROP CONSTRAINT ck_next_actions_2;

ALTER TABLE app.next_actions DROP CONSTRAINT ck_next_actions_3;

ALTER TABLE app.jobs DROP CONSTRAINT fk_jobs_tenant_id_tenants;

ALTER TABLE app.jobs DROP CONSTRAINT fk_jobs_tenant_id_id_head_version_id_job_versions;

ALTER TABLE app.job_captures DROP CONSTRAINT fk_job_captures_tenant_id_tenants;

ALTER TABLE app.job_captures DROP CONSTRAINT fk_job_captures_tenant_id_job_id_jobs;

ALTER TABLE app.job_captures DROP CONSTRAINT fk_job_captures_tenant_id_job_id_source_documen_bff5946eb00c;

ALTER TABLE app.job_captures DROP CONSTRAINT fk_job_captures_tenant_id_consent_event_id_consent_events;

ALTER TABLE app.job_versions DROP CONSTRAINT fk_job_versions_tenant_id_tenants;

ALTER TABLE app.job_versions DROP CONSTRAINT fk_job_versions_tenant_id_job_id_source_documen_1e72a16c26c1;

ALTER TABLE app.job_versions DROP CONSTRAINT fk_job_versions_tenant_id_job_id_jobs;

ALTER TABLE app.job_versions DROP CONSTRAINT fk_job_versions_tenant_id_job_id_parent_version_1eca79e66b19;

ALTER TABLE app.job_requirements DROP CONSTRAINT fk_job_requirements_tenant_id_tenants;

ALTER TABLE app.job_requirements DROP CONSTRAINT fk_job_requirements_tenant_id_job_id_source_doc_f5b3db4e77de;

ALTER TABLE app.job_requirements DROP CONSTRAINT fk_job_requirements_tenant_id_job_id_source_doc_11b7f688e0a6;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT fk_requirement_atoms_tenant_id_tenants;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT fk_requirement_atoms_tenant_id_job_id_source_do_099a7506fde7;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT fk_requirement_atoms_tenant_id_job_id_source_do_a708c78631e5;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT fk_requirement_atoms_tenant_id_job_version_id_r_c32b81b779e0;

ALTER TABLE app.applications DROP CONSTRAINT fk_applications_tenant_id_tenants;

ALTER TABLE app.applications DROP CONSTRAINT fk_applications_tenant_id_job_id_job_version_id_job_versions;

ALTER TABLE app.application_events DROP CONSTRAINT fk_application_events_tenant_id_tenants;

ALTER TABLE app.application_events DROP CONSTRAINT fk_application_events_tenant_id_job_id_applicat_b4a731f75dd8;

ALTER TABLE app.application_events DROP CONSTRAINT fk_application_events_tenant_id_job_id_job_vers_2f8638351f9d;

ALTER TABLE app.application_events DROP CONSTRAINT fk_application_events_tenant_id_application_id__3f79844a6417;

ALTER TABLE app.application_events DROP CONSTRAINT fk_application_events_tenant_id_request_id_idem_f314493594e9;

ALTER TABLE app.application_events DROP CONSTRAINT fk_application_events_actor_user_id_auth_users;

ALTER TABLE app.next_actions DROP CONSTRAINT fk_next_actions_tenant_id_tenants;

ALTER TABLE app.next_actions DROP CONSTRAINT fk_next_actions_tenant_id_application_id_applications;

ALTER TABLE app.job_requirements DROP CONSTRAINT job_requirements_priority_fraction_check;

ALTER TABLE app.job_requirements DROP CONSTRAINT job_requirements_gate_kind_check;

ALTER TABLE app.requirement_atoms DROP CONSTRAINT requirement_atoms_ordinal_check;

ALTER TABLE app.recommendations DROP CONSTRAINT ck_recommendations_0;

ALTER TABLE app.match_evidence DROP CONSTRAINT match_evidence_scope_check;

ALTER TABLE app.match_evidence DROP CONSTRAINT match_evidence_match_class_check;

ALTER TABLE app.match_evidence DROP CONSTRAINT match_evidence_fulfillment_check;

ALTER TABLE app.rule_versions DROP CONSTRAINT ck_rule_versions_0;

ALTER TABLE app.rule_versions DROP CONSTRAINT ck_rule_versions_1;

ALTER TABLE app.rule_versions DROP CONSTRAINT ck_rule_versions_content_hash_sha256;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT ck_evidence_mappings_0;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT ck_evidence_mappings_1;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT ck_evidence_mappings_content_hash_sha256;

ALTER TABLE app.match_evidence DROP CONSTRAINT ck_match_evidence_0;

ALTER TABLE app.match_evidence DROP CONSTRAINT ck_match_evidence_1;

ALTER TABLE app.match_evidence DROP CONSTRAINT ck_match_evidence_2;

ALTER TABLE app.match_evidence DROP CONSTRAINT ck_match_evidence_3;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_0;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_1;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_2;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_3;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_4;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_5;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_6;

ALTER TABLE app.match_evidence DROP CONSTRAINT fk_match_evidence_tenant_id_cv_version_id_cv_it_8d82d6a30729;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_7;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_input_fingerprint_sha256;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_result_hash_sha256;

ALTER TABLE app.analysis_runs DROP CONSTRAINT ck_analysis_runs_requirements_hash_sha256;

ALTER TABLE app.analysis_components DROP CONSTRAINT ck_analysis_components_0;

ALTER TABLE app.analysis_components DROP CONSTRAINT ck_analysis_components_1;

ALTER TABLE app.analysis_components DROP CONSTRAINT ck_analysis_components_2;

ALTER TABLE app.recommendations DROP CONSTRAINT ck_recommendations_1;

ALTER TABLE app.readiness_runs DROP CONSTRAINT ck_readiness_runs_0;

ALTER TABLE app.readiness_runs DROP CONSTRAINT ck_readiness_runs_1;

ALTER TABLE app.readiness_runs DROP CONSTRAINT ck_readiness_runs_input_hash_sha256;

ALTER TABLE app.readiness_runs DROP CONSTRAINT ck_readiness_runs_result_hash_sha256;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT fk_evidence_mappings_tenant_id_tenants;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT fk_evidence_mappings_tenant_id_profile_version__611a172aac9c;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT fk_evidence_mappings_tenant_id_cv_version_id_cv_versions;

ALTER TABLE app.evidence_mappings DROP CONSTRAINT fk_evidence_mappings_tenant_id_job_version_id_job_versions;

ALTER TABLE app.match_evidence DROP CONSTRAINT fk_match_evidence_tenant_id_tenants;

ALTER TABLE app.match_evidence DROP CONSTRAINT fk_match_evidence_tenant_id_job_version_id_evid_d617de2118a7;

ALTER TABLE app.match_evidence DROP CONSTRAINT fk_match_evidence_tenant_id_job_version_id_requ_b33365309195;

ALTER TABLE app.match_evidence DROP CONSTRAINT fk_match_evidence_tenant_id_profile_version_id__3d5f9b35c987;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_tenant_id_tenants;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_tenant_id_profile_version_id_p_02f65eea791e;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_tenant_id_cv_version_id_cv_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_tenant_id_job_version_id_job_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_tenant_id_job_version_id_evide_8c2bb61cc37a;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_rules_version_id_rule_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_dictionary_version_id_rule_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_normalizer_version_id_rule_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_matcher_version_id_rule_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_weights_version_id_rule_versions;

ALTER TABLE app.analysis_runs DROP CONSTRAINT fk_analysis_runs_date_bounds_version_id_rule_versions;

ALTER TABLE app.analysis_components DROP CONSTRAINT fk_analysis_components_tenant_id_tenants;

ALTER TABLE app.analysis_components DROP CONSTRAINT fk_analysis_components_tenant_id_job_version_id_170f69128918;

ALTER TABLE app.analysis_components DROP CONSTRAINT fk_analysis_components_tenant_id_job_version_id_a5e5e161bfba;

ALTER TABLE app.recommendations DROP CONSTRAINT fk_recommendations_tenant_id_tenants;

ALTER TABLE app.recommendations DROP CONSTRAINT fk_recommendations_tenant_id_analysis_run_id_analysis_runs;

ALTER TABLE app.readiness_runs DROP CONSTRAINT fk_readiness_runs_tenant_id_tenants;

ALTER TABLE app.readiness_runs DROP CONSTRAINT fk_readiness_runs_tenant_id_profile_version_id__eca72a48e2b6;

ALTER TABLE app.readiness_runs DROP CONSTRAINT fk_readiness_runs_tenant_id_cv_version_id_cv_versions;

ALTER TABLE app.readiness_runs DROP CONSTRAINT fk_readiness_runs_tenant_id_job_version_id_job_versions;

ALTER TABLE app.readiness_runs DROP CONSTRAINT fk_readiness_runs_rubric_version_id_rule_versions;

ALTER TABLE app.recommendation_requirements DROP CONSTRAINT fk_recommendation_requirements_tenant_id_tenants;

ALTER TABLE app.recommendation_requirements DROP CONSTRAINT fk_recommendation_requirements_tenant_id_recomm_f1936b1031ea;

ALTER TABLE app.recommendation_requirements DROP CONSTRAINT fk_recommendation_requirements_tenant_id_job_re_a407adf7e7f2;

ALTER TABLE app.recommendation_claims DROP CONSTRAINT fk_recommendation_claims_tenant_id_tenants;

ALTER TABLE app.recommendation_claims DROP CONSTRAINT fk_recommendation_claims_tenant_id_recommendati_b7021faf46bf;

ALTER TABLE app.recommendation_claims DROP CONSTRAINT fk_recommendation_claims_tenant_id_claim_id_claims;

ALTER TABLE app.target_job_contexts DROP CONSTRAINT target_job_contexts_tenant_id_snapshot_id_fkey;

ALTER TABLE app.match_evidence DROP CONSTRAINT match_evidence_evidence_role_check;

ALTER TABLE app.match_evidence DROP CONSTRAINT match_evidence_gate_state_check;

ALTER TABLE app.match_evidence DROP CONSTRAINT ck_match_gate_role;

ALTER TABLE app.target_job_contexts DROP CONSTRAINT target_job_contexts_tenant_id_job_id_job_version_id_fkey;

ALTER TABLE app.capture_connections DROP CONSTRAINT capture_connections_challenge_check;

ALTER TABLE app.target_job_contexts DROP CONSTRAINT capture_base_pair;

ALTER TABLE app.capture_worker_authorization DROP CONSTRAINT capture_worker_authorization_singleton_check;

ALTER TABLE app.capture_session_fences DROP CONSTRAINT capture_session_fences_session_hash_check;

ALTER TABLE app.capture_connections DROP CONSTRAINT capture_connections_extension_id_check;

ALTER TABLE app.capture_connections DROP CONSTRAINT capture_connections_session_hash_check;

ALTER TABLE app.capture_connections DROP CONSTRAINT capture_connections_tenant_id_fkey;

ALTER TABLE app.capture_connections DROP CONSTRAINT capture_connections_user_id_fkey;

ALTER TABLE app.capture_operations DROP CONSTRAINT capture_operations_state_check;

ALTER TABLE app.capture_operations DROP CONSTRAINT capture_operations_attempts_check;

ALTER TABLE app.capture_operations DROP CONSTRAINT capture_operations_user_id_fkey;

ALTER TABLE app.capture_operations DROP CONSTRAINT capture_operations_tenant_id_fkey;

ALTER TABLE app.capture_operations DROP CONSTRAINT capture_operations_tenant_id_job_id_fkey;

ALTER TABLE app.job_editor_documents DROP CONSTRAINT job_editor_documents_source_revision_check;

ALTER TABLE app.job_editor_documents DROP CONSTRAINT job_editor_documents_tenant_id_job_id_fkey;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_revision_check;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_reason_check;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_payload_check;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_tenant_id_job_id_document_id_fkey;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_tenant_id_document_id_parent_id_fkey;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_tenant_id_document_id_restored_from_fkey;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_tenant_id_job_id_job_version_id_fkey;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_tenant_id_request_id_fkey;

ALTER TABLE app.job_editor_versions DROP CONSTRAINT job_editor_versions_tenant_id_photo_asset_id_fkey;

ALTER TABLE app.job_workflows DROP CONSTRAINT job_workflows_revision_check;

ALTER TABLE app.job_workflows DROP CONSTRAINT job_workflows_tenant_id_job_id_fkey;

ALTER TABLE app.job_workflows DROP CONSTRAINT job_workflows_tenant_id_source_parent_id_fkey;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_workflow_operations_kind_check;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_workflow_operations_state_check;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_workflow_operations_result_check;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_workflow_operations_check;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_workflow_operations_tenant_id_job_id_fkey;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_workflow_operations_tenant_id_snapshot_id_fkey;

ALTER TABLE app.applications DROP CONSTRAINT application_current_job_document;

ALTER TABLE app.job_answers DROP CONSTRAINT job_answers_tenant_id_job_id_fkey;

ALTER TABLE app.job_editor_documents DROP CONSTRAINT job_document_locale_valid;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_requested_locale_valid;

ALTER TABLE app.job_workflow_operations DROP CONSTRAINT job_target_locale_valid;

ALTER TABLE app.job_workflows DROP CONSTRAINT job_workflows_interface_locale_check;

ALTER TABLE app.job_deletion_fences DROP CONSTRAINT job_deletion_fences_kind_check;

ALTER TABLE app.job_deletion_fences DROP CONSTRAINT job_deletion_fences_tenant_id_fkey;

ALTER TABLE app.job_purge_rows DROP CONSTRAINT job_purge_rows_tenant_id_fkey;

ALTER TABLE app.job_request_links DROP CONSTRAINT job_request_links_tenant_id_request_id_fkey;


DELETE FROM app.ai_enhancement_attempts WHERE operation_id IN (SELECT id FROM removal_operations);
DELETE FROM app.ai_enhancement_operations WHERE id IN (SELECT id FROM removal_operations);
DELETE FROM app.workspace_drafts WHERE kind NOT IN ('resume','import-review','translation-review')
 OR (kind='translation-review' AND id IN (SELECT id FROM app.document_language_proposals WHERE request#>>'{source,kind}'='job'));
UPDATE app.workspace_drafts SET value=jsonb_build_object('route','#/profile'),revision=revision+1,updated_at=now()
 WHERE kind='resume' AND coalesce(value->>'route','') !~ '^#/profile($|/)';
DELETE FROM app.career_operation_results WHERE kind='integration';
DELETE FROM app.document_language_proposals WHERE request#>>'{source,kind}'='job';
DELETE FROM app.audit_events WHERE action ~ '(job|capture|tailor|application|analysis|readiness|target|integration|intake|mark_sent|retract_sent|next_action)' OR resource_kind ~ '(job|capture|application|analysis|recommendation|readiness)' OR resource_id IN (SELECT id FROM app.job_deletion_fences);
DELETE FROM app.cv_photo_references WHERE cv_version_id IN (SELECT id FROM app.cv_versions WHERE document_id IN (SELECT id FROM removal_documents));
DELETE FROM app.cv_items WHERE cv_version_id IN (SELECT id FROM app.cv_versions WHERE document_id IN (SELECT id FROM removal_documents));
DELETE FROM app.cv_sections WHERE cv_version_id IN (SELECT id FROM app.cv_versions WHERE document_id IN (SELECT id FROM removal_documents));
UPDATE app.cv_documents SET head_version_id=NULL WHERE id IN (SELECT id FROM removal_documents);
DELETE FROM app.cv_versions WHERE document_id IN (SELECT id FROM removal_documents);
DELETE FROM app.cv_documents WHERE id IN (SELECT id FROM removal_documents);
DELETE FROM app.source_spans WHERE job_id IS NOT NULL OR source_document_id IN (SELECT id FROM app.source_documents WHERE source_kind='job' OR job_id IS NOT NULL);
DELETE FROM app.source_documents WHERE job_id IS NOT NULL OR source_kind='job';
DELETE FROM app.photo_assets WHERE id IN (SELECT id FROM removal_photos);
DELETE FROM app.idempotency_requests WHERE id IN (SELECT id FROM removal_requests);


DROP TRIGGER check_retraction ON app.application_events;

DROP TRIGGER evidence_lineage ON app.match_evidence;

DROP TRIGGER recommendation_requirement_lineage ON app.recommendation_requirements;

DROP TRIGGER recommendation_claim_lineage ON app.recommendation_claims;

DROP TRIGGER immutable_catalog ON app.rule_versions;

DROP TRIGGER initialize_job_workflow ON app.target_job_contexts;

DROP TRIGGER application_cv_metadata ON app.applications;

DROP TRIGGER event_cv_metadata ON app.application_events;

DROP TRIGGER invalidate_overwritten_job_language_proposals ON app.job_editor_versions;

DROP TRIGGER pin_job_extraction_language ON app.job_workflow_operations;

DROP TRIGGER fence_deleted_job_operation ON app.career_operation_results;

ALTER TABLE app.source_documents DROP CONSTRAINT fk_source_documents_tenant_id_job_id_jobs;

ALTER TABLE app.source_spans DROP CONSTRAINT fk_source_spans_tenant_id_job_id_source_documen_781851d4f77e;

ALTER TABLE app.cv_documents DROP CONSTRAINT fk_cv_documents_tenant_id_job_id_jobs;

ALTER TABLE app.cv_versions DROP CONSTRAINT fk_cv_versions_tenant_id_job_id_job_version_id_job_versions;

ALTER TABLE app.ai_enhancement_operations DROP CONSTRAINT ai_enhancement_operations_tenant_id_job_id_fkey;

ALTER TABLE app.workspace_drafts DROP CONSTRAINT workspace_drafts_tenant_id_submitted_job_id_fkey;

ALTER TABLE app.source_documents DROP CONSTRAINT uq_source_documents_tenant_id_job_id_id;

ALTER TABLE app.source_documents DROP CONSTRAINT ck_source_documents_0;

ALTER TABLE app.source_spans DROP CONSTRAINT uq_source_spans_tenant_id_job_id_source_document_id_id;

ALTER TABLE app.cv_documents DROP CONSTRAINT uq_cv_documents_tenant_id_job_id_id;

ALTER TABLE app.cv_documents DROP CONSTRAINT ck_cv_document_job_context;

ALTER TABLE app.cv_versions DROP CONSTRAINT ck_cv_version_job_context;

ALTER TABLE app.source_documents DROP CONSTRAINT ck_source_context;

ALTER TABLE app.ai_enhancement_operations DROP CONSTRAINT ai_enhancement_operations_check;

ALTER TABLE app.workspace_drafts DROP CONSTRAINT workspace_drafts_kind_check;

ALTER TABLE app.career_operation_results DROP CONSTRAINT career_operation_results_kind_check;

CREATE OR REPLACE FUNCTION app.validate_canonical(cv jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE ids uuid[]; ref record; record jsonb; item jsonb; linked jsonb; start_value jsonb; end_value jsonb; expected text; entity_ids text[];
BEGIN
 IF cv IS NULL OR pg_catalog.octet_length(cv::text)>1048576 OR NOT app.matches_schema(cv,app.canonical_cv_schema(),app.canonical_cv_schema()) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='CANONICAL_SCHEMA_INVALID';
 END IF;
 IF cv#>>'{document,templateVersionId}' IS NOT NULL AND cv#>>'{document,templateVersionId}' NOT IN (
   'template_folio_2_1_0', 'template_meridian_2_1_0', 'template_signal_2_1_0',
   'template_archive_2_1_0', 'template_monograph_2_1_0'
 ) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='UNREGISTERED_TEMPLATE_VERSION';
 END IF;
 ids:=app.collect_ids(cv);
 IF pg_catalog.cardinality(ids)<>(SELECT count(DISTINCT i) FROM pg_catalog.unnest(ids)i) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='DUPLICATE_CANONICAL_ID';
 END IF;
 IF pg_catalog.jsonb_array_length(cv->'generatedProse')>0 OR pg_catalog.jsonb_array_length(cv->'generations')>0 OR pg_catalog.jsonb_array_length(cv->'interviews')>0 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}')s WHERE pg_catalog.jsonb_array_length(s->'proseIds')>0) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='DEFERRED_FEATURE_NOT_IN_P0_P3';
 END IF;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'provenance') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv->'sources')s WHERE s->>'id'=record->>'sourceId') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_SOURCE'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'claims') LOOP
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(record->'provenanceIds') LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv->'provenance')p WHERE p->>'id'=item#>>'{}') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_PROVENANCE'; END IF;
   END LOOP;
 END LOOP;
 FOR ref IN SELECT * FROM app.claim_refs(cv) LOOP
   SELECT c INTO linked FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE app.canonical_id(c->>'id')=ref.claim_id;
   IF linked IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_CLAIM'; END IF;
   expected:=CASE WHEN ref.field_role IN ('nameClaimId','positioningTitleClaimIds','labelClaimId','titleClaimId','companyClaimId','institutionClaimId','qualificationClaimId','fieldClaimId') THEN 'text' WHEN ref.field_role IN ('startClaimId','endClaimId') THEN 'date' WHEN ref.field_role='locationClaimId' THEN 'location' WHEN ref.field_role='metricClaimIds' THEN 'metric' ELSE NULL END;
   IF expected IS NOT NULL AND linked->>'kind'<>expected THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='WRONG_CLAIM_KIND'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv#>'{facts,contacts}') LOOP
   SELECT c INTO linked FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'valueClaimId';
   IF linked->>'kind'<>(CASE WHEN record->>'kind'='location' THEN 'location' ELSE 'text' END) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='WRONG_CONTACT_CLAIM_KIND'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements((cv#>'{facts,employment}')||(cv#>'{facts,education}')||(cv#>'{facts,optionalEntries}')) LOOP
   SELECT c->'value' INTO start_value FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'startClaimId';
   SELECT c->'value' INTO end_value FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'endClaimId';
   IF start_value IS NOT NULL AND end_value IS NOT NULL AND ((start_value->>'year')::integer,COALESCE((start_value->>'month')::integer,1))>((end_value->>'year')::integer,COALESCE((end_value->>'month')::integer,12)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='IMPOSSIBLE_DATE_CHRONOLOGY'; END IF;
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(record->'skillIds','[]')) LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{facts,skills}')s WHERE s->>'id'=item#>>'{}') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_SKILL'; END IF;
   END LOOP;
 END LOOP;
 SELECT pg_catalog.array_agg(e->>'id') INTO entity_ids FROM pg_catalog.jsonb_array_elements((cv#>'{facts,contacts}')||(cv#>'{facts,skills}')||(cv#>'{facts,employment}')||(cv#>'{facts,education}')||(cv#>'{facts,optionalEntries}'))e;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'enrichment') LOOP
   IF NOT COALESCE(record->>'targetEntityId'=ANY(entity_ids),false) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_ENRICHMENT_TARGET'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'claimLinks') LOOP
   IF record->>'relation'='metric_of' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'fromClaimId' AND c->>'kind'='metric') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='METRIC_LINK_REQUIRES_METRIC'; END IF;
 END LOOP;
 IF pg_catalog.jsonb_array_length(cv#>'{document,sectionOrder}')<>pg_catalog.jsonb_array_length(cv#>'{document,sections}') OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(cv#>'{document,sectionOrder}')i WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}')s WHERE s->>'id'=i)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='SECTION_ORDER_NOT_PERMUTATION'; END IF;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}') LOOP
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(record->'entryIds') LOOP
     expected:=record->>'kind';
     IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements((cv#>'{facts,skills}')||(cv#>'{facts,employment}')||(cv#>'{facts,education}')||(cv#>'{facts,optionalEntries}'))e WHERE e->>'id'=item#>>'{}' AND (CASE WHEN e ? 'class' THEN e->>'class'||'_skills' WHEN e ? 'companyClaimId' THEN 'experience' WHEN e ? 'institutionClaimId' THEN 'education' ELSE e->>'kind' END)=expected) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='WRONG_SECTION_ENTRY_KIND'; END IF;
   END LOOP;
 END LOOP;
 FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(cv#>'{document,contactIds}') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{facts,contacts}')c WHERE c->>'id'=item#>>'{}' AND c->>'visibility'='export') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PRIVATE_OR_DANGLING_CONTACT'; END IF;
 END LOOP;
 IF cv#>>'{context,kind}' IS DISTINCT FROM 'base' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_CV_CONTEXT'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION app.begin_workspace_operation(p_id uuid, p_kind text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user(); o app.career_operation_results;created boolean;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 IF p_kind NOT IN ('questions','rewrite') OR octet_length(p_input::text)>16384 OR NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=(p_input->>'snapshotId')::uuid AND revision=(p_input->>'revision')::bigint) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 INSERT INTO app.career_operation_results(tenant_id,id,kind,state,input) VALUES(w,p_id,p_kind,'processing',p_input) ON CONFLICT(id) DO NOTHING;created:=FOUND;
 SELECT * INTO o FROM app.career_operation_results WHERE tenant_id=w AND id=p_id;
 IF o.id IS NULL OR o.input IS DISTINCT FROM p_input OR o.kind<>p_kind THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;
 RETURN jsonb_build_object('created',created,'operation',app.workspace_operation_json(o));
END $function$;

CREATE OR REPLACE FUNCTION app.save_workspace_draft_before_generation(p_key uuid, p_kind text, p_id uuid, p_revision bigint, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid; d app.workspace_drafts;r record;
BEGIN
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_workspace_resource(p_kind,p_id);
 IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>1000000 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE NOT k=ANY(CASE p_kind WHEN 'resume' THEN ARRAY['route'] WHEN 'import-review' THEN ARRAY['draft','selected','targets','ownerConfirmed','profileId','profileFingerprint'] WHEN 'translation-review' THEN ARRAY['values','confirmed','step','proposalId'] END)) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 IF p_kind='resume' AND (p_value->>'route' IS NULL OR p_value->>'route' !~ '^#/profile($|/)') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 SELECT * INTO r FROM app.begin_request(w,'save_workspace_draft',p_key,jsonb_build_object('kind',p_kind,'id',p_id,'revision',p_revision,'value',p_value));
 IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 SELECT * INTO d FROM app.workspace_drafts WHERE tenant_id=w AND kind=p_kind AND id=p_id FOR UPDATE;
 IF coalesce(d.revision,0)<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 INSERT INTO app.workspace_drafts(tenant_id,kind,id,revision,value) VALUES(w,p_kind,p_id,p_revision+1,p_value)
 ON CONFLICT(tenant_id,kind,id) DO UPDATE SET revision=p_revision+1,value=p_value,updated_at=now() RETURNING * INTO d;
 RETURN app.finish_request(w,r.request_id,app.workspace_draft_json(d));
END $function$;

CREATE OR REPLACE FUNCTION app.assert_workspace_resource(p_kind text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user(); valid boolean:=false;
BEGIN
 CASE p_kind
 WHEN 'resume' THEN valid:=p_id='00000000-0000-4000-8000-000000000001'::uuid;
 WHEN 'import-review' THEN valid:=EXISTS(SELECT 1 FROM app.cv_import_sessions WHERE tenant_id=w AND source_id=p_id AND state='ready' AND expires_at>now());
 WHEN 'translation-review' THEN valid:=EXISTS(SELECT 1 FROM app.document_language_proposals WHERE tenant_id=w AND id=p_id);
 ELSE valid:=false;
 END CASE;
 IF NOT valid THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION app.list_workspace_drafts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce(jsonb_agg(app.workspace_draft_json(d)),'[]') FROM (SELECT * FROM app.workspace_drafts WHERE tenant_id=app.tenant_for_user() AND kind IN ('resume','translation-review') ORDER BY updated_at DESC LIMIT 100) d
$function$;

CREATE OR REPLACE FUNCTION app.canonical_for_cv(workspace uuid, version_id uuid, document_id uuid, new_version_id uuid, sequence_no bigint, parent uuid, locale text, layout jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE facts jsonb;
BEGIN
 PERFORM app.assert_profile_usable(workspace,version_id);
 SELECT v.canonical_json INTO facts FROM app.profile_versions v WHERE v.tenant_id=workspace AND v.id=version_id;
 RETURN pg_catalog.jsonb_build_object('schemaVersion','1.0.0','snapshotId',app.portable_id(new_version_id),'baseCvId',app.portable_id(document_id),
   'version',sequence_no,'parentSnapshotId',app.portable_id(parent),'createdAt',pg_catalog.transaction_timestamp(),'locale',locale,
   'sources',facts->'sources','provenance',facts->'provenance','claims',facts->'claims','facts',facts->'facts',
   'claimLinks',facts->'claimLinks','enrichment',facts->'enrichment','interviews','[]'::jsonb,'generatedProse','[]'::jsonb,'generations','[]'::jsonb,
   'document',layout,'context',pg_catalog.jsonb_build_object('kind','base'));
END $function$;

CREATE OR REPLACE FUNCTION app.language_proposal_command(p_action text, p_id uuid, p_input jsonb DEFAULT '{}'::jsonb, p_secret text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user();p app.document_language_proposals;source jsonb;created boolean:=false;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 IF p_id IS NULL OR p_input IS NULL OR octet_length(p_input::text)>524288 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT * INTO p FROM app.document_language_proposals WHERE tenant_id=w AND id=p_id FOR UPDATE;
 IF p_action='start' THEN
  PERFORM app.require_ai_worker(p_secret);
  IF p.id IS NOT NULL THEN IF p.request IS DISTINCT FROM p_input THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;ELSE
   IF app.canonical_content_locale(p_input->>'sourceLocale') IS NULL OR app.canonical_content_locale(p_input->>'targetLocale') IS NULL OR p_input->>'sourceLocale'=p_input->>'targetLocale' OR NOT app.translation_source_current(w,p_input->'source',p_input->>'sourceLocale') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
   IF (SELECT count(*) FROM app.document_language_proposals WHERE tenant_id=w AND state IN ('pending','processing','ready'))>=5 THEN RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='COMMAND_IN_PROGRESS';END IF;
   INSERT INTO app.document_language_proposals(tenant_id,id,request,state) VALUES(w,p_id,p_input,'pending') RETURNING * INTO p;
  END IF;
 END IF;
 IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF p_action='cancel' AND p.state='accepted' THEN RETURN app.language_proposal_json(p);END IF;
 IF p_action='cancel' THEN UPDATE app.document_language_proposals SET state='cancelled',output=NULL,review=NULL,work_id=NULL WHERE id=p.id AND state<>'accepted' RETURNING * INTO p;RETURN app.language_proposal_json(p);END IF;
 IF p.state IN ('pending','processing','ready') AND NOT app.translation_source_current(w,p.request->'source',p.request->>'sourceLocale') THEN UPDATE app.document_language_proposals SET state='stale',output=NULL,review=NULL,work_id=NULL WHERE id=p.id RETURNING * INTO p;END IF;
 IF p.state='processing' AND p.started_at<now()-interval '3 minutes' THEN UPDATE app.document_language_proposals SET state='unknown',work_id=NULL WHERE id=p.id RETURNING * INTO p;END IF;
 IF p_action IN ('get','start') THEN RETURN app.language_proposal_json(p);END IF;
 IF p_action='work' THEN
  PERFORM app.require_ai_worker(p_secret);
  IF p.state NOT IN ('pending','ready') OR (p_input->>'expectedStep')::integer<>p.step THEN RETURN jsonb_build_object('created',false,'proposal',app.language_proposal_json(p));END IF;
  source:=p.request->'source';
  INSERT INTO app.ai_enhancement_operations(tenant_id,id,snapshot_id,revision,target_id,policy) VALUES(w,(p_input->>'operationId')::uuid,(source->>'currentId')::uuid,(source->>'revision')::bigint,'P09:'||p.id::text,'cv-translation/1') ON CONFLICT(id) DO NOTHING;
  created:=FOUND;
  IF NOT created THEN RETURN jsonb_build_object('created',false,'proposal',app.language_proposal_json(p));END IF;
  UPDATE app.document_language_proposals SET state='processing',work_id=(p_input->>'operationId')::uuid,started_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
  RETURN jsonb_build_object('created',true,'proposal',app.language_proposal_json(p));
 ELSIF p_action='settle' THEN
  PERFORM app.require_ai_worker(p_secret);
  IF p.state<>'processing' OR p.work_id IS DISTINCT FROM (p_input->>'operationId')::uuid THEN RETURN app.language_proposal_json(p);END IF;
  IF p_input->>'error' IS NOT NULL THEN UPDATE app.document_language_proposals SET state='failed',work_id=NULL WHERE id=p.id RETURNING * INTO p;
  ELSE UPDATE app.document_language_proposals SET state=CASE WHEN (p_input->>'complete')::boolean THEN 'ready' ELSE 'pending' END,step=step+1,output=p_input->'output',work_id=NULL WHERE id=p.id RETURNING * INTO p;END IF;
 ELSIF p_action='review' THEN
  IF p.state<>'ready' OR p.review_revision<>(p_input->>'expectedRevision')::bigint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
  UPDATE app.document_language_proposals SET review=p_input->'review',review_revision=review_revision+1 WHERE id=p.id RETURNING * INTO p;
 ELSE RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 RETURN app.language_proposal_json(p);
END $function$;

CREATE OR REPLACE FUNCTION app.remove_base_cv_before_workspace(p_key uuid, p_expected_revision bigint, p_expected_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user(); l app.base_cv_lifecycle;r record;t text;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 INSERT INTO app.base_cv_lifecycle(tenant_id) VALUES(w) ON CONFLICT DO NOTHING;
 SELECT * INTO l FROM app.base_cv_lifecycle WHERE tenant_id=w FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(w,'remove_base_cv',p_key,jsonb_build_object('revision',p_expected_revision,'generation',p_expected_generation));
 IF r.cached IS NOT NULL THEN
  IF (r.cached->>'generation')::bigint<>l.generation OR (r.cached->>'revision')::bigint<>l.revision_floor OR EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=w) THEN
   RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE';END IF;
  RETURN (app.load_base_state()-'snapshot')||jsonb_build_object('removed',true);
 END IF;
 IF p_expected_revision IS NULL OR p_expected_generation IS NULL OR p_expected_generation<>l.generation OR p_expected_revision<>greatest(l.revision_floor,coalesce((app.current_base_snapshot(w)).revision,0)) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 UPDATE app.base_cv_lifecycle SET purge_transaction=pg_current_xact_id() WHERE tenant_id=w;
 INSERT INTO app.base_removal_objects(tenant_id,bucket,object_key)
 SELECT w,bucket,object_key FROM app.source_documents WHERE tenant_id=w AND profile_id IS NOT NULL AND bucket='cv-imports' AND object_key IS NOT NULL ON CONFLICT DO NOTHING;
 INSERT INTO app.base_removal_objects(tenant_id,bucket,object_key)
 SELECT w,'cv-photos',p.object_key FROM app.photo_assets p WHERE p.tenant_id=w ON CONFLICT DO NOTHING;
 DELETE FROM app.document_language_proposals WHERE tenant_id=w AND request#>>'{source,kind}'='base';
 UPDATE app.ai_enhancement_operations SET base_removed=true,snapshot_id=NULL,revision=NULL,import_id=NULL WHERE tenant_id=w;
 -- Result refs can contain whole historical draft payloads. Keep only the
 -- non-content idempotency identity/hash and expire these command families.
 UPDATE app.idempotency_requests SET result_refs='{}'::jsonb,expires_at=transaction_timestamp() WHERE tenant_id=w AND command_kind IN (
 'save_base_draft','restore_base_draft','begin_cv_import','save_import_review_draft','save_base_language','restore_base_language','publish_profile','save_profile_checkpoint','save_cv_checkpoint','write_base_language','save_base_cv_checkpoint','restore_cv_version');
 DELETE FROM app.cv_import_sessions WHERE tenant_id=w;
 DELETE FROM app.editor_photo_references WHERE tenant_id=w;
 DELETE FROM app.editor_draft_snapshots WHERE tenant_id=w;
 -- Ordered Base canonical closure.
 FOREACH t IN ARRAY ARRAY['cv_photo_references','cv_items','cv_sections'] LOOP
  EXECUTE format('DELETE FROM app.%I WHERE tenant_id=$1',t) USING w;
 END LOOP;
 UPDATE app.cv_documents SET head_version_id=NULL WHERE tenant_id=w;
 DELETE FROM app.cv_versions WHERE tenant_id=w;
 DELETE FROM app.cv_documents WHERE tenant_id=w;
 UPDATE app.career_profiles SET head_version_id=NULL WHERE tenant_id=w;
 FOREACH t IN ARRAY ARRAY['profile_version_relations','profile_version_claims','profile_version_entities','profile_versions','entity_revision_entities','entity_revision_claims','entity_revisions','career_entities','claim_relations','claim_provenance','confirmation_events','claims'] LOOP
  EXECUTE format('DELETE FROM app.%I WHERE tenant_id=$1',t) USING w;
 END LOOP;
 DELETE FROM app.source_spans WHERE tenant_id=w AND profile_id IS NOT NULL;
 DELETE FROM app.source_documents WHERE tenant_id=w AND profile_id IS NOT NULL;
 DELETE FROM app.career_profiles WHERE tenant_id=w;
 DELETE FROM app.photo_assets p WHERE tenant_id=w;
 UPDATE app.base_cv_lifecycle SET generation=generation+1,revision_floor=greatest(revision_floor,p_expected_revision)+1,purge_transaction=NULL WHERE tenant_id=w;
 PERFORM app.audit(w,'editor.remove','tenant',w);
 RETURN app.finish_request(w,r.request_id,(app.load_base_state()-'snapshot')||jsonb_build_object('removed',true));
END $function$;

CREATE OR REPLACE FUNCTION app.remove_base_cv(p_key uuid, p_expected_revision bigint, p_expected_generation bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user();v jsonb;previous_generation bigint;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 previous_generation:=(app.load_base_state()->>'generation')::bigint;
 v:=app.remove_base_cv_before_workspace(p_key,p_expected_revision,p_expected_generation);
 IF (v->>'generation')::bigint=previous_generation THEN RETURN v;END IF; UPDATE app.base_cv_lifecycle SET initial_import_id=NULL WHERE tenant_id=w;
 DELETE FROM app.workspace_drafts WHERE tenant_id=w AND kind NOT IN ('resume');
 DELETE FROM app.career_operation_results WHERE tenant_id=w;

 UPDATE app.idempotency_requests SET result_refs='{}',expires_at=now() WHERE tenant_id=w AND command_kind IN ('save_workspace_draft');
 RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION app.canonical_cv_schema() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$ SELECT $schema${"$id":"https://schemas.example.invalid/cv/v1/schema.json","type":"object","$defs":{"id":{"type":"string","pattern":"^[a-z][a-z0-9_-]{1,79}$"},"claim":{"type":"object","allOf":[{"if":{"properties":{"kind":{"const":"text"}}},"then":{"properties":{"value":{"type":"string","maxLength":20000,"minLength":1}}}},{"if":{"properties":{"kind":{"const":"date"}}},"then":{"properties":{"value":{"$ref":"#/$defs/partialDate"}}}},{"if":{"properties":{"kind":{"const":"location"}}},"then":{"properties":{"value":{"$ref":"#/$defs/location"}}}},{"if":{"properties":{"kind":{"const":"metric"}}},"then":{"properties":{"value":{"$ref":"#/$defs/metric"}}}},{"if":{"properties":{"status":{"enum":["user_confirmed","externally_verified"]}}},"then":{"required":["confirmedAt","confirmationActor"]}},{"if":{"properties":{"status":{"const":"externally_verified"}}},"then":{"required":["verificationMethod"]}}],"required":["id","kind","value","status","provenanceIds"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"enum":["text","date","location","metric"]},"value":{},"status":{"enum":["extracted_unconfirmed","user_confirmed","externally_verified","suggested","rejected"]},"confirmedAt":{"type":"string","format":"date-time"},"provenanceIds":{"type":"array","items":{"$ref":"#/$defs/id"},"minItems":1,"uniqueItems":true},"confirmationActor":{"$ref":"#/$defs/id"},"verificationMethod":{"type":"string","maxLength":20000,"minLength":1}},"additionalProperties":false},"prose":{"type":"object","required":["id","kind","text","claimIds","origin","approval","locale","generationId"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"enum":["summary","bullet","scope","other"]},"text":{"type":"string","maxLength":20000,"minLength":1},"locale":{"enum":["ro","en"]},"origin":{"enum":["ai_generated","user_authored"]},"approval":{"enum":["pending","approved","rejected"]},"claimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"minItems":1,"uniqueItems":true},"generationId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]}},"additionalProperties":false},"skill":{"type":"object","required":["id","class","labelClaimId","evidenceClaimIds"],"properties":{"id":{"$ref":"#/$defs/id"},"class":{"enum":["professional","technical"]},"conceptId":{"type":"string","maxLength":20000,"minLength":1},"labelClaimId":{"$ref":"#/$defs/id"},"evidenceClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true}},"additionalProperties":false},"metric":{"type":"object","required":["value","unit","qualifier"],"properties":{"unit":{"type":"string","maxLength":20000,"minLength":1},"value":{"type":"number"},"period":{"type":"string","maxLength":20000,"minLength":1},"baseline":{"type":"number"},"qualifier":{"enum":["exact","approximate","range"]},"upperValue":{"type":"number"}},"additionalProperties":false},"source":{"type":"object","required":["id","kind","label","capturedAt"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"enum":["upload","manual","interview","external_document"]},"label":{"type":"string","maxLength":20000,"minLength":1},"sha256":{"type":"string","pattern":"^[a-f0-9]{64}$"},"capturedAt":{"type":"string","format":"date-time"},"extractorVersion":{"type":"string","maxLength":20000,"minLength":1}},"additionalProperties":false},"contact":{"type":"object","required":["id","kind","valueClaimId","visibility"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"enum":["email","phone","location","address","linkedin","github","portfolio","other"]},"label":{"type":"string","maxLength":20000,"minLength":1},"visibility":{"enum":["private","export"]},"valueClaimId":{"$ref":"#/$defs/id"}},"additionalProperties":false},"section":{"type":"object","required":["id","kind","label","entryIds","proseIds","visible"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"enum":["identity","summary","professional_skills","technical_skills","experience","education","certifications","projects","achievements","portfolio","languages","leadership","publications","volunteering","custom"]},"label":{"type":"string","maxLength":20000,"minLength":1},"visible":{"type":"boolean"},"entryIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"proseIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true}},"additionalProperties":false},"location":{"type":"object","required":[],"properties":{"city":{"type":"string","maxLength":20000,"minLength":1},"address":{"type":"string","maxLength":20000,"minLength":1},"countryCode":{"type":"string","pattern":"^[A-Z]{2}$"}},"additionalProperties":false},"claimLink":{"type":"object","required":["id","fromClaimId","toClaimId","relation"],"properties":{"id":{"$ref":"#/$defs/id"},"relation":{"enum":["metric_of","supports","contribution_to","scope_of"]},"toClaimId":{"$ref":"#/$defs/id"},"fromClaimId":{"$ref":"#/$defs/id"}},"additionalProperties":false},"education":{"type":"object","required":["id","institutionClaimId","qualificationClaimId","fieldClaimId","locationClaimId","startClaimId","endClaimId","detailClaimIds"],"properties":{"id":{"$ref":"#/$defs/id"},"endClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"fieldClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"startClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"detailClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"locationClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"institutionClaimId":{"$ref":"#/$defs/id"},"qualificationClaimId":{"$ref":"#/$defs/id"}},"additionalProperties":false},"interview":{"type":"object","required":["id","question","answerClaimIds","targetClaimIds","state"],"properties":{"id":{"$ref":"#/$defs/id"},"state":{"enum":["asked","answered_unconfirmed","confirmed","dismissed"]},"question":{"type":"string","maxLength":20000,"minLength":1},"answerClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"targetClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true}},"additionalProperties":false},"employment":{"type":"object","allOf":[{"if":{"properties":{"ongoing":{"const":true}}},"then":{"properties":{"endClaimId":{"type":"null"}}}}],"required":["id","titleClaimId","companyClaimId","locationClaimId","startClaimId","endClaimId","ongoing","scopeClaimIds","responsibilityClaimIds","accomplishmentClaimIds","metricClaimIds","skillIds"],"properties":{"id":{"$ref":"#/$defs/id"},"ongoing":{"type":"boolean"},"skillIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"endClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"startClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"titleClaimId":{"$ref":"#/$defs/id"},"scopeClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"companyClaimId":{"$ref":"#/$defs/id"},"metricClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"locationClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"accomplishmentClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"responsibilityClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true}},"additionalProperties":false},"enrichment":{"type":"object","required":["id","targetEntityId","attribute","claimIds"],"properties":{"id":{"$ref":"#/$defs/id"},"claimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"minItems":1,"uniqueItems":true},"attribute":{"enum":["systems","technology","individual_contribution","impact_time","impact_cost","impact_accuracy","impact_revenue","impact_productivity","scale","stakeholders","budget","team","project"]},"targetEntityId":{"$ref":"#/$defs/id"}},"additionalProperties":false},"generation":{"type":"object","required":["id","provider","modelRequested","modelResolved","promptVersion","inputHash","createdAt"],"properties":{"id":{"$ref":"#/$defs/id"},"provider":{"type":"string","maxLength":20000,"minLength":1},"createdAt":{"type":"string","format":"date-time"},"inputHash":{"type":"string","pattern":"^[a-f0-9]{64}$"},"modelResolved":{"type":"string","maxLength":20000,"minLength":1},"promptVersion":{"type":"string","maxLength":20000,"minLength":1},"modelRequested":{"type":"string","maxLength":20000,"minLength":1}},"additionalProperties":false},"provenance":{"type":"object","required":["id","sourceId","locator"],"properties":{"id":{"$ref":"#/$defs/id"},"excerpt":{"type":"string","maxLength":20000,"minLength":1},"locator":{"type":"string","maxLength":20000,"minLength":1},"sourceId":{"$ref":"#/$defs/id"},"extractionConfidence":{"type":"number","maximum":1,"minimum":0}},"additionalProperties":false},"partialDate":{"type":"object","required":["year"],"properties":{"year":{"type":"integer","maximum":2200,"minimum":1900},"month":{"type":"integer","maximum":12,"minimum":1}},"additionalProperties":false},"optionalEntry":{"type":"object","required":["id","kind","labelClaimId","detailClaimIds","startClaimId","endClaimId","linkClaimIds","metricClaimIds"],"properties":{"id":{"$ref":"#/$defs/id"},"kind":{"enum":["certifications","projects","achievements","portfolio","languages","leadership","publications","volunteering","custom"]},"endClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"labelClaimId":{"$ref":"#/$defs/id"},"linkClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"startClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"detailClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"metricClaimIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true}},"additionalProperties":false}},"title":"CV Maker canonical snapshot v1 \u2014 discovery proposal","$schema":"https://json-schema.org/draft/2020-12/schema","required":["schemaVersion","snapshotId","baseCvId","version","parentSnapshotId","createdAt","locale","sources","provenance","claims","facts","claimLinks","enrichment","interviews","generatedProse","generations","document","context"],"properties":{"facts":{"type":"object","required":["nameClaimId","positioningTitleClaimIds","contacts","skills","employment","education","optionalEntries"],"properties":{"skills":{"type":"array","items":{"$ref":"#/$defs/skill"}},"contacts":{"type":"array","items":{"$ref":"#/$defs/contact"}},"education":{"type":"array","items":{"$ref":"#/$defs/education"}},"employment":{"type":"array","items":{"$ref":"#/$defs/employment"}},"nameClaimId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"optionalEntries":{"type":"array","items":{"$ref":"#/$defs/optionalEntry"}},"positioningTitleClaimIds":{"type":"array","items":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"maxItems":2,"minItems":2}},"additionalProperties":false},"claims":{"type":"array","items":{"$ref":"#/$defs/claim"}},"locale":{"enum":["ro","en"]},"context":{"type":"object","required":["kind"],"properties":{"kind":{"const":"base"}},"additionalProperties":false},"sources":{"type":"array","items":{"$ref":"#/$defs/source"}},"version":{"type":"integer","minimum":1},"baseCvId":{"$ref":"#/$defs/id"},"document":{"type":"object","required":["sectionOrder","sections","templateVersionId","contactIds"],"properties":{"photo":{"oneOf":[{"type":"null"},{"type":"object","required":["assetId","crop","shape","visible"],"properties":{"crop":{"type":"object","required":["version","centerX","centerY","zoom"],"properties":{"zoom":{"type":"number","maximum":3,"minimum":1},"centerX":{"type":"number","maximum":1,"minimum":0},"centerY":{"type":"number","maximum":1,"minimum":0},"version":{"const":1}},"additionalProperties":false},"shape":{"enum":["circle","square"]},"assetId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"visible":{"type":"boolean"}},"additionalProperties":false}]},"sections":{"type":"array","items":{"$ref":"#/$defs/section"}},"photoMode":{"enum":["base"]},"contactIds":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"sectionOrder":{"type":"array","items":{"$ref":"#/$defs/id"},"uniqueItems":true},"templateVersionId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]}},"additionalProperties":false},"createdAt":{"type":"string","format":"date-time"},"claimLinks":{"type":"array","items":{"$ref":"#/$defs/claimLink"}},"enrichment":{"type":"array","items":{"$ref":"#/$defs/enrichment"}},"interviews":{"type":"array","items":{"$ref":"#/$defs/interview"}},"provenance":{"type":"array","items":{"$ref":"#/$defs/provenance"}},"snapshotId":{"$ref":"#/$defs/id"},"generations":{"type":"array","items":{"$ref":"#/$defs/generation"}},"schemaVersion":{"const":"1.0.0"},"generatedProse":{"type":"array","items":{"$ref":"#/$defs/prose"}},"parentSnapshotId":{"oneOf":[{"$ref":"#/$defs/id"},{"type":"null"}]}},"additionalProperties":false}$schema$::jsonb $function$;

CREATE OR REPLACE FUNCTION app.begin_request(workspace uuid, command text, request_key uuid, body jsonb, allow_deleting boolean DEFAULT false)
 RETURNS TABLE(request_id uuid, cached jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE actor uuid; principal text; fingerprint bytea; existing app.idempotency_requests;
BEGIN
  actor := app.assert_tenant(workspace,allow_deleting);
  IF request_key IS NULL OR request_key='00000000-0000-0000-0000-000000000000'::uuid
     OR body IS NULL OR pg_catalog.octet_length(body::text)>1048576 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='INVALID_COMMAND_ENVELOPE';
  END IF;
  principal := 'user:'||actor::text;
  fingerprint := app.hash_json(pg_catalog.jsonb_build_object('schemaVersion','1',
    'command',command,'tenant',workspace,'principal',principal,'body',body));
  INSERT INTO app.idempotency_requests
    (tenant_id,principal_key,command_kind,key_digest,request_hash,state,result_refs,
     expires_at,request_schema_version)
  VALUES (workspace,principal,command,pg_catalog.sha256(pg_catalog.uuid_send(request_key)),
    fingerprint,'in_progress','{}',pg_catalog.transaction_timestamp()+interval '7 days','1')
  ON CONFLICT (tenant_id,principal_key,command_kind,key_digest) DO NOTHING
  RETURNING id INTO request_id;
  IF request_id IS NOT NULL THEN
    cached := NULL;
 RETURN NEXT;
    RETURN;
  END IF;
  SELECT r.* INTO STRICT existing FROM app.idempotency_requests r
    WHERE r.tenant_id=workspace AND r.principal_key=principal AND r.command_kind=command
      AND r.key_digest=pg_catalog.sha256(pg_catalog.uuid_send(request_key)) FOR UPDATE;
  IF existing.request_hash<>fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='IDEMPOTENCY_BODY_MISMATCH';
  END IF;
  IF existing.expires_at<=pg_catalog.transaction_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='PT410', MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE';
  END IF;
  IF existing.state NOT IN ('completed','accepted') THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='COMMAND_IN_PROGRESS';
  END IF;
  request_id := existing.id;
  cached := existing.result_refs;
 RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION app.restore_cv_version(p_key uuid, p_document uuid, p_expected_revision bigint, p_historical_version uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user();r record;old_version app.cv_versions;document app.cv_documents;version uuid;
BEGIN
 SELECT * INTO document FROM app.cv_documents WHERE tenant_id=w AND id=p_document FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(w,'restore_cv_version',p_key,jsonb_build_object('document',p_document,'expectedRevision',p_expected_revision,'historicalVersion',p_historical_version));
 IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 SELECT * INTO old_version FROM app.cv_versions WHERE tenant_id=w AND id=p_historical_version AND document_id=p_document;
 IF old_version.id IS NULL OR document.id IS NULL OR document.document_kind<>'base' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESTORE_LINEAGE_FORBIDDEN';END IF;
 PERFORM app.assert_profile_usable(w,old_version.profile_version_id);
 IF document.draft_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 version:=app.insert_cv_version(w,p_document,old_version.profile_version_id,r.request_id,old_version.canonical_json->'document',old_version.locale);
 PERFORM app.audit(w,'cv.restore','cv_version',version);
 RETURN app.finish_request(w,r.request_id,jsonb_build_object('cvVersionId',version,'documentId',p_document,'revision',document.draft_revision+1,'restoredFrom',p_historical_version));
END $function$;

CREATE OR REPLACE FUNCTION app.protect_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP='DELETE' AND pg_catalog.has_table_privilege(current_user,TG_RELID,'DELETE') THEN
  -- Preserve the separate existing account-removal contract.
  IF EXISTS(SELECT 1 FROM app.tenants WHERE id=OLD.tenant_id AND state='deleting') THEN RETURN OLD; END IF;
  IF TG_TABLE_SCHEMA='app' AND TG_TABLE_NAME=ANY(ARRAY[
   'source_spans','claims','claim_provenance','confirmation_events',
   'entity_revisions','entity_revision_claims','entity_revision_entities',
   'profile_versions','profile_version_entities','profile_version_claims','profile_version_relations',
   'claim_relations','cv_versions','cv_sections','cv_items','cv_photo_references',
   'editor_draft_snapshots',
   'recommendations'
  ]) AND EXISTS(SELECT 1 FROM app.base_cv_lifecycle l
   WHERE l.tenant_id=OLD.tenant_id AND l.purge_transaction=pg_catalog.pg_current_xact_id()) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_RECORD';
END $function$;

CREATE OR REPLACE FUNCTION app.accept_language_proposal(p_id uuid, p_key uuid, p_review_revision bigint, p_payload jsonb, p_variant text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user();p app.document_language_proposals;result jsonb;source jsonb;provenance jsonb;current jsonb;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 SELECT * INTO p FROM app.document_language_proposals WHERE tenant_id=w AND id=p_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF p.state='accepted' THEN RETURN p.accepted;END IF;
 IF p.state<>'ready' OR p.review_revision<>p_review_revision OR NOT app.translation_source_current(w,p.request->'source',p.request->>'sourceLocale') OR p_payload#>'{content,translation,source}' IS DISTINCT FROM p.request->'source' OR p_payload#>>'{content,documentLocale}' IS DISTINCT FROM p.request->>'targetLocale' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 source:=p.request->'source';
  result:=app.write_base_language(p_key,p_variant,(p.request->>'targetRevision')::bigint,p_payload,NULL,true);
  result:=jsonb_build_object('kind','base','variantId',p_variant,'id',result->>'id','revision',result->'revision');
 UPDATE app.document_language_proposals SET state='accepted',accepted=result,output=NULL,review=NULL WHERE id=p.id;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION app.translation_source_current(w uuid, s jsonb, source_locale text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE result boolean;
BEGIN
 IF s->>'kind'='base' THEN
  SELECT EXISTS(SELECT 1 FROM app.editor_draft_snapshots b WHERE b.tenant_id=w AND b.variant_id='default' AND b.id=(s->>'currentId')::uuid AND b.revision=(s->>'revision')::bigint AND b.payload#>>'{content,id}'=s->>'documentId' AND b.reason IN ('save','restore') AND app.document_content_locale(b.payload)=source_locale AND NOT b.payload->'content' ? 'translation' AND encode(app.hash_json(b.payload),'hex')=s->>'fingerprint' AND b.id=(SELECT id FROM app.current_base_snapshot(w))) INTO result;
 ELSE RETURN false;END IF;
 RETURN coalesce(result,false);
END $function$;

CREATE OR REPLACE FUNCTION app.workspace_draft_json(d app.workspace_drafts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('id',d.id,'kind',d.kind,'revision',d.revision,'value',d.value,'updatedAt',d.updated_at)
$function$;

CREATE OR REPLACE FUNCTION app.document_language_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid:=app.tenant_for_user();source jsonb;versions jsonb;v app.editor_draft_snapshots;
BEGIN
  SELECT * INTO v FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id='default' ORDER BY revision DESC LIMIT 1;
  IF v.id IS NOT NULL THEN source:=app.editor_snapshot_json(v)||jsonb_build_object('documentId',v.payload#>>'{content,id}','fingerprint',encode(app.hash_json(v.payload),'hex'),'locale',app.document_content_locale(v.payload));END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('variantId',s.variant_id,'id',s.id,'revision',s.revision,'locale',s.payload#>>'{content,documentLocale}','translation',s.payload#>'{content,translation}')),'[]') INTO versions FROM (SELECT DISTINCT ON(variant_id) * FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id<>'default' ORDER BY variant_id,revision DESC) s WHERE s.payload#>>'{content,translation,source,documentId}'=v.payload#>>'{content,id}';
 RETURN jsonb_build_object('source',source,'versions',versions);
END $function$;

CREATE OR REPLACE FUNCTION app.expire_photo_uploads(p_worker_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE workspace uuid:=app.tenant_for_user(); row app.photo_assets; result jsonb:='[]'::jsonb;
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 FOR row IN SELECT p.* FROM app.photo_assets p WHERE p.tenant_id=workspace AND
  (p.state='purge_pending' OR (p.state IN ('reserved','ready') AND p.created_at<transaction_timestamp()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM app.cv_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)))
  ORDER BY p.created_at LIMIT 10 FOR UPDATE SKIP LOCKED
 LOOP
  IF row.state<>'purge_pending' AND
   (EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.tenant_id=row.tenant_id AND r.asset_id=row.id)
    OR EXISTS(SELECT 1 FROM app.cv_photo_references r WHERE r.tenant_id=row.tenant_id AND r.asset_id=row.id)) THEN
   CONTINUE;
  END IF;
  UPDATE app.photo_assets SET state='purge_pending',deleted_at=coalesce(deleted_at,transaction_timestamp()) WHERE id=row.id;
  result:=result||jsonb_build_array(app.photo_manifest(row));
 END LOOP;
 RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION app.save_workspace_draft(p_key uuid, p_kind text, p_id uuid, p_revision bigint, p_value jsonb, p_generation bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w uuid;
BEGIN
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 PERFORM app.assert_workspace_resource(p_kind,p_id);
 IF p_kind NOT IN ('resume') AND
    (p_generation IS NULL OR p_generation IS DISTINCT FROM (app.load_base_state()->>'generation')::bigint)
 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='BASE_GENERATION_CONFLICT'; END IF;
 RETURN app.save_workspace_draft_before_generation(p_key,p_kind,p_id,p_revision,p_value);
END $function$;

CREATE OR REPLACE FUNCTION app.save_profile_checkpoint_before_base_removal(p_key uuid, p_profile uuid, p_expected_revision bigint, p_expected_base_revision bigint, p_cv jsonb, p_confirm_claim_ids uuid[], p_as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_workspace uuid:=app.tenant_for_user();v_actor uuid:=app.require_user();r record;
 v_profile uuid;v_base app.cv_documents;v_head uuid;v_sequence bigint;v_version uuid:=pg_catalog.gen_random_uuid();
 v_cv_version uuid;v_record jsonb;v_source app.source_documents;v_span app.source_spans;v_claim app.claims;
 v_confirmation app.confirmation_events;v_claims jsonb:='[]';v_projection jsonb;v_entities jsonb:='[]';v_entity jsonb;
 v_entity_id uuid;v_revision uuid;v_kind text;v_ordinal integer:=0;v_relation app.claim_relations;v_ref text;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'save_profile_checkpoint',p_key,pg_catalog.jsonb_build_object(
 'profile',p_profile,'expectedRevision',p_expected_revision,'expectedBaseRevision',p_expected_base_revision,
 'cv',p_cv,'confirmClaimIds',p_confirm_claim_ids,'asOf',p_as_of));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 PERFORM app.validate_canonical(p_cv);
 IF p_cv#>>'{context,kind}'<>'base' OR p_as_of IS NULL OR extract(year FROM p_as_of) NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='BASE_PROFILE_INPUT_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(p_confirm_claim_ids)c WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_cv->'claims')i WHERE app.canonical_id(i->>'id')=c)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CONFIRMATION_OUTSIDE_INPUT'; END IF;
 v_profile:=app.ensure_profile(v_workspace,p_profile);
 SELECT p.head_version_id,p.draft_revision+1 INTO v_head,v_sequence FROM app.career_profiles p WHERE p.tenant_id=v_workspace AND p.id=v_profile;
 IF v_sequence-1 IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 INSERT INTO app.cv_documents(tenant_id,profile_id,document_kind,draft_revision,draft_payload)
 VALUES(v_workspace,v_profile,'base',0,'{}') ON CONFLICT(tenant_id,profile_id) WHERE document_kind='base' DO NOTHING;
 SELECT * INTO v_base FROM app.cv_documents WHERE tenant_id=v_workspace AND profile_id=v_profile AND document_kind='base' FOR UPDATE;
 IF v_base.draft_revision IS DISTINCT FROM p_expected_base_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='BASE_VERSION_CONFLICT'; END IF;
 -- Immutable source content and locator identity; manifest state may evolve separately later.
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'sources') LOOP
   INSERT INTO app.source_documents(id,tenant_id,profile_id,source_kind,content_hash,state,metadata)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,
     CASE v_record->>'kind' WHEN 'external_document' THEN 'own_profile' ELSE v_record->>'kind' END,
     CASE WHEN v_record ? 'sha256' THEN pg_catalog.decode(v_record->>'sha256','hex') ELSE app.hash_json(v_record) END,
     CASE WHEN v_record->>'kind'='upload' THEN 'reserved' ELSE 'available' END,v_record) ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_source FROM app.source_documents WHERE id=app.canonical_id(v_record->>'id');
   IF v_source.tenant_id<>v_workspace OR v_source.profile_id IS DISTINCT FROM v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='SOURCE_LINEAGE_FORBIDDEN'; END IF;
   IF v_source.metadata<>v_record THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_SOURCE_CONTENT'; END IF;
 END LOOP;
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'provenance') LOOP
   INSERT INTO app.source_spans(id,tenant_id,profile_id,source_document_id,locator,text_excerpt)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,app.canonical_id(v_record->>'sourceId'),v_record-'excerpt',v_record->>'excerpt') ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_span FROM app.source_spans WHERE id=app.canonical_id(v_record->>'id');
   IF v_span.tenant_id<>v_workspace OR v_span.profile_id IS DISTINCT FROM v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='PROVENANCE_LINEAGE_FORBIDDEN'; END IF;
   IF v_span.locator<>v_record-'excerpt' OR v_span.text_excerpt IS DISTINCT FROM v_record->>'excerpt' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_PROVENANCE'; END IF;
 END LOOP;
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'claims') LOOP
   INSERT INTO app.claims(id,tenant_id,profile_id,claim_kind,value,content_hash)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,v_record->>'kind',v_record->'value',app.hash_json(pg_catalog.jsonb_build_object('kind',v_record->'kind','value',v_record->'value'))) ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_claim FROM app.claims WHERE id=app.canonical_id(v_record->>'id') FOR UPDATE;
   IF v_claim.tenant_id<>v_workspace OR v_claim.profile_id<>v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CLAIM_LINEAGE_FORBIDDEN'; END IF;
   IF v_claim.claim_kind<>v_record->>'kind' OR v_claim.value<>v_record->'value' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_CLAIM_CONTENT'; END IF;
   FOR v_ref IN SELECT * FROM pg_catalog.jsonb_array_elements_text(v_record->'provenanceIds') LOOP
     INSERT INTO app.claim_provenance(tenant_id,profile_id,claim_id,source_span_id,basis)
     VALUES(v_workspace,v_profile,v_claim.id,app.canonical_id(v_ref),'provided_by_user') ON CONFLICT DO NOTHING;
   END LOOP;
   IF v_claim.id=ANY(p_confirm_claim_ids) THEN
     INSERT INTO app.confirmation_events(tenant_id,profile_id,claim_id,actor_user_id,decision,method)
     VALUES(v_workspace,v_profile,v_claim.id,v_actor,'user_confirmed','explicit_selected_fact_attestation');
   END IF;
   SELECT * INTO v_confirmation FROM app.confirmation_events WHERE tenant_id=v_workspace AND claim_id=v_claim.id ORDER BY event_sequence DESC LIMIT 1;
   IF v_confirmation.id IS NULL OR v_confirmation.decision NOT IN ('user_confirmed','externally_verified') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EXPLICIT_CONFIRMATION_REQUIRED'; END IF;
   v_claims:=v_claims||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',app.portable_id(v_claim.id),'kind',v_claim.claim_kind,'value',v_claim.value,
    'provenanceIds',v_record->'provenanceIds','status',v_confirmation.decision,'confirmedAt',v_confirmation.recorded_at,'confirmationActor',app.portable_id(v_confirmation.actor_user_id))
    ||CASE WHEN v_confirmation.decision='externally_verified' THEN pg_catalog.jsonb_build_object('verificationMethod',v_confirmation.method) ELSE '{}'::jsonb END);
 END LOOP;
 v_projection:=pg_catalog.jsonb_build_object('schemaVersion','cv-facts-1.0.0','profileId',v_profile,'profileVersionId',v_version,
   'sequence',v_sequence,'parentVersionId',v_head,'asOf',p_as_of,'sources',p_cv->'sources','provenance',p_cv->'provenance',
   'claims',v_claims,'facts',p_cv->'facts','claimLinks',p_cv->'claimLinks','enrichment',p_cv->'enrichment');
 INSERT INTO app.profile_versions(id,tenant_id,profile_id,sequence,parent_version_id,canonical_json,schema_version,content_hash,as_of,publication_request_id)
 VALUES(v_version,v_workspace,v_profile,v_sequence,v_head,v_projection,'cv-facts-1.0.0',app.hash_json(v_projection-'profileId'-'profileVersionId'-'sequence'-'parentVersionId'-'asOf'),p_as_of,r.request_id);
 INSERT INTO app.profile_version_claims(tenant_id,profile_id,profile_version_id,claim_id,confirmation_event_id,accepted_state)
 SELECT v_workspace,v_profile,v_version,c.id,e.id,e.decision FROM app.claims c
 JOIN LATERAL(SELECT * FROM app.confirmation_events ce WHERE ce.tenant_id=c.tenant_id AND ce.claim_id=c.id ORDER BY ce.event_sequence DESC LIMIT 1)e ON true
 WHERE c.tenant_id=v_workspace AND c.id IN(SELECT app.canonical_id(i->>'id') FROM pg_catalog.jsonb_array_elements(p_cv->'claims')i);
 v_entities:=pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('entity',pg_catalog.md5(v_profile::text||':name')::uuid,'kind','name','payload',pg_catalog.jsonb_build_object('nameClaimId',p_cv#>'{facts,nameClaimId}')),
   pg_catalog.jsonb_build_object('entity',pg_catalog.md5(v_profile::text||':title0')::uuid,'kind','positioning_title','payload',pg_catalog.jsonb_build_object('slot',0,'titleClaimId',p_cv#>'{facts,positioningTitleClaimIds,0}')),
   pg_catalog.jsonb_build_object('entity',pg_catalog.md5(v_profile::text||':title1')::uuid,'kind','positioning_title','payload',pg_catalog.jsonb_build_object('slot',1,'titleClaimId',p_cv#>'{facts,positioningTitleClaimIds,1}')));
 FOR v_kind,v_record IN SELECT 'contact',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,contacts}')i
   UNION ALL SELECT 'skill',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,skills}')i
   UNION ALL SELECT 'employment',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,employment}')i
   UNION ALL SELECT 'education',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,education}')i
   UNION ALL SELECT 'optional_entry',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,optionalEntries}')i
   UNION ALL SELECT 'enrichment',i FROM pg_catalog.jsonb_array_elements(p_cv->'enrichment')i LOOP
   v_entities:=v_entities||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('entity',app.canonical_id(v_record->>'id'),'kind',v_kind,'payload',v_record));
 END LOOP;
 FOR v_entity IN SELECT * FROM pg_catalog.jsonb_array_elements(v_entities) LOOP
   v_entity_id:=(v_entity->>'entity')::uuid;
   v_revision:=app.entity_revision(v_workspace,v_profile,v_entity_id,v_entity->>'kind',v_entity->'payload');
   INSERT INTO app.profile_version_entities(tenant_id,profile_id,profile_version_id,entity_id,entity_revision_id,ordinal)
   VALUES(v_workspace,v_profile,v_version,v_entity_id,v_revision,v_ordinal);v_ordinal:=v_ordinal+1;
 END LOOP;
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'claimLinks') LOOP
   INSERT INTO app.claim_relations(id,tenant_id,profile_id,from_claim_id,to_claim_id,relation)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,app.canonical_id(v_record->>'fromClaimId'),app.canonical_id(v_record->>'toClaimId'),v_record->>'relation') ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_relation FROM app.claim_relations WHERE id=app.canonical_id(v_record->>'id');
   IF v_relation.tenant_id<>v_workspace OR v_relation.profile_id<>v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RELATION_LINEAGE_FORBIDDEN'; END IF;
   IF v_relation.from_claim_id<>app.canonical_id(v_record->>'fromClaimId') OR v_relation.to_claim_id<>app.canonical_id(v_record->>'toClaimId') OR v_relation.relation<>v_record->>'relation' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_CLAIM_RELATION'; END IF;
   INSERT INTO app.profile_version_relations(tenant_id,profile_id,profile_version_id,claim_relation_id,from_claim_id,to_claim_id)
   VALUES(v_workspace,v_profile,v_version,v_relation.id,v_relation.from_claim_id,v_relation.to_claim_id);
 END LOOP;
 UPDATE app.career_profiles SET head_version_id=v_version,draft_revision=v_sequence,draft_payload=p_cv,updated_at=pg_catalog.transaction_timestamp() WHERE id=v_profile;
 v_cv_version:=app.insert_cv_version(v_workspace,v_base.id,v_version,r.request_id,p_cv->'document',p_cv->>'locale');
 PERFORM app.audit(v_workspace,'profile.checkpoint','profile_version',v_version,pg_catalog.jsonb_build_object('revision',v_sequence));
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('profileId',v_profile,'profileVersionId',v_version,
  'revision',v_sequence,'baseDocumentId',v_base.id,'baseCvVersionId',v_cv_version,'baseRevision',v_base.draft_revision+1));
EXCEPTION WHEN check_violation OR foreign_key_violation OR invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PROFILE_GRAPH';
 WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='PROFILE_IDENTITY_CONFLICT';
END $function$;

CREATE OR REPLACE FUNCTION app.insert_cv_version(workspace uuid, document_id uuid, profile_version uuid, request_id uuid, layout jsonb, locale text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE document app.cv_documents; profile uuid; snapshot uuid := pg_catalog.gen_random_uuid(); seq bigint; projection jsonb; section jsonb; entry text; section_row uuid; order_no integer:=0; item_no integer; revision uuid;
BEGIN
 SELECT * INTO document FROM app.cv_documents d WHERE d.tenant_id=workspace AND d.id=document_id FOR UPDATE;
 SELECT v.profile_id INTO profile FROM app.profile_versions v WHERE v.tenant_id=workspace AND v.id=profile_version;
 IF document.id IS NULL OR profile IS DISTINCT FROM document.profile_id OR document.document_kind<>'base' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_PROFILE_LINEAGE_FORBIDDEN'; END IF;
 SELECT COALESCE(max(v.sequence),0)+1 INTO seq FROM app.cv_versions v WHERE v.tenant_id=workspace AND v.document_id=insert_cv_version.document_id;
 projection:=app.canonical_for_cv(workspace,profile_version,document_id,snapshot,seq,document.head_version_id,locale,layout);
 PERFORM app.validate_canonical(projection);
 INSERT INTO app.cv_versions(id,tenant_id,profile_id,document_id,sequence,parent_version_id,profile_version_id,locale,canonical_json,content_hash,publication_request_id,schema_version)
 VALUES(snapshot,workspace,profile,document_id,seq,document.head_version_id,profile_version,locale,projection,app.hash_json(projection-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt'),request_id,'1.0.0');
 FOR entry IN SELECT * FROM pg_catalog.jsonb_array_elements_text(layout->'sectionOrder') LOOP
   SELECT s INTO STRICT section FROM pg_catalog.jsonb_array_elements(layout->'sections')s WHERE s->>'id'=entry;
   INSERT INTO app.cv_sections(tenant_id,cv_version_id,section_instance_id,section_kind,label,ordinal,visible)
    VALUES(workspace,snapshot,app.canonical_id(entry),section->>'kind',section->>'label',order_no,(section->>'visible')::boolean) RETURNING id INTO section_row;
   item_no:=0;
   FOR entry IN SELECT * FROM app.cv_section_entity_ids(workspace,profile_version,section,layout) LOOP
     SELECT pe.entity_revision_id INTO revision FROM app.profile_version_entities pe WHERE pe.tenant_id=workspace AND pe.profile_version_id=profile_version AND pe.entity_id=app.canonical_id(entry);
     IF revision IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CV_ENTITY_NOT_PINNED'; END IF;
     INSERT INTO app.cv_items(tenant_id,cv_section_id,cv_version_id,profile_version_id,item_kind,entity_revision_id,ordinal,selected,privacy_flags)
       VALUES(workspace,section_row,snapshot,profile_version,'entity',revision,item_no,(section->>'visible')::boolean,'{}');
     item_no:=item_no+1;
   END LOOP;
   order_no:=order_no+1;
 END LOOP;
 UPDATE app.cv_documents d SET head_version_id=snapshot,draft_revision=d.draft_revision+1,draft_payload=layout WHERE d.id=document_id AND d.tenant_id=workspace;
 RETURN snapshot;
END $function$;

CREATE OR REPLACE FUNCTION app.pin_cv_photo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE layout jsonb:=NEW.canonical_json->'document'; previous jsonb; p jsonb;
 mode text; kind text; command text; has_base boolean:=false;
BEGIN
 SELECT d.document_kind INTO kind FROM app.cv_documents d WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.document_id;
 SELECT r.command_kind INTO command FROM app.idempotency_requests r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.publication_request_id;
 SELECT v.canonical_json->'document' INTO previous FROM app.cv_versions v WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.parent_version_id;
 IF command='restore_cv_version' THEN
  p:=layout->'photo'; mode:='base';
 ELSE
  mode:='base';
  SELECT s.payload#>'{content,presentation,photo}' INTO p FROM app.editor_draft_snapshots s WHERE s.tenant_id=NEW.tenant_id AND s.variant_id='default' ORDER BY s.revision DESC LIMIT 1;
  has_base:=FOUND;
 END IF;
 PERFORM app.validate_photo_reference(NEW.tenant_id,p);
 IF has_base OR layout ? 'photo' OR layout ? 'photoMode' OR (command<>'restore_cv_version' AND previous ? 'photo') THEN
  layout:=layout||jsonb_build_object('photo',coalesce(p,'null'::jsonb),'photoMode',mode);
  NEW.canonical_json:=jsonb_set(NEW.canonical_json,'{document}',layout);
 END IF;
 PERFORM app.validate_canonical(NEW.canonical_json);
 NEW.content_hash:=app.hash_json(NEW.canonical_json-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt');
 RETURN NEW;
END $function$;

DROP FUNCTION app.document_language_context(uuid);

REVOKE ALL ON FUNCTION app.document_language_context() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION app.document_language_context() TO authenticated;

DROP FUNCTION app.capture_command(text,text,text,uuid,text,jsonb),
 app.job_editor_pin(app.target_job_contexts),
 app.job_editor_facts(jsonb),
 app.confirm_job(uuid,uuid,bigint,jsonb),
 app.validate_retraction(),
 app.insert_job_cv_version(uuid,uuid,uuid,uuid,jsonb,text,uuid,boolean,uuid),
 app.save_application(uuid,uuid,bigint,uuid,uuid,uuid,text),
 app.save_next_action(uuid,uuid,uuid,bigint,text,text,date,text),
 app.mark_sent(uuid,uuid,bigint,uuid,date),
 app.retract_sent(uuid,uuid,bigint,uuid),
 app.search_applications(text,text,timestamp with time zone,uuid,integer),
 app.sent_count(),
 app.save_job_cv_checkpoint(uuid,uuid,bigint,uuid,uuid,jsonb,text,boolean),
 app.calculate_scores(uuid,uuid,boolean,boolean),
 app.validate_evidence_lineage(),
 app.validate_recommendation_lineage(),
 app.protect_catalog(),
 app.publish_analysis(uuid,uuid,uuid,uuid,jsonb,jsonb,date,text),
 app.get_analysis(uuid),
 app.publish_readiness(uuid,uuid,uuid,uuid,jsonb),
 app.initialize_job_workflow(),
 app.review_target_job(uuid,uuid,text,text,jsonb),
 app.target_job_json(app.target_job_contexts),
 app.get_target_job(uuid),
 app.save_target_job(uuid,uuid,bigint,jsonb,jsonb),
 app.list_target_jobs(),
 app.require_capture_worker(text),
 app.capture_receipt(app.capture_operations),
 app.revoke_my_capture_connections(),
 app.authorize_capture(text,text,uuid,text,text,text,timestamp with time zone),
 app.revoke_capture_session(text,text),
 app.finish_capture(text,uuid,jsonb),
 app.write_job_editor(uuid,uuid,uuid,bigint,jsonb,uuid,boolean),
 app.job_locale_key(text),
 app.load_current_job_document(uuid,text),
 app.job_editor_json(app.job_editor_versions),
 app.load_job_editor(uuid,uuid,uuid),
 app.validate_job_editor(jsonb,jsonb),
 app.job_editor_context(uuid),
 app.job_editor_schema(),
 app.job_editor_history(uuid,uuid,bigint,integer),
 app.save_job_editor(uuid,uuid,uuid,bigint,jsonb),
 app.restore_job_editor(uuid,uuid,uuid,bigint,uuid),
 app.delete_job_editor(uuid,uuid,uuid,bigint),
 app.job_workflow_json(app.job_workflow_operations),
 app.request_job_workflow_before_workspace(uuid,uuid,text,bigint,text,text),
 app.get_job_workflow(uuid),
 app.review_job_workflow(uuid,uuid,bigint,jsonb),
 app.cancel_job_workflow(uuid,uuid),
 app.job_workflow_action(uuid,uuid,bigint,text,text),
 app.clean_job_document_json(jsonb),
 app.current_job_document_json(app.job_editor_versions),
 app.detach_job_documents_from_base_internal(uuid),
 app.save_current_job_document_before_workspace(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid),
 app.freeze_job_document(jsonb,jsonb),
 app.save_target_url(uuid,text),
 app.job_editor_current_pin(uuid),
 app.current_job_document_row(uuid,uuid,text),
 app.link_job_source_version(uuid,uuid,uuid,bigint),
 app.legacy_job_text_fact(jsonb,text,text),
 app.convert_legacy_current_job(jsonb),
 app.legacy_job_render_key(jsonb),
 app.preflight_legacy_current_jobs(uuid),
 app.accept_job_tailor(uuid,uuid,uuid,uuid,bigint,jsonb),
 app.validate_application_cv_metadata(),
 app.prepare_job_documents_for_base_removal(uuid),
 app.invalidate_job_language_proposals(),
 app.submit_workspace_intake(uuid,uuid,bigint),
 app.save_job_answer(uuid,uuid,bigint,jsonb),
 app.job_extraction_locale(uuid,uuid,text),
 app.pin_job_extraction_language(),
 app.record_job_interface_locale(uuid,uuid,text,boolean),
 app.accept_profile_integration(uuid,uuid),
 app.save_target_job_with_locale(uuid,uuid,bigint,jsonb,jsonb,text),
 app.request_job_workflow(uuid,uuid,text,bigint,text,text),
 app.save_target_url_with_locale(uuid,text,text),
 app.submit_workspace_intake_with_locale(uuid,uuid,bigint,text),
 app.request_job_workflow_with_locale(uuid,uuid,text,bigint,text,text,text),
 app.save_current_job_document(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid),
 app.claim_job_workflow(text,boolean),
 app.get_job_answers(uuid),
 app.reject_workspace_operation(uuid),
 app.job_identity(text),
 app.fence_deleted_job_operation(),
 app.job_workflow_attempt(text,uuid,jsonb,text,jsonb),
 app.job_workflow_attempt_before_workspace(text,uuid,jsonb,text,jsonb),
 app.finish_job_workflow_before_workspace(text,uuid,jsonb,text),
 app.claim_job_workflow_before_workspace(text,boolean),
 app.claim_capture(text),
 app.finish_job_workflow(text,uuid,jsonb,text),
 app.delete_target_job(uuid,uuid);

DROP TABLE app.analysis_components,
 app.analysis_runs,
 app.application_events,
 app.applications,
 app.capture_connections,
 app.capture_operations,
 app.capture_session_fences,
 app.capture_worker_authorization,
 app.evidence_mappings,
 app.job_answers,
 app.job_captures,
 app.job_deletion_fences,
 app.job_editor_documents,
 app.job_editor_versions,
 app.job_purge_rows,
 app.job_request_links,
 app.job_requirements,
 app.job_versions,
 app.job_workflow_operations,
 app.job_workflows,
 app.jobs,
 app.match_evidence,
 app.next_actions,
 app.readiness_runs,
 app.recommendation_claims,
 app.recommendation_requirements,
 app.recommendations,
 app.requirement_atoms,
 app.rule_versions,
 app.target_job_contexts;

ALTER TABLE app.ai_enhancement_operations DROP COLUMN job_id;

ALTER TABLE app.source_documents DROP COLUMN job_id;

ALTER TABLE app.source_spans DROP COLUMN job_id;

ALTER TABLE app.cv_documents DROP COLUMN job_id;

ALTER TABLE app.cv_versions DROP COLUMN job_id, DROP COLUMN job_version_id, DROP COLUMN tailoring_state;

ALTER TABLE app.workspace_drafts DROP COLUMN submitted_job_id;


ALTER TABLE app.ai_enhancement_operations ADD CONSTRAINT ai_enhancement_operations_context CHECK (
 (base_removed AND snapshot_id IS NULL AND revision IS NULL AND import_id IS NULL) OR
 (NOT base_removed AND ((import_id IS NULL AND snapshot_id IS NOT NULL AND revision IS NOT NULL) OR (import_id IS NOT NULL AND snapshot_id IS NULL AND revision IS NULL))));
ALTER TABLE app.cv_documents ADD CONSTRAINT cv_documents_kind CHECK (document_kind='base');
ALTER TABLE app.source_documents ADD CONSTRAINT source_documents_kind CHECK (source_kind IN ('manual','upload','interview','own_profile'));
ALTER TABLE app.source_documents ADD CONSTRAINT source_documents_profile CHECK (profile_id IS NOT NULL);
ALTER TABLE app.workspace_drafts ADD CONSTRAINT workspace_drafts_kind CHECK (kind IN ('resume','import-review','translation-review'));
ALTER TABLE app.career_operation_results ADD CONSTRAINT career_operation_results_kind CHECK (kind IN ('questions','rewrite'));
ALTER TABLE app.document_language_proposals ADD CONSTRAINT document_language_proposals_source CHECK (request#>>'{source,kind}'='base');
-- Normalize only obsolete, null canonical context metadata; never editor content/history.
UPDATE app.cv_versions SET canonical_json=jsonb_set(canonical_json,'{context}','{"kind":"base"}'),content_hash=app.hash_json(jsonb_set(canonical_json,'{context}','{"kind":"base"}')-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt') WHERE canonical_json->'context' IS DISTINCT FROM '{"kind":"base"}'::jsonb;


ALTER TABLE app.ai_enhancement_attempts ENABLE TRIGGER USER;

ALTER TABLE app.ai_enhancement_operations ENABLE TRIGGER USER;

ALTER TABLE app.audit_events ENABLE TRIGGER USER;

ALTER TABLE app.source_spans ENABLE TRIGGER USER;

ALTER TABLE app.cv_photo_references ENABLE TRIGGER USER;

ALTER TABLE app.cv_items ENABLE TRIGGER USER;

ALTER TABLE app.cv_sections ENABLE TRIGGER USER;

ALTER TABLE app.cv_versions ENABLE TRIGGER USER;

ALTER TABLE app.cv_documents ENABLE TRIGGER USER;

ALTER TABLE app.profile_versions ENABLE TRIGGER USER;


DO $postflight$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='app'::regnamespace AND relname ~ '(job|capture|tailor|application|analysis|recommendation|readiness|requirement|match_evidence|evidence_mapping|rule_version|next_action)')
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='app'::regnamespace AND (proname ~ '(job|capture|tailor|application|analysis|readiness|integration|intake|sent_count|mark_sent|retract_sent|next_action)' OR prosrc ~ 'app\.(jobs|job_|capture_|analysis_|applications|recommendation|readiness|rule_versions|target_job)'))
 THEN RAISE EXCEPTION 'RETIRED_SCHEMA_REMAINS'; END IF;
END $postflight$;


NOTIFY pgrst, 'reload schema';
