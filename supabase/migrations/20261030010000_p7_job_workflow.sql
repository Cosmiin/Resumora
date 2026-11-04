-- Additive, local review artifact only. No hosted activation or provider policy.
-- References the existing account-owned advert and immutable editor snapshots.
CREATE TABLE app.job_workflows (
 tenant_id uuid NOT NULL, job_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 extracted jsonb, reviewed jsonb, source_parent_id uuid, actions jsonb NOT NULL DEFAULT '{}',
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,source_parent_id) REFERENCES app.jobs(tenant_id,id)
);
CREATE TABLE app.job_workflow_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,user_id uuid NOT NULL,job_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('fetch','extract','match','tailor')),job_revision bigint NOT NULL,
 snapshot_id uuid,snapshot_revision bigint,document_version_id uuid,requested_locale text CHECK(requested_locale IN ('ro','en')),target_locale text NOT NULL DEFAULT 'ro' CHECK(target_locale IN ('ro','en')),target_document_version_id uuid,match_id uuid,target_id text, then_tailor boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','ready','failed','cancelled','stale','unknown')),
 result jsonb CHECK(result IS NULL OR octet_length(result::text)<=524288),error text,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),started_at timestamptz,lease uuid,
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id),
 CHECK((snapshot_id IS NULL)=(snapshot_revision IS NULL))
);
ALTER TABLE app.job_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_workflow_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.job_workflows,app.job_workflow_operations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.initialize_job_workflow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;
BEGIN
 SELECT owner_user_id INTO u FROM app.tenants WHERE id=NEW.tenant_id;
 INSERT INTO app.job_workflows(tenant_id,job_id) VALUES(NEW.tenant_id,NEW.job_id);
 INSERT INTO app.job_workflow_operations(tenant_id,user_id,job_id,kind,job_revision) VALUES(NEW.tenant_id,u,NEW.job_id,CASE WHEN NEW.intake->>'text'='' THEN 'fetch' ELSE 'extract' END,1);
 RETURN NEW;
END $$;
CREATE TRIGGER initialize_job_workflow AFTER INSERT ON app.target_job_contexts FOR EACH ROW EXECUTE FUNCTION app.initialize_job_workflow();
INSERT INTO app.job_workflows(tenant_id,job_id) SELECT tenant_id,job_id FROM app.target_job_contexts;
-- Historical jobs are not automatically sent to a model on migration.
CREATE FUNCTION app.job_workflow_json(o app.job_workflow_operations) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'kind',o.kind,'state',CASE WHEN o.state='processing' AND o.started_at<now()-interval '3 minutes' THEN 'unknown' ELSE o.state END,
 'jobRevision',o.job_revision,'snapshotId',o.snapshot_id,'snapshotRevision',o.snapshot_revision,'documentVersionId',o.document_version_id,'documentLocale',o.requested_locale,'targetLocale',o.target_locale,'targetDocumentVersionId',o.target_document_version_id,'result',o.result,'error',o.error,'createdAt',o.created_at)
$$;
CREATE FUNCTION app.get_job_workflow(p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); f app.job_workflows; c app.target_job_contexts; operations jsonb; duplicates jsonb;
BEGIN
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job;
 IF f.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job;
 SELECT coalesce(jsonb_agg(app.job_workflow_json(o) ORDER BY o.created_at DESC),'[]') INTO operations FROM
 (SELECT * FROM app.job_workflow_operations WHERE tenant_id=w AND job_id=p_job ORDER BY created_at DESC,id LIMIT 20) o;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.job_id,'title',coalesce(j.intake->>'title',''),
 'kind',CASE WHEN j.intake->>'text'=c.intake->>'text' THEN 'exact' ELSE 'updated' END)),'[]') INTO duplicates FROM
 (SELECT * FROM app.target_job_contexts j WHERE j.tenant_id=w AND j.job_id<>p_job AND
 (j.intake->>'text'=c.intake->>'text' OR (nullif(split_part(j.intake->>'sourceUrl','?',1),'') IS NOT NULL AND split_part(j.intake->>'sourceUrl','?',1)=split_part(c.intake->>'sourceUrl','?',1))) ORDER BY j.created_at DESC LIMIT 5) j;
 RETURN jsonb_build_object('revision',f.revision,'extracted',f.extracted,'reviewed',f.reviewed,'operations',operations,'sourceParentId',f.source_parent_id,'duplicates',duplicates,'actions',f.actions);
