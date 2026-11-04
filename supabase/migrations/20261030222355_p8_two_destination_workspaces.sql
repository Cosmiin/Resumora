-- Durable work-in-progress is separate from confirmed evidence and accepted CVs.
CREATE TABLE app.workspace_drafts (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),kind text NOT NULL CHECK(kind IN ('intake','import-review','job-review','tailor-review','job-answer','translation-review','resume')),
 id uuid NOT NULL,revision bigint NOT NULL CHECK(revision>0),value jsonb NOT NULL CHECK(jsonb_typeof(value)='object' AND octet_length(value::text)<=1000000),
 updated_at timestamptz NOT NULL DEFAULT now(),submitted_job_id uuid,PRIMARY KEY(tenant_id,kind,id),FOREIGN KEY(tenant_id,submitted_job_id) REFERENCES app.jobs(tenant_id,id)
);
CREATE TABLE app.job_answers (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,revision bigint NOT NULL,answer jsonb NOT NULL,
 PRIMARY KEY(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES app.jobs(tenant_id,id)
);
CREATE TABLE app.career_operation_results (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('questions','rewrite','integration')),
 state text NOT NULL CHECK(state IN ('processing','ready','unknown','failed','accepted','rejected')),input jsonb NOT NULL,result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(octet_length(coalesce(result,'{}')::text)<=1048576)
);
ALTER TABLE app.workspace_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.career_operation_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.workspace_drafts,app.job_answers,app.career_operation_results FROM PUBLIC,anon,authenticated;
ALTER TABLE app.job_workflows ADD COLUMN answers_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE app.job_workflow_operations ADD COLUMN answers_revision bigint NOT NULL DEFAULT 0;
CREATE FUNCTION app.assert_workspace_resource(p_kind text,p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); valid boolean:=false;
BEGIN
 CASE p_kind
 WHEN 'intake' THEN valid:=true;
 WHEN 'resume' THEN valid:=p_id='00000000-0000-4000-8000-000000000001'::uuid;
 WHEN 'import-review' THEN valid:=EXISTS(SELECT 1 FROM app.cv_import_sessions WHERE tenant_id=w AND source_id=p_id AND state='ready' AND expires_at>now());
 WHEN 'job-review','job-answer' THEN valid:=EXISTS(SELECT 1 FROM app.jobs WHERE tenant_id=w AND id=p_id);
 WHEN 'tailor-review' THEN valid:=EXISTS(SELECT 1 FROM app.job_workflow_operations WHERE tenant_id=w AND id=p_id AND kind='tailor');
 WHEN 'translation-review' THEN valid:=EXISTS(SELECT 1 FROM app.document_language_proposals WHERE tenant_id=w AND id=p_id);
 ELSE valid:=false;
 END CASE;
 IF NOT valid THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
END $$;
CREATE FUNCTION app.workspace_draft_json(d app.workspace_drafts) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',d.id,'kind',d.kind,'revision',d.revision,'value',d.value,'updatedAt',d.updated_at,'submittedJobId',d.submitted_job_id)
$$;
CREATE FUNCTION app.get_workspace_draft(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); d app.workspace_drafts;
BEGIN
 PERFORM app.assert_workspace_resource(p_kind,p_id);
 SELECT * INTO d FROM app.workspace_drafts WHERE tenant_id=w AND kind=p_kind AND id=p_id;
 RETURN CASE WHEN d.id IS NULL THEN NULL ELSE app.workspace_draft_json(d) END;
END $$;
CREATE FUNCTION app.list_workspace_drafts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(app.workspace_draft_json(d)),'[]') FROM (SELECT * FROM app.workspace_drafts WHERE tenant_id=app.tenant_for_user() AND kind IN ('intake','resume','translation-review') AND submitted_job_id IS NULL ORDER BY updated_at DESC LIMIT 100) d
$$;
CREATE FUNCTION app.save_workspace_draft(p_key uuid,p_kind text,p_id uuid,p_revision bigint,p_value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; d app.workspace_drafts;r record;
BEGIN
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_workspace_resource(p_kind,p_id);
 IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>1000000 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE NOT k=ANY(CASE p_kind WHEN 'intake' THEN ARRAY['text','sourceUrl'] WHEN 'resume' THEN ARRAY['route'] WHEN 'import-review' THEN ARRAY['draft','selected','targets','ownerConfirmed','profileId','profileFingerprint'] WHEN 'job-review' THEN ARRAY['review','basisRevision'] WHEN 'tailor-review' THEN ARRAY['decisions','operationId'] WHEN 'job-answer' THEN ARRAY['entries','focused','integrationSelection','integrationOperationId'] WHEN 'translation-review' THEN ARRAY['values','confirmed','step','proposalId'] END)) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT * INTO r FROM app.begin_request(w,'save_workspace_draft',p_key,jsonb_build_object('kind',p_kind,'id',p_id,'revision',p_revision,'value',p_value));
 IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 SELECT * INTO d FROM app.workspace_drafts WHERE tenant_id=w AND kind=p_kind AND id=p_id FOR UPDATE;
 IF coalesce(d.revision,0)<>p_revision OR d.submitted_job_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 INSERT INTO app.workspace_drafts(tenant_id,kind,id,revision,value) VALUES(w,p_kind,p_id,p_revision+1,p_value)
 ON CONFLICT(tenant_id,kind,id) DO UPDATE SET revision=p_revision+1,value=p_value,updated_at=now() RETURNING * INTO d;
 RETURN app.finish_request(w,r.request_id,app.workspace_draft_json(d));
