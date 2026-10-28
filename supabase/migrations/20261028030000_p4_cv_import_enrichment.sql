-- Private document imports reuse P1 sources and connected provider operations/attempts.
-- Prepares a private bounded bucket when applied; no remote apply, secret installation, paid route or scheduler activation performed here.
CREATE TABLE app.cv_import_sessions (
 source_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, operation_id uuid NOT NULL,
 format text NOT NULL CHECK(format IN ('pdf','docx','doc')),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10000000),
 expected_revision bigint NOT NULL CHECK(expected_revision>=0),
 state text NOT NULL CHECK(state IN ('uploading','uploaded','processing','ready','not_cv','uncertain','failed','cancelled','disabled','unknown')),
 review jsonb CHECK(review IS NULL OR (jsonb_typeof(review)='object' AND octet_length(review::text)<524288)),
 error_code text CHECK(error_code IS NULL OR error_code ~ '^[A-Z_]{1,80}$'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT transaction_timestamp()+interval '24 hours',
 review_decisions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(review_decisions)='array' AND octet_length(review_decisions::text)<524288),
 UNIQUE(tenant_id,operation_id),UNIQUE(tenant_id,source_id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.source_documents(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.cv_import_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.cv_import_sessions FROM PUBLIC,anon,authenticated;
CREATE POLICY owner_read ON app.cv_import_sessions FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.cv_import_sessions TO authenticated;
CREATE FUNCTION app.cv_import_json(s app.cv_import_sessions) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',s.source_id,'operationId',s.operation_id,'state',s.state,'format',s.format,
 'sourceHash',s.source_hash,'expectedRevision',s.expected_revision,'review',s.review,'error',s.error_code,
 'objectKey',(SELECT object_key FROM app.source_documents WHERE tenant_id=s.tenant_id AND id=s.source_id))
$$;
CREATE FUNCTION app.get_cv_import(p_operation uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND operation_id=p_operation FOR UPDATE;
 IF s.state IN ('uploading','uploaded','processing') AND s.created_at<transaction_timestamp()-interval '90 seconds' THEN
 UPDATE app.cv_import_sessions SET state='unknown',error_code='PROCESSING_OUTCOME_UNKNOWN' WHERE source_id=s.source_id RETURNING * INTO s;
 END IF;
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 RETURN app.cv_import_json(s);
END $$;
CREATE FUNCTION app.list_cv_imports() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); result jsonb;
BEGIN
 SELECT coalesce(jsonb_agg((app.cv_import_json(s)-'review')||jsonb_build_object('review',NULL) ORDER BY s.created_at DESC),'[]'::jsonb) INTO result
 FROM (SELECT * FROM app.cv_import_sessions WHERE tenant_id=w AND expires_at>transaction_timestamp() AND state<>'cancelled' ORDER BY created_at DESC LIMIT 5) s;
 RETURN result;
END $$;
CREATE FUNCTION app.begin_cv_import(p_operation uuid,p_format text,p_hash text,p_size bigint,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; s app.cv_import_sessions; source uuid:=gen_random_uuid(); r record; head_revision bigint; profile uuid;
BEGIN
 PERFORM app.provision_workspace(p_operation); w:=app.tenant_for_user();
 SELECT * INTO r FROM app.begin_request(w,'begin_cv_import',p_operation,jsonb_build_object('format',p_format,'hash',p_hash,'size',p_size,'revision',p_revision));
 IF r.cached IS NOT NULL THEN RETURN jsonb_build_object('created',false,'record',app.get_cv_import(p_operation)); END IF;
 IF p_format IS NULL OR p_format NOT IN ('pdf','docx','doc') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 10000000 OR p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resumora:import:'||w::text,0));
 SELECT coalesce(max(revision),0) INTO head_revision FROM app.editor_draft_snapshots WHERE tenant_id=w;
 IF head_revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM app.cv_import_sessions WHERE tenant_id=w AND state IN ('uploading','uploaded','processing') AND expires_at>transaction_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='COMMAND_IN_PROGRESS'; END IF;
 profile:=app.ensure_profile(w,NULL);
 INSERT INTO app.source_documents(id,tenant_id,profile_id,source_kind,bucket,object_key,content_hash,mime_type,size_bytes,retain_until,state,upload_request_id)
 VALUES(source,w,profile,'upload','cv-imports',w::text||'/'||source::text||'/original.'||p_format,decode(p_hash,'hex'),
 CASE p_format WHEN 'pdf' THEN 'application/pdf' WHEN 'doc' THEN 'application/msword' ELSE 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' END,p_size,transaction_timestamp()+interval '24 hours','reserved',r.request_id);
 INSERT INTO app.cv_import_sessions(source_id,tenant_id,operation_id,format,source_hash,size_bytes,expected_revision,state)
 VALUES(source,w,p_operation,p_format,p_hash,p_size,p_revision,'uploading') RETURNING * INTO s;
 RETURN app.finish_request(w,r.request_id,jsonb_build_object('created',true,'record',app.cv_import_json(s)));
END $$;
CREATE FUNCTION app.complete_cv_import(p_operation uuid,p_state text,p_review jsonb,p_error text,p_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions; c jsonb; excerpt text;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND operation_id=p_operation FOR UPDATE;
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF s.state='cancelled' OR s.expires_at<=transaction_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('uploaded','processing','ready','not_cv','uncertain','failed','disabled','unknown') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 IF s.state IN ('ready','not_cv','uncertain','failed','disabled','unknown') THEN
   IF s.state=p_state AND s.review IS NOT DISTINCT FROM p_review AND s.error_code IS NOT DISTINCT FROM p_error THEN RETURN app.cv_import_json(s); END IF;
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';
 END IF;
 IF p_state='ready' AND (p_review IS NULL OR p_review->>'id' IS DISTINCT FROM s.source_id::text OR p_review->>'sourceHash' IS DISTINCT FROM s.source_hash OR p_review->>'format' IS DISTINCT FROM s.format OR jsonb_typeof(p_review->'extraction'->'candidates') IS DISTINCT FROM 'array' OR jsonb_array_length(p_review->'extraction'->'candidates')>250) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 IF p_state<>'ready' AND p_review IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 UPDATE app.cv_import_sessions SET state=p_state,review=p_review,error_code=p_error,
 expires_at=CASE WHEN p_state='ready' THEN transaction_timestamp()+interval '7 days' ELSE expires_at END WHERE source_id=s.source_id RETURNING * INTO s;
 UPDATE app.source_documents SET state=CASE WHEN p_state='ready' THEN 'available' WHEN p_state IN ('failed','not_cv','uncertain') THEN 'quarantined' ELSE 'uploaded' END,retain_until=s.expires_at WHERE tenant_id=w AND id=s.source_id;
 IF p_state='ready' THEN
 FOR c IN SELECT * FROM jsonb_array_elements(p_review->'extraction'->'candidates') LOOP
 excerpt:=c->>'quote';
 WHILE octet_length(excerpt)>4096 LOOP
 excerpt:=left(excerpt,length(excerpt)-1);
 END LOOP;
 INSERT INTO app.source_spans(tenant_id,profile_id,source_document_id,locator,text_excerpt)
 VALUES(w,(SELECT profile_id FROM app.source_documents WHERE tenant_id=w AND id=s.source_id),s.source_id,jsonb_build_object('candidateId',c->>'id','page',c->'page','kind',CASE WHEN c->'page'='null'::jsonb THEN 'word_excerpt' ELSE 'pdf_page' END),excerpt);
 END LOOP;
 END IF;
 RETURN app.cv_import_json(s);
END $$;
CREATE FUNCTION app.cancel_cv_import(p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 UPDATE app.cv_import_sessions SET state='cancelled',review=NULL,error_code='CANCELLED' WHERE tenant_id=w AND operation_id=p_operation RETURNING * INTO s;
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 UPDATE app.source_documents SET state='purge_pending',retain_until=transaction_timestamp() WHERE tenant_id=w AND id=s.source_id;
 RETURN app.cv_import_json(s);
END $$;
-- Add import context to the existing operation store; no competing usage ledger.
ALTER TABLE app.ai_enhancement_operations ALTER COLUMN snapshot_id DROP NOT NULL,ALTER COLUMN revision DROP NOT NULL;
ALTER TABLE app.ai_enhancement_operations ADD COLUMN import_id uuid,ADD COLUMN route_kind text NOT NULL DEFAULT 'chat' CHECK(route_kind IN ('chat','word'));
ALTER TABLE app.ai_enhancement_operations ADD FOREIGN KEY(tenant_id,import_id) REFERENCES app.cv_import_sessions(tenant_id,source_id);
ALTER TABLE app.ai_enhancement_operations ADD CHECK((import_id IS NULL AND snapshot_id IS NOT NULL AND revision IS NOT NULL) OR (import_id IS NOT NULL AND snapshot_id IS NULL AND revision IS NULL));
CREATE FUNCTION app.reserve_document_operation(p_operation uuid,p_import uuid,p_stage text,p_policy text,p_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions; o app.ai_enhancement_operations; created boolean;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND source_id=p_import FOR UPDATE;
 IF s.source_id IS NULL OR s.state<>'processing' OR s.expires_at<=transaction_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
 IF p_stage IS NULL OR p_stage NOT IN ('admit','extract') OR p_policy IS NULL OR length(p_policy) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 INSERT INTO app.ai_enhancement_operations(tenant_id,id,target_id,policy,import_id,route_kind)
 VALUES(w,p_operation,p_stage,p_policy,p_import,CASE WHEN s.format='pdf' THEN 'chat' ELSE 'word' END) ON CONFLICT(id) DO NOTHING;
 created:=FOUND; SELECT * INTO o FROM app.ai_enhancement_operations WHERE tenant_id=w AND id=p_operation;
 IF o.id IS NULL OR o.import_id IS DISTINCT FROM p_import OR o.target_id<>p_stage OR o.policy<>p_policy THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN jsonb_build_object('created',created);
END $$;
CREATE OR REPLACE FUNCTION app.begin_ai_attempt(p_start jsonb,p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); a app.ai_enhancement_attempts; o app.ai_enhancement_operations; created boolean;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO o FROM app.ai_enhancement_operations WHERE tenant_id=w AND id=(p_start->>'operationId')::uuid;
 IF o.id IS NULL OR (o.import_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.cv_import_sessions WHERE tenant_id=w AND source_id=o.import_id AND state='processing' AND expires_at>transaction_timestamp())) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
 IF p_start->>'userId' IS DISTINCT FROM app.require_user()::text OR p_start->>'provider' NOT IN ('openrouter','openai')
 OR (o.route_kind='word' AND p_start->>'provider'<>'openai')
 OR p_start->>'attemptId' IS DISTINCT FROM ((p_start->>'operationId')||CASE WHEN p_start->>'provider'='openrouter' OR o.route_kind='word' THEN '-primary' ELSE '-fallback' END)
 THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
 INSERT INTO app.ai_enhancement_attempts(tenant_id,id,operation_id,start_data) VALUES(w,p_start->>'attemptId',(p_start->>'operationId')::uuid,p_start) ON CONFLICT(id) DO NOTHING;
 created:=FOUND; SELECT * INTO a FROM app.ai_enhancement_attempts WHERE tenant_id=w AND id=p_start->>'attemptId';
 IF a.id IS NULL OR a.start_data<>p_start THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN jsonb_build_object('created',created,'attempt',a.start_data||jsonb_build_object('result',a.result_data,'duplicateOf',NULL));
END $$;
-- User-reviewed confirmations and the immutable editor checkpoint are one transaction.
CREATE FUNCTION app.save_import_review_draft(p_key uuid,p_expected_revision bigint,p_payload jsonb,p_import uuid,p_selected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions; selected text; result jsonb;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND source_id=p_import FOR UPDATE;
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF jsonb_typeof(p_selected) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selected) NOT BETWEEN 1 AND 250 OR p_payload->'content'->'importReview'->'confirmedIds' IS DISTINCT FROM p_selected THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s.review_decisions) d
 JOIN app.editor_draft_snapshots v ON v.tenant_id=w AND v.id=(d->>'snapshotId')::uuid
 WHERE d->'selectedIds' @> p_selected AND (v.payload->'content'->'importReview'-'confirmedIds')=(p_payload->'content'->'importReview'-'confirmedIds')) THEN
 RETURN app.write_base_draft(p_key,p_expected_revision,p_payload,'checkpoint',NULL);
 END IF;
 IF s.state<>'ready' OR s.expires_at<=transaction_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF ((p_payload->'content'->'importReview')-'confirmedIds') IS DISTINCT FROM (s.review-'confirmedIds') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 FOR selected IN SELECT jsonb_array_elements_text(p_selected) LOOP
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.review->'extraction'->'candidates') c WHERE c->>'id'=selected) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 END LOOP;
 result:=app.write_base_draft(p_key,p_expected_revision,p_payload,'checkpoint',NULL);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.review_decisions) d WHERE d->>'snapshotId'=result->>'id') THEN
 UPDATE app.cv_import_sessions SET review_decisions=review_decisions||jsonb_build_array(jsonb_build_object('snapshotId',result->>'id','selectedIds',p_selected,'actor',app.require_user(),'recordedAt',transaction_timestamp())),expires_at=transaction_timestamp()+interval '7 days' WHERE source_id=p_import;
 UPDATE app.source_documents SET retain_until=transaction_timestamp()+interval '7 days' WHERE tenant_id=w AND id=p_import;
 END IF;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION app.cv_import_json(app.cv_import_sessions),app.get_cv_import(uuid),app.list_cv_imports(),app.begin_cv_import(uuid,text,text,bigint,bigint),app.complete_cv_import(uuid,text,jsonb,text,text),app.cancel_cv_import(uuid),app.reserve_document_operation(uuid,uuid,text,text,text),app.save_import_review_draft(uuid,bigint,jsonb,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_cv_import(uuid),app.list_cv_imports(),app.begin_cv_import(uuid,text,text,bigint,bigint),app.complete_cv_import(uuid,text,jsonb,text,text),app.cancel_cv_import(uuid),app.reserve_document_operation(uuid,uuid,text,text,text),app.save_import_review_draft(uuid,bigint,jsonb,uuid,jsonb) TO authenticated;
-- Storage bucket and policies are prepared below when the Storage schema is available.
-- Manifest-based path authorisation supports private cv-imports when Storage exists.
CREATE FUNCTION app.can_access_cv_import_object(p_name text,p_write boolean) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid;
BEGIN
 w:=app.tenant_for_user();
 RETURN EXISTS(SELECT 1 FROM app.source_documents d JOIN app.cv_import_sessions s ON s.tenant_id=d.tenant_id AND s.source_id=d.id
 WHERE d.tenant_id=w AND d.bucket='cv-imports' AND d.object_key=p_name AND s.state<>'cancelled' AND s.expires_at>transaction_timestamp()
 AND (NOT p_write OR s.state='uploading'));
EXCEPTION WHEN SQLSTATE 'PT401' OR SQLSTATE 'PT403' THEN RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION app.can_access_cv_import_object(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.can_access_cv_import_object(text,boolean) TO authenticated;
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'CREATE POLICY cv_import_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id=''cv-imports'' AND app.can_access_cv_import_object(name,false))';
 EXECUTE 'CREATE POLICY cv_import_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id=''cv-imports'' AND app.can_access_cv_import_object(name,true))';
 END IF;
END $$;

CREATE FUNCTION app.can_delete_cv_import_object(p_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid;
BEGIN
 w:=app.tenant_for_user();
 RETURN EXISTS(SELECT 1 FROM app.source_documents d JOIN app.cv_import_sessions s ON s.tenant_id=d.tenant_id AND s.source_id=d.id
 WHERE d.tenant_id=w AND d.bucket='cv-imports' AND d.object_key=p_name AND (s.state='cancelled' OR s.expires_at<=transaction_timestamp()));
EXCEPTION WHEN SQLSTATE 'PT401' OR SQLSTATE 'PT403' THEN RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION app.can_delete_cv_import_object(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.can_delete_cv_import_object(text) TO authenticated;
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'CREATE POLICY cv_import_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id=''cv-imports'' AND app.can_delete_cv_import_object(name))';
 END IF;
END $$;
-- Cleanup needs owned row visibility while cancellation/expiry is pending physical deletion.
-- Application cancellation still fences inference/publication before deletion is attempted.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
 INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('cv-imports','cv-imports',false,10000000,ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) ON CONFLICT(id) DO NOTHING;
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='cv-imports' AND (public OR file_size_limit IS DISTINCT FROM 10000000)) THEN RAISE EXCEPTION 'CV_IMPORT_BUCKET_MUST_BE_PRIVATE_AND_BOUNDED'; END IF;
 END IF;
 IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'CREATE POLICY cv_import_cleanup_visibility ON storage.objects FOR SELECT TO authenticated USING(bucket_id=''cv-imports'' AND app.can_delete_cv_import_object(name))';
 -- Restrictive policies prevent unrelated permissive storage policies from exposing this bucket.
 EXECUTE 'CREATE POLICY cv_import_isolation ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(bucket_id<>''cv-imports'' OR app.can_access_cv_import_object(name,false) OR app.can_delete_cv_import_object(name)) WITH CHECK(bucket_id<>''cv-imports'' OR app.can_access_cv_import_object(name,true))';
 EXECUTE 'CREATE POLICY cv_import_no_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>''cv-imports'') WITH CHECK(bucket_id<>''cv-imports'')';
 END IF;
END $$;
-- Bounded per-account cleanup on account interaction. A continuous offline sweep
-- remains a separate operational activation; expiry metadata alone is not byte erasure.
CREATE FUNCTION app.expired_cv_import_objects() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions; result jsonb:='[]';
BEGIN
 FOR s IN SELECT c.* FROM app.cv_import_sessions c JOIN app.source_documents d ON d.tenant_id=c.tenant_id AND d.id=c.source_id
 WHERE c.tenant_id=w AND (c.expires_at<=transaction_timestamp() OR c.state='cancelled') AND d.state<>'purged' ORDER BY c.created_at LIMIT 5 FOR UPDATE OF c LOOP
 UPDATE app.cv_import_sessions SET state='cancelled',review=NULL,error_code='EXPIRED' WHERE source_id=s.source_id;
 UPDATE app.source_documents SET state='purge_pending' WHERE tenant_id=w AND id=s.source_id;
 result:=result||jsonb_build_array((app.cv_import_json(s)-'review')||jsonb_build_object('review',NULL));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION app.ack_cv_import_purge(p_operation uuid,p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND operation_id=p_operation FOR UPDATE;
 IF s.source_id IS NULL OR s.state<>'cancelled' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
 UPDATE app.source_documents SET state='purged' WHERE tenant_id=w AND id=s.source_id;
 RETURN jsonb_build_object('purged',true);
END $$;
REVOKE EXECUTE ON FUNCTION app.expired_cv_import_objects(),app.ack_cv_import_purge(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.expired_cv_import_objects(),app.ack_cv_import_purge(uuid,text) TO authenticated;
