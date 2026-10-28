-- Prepared for review only. Do not apply to hosted databases without separate approval.
-- Reuse normalized jobs and confirm_job; an editor snapshot is not a canonical CV version.
CREATE TABLE app.target_job_contexts (
 tenant_id uuid NOT NULL, job_id uuid PRIMARY KEY, job_version_id uuid,
 snapshot_id uuid NOT NULL, snapshot_revision bigint NOT NULL,
 intake jsonb NOT NULL, requirements jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 FOREIGN KEY(tenant_id,job_id,job_version_id) REFERENCES app.job_versions(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id)
);
ALTER TABLE app.target_job_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.target_job_contexts FROM PUBLIC,anon,authenticated;
CREATE POLICY owner_read ON app.target_job_contexts FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.target_job_contexts TO authenticated;

CREATE FUNCTION app.target_job_json(j app.target_job_contexts) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',j.job_id,'versionId',j.job_version_id,'createdAt',j.created_at,
 'state',CASE WHEN j.job_version_id IS NULL THEN 'draft' ELSE 'reviewed' END,'snapshotId',j.snapshot_id,'snapshotRevision',j.snapshot_revision,'intake',j.intake,'requirements',j.requirements)
$$;
CREATE FUNCTION app.load_editor_snapshot(p_snapshot uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app.editor_snapshot_json(s) FROM app.editor_draft_snapshots s WHERE s.tenant_id=app.tenant_for_user() AND s.id=p_snapshot
$$;
CREATE FUNCTION app.save_target_job(p_key uuid,p_snapshot uuid,p_revision bigint,p_intake jsonb,p_requirements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); r record; j jsonb; q jsonb; reqs jsonb:='[]'; n integer:=0; saved app.target_job_contexts;
BEGIN
 SELECT * INTO r FROM app.begin_request(w,'save_target_job',p_key,pg_catalog.jsonb_build_object('snapshot',p_snapshot,'revision',p_revision,'intake',p_intake,'requirements',p_requirements));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=p_snapshot AND revision=p_revision) THEN
 RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF pg_catalog.jsonb_typeof(p_intake) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_intake) k WHERE k NOT IN ('text','title','company','location','sourceUrl'))
 OR pg_catalog.jsonb_typeof(p_intake->'text') IS DISTINCT FROM 'string' OR pg_catalog.length(p_intake->>'text') NOT BETWEEN 1 AND 200000

 OR pg_catalog.jsonb_typeof(p_requirements) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_requirements)>100
 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
 FOR q IN SELECT * FROM pg_catalog.jsonb_array_elements(p_requirements) LOOP
 IF pg_catalog.jsonb_typeof(q) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(q) k WHERE k NOT IN ('text','priority'))
 OR q->>'priority' IS NULL OR q->>'priority' NOT IN ('required','preferred') OR pg_catalog.jsonb_typeof(q->'text') IS DISTINCT FROM 'string'
 OR pg_catalog.length(pg_catalog.btrim(q->>'text')) NOT BETWEEN 1 AND 1000 OR pg_catalog.strpos(p_intake->>'text',q->>'text')=0
 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REQUIREMENT'; END IF;
 n:=n+1;
 reqs:=reqs||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key','evidence_'||n,'category','responsibilities','priority',q->>'priority',
 'sourceText',q->>'text','atoms',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('concept','evidence_'||n))));
 END LOOP;
 INSERT INTO app.jobs(tenant_id,draft_payload) VALUES(w,p_intake) RETURNING pg_catalog.jsonb_build_object('jobId',id) INTO j;
 INSERT INTO app.target_job_contexts(tenant_id,job_id,job_version_id,snapshot_id,snapshot_revision,intake,requirements)
 VALUES(w,(j->>'jobId')::uuid,NULL,p_snapshot,p_revision,p_intake,p_requirements) RETURNING * INTO saved;
 RETURN app.finish_request(w,r.request_id,app.target_job_json(saved));
