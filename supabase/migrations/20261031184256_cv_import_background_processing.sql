-- Only new, explicitly queued uploads are eligible. Existing unknown operations are never retried.
-- Private temporary source bytes let the worker run without storing browser bearer/refresh tokens.
CREATE TABLE app.cv_import_tasks (
 source_id uuid PRIMARY KEY REFERENCES app.cv_import_sessions(source_id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES app.tenants(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','done')),
 source_base64 text CHECK(source_base64 IS NULL OR octet_length(source_base64)<=13333336),
 lease uuid UNIQUE, started_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app.cv_import_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.cv_import_tasks FROM PUBLIC,anon,authenticated;
CREATE INDEX cv_import_tasks_tenant ON app.cv_import_tasks(tenant_id);
CREATE INDEX cv_import_tasks_user ON app.cv_import_tasks(user_id);
CREATE INDEX cv_import_tasks_started ON app.cv_import_tasks(started_at) WHERE state='processing';
CREATE INDEX cv_import_tasks_pending ON app.cv_import_tasks(created_at) WHERE state='queued';
CREATE FUNCTION app.clear_cv_import_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.state NOT IN ('uploading','uploaded','processing') THEN
  UPDATE app.cv_import_tasks SET state='done',source_base64=NULL WHERE source_id=NEW.source_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cv_import_task_terminal AFTER UPDATE OF state ON app.cv_import_sessions
 FOR EACH ROW EXECUTE FUNCTION app.clear_cv_import_task();
CREATE FUNCTION app.queue_cv_import(p_operation uuid,p_base64 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND operation_id=p_operation FOR UPDATE;
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM app.cv_import_tasks WHERE source_id=s.source_id) THEN RETURN app.cv_import_json(s);END IF;
 IF s.state<>'uploaded' OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 IF p_base64 IS NULL OR length(p_base64)<>4*((s.size_bytes+2)/3) OR length(p_base64)>13333336
 OR p_base64 !~ '^[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 INSERT INTO app.cv_import_tasks(source_id,tenant_id,user_id,source_base64) VALUES(s.source_id,w,app.require_user(),p_base64);
 RETURN app.cv_import_json(s);
END $$;
-- Polling uses the worker lease clock rather than the age of the upload. Queue waiting
-- and storage time cannot consume or prematurely expire the AI processing budget.
CREATE OR REPLACE FUNCTION app.get_cv_import(p_operation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions; q app.cv_import_tasks;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions WHERE tenant_id=w AND (operation_id=p_operation OR source_id=p_operation) FOR UPDATE;
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 SELECT * INTO q FROM app.cv_import_tasks WHERE source_id=s.source_id;
 IF s.state IN ('uploading','uploaded','processing') AND
 ((q.source_id IS NULL AND s.created_at<clock_timestamp()-interval '90 seconds') OR
 (q.state='processing' AND q.started_at<clock_timestamp()-interval '120 seconds') OR s.expires_at<=clock_timestamp()) THEN
  UPDATE app.cv_import_sessions SET state='unknown',error_code=CASE WHEN q.source_id IS NULL THEN 'PROCESSING_OUTCOME_UNKNOWN' ELSE 'AI_TIMEOUT_UNKNOWN' END WHERE source_id=s.source_id RETURNING * INTO s;
 END IF;
 RETURN app.cv_import_json(s);
END $$;
CREATE OR REPLACE FUNCTION app.cv_import_json(s app.cv_import_sessions) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',s.source_id,'operationId',s.operation_id,'state',s.state,'format',s.format,
 'sourceHash',s.source_hash,'expectedRevision',s.expected_revision,'review',s.review,'error',s.error_code,
 'objectKey',(SELECT object_key FROM app.source_documents WHERE tenant_id=s.tenant_id AND id=s.source_id),
 'stage',CASE WHEN s.state='uploaded' AND EXISTS(SELECT 1 FROM app.cv_import_tasks WHERE source_id=s.source_id AND state='queued') THEN 'queued'
 WHEN s.state='processing' THEN CASE WHEN EXISTS(SELECT 1 FROM app.ai_enhancement_operations WHERE import_id=s.source_id AND target_id='extract') THEN 'extracting' ELSE 'checking' END ELSE NULL END)
$$;
CREATE FUNCTION app.expire_cv_import_tasks(p_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 UPDATE app.cv_import_sessions sx SET state=CASE WHEN sx.expires_at<=clock_timestamp() THEN 'unknown'
 WHEN NOT EXISTS(SELECT 1 FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=qx.user_id WHERE t.id=qx.tenant_id AND t.owner_user_id=qx.user_id AND t.state='active' AND m.state='active') THEN 'cancelled' ELSE 'unknown' END,
 error_code='AI_TIMEOUT_UNKNOWN'
 FROM app.cv_import_tasks qx WHERE qx.source_id=sx.source_id AND qx.state IN ('queued','processing') AND sx.state IN ('uploaded','processing') AND
 ((qx.state='processing' AND qx.started_at<clock_timestamp()-interval '120 seconds') OR sx.expires_at<=clock_timestamp() OR NOT EXISTS(
 SELECT 1 FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=qx.user_id WHERE t.id=qx.tenant_id AND t.owner_user_id=qx.user_id AND t.state='active' AND m.state='active'));
 UPDATE app.cv_import_tasks qx SET state='done',source_base64=NULL WHERE qx.state<>'done' AND EXISTS(SELECT 1 FROM app.cv_import_sessions sx WHERE sx.source_id=qx.source_id AND sx.state NOT IN ('uploading','uploaded','processing'));
END $$;
CREATE FUNCTION app.claim_cv_import_task(p_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q app.cv_import_tasks; s app.cv_import_sessions;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 PERFORM app.expire_cv_import_tasks(p_secret);
 -- Claim the parent first: all state changes lock session -> task in the same order.
 SELECT s0.* INTO s FROM app.cv_import_sessions s0 JOIN app.cv_import_tasks q0 ON q0.source_id=s0.source_id
 JOIN app.tenants t ON t.id=s0.tenant_id JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=q0.user_id
 WHERE q0.state='queued' AND s0.state='uploaded' AND s0.expires_at>clock_timestamp()
 AND t.state='active' AND t.owner_user_id=q0.user_id AND m.state='active'
 ORDER BY q0.created_at,q0.source_id FOR UPDATE OF s0 SKIP LOCKED LIMIT 1;
 IF s.source_id IS NULL THEN RETURN NULL;END IF;
 UPDATE app.cv_import_tasks SET state='processing',lease=gen_random_uuid(),started_at=clock_timestamp() WHERE source_id=s.source_id AND state='queued' RETURNING * INTO q;
 IF q.source_id IS NULL THEN RETURN NULL;END IF;
 UPDATE app.cv_import_sessions SET state='processing',error_code=NULL WHERE source_id=s.source_id RETURNING * INTO s;
 RETURN jsonb_build_object('lease',q.lease,'userId',q.user_id,'record',app.cv_import_json(s),'base64',q.source_base64);
END $$;
-- This internal helper only authorizes one claimed import. It cannot accept a user ID
-- or an arbitrary operation and is never executable by API roles.
CREATE FUNCTION app.cv_import_task_context(p_secret text,p_lease uuid,p_settlement boolean DEFAULT false) RETURNS app.cv_import_tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q app.cv_import_tasks; s app.cv_import_sessions;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT s0.* INTO s FROM app.cv_import_sessions s0 JOIN app.cv_import_tasks q0 ON q0.source_id=s0.source_id WHERE q0.lease=p_lease FOR UPDATE OF s0;
 SELECT * INTO q FROM app.cv_import_tasks WHERE lease=p_lease;
 IF q.source_id IS NULL OR q.started_at<clock_timestamp()-interval '120 seconds' OR (NOT p_settlement AND
 (q.state<>'processing' OR s.state<>'processing' OR s.expires_at<=clock_timestamp() OR NOT EXISTS(
 SELECT 1 FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=q.user_id
 WHERE t.id=q.tenant_id AND t.owner_user_id=q.user_id AND t.state='active' AND m.state='active'))) THEN
 RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 PERFORM set_config('request.jwt.claim.sub',q.user_id::text,true);
 RETURN q;
END $$;
CREATE FUNCTION app.reserve_cv_import_task_stage(p_secret text,p_lease uuid,p_operation uuid,p_import uuid,p_stage text,p_policy text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q app.cv_import_tasks;
BEGIN
 q:=app.cv_import_task_context(p_secret,p_lease);
 IF p_import IS DISTINCT FROM q.source_id THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
 RETURN app.reserve_document_operation(p_operation,p_import,p_stage,p_policy,p_secret);
END $$;
CREATE FUNCTION app.cv_import_task_attempt(p_secret text,p_lease uuid,p_start jsonb,p_attempt text,p_result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q app.cv_import_tasks; operation uuid;
BEGIN
 q:=app.cv_import_task_context(p_secret,p_lease,p_start IS NULL);
 IF p_start IS NOT NULL THEN
  operation:=(p_start->>'operationId')::uuid;
 ELSE
  SELECT operation_id INTO operation FROM app.ai_enhancement_attempts WHERE tenant_id=q.tenant_id AND id=p_attempt;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.ai_enhancement_operations WHERE id=operation AND tenant_id=q.tenant_id AND import_id=q.source_id) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
 IF p_start IS NOT NULL THEN RETURN app.begin_ai_attempt(p_start,p_secret);END IF;
 RETURN app.finish_ai_attempt(p_attempt,p_result,p_secret);
END $$;
CREATE FUNCTION app.finish_cv_import_task(p_secret text,p_lease uuid,p_state text,p_review jsonb,p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q app.cv_import_tasks; operation uuid;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 IF NOT EXISTS(SELECT 1 FROM app.cv_import_tasks WHERE lease=p_lease AND state='processing') THEN RETURN NULL;END IF;
 q:=app.cv_import_task_context(p_secret,p_lease);
 IF p_state IS NULL OR p_state NOT IN ('ready','failed','unknown','not_cv','uncertain','disabled') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT operation_id INTO operation FROM app.cv_import_sessions WHERE source_id=q.source_id;
 RETURN app.complete_cv_import(operation,p_state,p_review,p_error,p_secret);
END $$;
REVOKE ALL ON FUNCTION app.clear_cv_import_task(),app.queue_cv_import(uuid,text),app.expire_cv_import_tasks(text),app.claim_cv_import_task(text),app.cv_import_task_context(text,uuid,boolean),app.reserve_cv_import_task_stage(text,uuid,uuid,uuid,text,text),app.cv_import_task_attempt(text,uuid,jsonb,text,jsonb),app.finish_cv_import_task(text,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.queue_cv_import(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.expire_cv_import_tasks(text),app.claim_cv_import_task(text),app.reserve_cv_import_task_stage(text,uuid,uuid,uuid,text,text),app.cv_import_task_attempt(text,uuid,jsonb,text,jsonb),app.finish_cv_import_task(text,uuid,text,jsonb,text) TO anon;