END $$;
CREATE FUNCTION app.submit_workspace_intake(p_key uuid,p_id uuid,p_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); d app.workspace_drafts;r record;saved jsonb;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 SELECT * INTO d FROM app.workspace_drafts WHERE tenant_id=w AND kind='intake' AND id=p_id FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF d.submitted_job_id IS NOT NULL THEN RETURN app.target_job_json((SELECT c FROM app.target_job_contexts c WHERE c.tenant_id=w AND c.job_id=d.submitted_job_id));END IF;
 IF d.revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 IF length(btrim(coalesce(d.value->>'text','')))>0 THEN
 saved:=app.save_target_job(p_key,NULL,NULL,jsonb_build_object('text',d.value->>'text')||CASE WHEN length(coalesce(d.value->>'sourceUrl',''))>0 THEN jsonb_build_object('sourceUrl',d.value->>'sourceUrl') ELSE '{}' END,'[]');
 ELSE saved:=app.save_target_url(p_key,d.value->>'sourceUrl'); END IF;
 UPDATE app.workspace_drafts SET submitted_job_id=(saved->>'id')::uuid WHERE tenant_id=w AND kind='intake' AND id=p_id;
 RETURN saved;
END $$;
CREATE FUNCTION app.get_job_answers(p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); rev bigint;
BEGIN
 SELECT answers_revision INTO rev FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job;
 IF rev IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 RETURN jsonb_build_object('revision',rev,'answers',(SELECT coalesce(jsonb_agg(answer||jsonb_build_object('revision',revision) ORDER BY id),'[]') FROM app.job_answers WHERE tenant_id=w AND job_id=p_job));
