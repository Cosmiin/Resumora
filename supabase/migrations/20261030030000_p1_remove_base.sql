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

-- The cleanup outbox contains object identities only, never source/profile text.
-- Storage insertions serialize with removal below, so an acknowledged object
-- cannot arrive later from an already admitted upload.
CREATE TABLE app.base_removal_objects (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 bucket text NOT NULL CHECK(bucket IN ('cv-imports','cv-photos')),
 object_key text NOT NULL,
 PRIMARY KEY(tenant_id,bucket,object_key)
);
ALTER TABLE app.base_removal_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.base_removal_objects FROM PUBLIC,anon,authenticated;


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
  'cleanupPending',EXISTS(SELECT 1 FROM app.base_removal_objects WHERE tenant_id=w),'snapshot',CASE WHEN s.id IS NULL THEN NULL ELSE app.editor_snapshot_json(s) END);
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
 SELECT greatest(coalesce(max(es.revision),0),(SELECT revision_floor FROM app.base_cv_lifecycle WHERE tenant_id=w)) INTO head_revision FROM app.editor_draft_snapshots es WHERE es.tenant_id=w AND coalesce(to_jsonb(es)->>'variant_id','default')='default';
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

CREATE FUNCTION app.base_removal_objects() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'objectKey',object_key)),'[]')
 FROM (SELECT bucket,object_key FROM app.base_removal_objects WHERE tenant_id=app.tenant_for_user() ORDER BY bucket,object_key LIMIT 20) o
$$;
CREATE FUNCTION app.ack_base_removal_object(p_bucket text,p_object_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();
BEGIN
 IF to_regclass('storage.objects') IS NOT NULL AND EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_object_key) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='SOURCE_CLEANUP_PENDING';END IF;
 DELETE FROM app.base_removal_objects WHERE tenant_id=w AND bucket=p_bucket AND object_key=p_object_key;
 RETURN jsonb_build_object('acknowledged',true);
