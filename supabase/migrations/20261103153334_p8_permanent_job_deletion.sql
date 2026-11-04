-- Permanent owned job closure. Forward artifact; never applies itself to hosted data.
-- Only content-free replay fences survive. Authorization hashes are transaction-bound
-- and removed before commit; unlike Base removal they authorize exact job rows only.
CREATE TABLE app.job_deletion_fences (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id), kind text NOT NULL CHECK(kind IN ('job','intake','capture')),
 id uuid NOT NULL, PRIMARY KEY(tenant_id,kind,id)
);
CREATE TABLE app.job_purge_rows (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id), purge_transaction xid8 NOT NULL,
 relation_id oid NOT NULL, row_hash bytea NOT NULL,
 PRIMARY KEY(tenant_id,purge_transaction,relation_id,row_hash)
);
ALTER TABLE app.job_deletion_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_purge_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.job_deletion_fences,app.job_purge_rows FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app.protect_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' AND TG_TABLE_SCHEMA='app'
  AND TG_TABLE_NAME=ANY(ARRAY['source_spans','job_captures','job_versions','job_requirements','requirement_atoms','application_events','job_editor_versions','cv_versions','cv_sections','cv_items','cv_photo_references','evidence_mappings','match_evidence','analysis_runs','analysis_components','recommendations','readiness_runs','recommendation_requirements','recommendation_claims'])
  AND pg_catalog.has_table_privilege(current_user,TG_RELID,'DELETE')
  AND EXISTS(SELECT 1 FROM app.job_purge_rows p
    WHERE p.tenant_id=OLD.tenant_id AND p.purge_transaction=pg_catalog.pg_current_xact_id()
     AND p.relation_id=TG_RELID AND p.row_hash=app.hash_json(to_jsonb(OLD))) THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' AND pg_catalog.has_table_privilege(current_user,TG_RELID,'DELETE') THEN
  -- Preserve the separate existing account-removal contract.
  IF EXISTS(SELECT 1 FROM app.tenants WHERE id=OLD.tenant_id AND state='deleting') THEN RETURN OLD; END IF;
  IF TG_TABLE_SCHEMA='app' AND TG_TABLE_NAME=ANY(ARRAY[
   'source_spans','claims','claim_provenance','confirmation_events',
   'entity_revisions','entity_revision_claims','entity_revision_entities',
   'profile_versions','profile_version_entities','profile_version_claims','profile_version_relations',
   'claim_relations','cv_versions','cv_sections','cv_items','cv_photo_references',
   'editor_draft_snapshots','evidence_mappings','match_evidence','analysis_runs',
   'analysis_components','recommendations','readiness_runs','recommendation_requirements','recommendation_claims'
  ]) AND EXISTS(SELECT 1 FROM app.base_cv_lifecycle l
   WHERE l.tenant_id=OLD.tenant_id AND l.purge_transaction=pg_catalog.pg_current_xact_id()) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_RECORD';
END $$;


-- Fence resubmitted browser intake and capability capture identities. Keep the
-- existing command implementation and its authorization/validation unchanged.
DO $patch$
DECLARE definition text; marker text;
BEGIN
 definition:=pg_get_functiondef('app.capture_command(text,text,text,uuid,text,jsonb)'::regprocedure);
 marker:='SELECT * INTO o FROM app.capture_operations WHERE user_id=c.user_id AND request_id=req;';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Capture fence insertion point missing';END IF;
 definition:=replace(definition,marker,$insert$
 PERFORM 1 FROM app.tenants WHERE id=c.tenant_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM app.job_deletion_fences WHERE tenant_id=c.tenant_id AND kind='capture' AND id=req) THEN
  RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE';END IF;
 $insert$||marker);
 EXECUTE definition;
 definition:=pg_get_functiondef('app.assert_workspace_resource(text,uuid)'::regprocedure);
 marker:='WHEN ''intake'' THEN valid:=true;';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Intake fence insertion point missing';END IF;
 EXECUTE replace(definition,marker,'WHEN ''intake'' THEN valid:=NOT EXISTS(SELECT 1 FROM app.job_deletion_fences WHERE tenant_id=w AND kind=''intake'' AND id=p_id);');
