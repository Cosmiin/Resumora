-- Authoritative 30 October policy: one CURRENT CV per job/language. This
-- destructive forward ARTIFACT removes old tailored content. Apply only through
-- separately approved backup/data-safeguard activation; tests use disposable PG.
-- Existing tables/CAS engine are retained; no new factual or version store.
CREATE FUNCTION app.clean_job_document_json(v jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb; k text; x jsonb;
BEGIN
 IF jsonb_typeof(v)='array' THEN SELECT coalesce(jsonb_agg(app.clean_job_document_json(e)),'[]') INTO result FROM jsonb_array_elements(v) e;RETURN result;END IF;
 IF jsonb_typeof(v)<>'object' THEN RETURN v;END IF;
 result:='{}';FOR k,x IN SELECT * FROM jsonb_each(v) LOOP
  IF k NOT IN ('sourceClaimId','sourceLineage') THEN result:=result||jsonb_build_object(k,app.clean_job_document_json(x));END IF;
 END LOOP;
 IF result ? 'fieldId' AND result ? 'sourceId' THEN
  result:=jsonb_set(result,'{sourceId}','"job_document"');

 END IF;RETURN result;
END $$;
CREATE FUNCTION app.freeze_job_document(p jsonb,source jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c jsonb:=source->'content'; presentation jsonb; words jsonb; word jsonb; additions jsonb:=coalesce(p->'localAdditions','[]');
 r jsonb; s jsonb; e jsonb; candidate jsonb; valid_word boolean; entries jsonb; roles jsonb:='[]'; groups jsonb; group_name text; key text; i integer;
BEGIN
 -- Apply the existing accepted projection before removing its source context.
 presentation:=coalesce(c->'presentation','{}')||coalesce(p->'presentation','{}');
 words:=coalesce(c#>'{presentation,approvedWording}','{}');
 IF jsonb_array_length(coalesce(p->'wording','[]'))>0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WORDING_MATERIALIZATION_REQUIRED';END IF;
 IF p#>'{presentation,summaryText}' IS NOT NULL AND p#>'{presentation,summaryText}' IS DISTINCT FROM c#>'{summary,text}' THEN
  IF c#>'{summary,provenance}' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WORDING_MATERIALIZATION_REQUIRED';END IF;
  c:=jsonb_set(c,'{summary,text}',p#>'{presentation,summaryText}');c:=jsonb_set(c,'{summary,origin}','"user_authored"');c:=jsonb_set(c,'{summary,approval}','"approved"');
 END IF;
 FOR group_name,key IN SELECT * FROM (VALUES('professionalSkills','professionalSkillIds'),('technicalSkills','technicalSkillIds')) keys LOOP
  groups:=coalesce(c->group_name,'[]');
  FOR r IN SELECT * FROM jsonb_array_elements(additions) WHERE value->>'kind'=CASE group_name WHEN 'professionalSkills' THEN 'professionalSkill' ELSE 'technicalSkill' END LOOP
   groups:=groups||jsonb_build_array(jsonb_build_object('id',r->>'id','fieldId',r->>'id','value',r->>'text','status','user_authored','sourceId','job_document'));
  END LOOP;
  IF p#>ARRAY['presentation',key] IS NOT NULL THEN SELECT coalesce(jsonb_agg(f ORDER BY selection.ordinality),'[]') INTO groups FROM jsonb_array_elements(p#>ARRAY['presentation',key]) WITH ORDINALITY selection(id,ordinality) JOIN LATERAL jsonb_array_elements(groups) f ON f->'id'=selection.id;END IF;
  c:=jsonb_set(c,ARRAY[group_name],groups);
 END LOOP;
 FOR i IN 0..1 LOOP
  groups:=CASE i WHEN 0 THEN coalesce(c->'roles','[]') ELSE coalesce(c->'optionalSections','[]') END;roles:='[]';
  FOR s IN SELECT * FROM jsonb_array_elements(groups) LOOP
   entries:='[]';
   FOR e IN SELECT * FROM jsonb_array_elements(CASE i WHEN 0 THEN jsonb_build_array(s) ELSE coalesce(s->'entries','[]') END) LOOP
    key:=CASE WHEN i=0 THEN 'context' ELSE 'details' END;
    word:=words->(e->>'id');
    IF i=1 AND s->>'kind'='languages' THEN word:=NULL;END IF;
    IF word IS NOT NULL THEN
     IF word->>'scope'='experience' AND NOT word ? 'origin' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WORDING_MATERIALIZATION_REQUIRED';END IF;
     valid_word:=jsonb_typeof(word->'sources')='array' AND jsonb_array_length(word->'sources')>0;
     FOR candidate IN SELECT * FROM jsonb_array_elements(coalesce(word->'sources','[]')) LOOP
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(source->'answers','[]')) a WHERE a->>'id'=candidate->>'id' AND a->>'targetId'=e->>'id' AND a ? 'selectedOptionIds') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='WORDING_MATERIALIZATION_REQUIRED';END IF;
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(jsonb_build_array(e->key)||coalesce(e->'bullets','[]')) f
       WHERE f->>'id'=candidate->>'id' AND f->>'value'=candidate->>'text' AND f->>'sourceId'=candidate->>'sourceId'
        AND (f->>'status' IN ('user_authored','user_confirmed') OR (f->>'status'='extracted_unconfirmed' AND f->>'acceptance'='automatic')))
       AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(source->'answers','[]')) a
        WHERE a->>'id'=candidate->>'id' AND a->>'targetId'=e->>'id' AND a->>'status'='confirmed' AND a->>'sourceId'=candidate->>'sourceId'
         AND a->>'text'=candidate->>'text' AND NOT a ? 'selectedOptionIds') THEN valid_word:=false;END IF;
     END LOOP;
     IF valid_word THEN
      e:=jsonb_set(e,ARRAY[key,'value'],word->'text');e:=jsonb_set(e,ARRAY[key,'status'],'"draft"');
      IF word->>'scope'='experience' THEN e:=jsonb_set(e,'{bullets}','[]');END IF;
     END IF;
    END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(additions) WHERE value->>'kind'='bullet' AND value->>'targetId'=e->>'id' LOOP
     e:=jsonb_set(e,'{bullets}',coalesce(e->'bullets','[]')||jsonb_build_array(jsonb_build_object('id',r->>'id','fieldId',r->>'id','value',r->>'text','status','user_authored','sourceId','job_document')));
    END LOOP;
    entries:=entries||jsonb_build_array(e);
   END LOOP;
   roles:=roles||CASE i WHEN 0 THEN entries ELSE jsonb_build_array(jsonb_set(s,'{entries}',entries)) END;
  END LOOP;
  c:=jsonb_set(c,ARRAY[CASE i WHEN 0 THEN 'roles' ELSE 'optionalSections' END],roles);
 END LOOP;
 c:=c-'nameParts'-'importReview'-'questionPlans'-'roleRewriteReviews';c:=jsonb_set(c,'{referenceProse}','[]');
 presentation:=presentation-'approvedWording'-'contributionHtml'-'summaryText'-'professionalSkillIds'-'technicalSkillIds';c:=jsonb_set(c,'{presentation}',presentation);
 c:=app.clean_job_document_json(c);c:=jsonb_set(c,'{sources}','[{"id":"job_document","kind":"document","label":"Accepted job CV content"}]');
 RETURN jsonb_build_object('schemaVersion','resumora-editor-draft/1','content',c,'answers','[]'::jsonb);