END $$;
-- No manifest means no upload; a caller cannot turn a cleanup entry into a
-- readable source. DELETE authorization is still tenant-authenticated.
CREATE FUNCTION app.base_removal_object_access(p_bucket text,p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM app.base_removal_objects WHERE tenant_id=app.tenant_for_user() AND bucket=p_bucket AND object_key=p_name)
$$;
REVOKE EXECUTE ON FUNCTION app.base_removal_objects(),app.ack_base_removal_object(text,text),app.base_removal_object_access(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.base_removal_objects(),app.ack_base_removal_object(text,text),app.base_removal_object_access(text,text) TO authenticated;

-- Compose cleanup rights into the existing restrictive Storage guards, without
-- broadening read/upload rights. The delete endpoint requires SELECT visibility.
CREATE OR REPLACE FUNCTION app.can_delete_cv_import_object(p_name text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid;
BEGIN
 w:=app.tenant_for_user();
 RETURN app.base_removal_object_access('cv-imports',p_name) OR EXISTS(SELECT 1 FROM app.source_documents d JOIN app.cv_import_sessions s ON s.tenant_id=d.tenant_id AND s.source_id=d.id WHERE d.tenant_id=w AND d.bucket='cv-imports' AND d.object_key=p_name AND (s.state='cancelled' OR s.expires_at<=transaction_timestamp()));
EXCEPTION WHEN SQLSTATE 'PT401' OR SQLSTATE 'PT403' THEN RETURN false;
END $$;
CREATE OR REPLACE FUNCTION app.photo_storage_access(object_name text,operation text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (operation='delete' AND app.base_removal_object_access('cv-photos',object_name)) OR EXISTS(SELECT 1 FROM app.photo_assets p WHERE p.object_key=object_name AND app.is_active_member(p.tenant_id) AND CASE operation WHEN 'read' THEN p.state IN ('reserved','ready') WHEN 'insert' THEN p.state='reserved' WHEN 'delete' THEN p.state IN ('purge_pending','purged') ELSE false END)
$$;
-- Existing policy function identities and grants remain stable.
GRANT EXECUTE ON FUNCTION app.can_delete_cv_import_object(text),app.photo_storage_access(text,text) TO authenticated;
CREATE FUNCTION app.fence_base_source_upload() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid;
BEGIN
 IF NEW.bucket_id NOT IN ('cv-imports','cv-photos') THEN RETURN NEW; END IF;
 w:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 IF (NEW.bucket_id='cv-imports' AND NOT app.can_access_cv_import_object(NEW.name,true)) OR
    (NEW.bucket_id='cv-photos' AND NOT app.photo_storage_access(NEW.name,'insert')) THEN
 RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION app.fence_base_source_upload() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
 EXECUTE 'CREATE TRIGGER fence_base_source_upload BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION app.fence_base_source_upload()';
 END IF;
END $$;

ALTER TABLE app.ai_enhancement_operations ADD COLUMN base_removed boolean NOT NULL DEFAULT false;
ALTER TABLE app.ai_enhancement_operations DROP CONSTRAINT ai_enhancement_operations_check;
ALTER TABLE app.ai_enhancement_operations ADD CHECK(
 (base_removed AND snapshot_id IS NULL AND revision IS NULL AND import_id IS NULL) OR
 (NOT base_removed AND ((job_id IS NULL AND ((import_id IS NULL AND snapshot_id IS NOT NULL AND revision IS NOT NULL) OR (import_id IS NOT NULL AND snapshot_id IS NULL AND revision IS NULL))) OR
 (job_id IS NOT NULL AND import_id IS NULL AND ((snapshot_id IS NULL AND revision IS NULL) OR (snapshot_id IS NOT NULL AND revision IS NOT NULL)))))
);
CREATE FUNCTION app.fence_removed_base_attempt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=NEW.tenant_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM app.ai_enhancement_operations WHERE tenant_id=NEW.tenant_id AND id=NEW.operation_id AND base_removed) THEN
 RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fence_removed_base_attempt BEFORE INSERT ON app.ai_enhancement_attempts FOR EACH ROW EXECUTE FUNCTION app.fence_removed_base_attempt();
REVOKE EXECUTE ON FUNCTION app.fence_removed_base_attempt() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app.remove_base_cv(p_key uuid,p_expected_revision bigint,p_expected_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 -- Preflight/transfer all current job CVs before any destructive side effects.
 PERFORM app.prepare_job_documents_for_base_removal(w);
 INSERT INTO app.base_removal_objects(tenant_id,bucket,object_key)
 SELECT w,bucket,object_key FROM app.source_documents WHERE tenant_id=w AND profile_id IS NOT NULL AND bucket='cv-imports' AND object_key IS NOT NULL ON CONFLICT DO NOTHING;
 INSERT INTO app.base_removal_objects(tenant_id,bucket,object_key)
 SELECT w,'cv-photos',p.object_key FROM app.photo_assets p WHERE p.tenant_id=w AND NOT EXISTS(SELECT 1 FROM app.job_editor_versions j WHERE j.tenant_id=w AND j.photo_asset_id=p.id) ON CONFLICT DO NOTHING;
 DELETE FROM app.document_language_proposals WHERE tenant_id=w AND request#>>'{source,kind}'='base';
 UPDATE app.ai_enhancement_operations SET base_removed=true,snapshot_id=NULL,revision=NULL,import_id=NULL WHERE tenant_id=w AND job_id IS NULL;
 -- Result refs can contain whole historical draft payloads. Keep only the
 -- non-content idempotency identity/hash and expire these command families.
 UPDATE app.idempotency_requests SET result_refs='{}'::jsonb,expires_at=transaction_timestamp() WHERE tenant_id=w AND command_kind IN (
 'save_base_draft','restore_base_draft','begin_cv_import','save_import_review_draft','save_base_language','restore_base_language','publish_profile','save_profile_checkpoint','save_cv_checkpoint','write_base_language','save_base_cv_checkpoint','restore_cv_version');
 DELETE FROM app.cv_import_sessions WHERE tenant_id=w;
 DELETE FROM app.editor_photo_references WHERE tenant_id=w;
 DELETE FROM app.editor_draft_snapshots WHERE tenant_id=w;
 -- Ordered canonical/analysis closure. Jobs, advertisements, applications,
 -- immutable sent events, account/settings, audits and billing stay intact.
 FOREACH t IN ARRAY ARRAY['recommendation_claims','recommendation_requirements','recommendations','analysis_components','analysis_runs','readiness_runs','match_evidence','evidence_mappings','cv_photo_references','cv_items','cv_sections'] LOOP
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
 DELETE FROM app.photo_assets p WHERE tenant_id=w AND NOT EXISTS(SELECT 1 FROM app.job_editor_versions j WHERE j.tenant_id=w AND j.photo_asset_id=p.id);
 UPDATE app.base_cv_lifecycle SET generation=generation+1,revision_floor=greatest(revision_floor,p_expected_revision)+1,purge_transaction=NULL WHERE tenant_id=w;
 PERFORM app.audit(w,'editor.remove','tenant',w);
 RETURN app.finish_request(w,r.request_id,(app.load_base_state()-'snapshot')||jsonb_build_object('removed',true));
END $$;
REVOKE EXECUTE ON FUNCTION app.remove_base_cv(uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.remove_base_cv(uuid,bigint,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION app.translation_source_current(w uuid,s jsonb,source_locale text) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE result boolean;
BEGIN
 IF s->>'kind'='base' THEN
  SELECT EXISTS(SELECT 1 FROM app.editor_draft_snapshots b WHERE b.tenant_id=w AND b.variant_id='default' AND b.id=(s->>'currentId')::uuid AND b.revision=(s->>'revision')::bigint AND b.payload#>>'{content,id}'=s->>'documentId' AND b.reason IN ('save','restore') AND coalesce(b.payload#>>'{content,documentLocale}',CASE b.payload#>>'{content,language}' WHEN 'ro' THEN 'ro-RO' WHEN 'en' THEN 'en-GB' END)=source_locale AND NOT b.payload->'content' ? 'translation' AND encode(app.hash_json(b.payload),'hex')=s->>'fingerprint' AND b.id=(SELECT id FROM app.current_base_snapshot(w))) INTO result;
 ELSIF s->>'kind'='job' THEN
  SELECT EXISTS(SELECT 1 FROM app.job_editor_documents d JOIN app.job_editor_versions v ON v.document_id=d.id WHERE d.tenant_id=w AND d.id=(s->>'documentId')::uuid AND d.job_id=(s->>'jobId')::uuid AND d.document_locale=split_part(source_locale,'-',1) AND coalesce(v.payload#>>'{content,documentLocale}',CASE v.payload#>>'{content,language}' WHEN 'ro' THEN 'ro-RO' WHEN 'en' THEN 'en-GB' END)=source_locale AND d.deleted_at IS NULL AND v.id=(s->>'currentId')::uuid AND v.revision=(s->>'revision')::bigint AND encode(app.hash_json(v.payload),'hex')=s->>'fingerprint' AND NOT v.payload->'content' ? 'translation') INTO result;
 ELSE RETURN false;END IF;
 RETURN coalesce(result,false);
END $$;

-- The old canonical publication envelope carries no Base generation. Once its
-- family is removed it cannot safely distinguish a fresh null-profile request
-- from a delayed first publication. Retire that legacy envelope for this owned
-- family; the current editor/import CAS commands above remain available.
ALTER FUNCTION app.save_profile_checkpoint(uuid,uuid,bigint,bigint,jsonb,uuid[],date) RENAME TO save_profile_checkpoint_before_base_removal;
CREATE FUNCTION app.save_profile_checkpoint(p_key uuid,p_profile uuid,p_expected_revision bigint,p_expected_base_revision bigint,p_cv jsonb,p_confirm_claim_ids uuid[],p_as_of date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 IF EXISTS(SELECT 1 FROM app.base_cv_lifecycle WHERE tenant_id=w AND generation>0) THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE';END IF;
 RETURN app.save_profile_checkpoint_before_base_removal(p_key,p_profile,p_expected_revision,p_expected_base_revision,p_cv,p_confirm_claim_ids,p_as_of);
END $$;
REVOKE EXECUTE ON FUNCTION app.save_profile_checkpoint_before_base_removal(uuid,uuid,bigint,bigint,jsonb,uuid[],date),app.save_profile_checkpoint(uuid,uuid,bigint,bigint,jsonb,uuid[],date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.save_profile_checkpoint(uuid,uuid,bigint,bigint,jsonb,uuid[],date) TO authenticated;