END $$;
CREATE FUNCTION app.list_target_jobs() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',j.job_id,'createdAt',j.created_at,
 'state',CASE WHEN j.job_version_id IS NULL THEN 'draft' ELSE 'reviewed' END,
 'title',pg_catalog.left(coalesce(j.intake->>'title',''),200)) ORDER BY j.created_at DESC,j.job_id),'[]') FROM
 (SELECT * FROM app.target_job_contexts WHERE tenant_id=app.tenant_for_user() ORDER BY created_at DESC,job_id LIMIT 50) j
$$;
CREATE FUNCTION app.get_target_job(p_job uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app.target_job_json(j) FROM app.target_job_contexts j WHERE tenant_id=app.tenant_for_user() AND job_id=p_job
$$;
CREATE FUNCTION app.review_target_job(p_key uuid,p_job uuid,p_title text,p_company text,p_requirements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); r record; c app.target_job_contexts; q jsonb; reqs jsonb:='[]'; n integer:=0; j jsonb;
BEGIN
 SELECT * INTO r FROM app.begin_request(w,'review_target_job',p_key,pg_catalog.jsonb_build_object('job',p_job,'title',p_title,'company',p_company,'requirements',p_requirements));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF c.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF c.job_version_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_title IS NULL OR p_company IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 20000 OR pg_catalog.length(pg_catalog.btrim(p_company)) NOT BETWEEN 1 AND 20000
 OR pg_catalog.jsonb_typeof(p_requirements) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_requirements)>100 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
 FOR q IN SELECT * FROM pg_catalog.jsonb_array_elements(p_requirements) LOOP
 IF q->>'priority' IS NULL OR q->>'priority' NOT IN ('required','preferred') OR pg_catalog.jsonb_typeof(q->'text') IS DISTINCT FROM 'string'
 OR pg_catalog.length(pg_catalog.btrim(q->>'text')) NOT BETWEEN 1 AND 1000 OR pg_catalog.strpos(c.intake->>'text',q->>'text')=0
 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REQUIREMENT'; END IF;
 n:=n+1; reqs:=reqs||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key','evidence_'||n,'category','responsibilities','priority',q->>'priority','sourceText',q->>'text',
 'atoms',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('concept','evidence_'||n))));
 END LOOP;
 j:=app.confirm_job(p_key,p_job,0,(c.intake-'sourceUrl')||pg_catalog.jsonb_build_object('title',p_title,'company',p_company,'captureKind','paste','requirements',reqs));
 UPDATE app.target_job_contexts SET job_version_id=(j->>'jobVersionId')::uuid,requirements=p_requirements,
 intake=intake||pg_catalog.jsonb_build_object('title',p_title,'company',p_company) WHERE job_id=p_job RETURNING * INTO c;
 RETURN app.finish_request(w,r.request_id,app.target_job_json(c));
