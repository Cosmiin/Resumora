-- Base lifecycle boundary. Destructive closure is completed only against the
-- frozen canonical-current preservation and language contracts. No hosted apply.
CREATE TABLE app.base_cv_lifecycle (
 tenant_id uuid PRIMARY KEY REFERENCES app.tenants(id) ON DELETE RESTRICT,
 generation bigint NOT NULL DEFAULT 0 CHECK(generation BETWEEN 0 AND 9007199254740991),
 revision_floor bigint NOT NULL DEFAULT 0 CHECK(revision_floor BETWEEN 0 AND 9007199254740991),
 purge_transaction xid8
);
ALTER TABLE app.base_cv_lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.base_cv_lifecycle FROM PUBLIC,anon,authenticated;

-- Only the owned removal command may arm this row, under the tenant lock. A
-- committed/stale marker cannot authorize another transaction; there is no GUC.
CREATE FUNCTION app.require_base_cv_purge(p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM app.tenant_for_user() OR NOT EXISTS(
  SELECT 1 FROM app.base_cv_lifecycle l WHERE l.tenant_id=p_tenant
   AND l.purge_transaction=pg_catalog.pg_current_xact_id()
 ) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION app.require_base_cv_purge(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app.protect_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
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

-- Default Base alone supplies career evidence; translations never become a
-- fallback source. This remains compatible before/after variant_id is added.
CREATE FUNCTION app.current_base_snapshot(p_tenant uuid) RETURNS app.editor_draft_snapshots
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s FROM app.editor_draft_snapshots s
 WHERE s.tenant_id=p_tenant AND p_tenant=app.tenant_for_user()
  AND coalesce(to_jsonb(s)->>'variant_id','default')='default'
  AND NOT EXISTS(SELECT 1 FROM app.base_cv_lifecycle l WHERE l.tenant_id=p_tenant AND l.purge_transaction IS NOT NULL)
 ORDER BY s.revision DESC LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION app.current_base_snapshot(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app.load_base_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; s app.editor_draft_snapshots; l app.base_cv_lifecycle;
BEGIN
 SELECT id INTO w FROM app.tenants WHERE owner_user_id=app.require_user() AND kind='personal' AND state='active' AND app.is_active_member(id);
 IF w IS NULL THEN RETURN jsonb_build_object('generation',0,'revision',0,'cleanupPending',false,'snapshot',NULL); END IF;
 SELECT * INTO l FROM app.base_cv_lifecycle WHERE tenant_id=w;
 s:=app.current_base_snapshot(w);
 RETURN jsonb_build_object('generation',coalesce(l.generation,0),
  'revision',greatest(coalesce(l.revision_floor,0),coalesce(s.revision,0)),
  'cleanupPending',false,'snapshot',CASE WHEN s.id IS NULL THEN NULL ELSE app.editor_snapshot_json(s) END);
END $$;
REVOKE EXECUTE ON FUNCTION app.load_base_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.load_base_state() TO authenticated;

CREATE OR REPLACE FUNCTION app.load_base_draft() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT nullif(app.load_base_state()->'snapshot','null'::jsonb)
$$;

-- A floor survives physical history removal. A stale initial save at revision0
-- cannot recreate a removed Base. Existing requests replay only live snapshots.
CREATE OR REPLACE FUNCTION app.write_base_draft(p_key uuid,p_expected_revision bigint,p_payload jsonb,p_mode text,p_snapshot uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE workspace uuid; head app.editor_draft_snapshots; saved app.editor_draft_snapshots; r record; old jsonb; current_revision bigint;
 command text:=CASE WHEN p_snapshot IS NULL THEN 'save_base_draft' ELSE 'restore_base_draft' END;
BEGIN
 IF p_snapshot IS NULL THEN PERFORM app.provision_workspace(p_key); END IF;
 workspace:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=workspace FOR UPDATE; PERFORM app.assert_tenant(workspace);
 INSERT INTO app.base_cv_lifecycle(tenant_id) VALUES(workspace) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM app.base_cv_lifecycle WHERE tenant_id=workspace FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(workspace,command,p_key,jsonb_build_object(
  'revision',p_expected_revision,'payload',p_payload,'mode',p_mode,'snapshot',p_snapshot));
 IF r.cached IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=workspace AND id=(r.cached->>'id')::uuid) THEN
   RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE'; END IF;
  RETURN r.cached;
 END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resumora:editor:'||workspace::text,0));
 head:=app.current_base_snapshot(workspace);
 SELECT greatest(revision_floor,coalesce(head.revision,0)) INTO current_revision FROM app.base_cv_lifecycle WHERE tenant_id=workspace;
 IF current_revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_snapshot IS NOT NULL THEN
  SELECT payload INTO old FROM app.editor_draft_snapshots s WHERE tenant_id=workspace AND id=p_snapshot AND coalesce(to_jsonb(s)->>'variant_id','default')='default';
  IF old IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
  p_payload:=old;
 END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload->>'schemaVersion' IS DISTINCT FROM 'resumora-editor-draft/1'
  OR jsonb_typeof(p_payload->'content') IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'answers') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 IF octet_length(p_payload::text)>1048576 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 INSERT INTO app.editor_draft_snapshots(tenant_id,revision,parent_id,restored_from,reason,payload,request_id)
 VALUES(workspace,current_revision+1,head.id,p_snapshot,CASE p_mode WHEN 'checkpoint' THEN 'save' ELSE p_mode END,p_payload,r.request_id) RETURNING * INTO saved;
 UPDATE app.base_cv_lifecycle SET revision_floor=saved.revision WHERE tenant_id=workspace;
 PERFORM app.audit(workspace,'editor.'||p_mode,'editor_snapshot',saved.id);
 RETURN app.finish_request(workspace,r.request_id,app.editor_snapshot_json(saved));
END $$;

-- Import admission uses the same tenant lock and never resets to revision0.
CREATE OR REPLACE FUNCTION app.begin_cv_import(p_operation uuid,p_format text,p_hash text,p_size bigint,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; s app.cv_import_sessions; source uuid:=gen_random_uuid(); r record; head_revision bigint; profile uuid;
BEGIN
 PERFORM app.provision_workspace(p_operation); w:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE; PERFORM app.assert_tenant(w);
 INSERT INTO app.base_cv_lifecycle(tenant_id) VALUES(w) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM app.base_cv_lifecycle WHERE tenant_id=w FOR UPDATE;
 SELECT * INTO r FROM app.begin_request(w,'begin_cv_import',p_operation,jsonb_build_object('format',p_format,'hash',p_hash,'size',p_size,'revision',p_revision));
 IF r.cached IS NOT NULL THEN RETURN jsonb_build_object('created',false,'record',app.get_cv_import(p_operation)); END IF;
 IF p_format IS NULL OR p_format NOT IN ('pdf','docx','doc') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 10000000 OR p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('resumora:import:'||w::text,0));
 SELECT greatest(coalesce(max(s.revision),0),(SELECT revision_floor FROM app.base_cv_lifecycle WHERE tenant_id=w)) INTO head_revision FROM app.editor_draft_snapshots s WHERE s.tenant_id=w AND coalesce(to_jsonb(s)->>'variant_id','default')='default';
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