END $$;
CREATE FUNCTION app.review_job_workflow(p_key uuid,p_job uuid,p_revision bigint,p_value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); f app.job_workflows; r record; requirement jsonb; prior jsonb; normalized jsonb:='[]';
BEGIN
 SELECT * INTO r FROM app.begin_request(w,'review_job_workflow',p_key,jsonb_build_object('job',p_job,'revision',p_revision,'value',p_value));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF f.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF f.revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_value->>'schemaVersion' IS DISTINCT FROM 'vacancy-extraction/3' OR jsonb_typeof(p_value->'overview') IS DISTINCT FROM 'object' OR jsonb_typeof(p_value->'requirements') IS DISTINCT FROM 'array' OR jsonb_array_length(p_value->'requirements')>200 OR octet_length(p_value::text)>524288 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
 FOR requirement IN SELECT * FROM jsonb_array_elements(p_value->'requirements') LOOP
  SELECT x INTO prior FROM jsonb_array_elements(coalesce(f.reviewed->'requirements',f.extracted->'requirements','[]')) x WHERE x->>'id'=requirement->>'id';
  IF prior IS NOT NULL AND prior->>'text' IS DISTINCT FROM requirement->>'text' THEN requirement:=requirement||jsonb_build_object('components',jsonb_build_array(jsonb_build_object('id',(requirement->>'id')||'_manual','text',requirement->>'text')),'operator','and','evidence','[]'::jsonb,'emphasis','unknown');END IF;
  normalized:=normalized||jsonb_build_array(requirement);
 END LOOP;
 p_value:=jsonb_set(p_value,'{requirements}',normalized);
 UPDATE app.job_workflows SET reviewed=p_value,revision=revision+1 WHERE job_id=p_job;
 UPDATE app.job_workflow_operations SET state='stale',lease=NULL WHERE job_id=p_job AND state IN ('queued','processing');
 RETURN app.finish_request(w,r.request_id,app.get_job_workflow(p_job));