END $$;
CREATE FUNCTION app.save_job_answer(p_key uuid,p_job uuid,p_revision bigint,p_answer jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); f app.job_workflows;r record;b jsonb;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(w,'save_job_answer',p_key,jsonb_build_object('job',p_job,'revision',p_revision,'answer',p_answer));IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF f.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF f.answers_revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 IF jsonb_typeof(p_answer) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM unnest(ARRAY['id','requirementId','targetId','questionText','text','status']) k WHERE jsonb_typeof(p_answer->k) IS DISTINCT FROM 'string') OR p_answer-ARRAY['id','requirementId','targetId','questionText','text','status']<>'{}' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 SELECT payload INTO b FROM app.current_base_snapshot(w);
 IF f.reviewed IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(f.reviewed->'requirements') v WHERE v->>'id'=p_answer->>'requirementId')
 OR NOT (EXISTS(SELECT 1 FROM jsonb_array_elements(b#>'{content,roles}') v WHERE v->>'id'=p_answer->>'targetId') OR EXISTS(SELECT 1 FROM jsonb_array_elements(b#>'{content,optionalSections}') s CROSS JOIN LATERAL jsonb_array_elements(s->'entries') v WHERE v->>'id'=p_answer->>'targetId'))
 OR p_answer->>'status' NOT IN ('confirmed','unknown','skipped') OR length(coalesce(p_answer->>'questionText','')) NOT BETWEEN 1 AND 6000 OR length(coalesce(p_answer->>'text',''))>6000 OR (p_answer->>'status'='confirmed' AND length(btrim(coalesce(p_answer->>'text','')))=0) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 INSERT INTO app.job_answers VALUES(w,p_job,(p_answer->>'id')::uuid,p_revision+1,p_answer) ON CONFLICT(tenant_id,job_id,id) DO UPDATE SET revision=p_revision+1,answer=p_answer;
 UPDATE app.job_workflows SET answers_revision=answers_revision+1 WHERE tenant_id=w AND job_id=p_job;
 RETURN app.finish_request(w,r.request_id,app.get_job_answers(p_job));
END $$;
CREATE FUNCTION app.workspace_operation_json(o app.career_operation_results) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'kind',o.kind,'input',o.input,'state',CASE WHEN o.state='processing' AND o.created_at<now()-interval '2 minutes' THEN 'unknown' ELSE o.state END,'result',o.result,'createdAt',o.created_at)
$$;
CREATE FUNCTION app.get_workspace_operation(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app.workspace_operation_json(o) FROM app.career_operation_results o WHERE tenant_id=app.tenant_for_user() AND id=p_id
$$;
CREATE FUNCTION app.begin_workspace_operation(p_id uuid,p_kind text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); o app.career_operation_results;created boolean;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 IF p_kind NOT IN ('questions','rewrite','integration') OR octet_length(p_input::text)>16384 OR NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=(p_input->>'snapshotId')::uuid AND revision=(p_input->>'revision')::bigint) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 IF p_kind='integration' AND NOT EXISTS(SELECT 1 FROM app.job_workflows WHERE tenant_id=w AND job_id=(p_input->>'jobId')::uuid AND answers_revision=(p_input->>'answersRevision')::bigint) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 INSERT INTO app.career_operation_results(tenant_id,id,kind,state,input) VALUES(w,p_id,p_kind,'processing',p_input) ON CONFLICT(id) DO NOTHING;created:=FOUND;
 SELECT * INTO o FROM app.career_operation_results WHERE tenant_id=w AND id=p_id;
 IF o.id IS NULL OR o.input IS DISTINCT FROM p_input OR o.kind<>p_kind THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;
 RETURN jsonb_build_object('created',created,'operation',app.workspace_operation_json(o));
END $$;
CREATE FUNCTION app.finish_workspace_operation(p_id uuid,p_state text,p_result jsonb,p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();o app.career_operation_results;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 IF p_state NOT IN ('ready','unknown','failed') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 UPDATE app.career_operation_results SET state=p_state,result=p_result WHERE tenant_id=w AND id=p_id AND state IN ('processing','unknown') RETURNING * INTO o;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 RETURN app.workspace_operation_json(o);
END $$;
CREATE FUNCTION app.accept_profile_integration(p_key uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();o app.career_operation_results;b app.editor_draft_snapshots;f app.job_workflows;saved jsonb;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 SELECT * INTO o FROM app.career_operation_results WHERE tenant_id=w AND id=p_operation AND kind='integration' FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF o.state='accepted' THEN RETURN o.result->'accepted';END IF;
 SELECT * INTO b FROM app.current_base_snapshot(w);
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=(o.input->>'jobId')::uuid FOR UPDATE;
 IF o.state<>'ready' OR b.id IS DISTINCT FROM (o.input->>'snapshotId')::uuid OR b.revision IS DISTINCT FROM (o.input->>'revision')::bigint OR f.answers_revision IS DISTINCT FROM (o.input->>'answersRevision')::bigint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 saved:=app.write_base_draft(p_key,b.revision,o.result->'draft','autosave',NULL);
 UPDATE app.career_operation_results SET state='accepted',result=jsonb_build_object('accepted',saved) WHERE id=p_operation;
 RETURN saved;
END $$;
-- Source pins include confirmed job answers, not merely Base and advert revisions.
CREATE OR REPLACE FUNCTION app.job_workflow_json(o app.job_workflow_operations) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'kind',o.kind,'state',CASE WHEN o.state='processing' AND o.started_at<now()-interval '3 minutes' THEN 'unknown' ELSE o.state END,'jobRevision',o.job_revision,'answersRevision',o.answers_revision,'snapshotId',o.snapshot_id,'snapshotRevision',o.snapshot_revision,'documentVersionId',o.document_version_id,'documentLocale',o.requested_locale,'targetLocale',o.target_locale,'targetDocumentVersionId',o.target_document_version_id,'result',o.result,'error',o.error,'createdAt',o.created_at)
$$;
ALTER FUNCTION app.request_job_workflow(uuid,uuid,text,bigint,text,text) RENAME TO request_job_workflow_before_workspace;
CREATE FUNCTION app.request_job_workflow(p_key uuid,p_job uuid,p_kind text,p_revision bigint,p_target text DEFAULT NULL,p_locale text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();existed boolean;rev bigint;v jsonb;o app.job_workflow_operations;
BEGIN
 SELECT answers_revision INTO rev FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 existed:=EXISTS(SELECT 1 FROM app.job_workflow_operations WHERE tenant_id=w AND id=p_key);
 UPDATE app.job_workflow_operations SET state='stale' WHERE tenant_id=w AND job_id=p_job AND kind IN ('match','tailor') AND state IN ('ready','queued') AND answers_revision<>rev;
 v:=app.request_job_workflow_before_workspace(p_key,p_job,p_kind,p_revision,p_target,p_locale);
 IF NOT existed THEN UPDATE app.job_workflow_operations SET answers_revision=rev WHERE tenant_id=w AND id=p_key;END IF;
 SELECT * INTO o FROM app.job_workflow_operations WHERE tenant_id=w AND id=p_key;
 RETURN app.job_workflow_json(o);
END $$;
ALTER FUNCTION app.claim_job_workflow(text,boolean) RENAME TO claim_job_workflow_before_workspace;
CREATE FUNCTION app.claim_job_workflow(p_secret text,p_fetch_only boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;f app.job_workflows;
BEGIN
 v:=app.claim_job_workflow_before_workspace(p_secret,p_fetch_only);IF v IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO f FROM app.job_workflows WHERE job_id=(v->>'jobId')::uuid FOR UPDATE;
 IF v#>>'{operation,kind}' IN ('match','tailor') AND (v#>>'{operation,answersRevision}')::bigint<>f.answers_revision THEN UPDATE app.job_workflow_operations SET state='stale',lease=NULL WHERE id=(v#>>'{operation,id}')::uuid;RETURN NULL;END IF;
 RETURN v||jsonb_build_object('jobAnswers',(SELECT coalesce(jsonb_agg(answer||jsonb_build_object('revision',revision)),'[]') FROM app.job_answers WHERE tenant_id=f.tenant_id AND job_id=f.job_id));
END $$;
ALTER FUNCTION app.finish_job_workflow(text,uuid,jsonb,text) RENAME TO finish_job_workflow_before_workspace;
CREATE FUNCTION app.finish_job_workflow(p_secret text,p_lease uuid,p_result jsonb,p_error text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.job_workflow_operations;f app.job_workflows;v jsonb;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO o FROM app.job_workflow_operations WHERE lease=p_lease;
 SELECT * INTO f FROM app.job_workflows WHERE job_id=o.job_id FOR UPDATE;
 IF o.kind IN ('match','tailor') AND o.answers_revision<>f.answers_revision THEN UPDATE app.job_workflow_operations SET state='stale',lease=NULL WHERE id=o.id RETURNING * INTO o;RETURN app.job_workflow_json(o);END IF;
 v:=app.finish_job_workflow_before_workspace(p_secret,p_lease,p_result,p_error);
 UPDATE app.job_workflow_operations SET answers_revision=o.answers_revision WHERE match_id=o.id AND state='queued';
 RETURN v;
END $$;
ALTER FUNCTION app.save_current_job_document(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid) RENAME TO save_current_job_document_before_workspace;
CREATE FUNCTION app.save_current_job_document(p_key uuid,p_job uuid,p_locale text,p_document uuid,p_expected_revision bigint,p_payload jsonb,p_base_snapshot uuid,p_provenance jsonb DEFAULT NULL,p_operation uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();op app.job_workflow_operations;rev bigint;
BEGIN
 SELECT answers_revision INTO rev FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF p_operation IS NOT NULL THEN SELECT * INTO op FROM app.job_workflow_operations WHERE tenant_id=w AND id=p_operation;IF op.answers_revision IS DISTINCT FROM rev THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;END IF;
 RETURN app.save_current_job_document_before_workspace(p_key,p_job,p_locale,p_document,p_expected_revision,p_payload,p_base_snapshot,p_provenance,p_operation);
END $$;
ALTER FUNCTION app.remove_base_cv(uuid,bigint,bigint) RENAME TO remove_base_cv_before_workspace;
CREATE FUNCTION app.remove_base_cv(p_key uuid,p_expected_revision bigint,p_expected_generation bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();v jsonb;previous_generation bigint;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 previous_generation:=(app.load_base_state()->>'generation')::bigint;
 v:=app.remove_base_cv_before_workspace(p_key,p_expected_revision,p_expected_generation);
 IF (v->>'generation')::bigint=previous_generation THEN RETURN v;END IF;
 DELETE FROM app.workspace_drafts WHERE tenant_id=w AND kind NOT IN ('intake','resume','job-review');
 DELETE FROM app.job_answers WHERE tenant_id=w;DELETE FROM app.career_operation_results WHERE tenant_id=w;
 UPDATE app.job_workflows SET answers_revision=answers_revision+1 WHERE tenant_id=w;
 UPDATE app.idempotency_requests SET result_refs='{}',expires_at=now() WHERE tenant_id=w AND command_kind IN ('save_workspace_draft','save_job_answer');
 RETURN v;
END $$;
-- Helpers and previous implementations remain inaccessible through the Data API.
REVOKE ALL ON FUNCTION app.assert_workspace_resource(text,uuid),app.workspace_draft_json(app.workspace_drafts),app.workspace_operation_json(app.career_operation_results),app.request_job_workflow_before_workspace(uuid,uuid,text,bigint,text,text),app.claim_job_workflow_before_workspace(text,boolean),app.finish_job_workflow_before_workspace(text,uuid,jsonb,text),app.save_current_job_document_before_workspace(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid),app.remove_base_cv_before_workspace(uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f regprocedure;BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN ('get_workspace_draft','list_workspace_drafts','save_workspace_draft','submit_workspace_intake','get_job_answers','save_job_answer','get_workspace_operation','begin_workspace_operation','finish_workspace_operation','accept_profile_integration','request_job_workflow','claim_job_workflow','finish_job_workflow','save_current_job_document','remove_base_cv') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);
 END LOOP;
 -- The configured worker uses publishable credentials plus the existing worker secret.
 GRANT EXECUTE ON FUNCTION app.claim_job_workflow(text,boolean),app.finish_job_workflow(text,uuid,jsonb,text) TO anon;
END $$;

CREATE OR REPLACE FUNCTION app.get_job_answers(p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); rev bigint;
BEGIN
 SELECT answers_revision INTO rev FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job;
 IF rev IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 RETURN jsonb_build_object('revision',rev,'answers',(SELECT coalesce(jsonb_agg(answer||jsonb_build_object('revision',revision) ORDER BY id),'[]') FROM app.job_answers WHERE tenant_id=w AND job_id=p_job),'integrations',(SELECT coalesce(jsonb_agg(app.workspace_operation_json(o) ORDER BY o.created_at DESC),'[]') FROM (SELECT * FROM app.career_operation_results WHERE tenant_id=w AND kind='integration' AND input->>'jobId'=p_job::text ORDER BY created_at DESC LIMIT 10) o));
END $$;
CREATE FUNCTION app.reject_workspace_operation(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();o app.career_operation_results;
BEGIN
 UPDATE app.career_operation_results SET state='rejected',result=NULL WHERE tenant_id=w AND id=p_id AND kind='integration' AND state IN ('ready','unknown','failed','rejected') RETURNING * INTO o;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 RETURN app.workspace_operation_json(o);
END $$;
REVOKE ALL ON FUNCTION app.reject_workspace_operation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.reject_workspace_operation(uuid) TO authenticated;

ALTER FUNCTION app.get_cv_import(uuid) RENAME TO get_cv_import_before_workspace;
CREATE FUNCTION app.get_cv_import(p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();operation uuid;
BEGIN
 SELECT operation_id INTO operation FROM app.cv_import_sessions WHERE tenant_id=w AND source_id=p_operation;
 RETURN app.get_cv_import_before_workspace(coalesce(operation,p_operation));
END $$;
REVOKE ALL ON FUNCTION app.get_cv_import_before_workspace(uuid),app.get_cv_import(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_cv_import(uuid) TO authenticated;
-- Do not spend another provider attempt after confirmed job evidence changed.
ALTER FUNCTION app.job_workflow_attempt(text,uuid,jsonb,text,jsonb) RENAME TO job_workflow_attempt_before_workspace;
CREATE FUNCTION app.job_workflow_attempt(p_secret text,p_lease uuid,p_start jsonb,p_attempt text,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.job_workflow_operations;f app.job_workflows;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO o FROM app.job_workflow_operations WHERE lease=p_lease;
 SELECT * INTO f FROM app.job_workflows WHERE job_id=o.job_id;
 IF o.kind IN ('match','tailor') AND o.answers_revision<>f.answers_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 RETURN app.job_workflow_attempt_before_workspace(p_secret,p_lease,p_start,p_attempt,p_result);
END $$;
REVOKE ALL ON FUNCTION app.job_workflow_attempt_before_workspace(text,uuid,jsonb,text,jsonb),app.job_workflow_attempt(text,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.job_workflow_attempt(text,uuid,jsonb,text,jsonb) TO anon;