END $patch$;

-- UUID identity is independent of the spelling retained in opaque JSON pins.
CREATE FUNCTION app.job_identity(p_value text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN RETURN p_value::uuid;EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;END $$;
REVOKE ALL ON FUNCTION app.job_identity(text) FROM PUBLIC,anon,authenticated;

-- The existing ledger hashes request bodies rather than retaining their content.
-- Keep a private identity-only association so normalized review responses without
-- job IDs can still be erased exactly when their job is removed.
CREATE TABLE app.job_request_links (
 tenant_id uuid NOT NULL,request_id uuid NOT NULL,job_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,request_id,job_id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES app.idempotency_requests(tenant_id,id)
);
ALTER TABLE app.job_request_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.job_request_links FROM PUBLIC,anon,authenticated;
DO $request_links$
DECLARE definition text;marker text:='RETURN NEXT;';
BEGIN
 definition:=pg_get_functiondef('app.begin_request(uuid,text,uuid,jsonb,boolean)'::regprocedure);
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Request identity association point missing';END IF;
 EXECUTE replace(definition,marker,$link$
 INSERT INTO app.job_request_links(tenant_id,request_id,job_id)
 SELECT workspace,request_id,j.id FROM app.jobs j WHERE j.tenant_id=workspace AND j.id=app.job_identity(body->>'job')
 ON CONFLICT DO NOTHING;
 $link$||marker);
END $request_links$;
-- Backfill provable legacy workflow snapshots from request fingerprints.
-- Review can normalize away its original input; action/link responses can also
-- omit the current job identity. Purge therefore expires unassociated legacy
-- receipts from all three snapshot-returning commands when certainty is lost.
WITH legacy AS (
 SELECT q.*,CASE WHEN q.result_refs->>'revision' ~ '^[0-9]{1,16}$'
  THEN (q.result_refs->>'revision')::bigint END AS workflow_revision
 FROM app.idempotency_requests q WHERE q.command_kind IN
  ('review_job_workflow','job_workflow_action','link_job_source_version')
)
INSERT INTO app.job_request_links(tenant_id,request_id,job_id)
SELECT q.tenant_id,q.id,j.id FROM legacy q JOIN app.jobs j ON j.tenant_id=q.tenant_id
CROSS JOIN LATERAL (
 SELECT jsonb_build_object('job',j.id,'revision',q.workflow_revision-1,
  'value',q.result_refs->'reviewed') AS body WHERE q.command_kind='review_job_workflow'
 UNION ALL
 SELECT jsonb_build_object('job',j.id,'revision',q.workflow_revision,
  'parent',app.job_identity(q.result_refs->>'sourceParentId'))
 WHERE q.command_kind='link_job_source_version'
 UNION ALL
 SELECT jsonb_build_object('job',j.id,'revision',q.workflow_revision,'id',action.key,'state',action.value)
 FROM jsonb_each_text(CASE WHEN jsonb_typeof(q.result_refs->'actions')='object'
  THEN q.result_refs->'actions' ELSE '{}'::jsonb END) action
 WHERE q.command_kind='job_workflow_action'
) candidate
WHERE q.workflow_revision IS NOT NULL AND
 q.request_hash=app.hash_json(jsonb_build_object('schemaVersion','1','command',q.command_kind,
  'tenant',q.tenant_id,'principal',q.principal_key,'body',candidate.body))
ON CONFLICT DO NOTHING;

-- Legacy career requests can carry a job pin even for questions/rewrite.
CREATE FUNCTION app.fence_deleted_job_operation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM app.job_deletion_fences WHERE tenant_id=NEW.tenant_id AND kind='job' AND id=app.job_identity(NEW.input->>'jobId')) THEN
  RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.fence_deleted_job_operation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fence_deleted_job_operation BEFORE INSERT ON app.career_operation_results FOR EACH ROW EXECUTE FUNCTION app.fence_deleted_job_operation();