END $$;
CREATE FUNCTION app.request_job_workflow(p_key uuid,p_job uuid,p_kind text,p_revision bigint,p_target text DEFAULT NULL,p_locale text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); f app.job_workflows; s app.editor_draft_snapshots; o app.job_workflow_operations; r record; m uuid; doc uuid; target_doc uuid; target_locale text;
BEGIN
 SELECT * INTO r FROM app.begin_request(w,'request_job_workflow',p_key,jsonb_build_object('job',p_job,'kind',p_kind,'revision',p_revision,'target',p_target,'locale',p_locale));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF f.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF f.revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF (p_locale IS NOT NULL AND p_locale NOT IN ('ro','en')) OR p_kind IS NULL OR p_kind NOT IN ('fetch','extract','match','tailor','prepare') OR (p_target IS NOT NULL AND (p_kind<>'tailor' OR length(p_target) NOT BETWEEN 1 AND 256)) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_workflow_operations WHERE job_id=p_job AND state IN ('queued','processing') AND created_at>now()-interval '3 minutes') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='COMMAND_IN_PROGRESS'; END IF;
 IF (p_kind='fetch' AND NOT EXISTS(SELECT 1 FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job AND intake->>'text'='' AND intake->>'sourceUrl' IS NOT NULL)) OR (p_kind='extract' AND NOT EXISTS(SELECT 1 FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job AND length(intake->>'text')>0)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB';END IF;
 IF p_kind NOT IN ('fetch','extract') THEN
  IF f.reviewed IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
  SELECT * INTO s FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
  SELECT id INTO doc FROM app.current_job_document_row(w,p_job,p_locale);
  target_locale:=coalesce(p_locale,s.payload#>>'{content,language}','ro');
  SELECT id INTO target_doc FROM app.current_job_document_row(w,p_job,target_locale);
 END IF;
 IF p_target IS NOT NULL AND p_target NOT IN ('summary','professionalSkills','technicalSkills') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.payload#>'{content,titles}','[]')) e WHERE e->>'fieldId'=p_target) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.payload#>'{content,education}','[]')) e WHERE e->>'id'=p_target) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.payload#>'{content,roles}','[]')) e WHERE e->>'id'=p_target) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.payload#>'{content,optionalSections}','[]')) section,LATERAL jsonb_array_elements(coalesce(section->'entries','[]')) e WHERE e->>'id'=p_target) AND NOT EXISTS(SELECT 1 FROM app.job_editor_versions v, LATERAL jsonb_array_elements(coalesce(v.payload#>'{content,titles}','[]')||coalesce(v.payload#>'{content,roles}','[]')||coalesce(v.payload#>'{content,education}','[]')||(SELECT coalesce(jsonb_agg(e),'[]') FROM jsonb_array_elements(coalesce(v.payload#>'{content,optionalSections}','[]')) sec,LATERAL jsonb_array_elements(coalesce(sec->'entries','[]')) e)) e WHERE v.id=target_doc AND (e->>'id'=p_target OR e->>'fieldId'=p_target)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 IF p_kind='tailor' THEN
  SELECT id INTO m FROM app.job_workflow_operations WHERE tenant_id=w AND job_id=p_job AND kind='match' AND state='ready' AND job_revision=f.revision AND snapshot_id=s.id AND document_version_id IS NOT DISTINCT FROM doc AND requested_locale IS NOT DISTINCT FROM p_locale ORDER BY created_at DESC,id DESC LIMIT 1;
  IF m IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 END IF;
 INSERT INTO app.job_workflow_operations(id,tenant_id,user_id,job_id,kind,job_revision,snapshot_id,snapshot_revision,document_version_id,requested_locale,target_locale,target_document_version_id,match_id,target_id,then_tailor)
 VALUES(p_key,w,app.require_user(),p_job,CASE WHEN p_kind='prepare' THEN 'match' ELSE p_kind END,f.revision,s.id,s.revision,doc,p_locale,coalesce(target_locale,'ro'),target_doc,m,p_target,p_kind='prepare') RETURNING * INTO o;
 RETURN app.finish_request(w,r.request_id,app.job_workflow_json(o));
END $$;
CREATE FUNCTION app.cancel_job_workflow(p_job uuid,p_operation uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.job_workflow_operations;
BEGIN
 UPDATE app.job_workflow_operations SET state='cancelled',lease=NULL WHERE tenant_id=app.tenant_for_user() AND job_id=p_job AND id=p_operation AND state IN ('queued','processing') RETURNING * INTO o;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 RETURN app.job_workflow_json(o);
END $$;
CREATE FUNCTION app.job_workflow_action(p_key uuid,p_job uuid,p_revision bigint,p_id text,p_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); r record; f app.job_workflows;
BEGIN
 SELECT * INTO r FROM app.begin_request(w,'job_workflow_action',p_key,jsonb_build_object('job',p_job,'revision',p_revision,'id',p_id,'state',p_state));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF f.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF f.revision<>p_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 256 OR p_state IS NULL OR p_state NOT IN ('include','dismissed','skipped','completed') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 IF octet_length(f.actions::text)>131072 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 UPDATE app.job_workflows SET actions=jsonb_set(actions,ARRAY[p_id],to_jsonb(p_state)) WHERE job_id=p_job;
 RETURN app.finish_request(w,r.request_id,app.get_job_workflow(p_job));
END $$;
-- One worker capability, using the existing server-only AI secret. No session
-- impersonation, service key or arbitrary owner/tenant selectors. Claims return
-- just the next durable operation's bounded inputs. Expired work is UNKNOWN,
-- never automatically redispatched to a paid provider.
ALTER TABLE app.ai_enhancement_operations ALTER COLUMN snapshot_id DROP NOT NULL;
ALTER TABLE app.ai_enhancement_operations ADD COLUMN job_id uuid;
ALTER TABLE app.ai_enhancement_operations DROP CONSTRAINT ai_enhancement_operations_check;
ALTER TABLE app.ai_enhancement_operations ADD CHECK(
 (job_id IS NULL AND ((import_id IS NULL AND snapshot_id IS NOT NULL AND revision IS NOT NULL) OR (import_id IS NOT NULL AND snapshot_id IS NULL AND revision IS NULL))) OR
 (job_id IS NOT NULL AND import_id IS NULL AND ((snapshot_id IS NULL AND revision IS NULL) OR (snapshot_id IS NOT NULL AND revision IS NOT NULL)))
);
ALTER TABLE app.ai_enhancement_operations ADD FOREIGN KEY(tenant_id,job_id) REFERENCES app.jobs(tenant_id,id);
CREATE FUNCTION app.claim_job_workflow(p_secret text,p_fetch_only boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.job_workflow_operations; f app.job_workflows; c app.target_job_contexts; s app.editor_draft_snapshots; d app.job_editor_versions;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 UPDATE app.job_workflow_operations SET state='unknown',lease=NULL,error='INTERRUPTED' WHERE state='processing' AND started_at<now()-interval '3 minutes';
 SELECT q.* INTO o FROM app.job_workflow_operations q JOIN app.tenants t ON t.id=q.tenant_id JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=q.user_id WHERE q.state='queued' AND (NOT p_fetch_only OR q.kind='fetch') AND t.state='active' AND m.state='active' AND t.owner_user_id=q.user_id ORDER BY q.created_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF o.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO f FROM app.job_workflows WHERE job_id=o.job_id;
 SELECT * INTO c FROM app.target_job_contexts WHERE job_id=o.job_id;
 SELECT * INTO s FROM app.editor_draft_snapshots WHERE tenant_id=o.tenant_id AND id=o.snapshot_id;
 SELECT * INTO d FROM app.job_editor_versions WHERE tenant_id=o.tenant_id AND id=o.document_version_id;
 IF f.revision<>o.job_revision OR (o.kind IN ('match','tailor') AND f.reviewed IS NULL) THEN UPDATE app.job_workflow_operations SET state='stale' WHERE id=o.id;RETURN NULL;END IF;
 UPDATE app.job_workflow_operations SET state='processing',started_at=clock_timestamp(),lease=gen_random_uuid() WHERE id=o.id RETURNING * INTO o;
 IF o.kind<>'fetch' THEN INSERT INTO app.ai_enhancement_operations(tenant_id,id,snapshot_id,revision,target_id,policy,job_id) VALUES(o.tenant_id,o.id,o.snapshot_id,o.snapshot_revision,'job:'||o.job_id,'job-workflow/1',o.job_id); END IF;
 RETURN jsonb_build_object('operation',app.job_workflow_json(o),'userId',o.user_id,'lease',o.lease,'jobId',o.job_id,'text',c.intake->>'text','sourceUrl',c.intake->>'sourceUrl','vacancy',f.reviewed,'base',s.payload,'document',CASE WHEN d.id IS NULL THEN NULL ELSE app.current_job_document_json(d) END,'match',(SELECT result FROM app.job_workflow_operations WHERE id=o.match_id),'targetDocument',(SELECT CASE WHEN v.id IS NULL THEN NULL ELSE app.current_job_document_json(v) END FROM app.current_job_document_row(o.tenant_id,o.job_id,o.target_locale) v),'targetId',o.target_id,'actions',f.actions);
END $$;
CREATE FUNCTION app.finish_job_workflow(p_secret text,p_lease uuid,p_result jsonb,p_error text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.job_workflow_operations; f app.job_workflows; latest uuid; doc uuid; target_doc uuid;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO o FROM app.job_workflow_operations WHERE lease=p_lease AND state='processing' FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=o.user_id WHERE t.id=o.tenant_id AND t.owner_user_id=o.user_id AND t.state='active' AND m.state='active') THEN UPDATE app.job_workflow_operations SET state='cancelled',result=NULL,lease=NULL WHERE id=o.id RETURNING * INTO o;RETURN app.job_workflow_json(o);END IF;
 SELECT * INTO f FROM app.job_workflows WHERE job_id=o.job_id FOR UPDATE;
 SELECT id INTO latest FROM app.editor_draft_snapshots WHERE tenant_id=o.tenant_id AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
 SELECT id INTO doc FROM app.current_job_document_row(o.tenant_id,o.job_id,o.requested_locale);
 SELECT id INTO target_doc FROM app.current_job_document_row(o.tenant_id,o.job_id,o.target_locale);
 IF (o.kind IN ('match','tailor') AND f.reviewed IS NULL) OR o.job_revision<>f.revision OR (o.kind NOT IN ('fetch','extract') AND (latest IS DISTINCT FROM o.snapshot_id OR doc IS DISTINCT FROM o.document_version_id OR ((o.kind='tailor' OR o.then_tailor) AND target_doc IS DISTINCT FROM o.target_document_version_id))) THEN UPDATE app.job_workflow_operations SET state='stale',lease=NULL WHERE id=o.id RETURNING * INTO o;RETURN app.job_workflow_json(o);END IF;
 IF (p_result IS NOT NULL AND (jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>524288)) OR (p_error IS NOT NULL AND p_error NOT IN ('OUTPUT_INVALID','PROVIDER_UNAVAILABLE','INTERRUPTED','INPUT_TOO_LARGE')) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 UPDATE app.job_workflow_operations SET state=CASE WHEN p_result IS NULL THEN 'failed' ELSE 'ready' END,result=p_result,error=p_error,lease=NULL WHERE id=o.id RETURNING * INTO o;
 IF o.kind='fetch' AND p_result IS NOT NULL THEN
  IF jsonb_typeof(p_result->'text') IS DISTINCT FROM 'string' OR length(p_result->>'text') NOT BETWEEN 80 AND 200000 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB';END IF;
  UPDATE app.target_job_contexts SET intake=jsonb_set(intake,'{text}',p_result->'text') WHERE job_id=o.job_id AND intake->>'text'='';
  INSERT INTO app.job_workflow_operations(tenant_id,user_id,job_id,kind,job_revision) VALUES(o.tenant_id,o.user_id,o.job_id,'extract',o.job_revision);
 END IF;
 IF o.kind='match' AND o.then_tailor AND p_result IS NOT NULL THEN
  INSERT INTO app.job_workflow_operations(tenant_id,user_id,job_id,kind,job_revision,snapshot_id,snapshot_revision,document_version_id,requested_locale,target_locale,target_document_version_id,match_id) VALUES(o.tenant_id,o.user_id,o.job_id,'tailor',o.job_revision,o.snapshot_id,o.snapshot_revision,o.document_version_id,o.requested_locale,o.target_locale,o.target_document_version_id,o.id);
 END IF;
 IF o.kind='extract' AND p_result IS NOT NULL THEN UPDATE app.job_workflows SET extracted=p_result,reviewed=NULL,revision=revision+1 WHERE job_id=o.job_id;UPDATE app.job_workflow_operations SET job_revision=job_revision+1 WHERE id=o.id RETURNING * INTO o; END IF;
 RETURN app.job_workflow_json(o);
END $$;
-- Existing accounting tables/interface; authority is the claimed operation,
-- never a caller-supplied account. All writes still require the AI worker secret.
CREATE FUNCTION app.job_workflow_attempt(p_secret text,p_lease uuid,p_start jsonb,p_attempt text,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.job_workflow_operations; a app.ai_enhancement_attempts; created boolean;
BEGIN
 PERFORM app.require_ai_worker(p_secret);
 SELECT * INTO o FROM app.job_workflow_operations WHERE lease=p_lease AND state='processing' AND started_at>now()-interval '3 minutes' AND (kind IN ('fetch','extract') OR (snapshot_id=(SELECT id FROM app.editor_draft_snapshots s WHERE s.tenant_id=job_workflow_operations.tenant_id AND coalesce(to_jsonb(s)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1) AND document_version_id IS NOT DISTINCT FROM (SELECT id FROM app.current_job_document_row(job_workflow_operations.tenant_id,job_workflow_operations.job_id,requested_locale)) AND (kind<>'tailor' OR target_document_version_id IS NOT DISTINCT FROM (SELECT id FROM app.current_job_document_row(job_workflow_operations.tenant_id,job_workflow_operations.job_id,target_locale))) AND EXISTS(SELECT 1 FROM app.job_workflows f WHERE f.job_id=job_workflow_operations.job_id AND f.revision=job_revision AND f.reviewed IS NOT NULL))) AND EXISTS(SELECT 1 FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=job_workflow_operations.user_id WHERE t.id=job_workflow_operations.tenant_id AND t.owner_user_id=job_workflow_operations.user_id AND t.state='active' AND m.state='active');
 IF o.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_start IS NOT NULL THEN
  IF p_start->>'operationId' IS DISTINCT FROM o.id::text OR p_start->>'userId' IS DISTINCT FROM o.user_id::text OR p_start->>'provider' NOT IN ('openrouter','openai') OR p_start->>'attemptId' IS DISTINCT FROM (o.id::text||CASE WHEN p_start->>'attemptId' LIKE o.id::text||'-verify-%' AND o.kind IN ('match','tailor') THEN '-verify' WHEN p_start->>'attemptId' LIKE o.id::text||'-suggest-%' AND o.kind='match' THEN '-suggest' ELSE '' END||CASE p_start->>'provider' WHEN 'openrouter' THEN '-primary' ELSE '-fallback' END) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
  INSERT INTO app.ai_enhancement_attempts(tenant_id,id,operation_id,start_data) VALUES(o.tenant_id,p_start->>'attemptId',o.id,p_start) ON CONFLICT(id) DO NOTHING;created:=FOUND;
  SELECT * INTO a FROM app.ai_enhancement_attempts WHERE tenant_id=o.tenant_id AND id=p_start->>'attemptId' AND operation_id=o.id;
  IF a.id IS NULL OR a.start_data<>p_start THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;
  RETURN jsonb_build_object('created',created,'attempt',a.start_data||jsonb_build_object('result',a.result_data,'duplicateOf',NULL));
 END IF;
 SELECT * INTO a FROM app.ai_enhancement_attempts WHERE tenant_id=o.tenant_id AND id=p_attempt AND operation_id=o.id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF a.result_data IS NOT NULL AND a.result_data<>p_result THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;
 UPDATE app.ai_enhancement_attempts SET result_data=p_result WHERE id=a.id;
 RETURN a.start_data||jsonb_build_object('result',p_result,'duplicateOf',NULL);
END $$;
REVOKE EXECUTE ON FUNCTION app.initialize_job_workflow(),app.job_workflow_json(app.job_workflow_operations),app.get_job_workflow(uuid),app.review_job_workflow(uuid,uuid,bigint,jsonb),app.request_job_workflow(uuid,uuid,text,bigint,text,text),app.cancel_job_workflow(uuid,uuid),app.job_workflow_action(uuid,uuid,bigint,text,text),app.claim_job_workflow(text,boolean),app.finish_job_workflow(text,uuid,jsonb,text),app.job_workflow_attempt(text,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_job_workflow(uuid),app.review_job_workflow(uuid,uuid,bigint,jsonb),app.request_job_workflow(uuid,uuid,text,bigint,text,text),app.cancel_job_workflow(uuid,uuid),app.job_workflow_action(uuid,uuid,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.claim_job_workflow(text,boolean),app.finish_job_workflow(text,uuid,jsonb,text),app.job_workflow_attempt(text,uuid,jsonb,text,jsonb) TO anon;
-- Context for a NEW job document always resolves latest saved Base. Existing
-- document versions retain their original source and independent history.
CREATE OR REPLACE FUNCTION app.job_editor_context(p_job uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); c app.target_job_contexts; s app.editor_draft_snapshots;
BEGIN
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job;
 IF c.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 SELECT * INTO s FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
 IF s.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 RETURN jsonb_build_object('job',app.job_editor_pin(c),'source',jsonb_build_object('snapshotId',s.id,'revision',s.revision));
END $$;
CREATE FUNCTION app.accept_job_tailor(p_key uuid,p_job uuid,p_operation uuid,p_document uuid,p_expected_revision bigint,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); o app.job_workflow_operations; f app.job_workflows; s app.editor_draft_snapshots; r record; saved jsonb;
BEGIN
 -- Same lock order as Base saves; serializes new Base vs proposal acceptance.
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(w,'accept_job_tailor',p_key,jsonb_build_object('job',p_job,'operation',p_operation,'document',p_document,'revision',p_expected_revision,'payload',p_payload));
 IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 SELECT * INTO o FROM app.job_workflow_operations WHERE tenant_id=w AND job_id=p_job AND id=p_operation AND kind='tailor' AND state='ready';
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 SELECT * INTO s FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
 IF o.id IS NULL OR o.snapshot_id IS DISTINCT FROM s.id OR o.job_revision IS DISTINCT FROM f.revision OR p_payload#>>'{source,snapshotId}' IS DISTINCT FROM s.id::text OR p_payload#>>'{source,revision}' IS DISTINCT FROM s.revision::text THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 -- Existing writer owns reference validation, document CAS/photo/history and
 -- readback. Nested request key is a distinct deterministic per-operation key.
 saved:=app.save_job_editor(p_key,p_job,p_document,p_expected_revision,p_payload);
 RETURN app.finish_request(w,r.request_id,saved);
END $$;
REVOKE EXECUTE ON FUNCTION app.accept_job_tailor(uuid,uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.accept_job_tailor(uuid,uuid,uuid,uuid,bigint,jsonb) TO authenticated;
CREATE FUNCTION app.save_target_url(p_key uuid,p_url text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; r record; job uuid; c app.target_job_contexts;
BEGIN
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();
 SELECT * INTO r FROM app.begin_request(w,'save_target_url',p_key,jsonb_build_object('url',p_url));IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 IF p_url IS NULL OR length(p_url)>2048 OR p_url !~ '^https://(boards[.]greenhouse[.]io|job-boards[.]greenhouse[.]io|jobs[.]ashbyhq[.]com|jobs[.]lever[.]co|jobs[.]smartrecruiters[.]com)/[^/]' OR p_url ~ '[[:space:]]' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 INSERT INTO app.jobs(tenant_id,draft_payload) VALUES(w,jsonb_build_object('text','','sourceUrl',p_url)) RETURNING id INTO job;
 INSERT INTO app.target_job_contexts(tenant_id,job_id,intake,requirements) VALUES(w,job,jsonb_build_object('text','','sourceUrl',p_url),'[]') RETURNING * INTO c;
 RETURN app.finish_request(w,r.request_id,app.target_job_json(c));
END $$;
REVOKE EXECUTE ON FUNCTION app.save_target_url(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.save_target_url(uuid,text) TO authenticated;

CREATE FUNCTION app.job_editor_current_pin(p_job uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app.job_editor_pin(c) FROM app.target_job_contexts c WHERE tenant_id=app.tenant_for_user() AND job_id=p_job
$$;
REVOKE EXECUTE ON FUNCTION app.job_editor_current_pin(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.job_editor_current_pin(uuid) TO authenticated;
CREATE FUNCTION app.link_job_source_version(p_key uuid,p_job uuid,p_parent uuid,p_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); f app.job_workflows; r record;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(w,'link_job_source_version',p_key,jsonb_build_object('job',p_job,'parent',p_parent,'revision',p_revision));IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF f.job_id IS NULL OR NOT EXISTS(SELECT 1 FROM app.job_workflows WHERE tenant_id=w AND job_id=p_parent) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF f.revision<>p_revision OR f.source_parent_id IS NOT NULL OR p_parent=p_job OR EXISTS(WITH RECURSIVE chain AS(SELECT job_id,source_parent_id FROM app.job_workflows WHERE tenant_id=w AND job_id=p_parent UNION ALL SELECT p.job_id,p.source_parent_id FROM app.job_workflows p JOIN chain c ON p.job_id=c.source_parent_id WHERE p.tenant_id=w) SELECT 1 FROM chain WHERE job_id=p_job) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 UPDATE app.job_workflows SET source_parent_id=p_parent WHERE job_id=p_job;
 RETURN app.finish_request(w,r.request_id,app.get_job_workflow(p_job));
END $$;
REVOKE EXECUTE ON FUNCTION app.link_job_source_version(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.link_job_source_version(uuid,uuid,uuid,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION app.list_target_jobs() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.job_id,'createdAt',j.created_at,'state',CASE WHEN f.reviewed IS NOT NULL OR j.job_version_id IS NOT NULL THEN 'reviewed' ELSE 'draft' END,
 'title',left(coalesce(f.reviewed#>>'{overview,title,value}',f.extracted#>>'{overview,title,value}',j.intake->>'title',''),200),
 'company',coalesce(f.reviewed#>>'{overview,company,value}',f.extracted#>>'{overview,company,value}',j.intake->>'company'),
 'location',coalesce(f.reviewed#>>'{overview,location,value}',f.extracted#>>'{overview,location,value}',j.intake->>'location'),
 'workArrangement',coalesce(f.reviewed#>>'{overview,workArrangement,value}',f.extracted#>>'{overview,workArrangement,value}'),
 'analysisState',(SELECT state FROM app.job_workflow_operations o WHERE o.job_id=j.job_id AND o.kind='extract' ORDER BY created_at DESC,id DESC LIMIT 1)) ORDER BY j.created_at DESC,j.job_id),'[]')
 FROM (SELECT * FROM app.target_job_contexts WHERE tenant_id=app.tenant_for_user() ORDER BY created_at DESC,job_id LIMIT 50) j LEFT JOIN app.job_workflows f ON f.job_id=j.job_id
$$;