END $$;
-- Remove immutable-history mechanics only for job documents. Base engine stays
-- import-owned. Snapshot source IDs become opaque provenance, never FK archives.
DROP TRIGGER immutable_job_editor_version ON app.job_editor_versions;
ALTER TABLE app.job_editor_versions ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}';
ALTER TABLE app.job_editor_documents ADD COLUMN document_locale text NOT NULL DEFAULT 'ro' CHECK(document_locale IN ('ro','en'));
ALTER TABLE app.job_editor_documents ADD COLUMN is_primary boolean NOT NULL DEFAULT true;
DO $$DECLARE r record;BEGIN
 FOR r IN SELECT conrelid::regclass AS relation,conname FROM pg_constraint WHERE confrelid='app.editor_draft_snapshots'::regclass AND conrelid IN ('app.job_editor_versions'::regclass,'app.job_editor_documents'::regclass) LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.relation,r.conname);END LOOP;
END $$;
ALTER TABLE app.job_editor_documents ALTER COLUMN source_snapshot_id DROP NOT NULL,ALTER COLUMN source_revision DROP NOT NULL;
ALTER TABLE app.job_editor_versions ALTER COLUMN source_snapshot_id DROP NOT NULL,ALTER COLUMN source_revision DROP NOT NULL;
UPDATE app.job_editor_versions SET parent_id=NULL,restored_from=NULL;
DELETE FROM app.job_editor_versions v WHERE EXISTS(SELECT 1 FROM app.job_editor_versions newer WHERE newer.document_id=v.document_id AND newer.revision>v.revision);
UPDATE app.job_editor_versions v SET provenance=jsonb_build_object('sourceSnapshotId',v.source_snapshot_id,'sourceRevision',v.source_revision,'sourceFingerprint',encode(app.hash_json(s.payload),'hex'),'jobFingerprint',v.payload#>>'{job,fingerprint}'),payload=app.freeze_job_document(v.payload,s.payload),source_snapshot_id=NULL,source_revision=NULL FROM app.editor_draft_snapshots s WHERE s.id=v.source_snapshot_id AND s.tenant_id=v.tenant_id;
UPDATE app.job_editor_documents d SET document_locale=coalesce(v.payload#>>'{content,language}','ro'),source_snapshot_id=NULL,source_revision=NULL FROM app.job_editor_versions v WHERE v.document_id=d.id;
DROP INDEX app.one_active_job_editor;
CREATE UNIQUE INDEX one_current_job_locale ON app.job_editor_documents(tenant_id,job_id,document_locale) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX one_primary_job_document ON app.job_editor_documents(tenant_id,job_id) WHERE deleted_at IS NULL AND is_primary;
CREATE UNIQUE INDEX one_current_job_content ON app.job_editor_versions(document_id);
-- No old tailored content may survive through request replay caches.
UPDATE app.idempotency_requests SET result_refs=jsonb_build_object('currentOnly',true) WHERE command_kind IN ('save_job_editor','restore_job_editor','accept_job_tailor') AND result_refs IS NOT NULL;
CREATE FUNCTION app.current_job_document_json(v app.job_editor_versions) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',v.id,'documentId',v.document_id,'revision',v.revision,'fingerprint',encode(app.hash_json(v.payload),'hex'),'createdAt',v.created_at,'locale',d.document_locale,'provenance',v.provenance,'payload',v.payload) FROM app.job_editor_documents d WHERE d.id=v.document_id
$$;
-- Sole selector shared by authenticated reads and trusted worker settlement.
CREATE FUNCTION app.current_job_document_row(p_tenant uuid,p_job uuid,p_locale text DEFAULT NULL) RETURNS app.job_editor_versions LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT v.* FROM app.job_editor_documents d JOIN app.job_editor_versions v ON v.document_id=d.id WHERE d.tenant_id=p_tenant AND d.job_id=p_job AND d.deleted_at IS NULL AND CASE WHEN p_locale IS NULL THEN d.is_primary ELSE d.document_locale=p_locale END
$$;
REVOKE EXECUTE ON FUNCTION app.current_job_document_row(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.load_current_job_document(p_job uuid,p_locale text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();v app.job_editor_versions;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF p_locale IS NOT NULL AND p_locale NOT IN ('ro','en') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT * INTO v FROM app.current_job_document_row(w,p_job,p_locale);
 RETURN CASE WHEN v.id IS NULL THEN NULL ELSE app.current_job_document_json(v) END;
END $$;
CREATE FUNCTION app.save_current_job_document(p_key uuid,p_job uuid,p_locale text,p_document uuid,p_expected_revision bigint,p_payload jsonb,p_base_snapshot uuid,p_provenance jsonb DEFAULT NULL,p_operation uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();d app.job_editor_documents;v app.job_editor_versions;head app.job_editor_versions;r record;photo uuid;old_id uuid; origin_meta jsonb; op app.job_workflow_operations; f app.job_workflows; latest uuid; current_source uuid;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 IF NOT EXISTS(SELECT 1 FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 SELECT * INTO r FROM app.begin_request(w,'save_current_job_document',p_key,jsonb_build_object('job',p_job,'locale',p_locale,'document',p_document,'revision',p_expected_revision,'payload',p_payload,'base',p_base_snapshot,'provenance',p_provenance));
 IF r.cached IS NOT NULL THEN
  SELECT * INTO v FROM app.job_editor_versions WHERE tenant_id=w AND id=(r.cached->>'id')::uuid;
  IF v.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE';END IF;RETURN app.current_job_document_json(v);
 END IF;
 IF p_locale IS NULL OR p_locale NOT IN ('ro','en') OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_payload#>>'{content,language}' IS DISTINCT FROM p_locale OR p_payload->>'schemaVersion' IS DISTINCT FROM 'resumora-editor-draft/1' OR p_payload->'answers' IS DISTINCT FROM '[]'::jsonb OR p_payload#>'{content,referenceProse}' IS DISTINCT FROM '[]'::jsonb OR p_payload->'content' ?| ARRAY['importReview','questionPlans','roleRewriteReviews'] OR p_payload IS DISTINCT FROM app.freeze_job_document('{}',p_payload) OR octet_length(p_payload::text)>524288 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 SELECT * INTO d FROM app.job_editor_documents WHERE tenant_id=w AND job_id=p_job AND document_locale=p_locale AND deleted_at IS NULL FOR UPDATE;
 IF p_document IS NOT NULL AND d.id IS DISTINCT FROM p_document THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 SELECT * INTO head FROM app.job_editor_versions WHERE tenant_id=w AND document_id=d.id;
 IF coalesce(head.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 IF d.id IS NULL THEN
  SELECT id INTO latest FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
  IF p_base_snapshot IS DISTINCT FROM latest OR latest IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
  INSERT INTO app.job_editor_documents(tenant_id,job_id,document_locale,is_primary) VALUES(w,p_job,p_locale,NOT EXISTS(SELECT 1 FROM app.job_editor_documents WHERE tenant_id=w AND job_id=p_job AND deleted_at IS NULL)) RETURNING * INTO d;
 END IF;
 IF p_operation IS NOT NULL THEN
  SELECT * INTO op FROM app.job_workflow_operations WHERE tenant_id=w AND job_id=p_job AND id=p_operation AND kind='tailor' AND state='ready';
  SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job;
  SELECT id INTO latest FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
  SELECT id INTO current_source FROM app.current_job_document_row(w,p_job,op.requested_locale);
  IF f.reviewed IS NULL OR op.id IS NULL OR op.job_revision<>f.revision OR op.snapshot_id IS DISTINCT FROM latest OR op.document_version_id IS DISTINCT FROM current_source OR op.target_locale IS DISTINCT FROM p_locale OR op.target_document_version_id IS DISTINCT FROM head.id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 END IF;
 IF p_provenance IS NOT NULL AND (jsonb_typeof(p_provenance)<>'object' OR octet_length(p_provenance::text)>8192 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_provenance) k WHERE k NOT IN ('sourceSnapshotId','sourceRevision','sourceFingerprint','jobFingerprint','jobRevision','acceptedTargets','generatedTargets','sourceDocumentId','sourceCurrentId','sourceDocumentFingerprint','sourceDocumentRevision'))) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 origin_meta:=head.provenance;
 IF (origin_meta IS NULL OR p_operation IS NOT NULL) AND p_base_snapshot IS NOT NULL THEN SELECT jsonb_build_object('sourceSnapshotId',id,'sourceRevision',revision,'sourceFingerprint',encode(app.hash_json(payload),'hex')) INTO origin_meta FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=p_base_snapshot;END IF;
 origin_meta:=coalesce(origin_meta,'{}')||coalesce(p_provenance,'{}');
 photo:=app.validate_photo_reference(w,p_payload#>'{content,presentation,photo}');old_id:=head.id;
 DELETE FROM app.job_editor_versions WHERE tenant_id=w AND document_id=d.id;
 INSERT INTO app.job_editor_versions(tenant_id,job_id,document_id,revision,job_version_id,reason,payload,request_id,photo_asset_id,provenance)
 VALUES(w,p_job,d.id,coalesce(head.revision,0)+1,(SELECT job_version_id FROM app.target_job_contexts WHERE job_id=p_job),'save',p_payload,r.request_id,photo,origin_meta) RETURNING * INTO v;
 -- Once replaced, no old proposals/results survive as an alternative CV archive.
 UPDATE app.job_workflow_operations SET result=NULL,state=CASE WHEN state IN ('queued','processing') THEN 'stale' ELSE state END,lease=NULL WHERE tenant_id=w AND job_id=p_job AND kind='tailor' AND result IS NOT NULL;
 PERFORM app.finish_request(w,r.request_id,jsonb_build_object('id',v.id));RETURN app.current_job_document_json(v);
END $$;
-- Imports call this INTERNAL helper in their owned destructive transaction.
CREATE FUNCTION app.prepare_job_documents_for_base_removal(p_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM app.tenant_for_user() THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
 PERFORM 1 FROM app.tenants WHERE id=p_tenant FOR UPDATE;PERFORM app.assert_tenant(p_tenant);
 UPDATE app.target_job_contexts SET snapshot_id=NULL,snapshot_revision=NULL WHERE tenant_id=p_tenant;
 UPDATE app.job_workflow_operations SET result=NULL,state=CASE WHEN state IN ('queued','processing','ready') AND kind IN ('match','tailor') THEN 'cancelled' ELSE state END,lease=NULL,snapshot_id=NULL,snapshot_revision=NULL,document_version_id=NULL WHERE tenant_id=p_tenant AND kind IN ('match','tailor');
 UPDATE app.ai_enhancement_operations SET snapshot_id=NULL,revision=NULL WHERE tenant_id=p_tenant AND job_id IS NOT NULL;
END $$;
REVOKE EXECUTE ON FUNCTION app.clean_job_document_json(jsonb),app.freeze_job_document(jsonb,jsonb),app.current_job_document_json(app.job_editor_versions),app.load_current_job_document(uuid,text),app.save_current_job_document(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid),app.prepare_job_documents_for_base_removal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.load_current_job_document(uuid,text),app.save_current_job_document(uuid,uuid,text,uuid,bigint,jsonb,uuid,jsonb,uuid) TO authenticated;
-- Retire historical-content and legacy writer backdoors, not only the UI.
REVOKE EXECUTE ON FUNCTION app.load_job_editor(uuid,uuid,uuid),app.job_editor_history(uuid,uuid,bigint,integer),app.save_job_editor(uuid,uuid,uuid,bigint,jsonb),app.restore_job_editor(uuid,uuid,uuid,bigint,uuid),app.delete_job_editor(uuid,uuid,uuid,bigint),app.accept_job_tailor(uuid,uuid,uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