-- Claims, completion, autosave and removal share tenant -> workflow/operation
-- serialization. Never lock an outbox row first: its later job FK or workflow
-- lock could otherwise form a cycle with a removal holding that job/workflow.
DO $worker_lock_order$
DECLARE definition text; marker text; signature text;
BEGIN
 definition:=pg_get_functiondef('app.claim_job_workflow_before_workspace(text,boolean)'::regprocedure);
 marker:='PERFORM app.require_ai_worker(p_secret);';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Job claim lock insertion point missing';END IF;
 definition:=replace(definition,marker,marker||$lock$
 SELECT t.id INTO o.tenant_id FROM app.tenants t
 JOIN app.tenant_memberships m ON m.tenant_id=t.id AND m.user_id=t.owner_user_id AND m.state='active'
 JOIN LATERAL (SELECT q.created_at,q.id FROM app.job_workflow_operations q
  WHERE q.tenant_id=t.id AND q.user_id=t.owner_user_id AND
   ((q.state='queued' AND (NOT p_fetch_only OR q.kind='fetch')) OR
    (q.state='processing' AND q.started_at<now()-interval '3 minutes'))
  ORDER BY q.created_at,q.id LIMIT 1) pending ON true
 WHERE t.state='active' ORDER BY pending.created_at,pending.id
 FOR UPDATE OF t SKIP LOCKED LIMIT 1;
 IF o.tenant_id IS NULL THEN RETURN NULL;END IF;
 $lock$);
 marker:='WHERE state=''processing'' AND started_at<now()-interval ''3 minutes'';';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Job cleanup lock insertion point missing';END IF;
 definition:=replace(definition,marker,'WHERE tenant_id=o.tenant_id AND state=''processing'' AND started_at<now()-interval ''3 minutes'';');
 marker:='WHERE q.state=''queued''';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Job tenant claim filter missing';END IF;
 definition:=replace(definition,marker,'WHERE q.tenant_id=o.tenant_id AND q.state=''queued''');
 EXECUTE definition;

 definition:=pg_get_functiondef('app.claim_capture(text)'::regprocedure);
 marker:='PERFORM app.require_capture_worker(p_secret);';
 definition:=replace(definition,marker,marker||$lock$
 SELECT t.id INTO o.tenant_id FROM app.tenants t
 JOIN LATERAL (SELECT q.created_at FROM app.capture_operations q WHERE q.tenant_id=t.id
  AND (q.state='received' OR (q.state='processing' AND q.lease_until<transaction_timestamp()))
  ORDER BY q.created_at LIMIT 1) pending ON true
 WHERE t.state='active' ORDER BY pending.created_at,t.id
 FOR UPDATE OF t SKIP LOCKED LIMIT 1;
 IF o.tenant_id IS NULL THEN RETURN NULL;END IF;
 $lock$);
 marker:='WHERE state=''processing'' AND lease_until<transaction_timestamp() AND attempts>=3;';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Capture cleanup lock insertion point missing';END IF;
 definition:=replace(definition,marker,'WHERE tenant_id=o.tenant_id AND state=''processing'' AND lease_until<transaction_timestamp() AND attempts>=3;');
 marker:='WHERE (state=''received''';
 IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Capture tenant claim filter missing';END IF;
 definition:=replace(definition,marker,'WHERE tenant_id=o.tenant_id AND (state=''received''');
 EXECUTE definition;

 FOREACH signature IN ARRAY ARRAY['app.finish_job_workflow(text,uuid,jsonb,text)','app.job_workflow_attempt(text,uuid,jsonb,text,jsonb)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);marker:='PERFORM app.require_ai_worker(p_secret);';
  IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Worker completion lock insertion point missing: %',signature;END IF;
  EXECUTE replace(definition,marker,marker||' PERFORM 1 FROM app.tenants WHERE id=(SELECT tenant_id FROM app.job_workflow_operations WHERE lease=p_lease) FOR UPDATE;');
 END LOOP;
 definition:=pg_get_functiondef('app.finish_capture(text,uuid,jsonb)'::regprocedure);marker:='PERFORM app.require_capture_worker(p_secret);';
 EXECUTE replace(definition,marker,marker||' PERFORM 1 FROM app.tenants WHERE id=(SELECT tenant_id FROM app.capture_operations WHERE lease=p_lease) FOR UPDATE;');
 FOREACH signature IN ARRAY ARRAY[
  'app.save_current_job_document(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid)',
  'app.request_job_workflow(uuid,uuid,text,bigint,text,text)',
  'app.review_target_job(uuid,uuid,text,text,jsonb)',
  'app.review_job_workflow(uuid,uuid,bigint,jsonb)',
  'app.cancel_job_workflow(uuid,uuid)',
  'app.job_workflow_action(uuid,uuid,bigint,text,text)',
  'app.accept_job_tailor(uuid,uuid,uuid,uuid,bigint,jsonb)',
  'app.link_job_source_version(uuid,uuid,uuid,bigint)'
 ] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);marker:=E'BEGIN\n';
  IF strpos(definition,marker)=0 THEN RAISE EXCEPTION 'Owned command lock insertion point missing: %',signature;END IF;
  EXECUTE replace(definition,marker,marker||' PERFORM 1 FROM app.tenants WHERE id=app.tenant_for_user() FOR UPDATE;'||E'\n');
 END LOOP;