END $$;
REVOKE EXECUTE ON FUNCTION app.review_target_job(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.review_target_job(uuid,uuid,text,text,jsonb) TO authenticated;
-- A server-only secret protects accounting mutations from direct authenticated RPC callers.
-- The owner must configure a random secret's SHA256 hash through an approved DB change;
-- the plaintext goes only into the Worker AI_WORKER_SECRET. No hash/value is installed here.
CREATE TABLE app.ai_worker_authorization (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), secret_hash bytea NOT NULL);
REVOKE ALL ON app.ai_worker_authorization FROM PUBLIC,anon,authenticated;
ALTER TABLE app.ai_worker_authorization ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION app.require_ai_worker(p_secret text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_secret IS NULL OR pg_catalog.length(p_secret)<32 OR NOT EXISTS(SELECT 1 FROM app.ai_worker_authorization WHERE secret_hash=pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8'))) THEN
 RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
END $$;
CREATE TABLE app.ai_enhancement_operations (
 tenant_id uuid NOT NULL, id uuid PRIMARY KEY, snapshot_id uuid NOT NULL, revision bigint NOT NULL,
 target_id text NOT NULL CHECK(length(target_id) BETWEEN 1 AND 128), policy text NOT NULL CHECK(length(policy) BETWEEN 1 AND 128),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id)
);
CREATE TABLE app.ai_enhancement_attempts (
 tenant_id uuid NOT NULL, id text PRIMARY KEY CHECK(length(id)<=128), operation_id uuid NOT NULL,
 start_data jsonb NOT NULL CHECK(octet_length(start_data::text)<8192), result_data jsonb CHECK(octet_length(result_data::text)<8192),
 FOREIGN KEY(tenant_id,operation_id) REFERENCES app.ai_enhancement_operations(tenant_id,id)
);
CREATE UNIQUE INDEX ai_response_once ON app.ai_enhancement_attempts((start_data->>'provider'),(start_data->>'providerScope'),(result_data->>'providerResponseId')) WHERE result_data->>'providerResponseId' IS NOT NULL;
ALTER TABLE app.ai_enhancement_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ai_enhancement_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.ai_enhancement_operations,app.ai_enhancement_attempts FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.reserve_enhancement(p_operation uuid,p_snapshot uuid,p_revision bigint,p_target text,p_policy text,p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); o app.ai_enhancement_operations; created boolean;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 IF NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=p_snapshot AND revision=p_revision) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 INSERT INTO app.ai_enhancement_operations(tenant_id,id,snapshot_id,revision,target_id,policy) VALUES(w,p_operation,p_snapshot,p_revision,p_target,p_policy) ON CONFLICT(id) DO NOTHING;
 created:=FOUND;
 SELECT * INTO o FROM app.ai_enhancement_operations WHERE tenant_id=w AND id=p_operation;
 IF o.id IS NULL OR o.snapshot_id<>p_snapshot OR o.revision<>p_revision OR o.target_id<>p_target OR o.policy<>p_policy THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN pg_catalog.jsonb_build_object('created',created);
END $$;
CREATE FUNCTION app.begin_ai_attempt(p_start jsonb,p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); a app.ai_enhancement_attempts; created boolean;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 IF p_start->>'userId' IS DISTINCT FROM app.require_user()::text OR p_start->>'provider' NOT IN ('openrouter','openai')
 OR p_start->>'attemptId' IS DISTINCT FROM ((p_start->>'operationId')||CASE p_start->>'provider' WHEN 'openrouter' THEN '-primary' ELSE '-fallback' END)
 THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
 INSERT INTO app.ai_enhancement_attempts(tenant_id,id,operation_id,start_data) VALUES(w,p_start->>'attemptId',(p_start->>'operationId')::uuid,p_start) ON CONFLICT(id) DO NOTHING;
 created:=FOUND;
 SELECT * INTO a FROM app.ai_enhancement_attempts WHERE tenant_id=w AND id=p_start->>'attemptId';
 IF a.id IS NULL OR a.start_data<>p_start THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN pg_catalog.jsonb_build_object('created',created,'attempt',a.start_data||pg_catalog.jsonb_build_object('result',a.result_data,'duplicateOf',NULL));
END $$;
CREATE FUNCTION app.finish_ai_attempt(p_attempt text,p_result jsonb,p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); a app.ai_enhancement_attempts;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO a FROM app.ai_enhancement_attempts WHERE tenant_id=w AND id=p_attempt FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF a.result_data IS NOT NULL AND a.result_data<>p_result THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 UPDATE app.ai_enhancement_attempts SET result_data=p_result WHERE id=p_attempt;
 RETURN a.start_data||pg_catalog.jsonb_build_object('result',p_result,'duplicateOf',NULL);
END $$;
REVOKE EXECUTE ON FUNCTION app.target_job_json(app.target_job_contexts),app.load_editor_snapshot(uuid),app.save_target_job(uuid,uuid,bigint,jsonb,jsonb),app.list_target_jobs(),app.get_target_job(uuid),app.require_ai_worker(text),app.reserve_enhancement(uuid,uuid,bigint,text,text,text),app.begin_ai_attempt(jsonb,text),app.finish_ai_attempt(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.load_editor_snapshot(uuid),app.save_target_job(uuid,uuid,bigint,jsonb,jsonb),app.list_target_jobs(),app.get_target_job(uuid),app.reserve_enhancement(uuid,uuid,bigint,text,text,text),app.begin_ai_attempt(jsonb,text),app.finish_ai_attempt(text,jsonb,text) TO authenticated;