END $worker_lock_order$;

CREATE FUNCTION app.delete_target_job(p_key uuid,p_job uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();r record;entry jsonb;statement text;related text[]:=ARRAY[p_job::text];more text[];
 job_versions uuid[];cv_versions uuid[];mappings uuid[];analyses uuid[];recommendations uuid[];operations uuid[];proposals uuid[];
 closure constant jsonb:=$closure$[
  {
    "table": "workspace_drafts",
    "predicate": "submitted_job_id=$2 OR (kind IN ('job-review','job-answer') AND id=$2) OR (kind='tailor-review' AND id=ANY($8)) OR (kind='translation-review' AND id=ANY($9))"
  },
  {
    "table": "document_language_proposals",
    "predicate": "id=ANY($9)"
  },
  {
    "table": "career_operation_results",
    "predicate": "app.job_identity(input->>'jobId')=$2"
  },
  {
    "table": "job_answers",
    "predicate": "job_id=$2"
  },
  {
    "table": "capture_operations",
    "predicate": "job_id=$2"
  },
  {
    "table": "job_workflow_operations",
    "predicate": "job_id=$2"
  },
  {
    "table": "job_workflows",
    "predicate": "job_id=$2"
  },
  {
    "table": "target_job_contexts",
    "predicate": "job_id=$2"
  },
  {
    "table": "next_actions",
    "predicate": "application_id IN (SELECT id FROM app.applications WHERE tenant_id=$1 AND job_id=$2)"
  },
  {
    "table": "application_events",
    "predicate": "job_id=$2"
  },
  {
    "table": "applications",
    "predicate": "job_id=$2"
  },
  {
    "table": "recommendation_claims",
    "predicate": "recommendation_id=ANY($7)"
  },
  {
    "table": "recommendation_requirements",
    "predicate": "recommendation_id=ANY($7) OR job_requirement_id IN (SELECT id FROM app.job_requirements WHERE tenant_id=$1 AND job_id=$2)"
  },
  {
    "table": "recommendations",
    "predicate": "id=ANY($7)"
  },
  {
    "table": "analysis_components",
    "predicate": "analysis_run_id=ANY($6)"
  },
  {
    "table": "analysis_runs",
    "predicate": "id=ANY($6)"
  },
  {
    "table": "readiness_runs",
    "predicate": "job_version_id=ANY($3) OR cv_version_id=ANY($4)"
  },
  {
    "table": "match_evidence",
    "predicate": "evidence_mapping_id=ANY($5)"
  },
  {
    "table": "evidence_mappings",
    "predicate": "id=ANY($5)"
  },
  {
    "table": "job_editor_versions",
    "predicate": "job_id=$2"
  },
  {
    "table": "job_editor_documents",
    "predicate": "job_id=$2"
  },
  {
    "table": "cv_photo_references",
    "predicate": "cv_version_id=ANY($4)"
  },
  {
    "table": "cv_items",
    "predicate": "cv_version_id=ANY($4)"
  },
  {
    "table": "cv_sections",
    "predicate": "cv_version_id=ANY($4)"
  },
  {
    "table": "cv_versions",
    "predicate": "job_id=$2"
  },
  {
    "table": "cv_documents",
    "predicate": "job_id=$2"
  },
  {
    "table": "requirement_atoms",
    "predicate": "job_id=$2"
  },
  {
    "table": "job_requirements",
    "predicate": "job_id=$2"
  },
  {
    "table": "job_versions",
    "predicate": "job_id=$2"
  },
  {
    "table": "job_captures",
    "predicate": "job_id=$2"
  },
  {
    "table": "source_spans",
    "predicate": "job_id=$2"
  },
  {
    "table": "source_documents",
    "predicate": "job_id=$2"
  },
  {
    "table": "jobs",
    "predicate": "id=$2"
  }
]$closure$;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 SELECT * INTO r FROM app.begin_request(w,'delete_target_job',p_key,jsonb_build_object('job',p_job));
 IF r.cached IS NOT NULL THEN RETURN r.cached;END IF;
 PERFORM 1 FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 PERFORM 1 FROM app.jobs WHERE tenant_id=w AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 INSERT INTO app.job_deletion_fences VALUES(w,'job',p_job);
 INSERT INTO app.job_deletion_fences SELECT w,'intake',id FROM app.workspace_drafts WHERE tenant_id=w AND submitted_job_id=p_job ON CONFLICT DO NOTHING;
 INSERT INTO app.job_deletion_fences SELECT w,'capture',request_id FROM app.capture_operations WHERE tenant_id=w AND job_id=p_job ON CONFLICT DO NOTHING;
 SELECT coalesce(array_agg(id),'{}') INTO job_versions FROM app.job_versions WHERE tenant_id=w AND job_id=p_job;
 SELECT coalesce(array_agg(id),'{}') INTO cv_versions FROM app.cv_versions WHERE tenant_id=w AND job_id=p_job;
 SELECT coalesce(array_agg(id),'{}') INTO mappings FROM app.evidence_mappings WHERE tenant_id=w AND (job_version_id=ANY(job_versions) OR cv_version_id=ANY(cv_versions));
 SELECT coalesce(array_agg(id),'{}') INTO analyses FROM app.analysis_runs WHERE tenant_id=w AND (job_version_id=ANY(job_versions) OR cv_version_id=ANY(cv_versions) OR evidence_mapping_id=ANY(mappings));
 SELECT coalesce(array_agg(id),'{}') INTO recommendations FROM app.recommendations WHERE tenant_id=w AND analysis_run_id=ANY(analyses);
 SELECT coalesce(array_agg(id),'{}') INTO operations FROM app.job_workflow_operations WHERE tenant_id=w AND job_id=p_job;
 SELECT coalesce(array_agg(id),'{}') INTO proposals FROM app.document_language_proposals WHERE tenant_id=w AND
  (app.job_identity(request#>>'{source,jobId}')=p_job OR app.job_identity(request->>'jobId')=p_job OR
   app.job_identity(request#>>'{source,currentId}') IN (SELECT id FROM app.job_editor_versions WHERE tenant_id=w AND job_id=p_job) OR
   app.job_identity(request->>'targetDocumentId') IN (SELECT id FROM app.job_editor_documents WHERE tenant_id=w AND job_id=p_job));
 -- Detach incoming links; the newer job and its accepted documents survive.
 UPDATE app.job_workflows SET source_parent_id=NULL WHERE tenant_id=w AND source_parent_id=p_job;
 -- Retain accounting and provider attempts, while removing job content and
 -- disabling further attempts with the existing removed-operation fence.
 UPDATE app.ai_enhancement_operations SET job_id=NULL,snapshot_id=NULL,revision=NULL,import_id=NULL,
  base_removed=true,target_id='deleted-job',policy='deleted-job'
 WHERE tenant_id=w AND (job_id=p_job OR id=ANY(operations));
 UPDATE app.job_workflow_operations SET state='cancelled',lease=NULL,result=NULL,error=NULL WHERE tenant_id=w AND job_id=p_job;
 UPDATE app.capture_operations SET state='failed',lease=NULL,lease_until=NULL WHERE tenant_id=w AND job_id=p_job;
 UPDATE app.cv_documents SET head_version_id=NULL WHERE tenant_id=w AND job_id=p_job;
 UPDATE app.jobs SET head_version_id=NULL WHERE tenant_id=w AND id=p_job;
 -- Collect deleted identities before any dependent table disappears. Result
 -- receipts may contain whole editor payloads, so expire affected replay bodies.
 FOR entry IN SELECT * FROM jsonb_array_elements(closure) LOOP
  statement:=format('SELECT coalesce(array_agg(coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''request_id'')),''{}'') FROM app.%I t WHERE tenant_id=$1 AND (%s)',entry->>'table',entry->>'predicate');
  EXECUTE statement INTO more USING w,p_job,job_versions,cv_versions,mappings,analyses,recommendations,operations,proposals;
  related:=related||more;
 END LOOP;
 UPDATE app.idempotency_requests q SET result_refs='{}',expires_at=transaction_timestamp()
 WHERE q.tenant_id=w AND q.id<>r.request_id AND q.command_kind<>'delete_target_job' AND
  (EXISTS(SELECT 1 FROM unnest(related) identity WHERE identity IS NOT NULL AND strpos(lower(q.result_refs::text),lower(identity))>0)
   OR EXISTS(SELECT 1 FROM app.job_request_links link WHERE link.tenant_id=w AND link.request_id=q.id AND link.job_id=p_job)
   OR (q.command_kind IN ('review_job_workflow','job_workflow_action','link_job_source_version') AND NOT EXISTS(
    SELECT 1 FROM app.job_request_links link WHERE link.tenant_id=w AND link.request_id=q.id)));
 DELETE FROM app.job_request_links WHERE tenant_id=w AND job_id=p_job;
 FOR entry IN SELECT * FROM jsonb_array_elements(closure) LOOP
  -- The authorization is an exact OLD-row hash, scoped to this transaction.
  statement:=format('INSERT INTO app.job_purge_rows SELECT $1,pg_current_xact_id(),%L::regclass::oid,app.hash_json(to_jsonb(t)) FROM app.%I t WHERE tenant_id=$1 AND (%s) ON CONFLICT DO NOTHING','app.'||(entry->>'table'),entry->>'table',entry->>'predicate');
  EXECUTE statement USING w,p_job,job_versions,cv_versions,mappings,analyses,recommendations,operations,proposals;
  statement:=format('DELETE FROM app.%I WHERE tenant_id=$1 AND (%s)',entry->>'table',entry->>'predicate');
  EXECUTE statement USING w,p_job,job_versions,cv_versions,mappings,analyses,recommendations,operations,proposals;
 END LOOP;
 DELETE FROM app.job_purge_rows WHERE tenant_id=w AND purge_transaction=pg_current_xact_id();
 PERFORM app.audit(w,'job.deleted','job',p_job);
 RETURN app.finish_request(w,r.request_id,jsonb_build_object('jobId',p_job,'deleted',true));
END $$;
REVOKE ALL ON FUNCTION app.delete_target_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.delete_target_job(uuid,uuid) TO authenticated;
