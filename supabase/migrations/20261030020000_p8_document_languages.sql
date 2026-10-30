-- Additive language representations, not a factual profile or job history.
-- Local synthetic verification only; hosted apply/deletion requires separate approval.
ALTER TABLE app.editor_draft_snapshots ADD COLUMN variant_id text NOT NULL DEFAULT 'default';
ALTER TABLE app.editor_draft_snapshots ADD CHECK(variant_id='default' OR variant_id ~ '^lang_[a-f0-9]{64}$');
ALTER TABLE app.editor_draft_snapshots DROP CONSTRAINT editor_draft_snapshots_tenant_id_revision_key;
ALTER TABLE app.editor_draft_snapshots ADD UNIQUE(tenant_id,variant_id,revision);
-- Predicate-only correction preserves import-owned deletion/current-head guards.
DO $scope$
DECLARE signature text; original text; scoped text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['app.load_base_draft()','app.base_draft_history(bigint,integer)','app.write_base_draft(uuid,bigint,jsonb,text,uuid)','app.begin_cv_import(uuid,text,text,bigint,bigint)'] LOOP
  original:=pg_get_functiondef(to_regprocedure(signature));
  scoped:=replace(original,'s.tenant_id=workspace ORDER BY','s.tenant_id=workspace AND s.variant_id=''default'' ORDER BY');
  scoped:=replace(scoped,'s.tenant_id=workspace\n   AND','s.tenant_id=workspace AND s.variant_id=''default''\n   AND');
  scoped:=replace(scoped,'WHERE tenant_id=workspace ORDER BY revision','WHERE tenant_id=workspace AND variant_id=''default'' ORDER BY revision');
  scoped:=replace(scoped,'WHERE tenant_id=workspace AND id=p_snapshot','WHERE tenant_id=workspace AND variant_id=''default'' AND id=p_snapshot');
  scoped:=replace(scoped,'max(revision),0) INTO head_revision FROM app.editor_draft_snapshots WHERE tenant_id=w;','max(revision),0) INTO head_revision FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id=''default'';');
  IF scoped IS DISTINCT FROM original THEN EXECUTE scoped;END IF;
 END LOOP;
END $scope$;
CREATE OR REPLACE FUNCTION app.load_editor_snapshot(p_snapshot uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app.editor_snapshot_json(s) FROM app.editor_draft_snapshots s WHERE s.tenant_id=app.tenant_for_user() AND s.variant_id='default' AND s.id=p_snapshot
$$;
CREATE FUNCTION app.load_base_language(p_variant text,p_snapshot uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT app.editor_snapshot_json(s)||jsonb_build_object('variantId',s.variant_id) FROM app.editor_draft_snapshots s WHERE s.tenant_id=app.tenant_for_user() AND s.variant_id=p_variant AND s.variant_id<>'default' AND (p_snapshot IS NULL OR s.id=p_snapshot) ORDER BY s.revision DESC LIMIT 1
$$;
CREATE FUNCTION app.base_language_history(p_variant text,p_before bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(app.editor_snapshot_json(s) ORDER BY s.revision DESC),'[]') FROM (SELECT * FROM app.editor_draft_snapshots WHERE tenant_id=app.tenant_for_user() AND variant_id=p_variant AND variant_id<>'default' AND (p_before IS NULL OR revision<p_before) ORDER BY revision DESC LIMIT 20) s
$$;
CREATE FUNCTION app.translation_source_current(w uuid,s jsonb,source_locale text) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE result boolean;
BEGIN
 IF s->>'kind'='base' THEN
  SELECT EXISTS(SELECT 1 FROM app.editor_draft_snapshots b WHERE b.tenant_id=w AND b.variant_id='default' AND b.id=(s->>'currentId')::uuid AND b.revision=(s->>'revision')::bigint AND b.payload#>>'{content,id}'=s->>'documentId' AND b.reason IN ('save','restore') AND NOT b.payload->'content' ? 'translation' AND encode(app.hash_json(b.payload),'hex')=s->>'fingerprint' AND b.id=(SELECT id FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id='default' ORDER BY revision DESC LIMIT 1)) INTO result;
 ELSIF s->>'kind'='job' THEN
  SELECT EXISTS(SELECT 1 FROM app.job_editor_documents d JOIN app.job_editor_versions v ON v.document_id=d.id WHERE d.tenant_id=w AND d.id=(s->>'documentId')::uuid AND d.job_id=(s->>'jobId')::uuid AND d.document_locale=split_part(source_locale,'-',1) AND d.deleted_at IS NULL AND v.id=(s->>'currentId')::uuid AND v.revision=(s->>'revision')::bigint AND encode(app.hash_json(v.payload),'hex')=s->>'fingerprint' AND NOT v.payload->'content' ? 'translation') INTO result;
 ELSE RETURN false;END IF;
 RETURN coalesce(result,false);
END $$;
CREATE FUNCTION app.document_language_context(p_job uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();source jsonb;versions jsonb;v app.editor_draft_snapshots;
BEGIN
 IF p_job IS NULL THEN
  SELECT * INTO v FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id='default' ORDER BY revision DESC LIMIT 1;
  IF v.id IS NOT NULL THEN source:=app.editor_snapshot_json(v)||jsonb_build_object('documentId',v.payload#>>'{content,id}','fingerprint',encode(app.hash_json(v.payload),'hex'),'locale',coalesce(v.payload#>>'{content,documentLocale}',CASE v.payload#>>'{content,language}' WHEN 'ro' THEN 'ro-RO' ELSE 'en-GB' END));END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('variantId',s.variant_id,'id',s.id,'revision',s.revision,'locale',s.payload#>>'{content,documentLocale}','translation',s.payload#>'{content,translation}')),'[]') INTO versions FROM (SELECT DISTINCT ON(variant_id) * FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id<>'default' ORDER BY variant_id,revision DESC) s WHERE s.payload#>>'{content,translation,source,documentId}'=v.payload#>>'{content,id}';
 ELSE
  source:=app.load_current_job_document(p_job,NULL);
  SELECT coalesce(jsonb_agg(jsonb_build_object('documentId',d.id,'id',c.id,'revision',c.revision,'fingerprint',encode(app.hash_json(c.payload),'hex'),'locale',coalesce(c.payload#>>'{content,documentLocale}',CASE d.document_locale WHEN 'ro' THEN 'ro-RO' ELSE 'en-GB' END),'translation',c.payload#>'{content,translation}')),'[]') INTO versions FROM app.job_editor_documents d JOIN app.job_editor_versions c ON c.document_id=d.id WHERE d.tenant_id=w AND d.job_id=p_job AND d.deleted_at IS NULL;
 END IF;
 RETURN jsonb_build_object('source',source,'versions',versions);
END $$;
CREATE FUNCTION app.write_base_language(p_key uuid,p_variant text,p_expected bigint,p_payload jsonb,p_restore uuid DEFAULT NULL,p_accept boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();head app.editor_draft_snapshots;saved app.editor_draft_snapshots;base app.editor_draft_snapshots;r record;lineage jsonb;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 IF p_variant IS NULL OR p_variant !~ '^lang_[a-f0-9]{64}$' OR p_expected IS NULL OR p_expected<0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT * INTO r FROM app.begin_request(w,'write_base_language',p_key,jsonb_build_object('variant',p_variant,'revision',p_expected,'payload',p_payload,'restore',p_restore,'accept',p_accept));
 IF r.cached IS NOT NULL THEN
  SELECT * INTO saved FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id=p_variant AND id=(r.cached->>'id')::uuid;
  IF saved.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;RETURN app.editor_snapshot_json(saved);
 END IF;
 SELECT * INTO head FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id=p_variant ORDER BY revision DESC LIMIT 1;
 IF coalesce(head.revision,0)<>p_expected THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 IF p_restore IS NOT NULL THEN SELECT payload INTO p_payload FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id=p_variant AND id=p_restore;END IF;
 lineage:=p_payload#>'{content,translation}';
 IF p_payload->>'schemaVersion' IS DISTINCT FROM 'resumora-editor-draft/1' OR lineage->>'schemaVersion' IS DISTINCT FROM 'cv-language/1' OR lineage#>>'{source,kind}' IS DISTINCT FROM 'base' OR lineage->>'documentLocale' NOT IN ('ro-RO','en-GB') OR p_payload#>>'{content,documentLocale}' IS DISTINCT FROM lineage->>'documentLocale' OR octet_length(p_payload::text)>1048576 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';END IF;
 SELECT * INTO base FROM app.editor_draft_snapshots WHERE tenant_id=w AND variant_id='default' ORDER BY revision DESC LIMIT 1;
 IF base.id IS NULL OR base.payload#>>'{content,id}' IS DISTINCT FROM lineage#>>'{source,documentId}' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 IF (head.id IS NULL OR p_accept OR lineage->'source' IS DISTINCT FROM head.payload#>'{content,translation,source}') AND NOT app.translation_source_current(w,lineage->'source',lineage->>'sourceLocale') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 INSERT INTO app.editor_draft_snapshots(tenant_id,variant_id,revision,parent_id,restored_from,reason,payload,request_id) VALUES(w,p_variant,coalesce(head.revision,0)+1,head.id,p_restore,'save',p_payload,r.request_id) RETURNING * INTO saved;
 PERFORM app.finish_request(w,r.request_id,jsonb_build_object('id',saved.id));RETURN app.editor_snapshot_json(saved);
END $$;
REVOKE EXECUTE ON FUNCTION app.translation_source_current(uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION app.load_base_language(text,uuid),app.base_language_history(text,bigint),app.document_language_context(uuid),app.write_base_language(uuid,text,bigint,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.load_base_language(text,uuid),app.base_language_history(text,bigint),app.document_language_context(uuid),app.write_base_language(uuid,text,bigint,jsonb,uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION app.save_current_job_document(p_key uuid,p_job uuid,p_locale text,p_document uuid,p_expected_revision bigint,p_payload jsonb,p_base_snapshot uuid,p_provenance jsonb DEFAULT NULL,p_operation uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF p_provenance ? 'sourceCurrentId' THEN
  IF p_base_snapshot IS NOT NULL OR NOT EXISTS(SELECT 1 FROM app.job_editor_documents sd JOIN app.job_editor_versions sv ON sv.document_id=sd.id WHERE sd.tenant_id=w AND sd.job_id=p_job AND sd.document_locale<>p_locale AND sd.deleted_at IS NULL AND sd.id=(p_provenance->>'sourceDocumentId')::uuid AND sv.id=(p_provenance->>'sourceCurrentId')::uuid AND sv.revision=(p_provenance->>'sourceDocumentRevision')::bigint AND encode(app.hash_json(sv.payload),'hex')=p_provenance->>'sourceDocumentFingerprint' AND NOT sv.payload->'content' ? 'translation') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 END IF;
 IF p_payload#>'{content,translation}' IS NOT NULL AND (d.id IS NULL OR p_payload#>'{content,translation,source}' IS DISTINCT FROM head.payload#>'{content,translation,source}') THEN
  IF p_payload#>>'{content,translation,source,kind}' IS DISTINCT FROM 'job' OR p_payload#>>'{content,translation,source,jobId}' IS DISTINCT FROM p_job::text OR NOT app.translation_source_current(w,p_payload#>'{content,translation,source}',p_payload#>>'{content,translation,sourceLocale}') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 END IF;
 IF d.id IS NULL THEN
  SELECT id INTO latest FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
  IF NOT coalesce(p_provenance ? 'sourceCurrentId',false) AND (p_base_snapshot IS DISTINCT FROM latest OR latest IS NULL) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
  INSERT INTO app.job_editor_documents(tenant_id,job_id,document_locale,is_primary) VALUES(w,p_job,p_locale,NOT EXISTS(SELECT 1 FROM app.job_editor_documents WHERE tenant_id=w AND job_id=p_job AND deleted_at IS NULL)) RETURNING * INTO d;
 END IF;
 IF p_operation IS NOT NULL THEN
  SELECT * INTO op FROM app.job_workflow_operations WHERE tenant_id=w AND job_id=p_job AND id=p_operation AND kind='tailor' AND state='ready';
  SELECT * INTO f FROM app.job_workflows WHERE tenant_id=w AND job_id=p_job;
  SELECT id INTO latest FROM app.editor_draft_snapshots WHERE tenant_id=w AND coalesce(to_jsonb(editor_draft_snapshots)->>'variant_id','default')='default' ORDER BY revision DESC LIMIT 1;
  SELECT id INTO current_source FROM app.current_job_document_row(w,p_job,op.requested_locale);
  IF op.id IS NULL OR op.job_revision<>f.revision OR op.snapshot_id IS DISTINCT FROM latest OR op.document_version_id IS DISTINCT FROM current_source OR op.target_locale IS DISTINCT FROM p_locale OR op.target_document_version_id IS DISTINCT FROM head.id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
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
-- Only pending professional representations/review state; never accepted CV history.
CREATE TABLE app.document_language_proposals(
 tenant_id uuid NOT NULL REFERENCES app.tenants(id),id uuid PRIMARY KEY,request jsonb NOT NULL CHECK(octet_length(request::text)<32768),
 state text NOT NULL CHECK(state IN ('pending','processing','ready','accepted','cancelled','failed','stale','unknown')),
 step integer NOT NULL DEFAULT 0,work_id uuid,review_revision bigint NOT NULL DEFAULT 0,
 output jsonb,review jsonb,accepted jsonb,started_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),CHECK(output IS NULL OR octet_length(output::text)<524288),CHECK(review IS NULL OR octet_length(review::text)<524288)
);
ALTER TABLE app.document_language_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.document_language_proposals FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.language_proposal_json(p app.document_language_proposals) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'request',p.request,'state',p.state,'step',p.step,'reviewRevision',p.review_revision,'output',p.output,'review',p.review,'accepted',p.accepted)
$$;
CREATE FUNCTION app.language_proposal_command(p_action text,p_id uuid,p_input jsonb DEFAULT '{}',p_secret text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();p app.document_language_proposals;source jsonb;job uuid;created boolean:=false;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 IF p_id IS NULL OR p_input IS NULL OR octet_length(p_input::text)>524288 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';END IF;
 SELECT * INTO p FROM app.document_language_proposals WHERE tenant_id=w AND id=p_id FOR UPDATE;
 IF p_action='start' THEN
  PERFORM app.require_ai_worker(p_secret);
  IF p.id IS NOT NULL THEN IF p.request IS DISTINCT FROM p_input THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH';END IF;ELSE
   IF p_input->>'sourceLocale' NOT IN ('ro-RO','en-GB') OR p_input->>'targetLocale' NOT IN ('ro-RO','en-GB') OR p_input->>'sourceLocale'=p_input->>'targetLocale' OR NOT app.translation_source_current(w,p_input->'source',p_input->>'sourceLocale') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
   IF (SELECT count(*) FROM app.document_language_proposals WHERE tenant_id=w AND state IN ('pending','processing','ready'))>=5 THEN RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='COMMAND_IN_PROGRESS';END IF;
   INSERT INTO app.document_language_proposals(tenant_id,id,request,state) VALUES(w,p_id,p_input,'pending') RETURNING * INTO p;
  END IF;
 END IF;
 IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF p_action='cancel' THEN UPDATE app.document_language_proposals SET state='cancelled',output=NULL,review=NULL,work_id=NULL WHERE id=p.id AND state<>'accepted' RETURNING * INTO p;RETURN app.language_proposal_json(p);END IF;
 IF p.state IN ('pending','processing','ready') AND NOT app.translation_source_current(w,p.request->'source',p.request->>'sourceLocale') THEN UPDATE app.document_language_proposals SET state='stale',output=NULL,review=NULL,work_id=NULL WHERE id=p.id RETURNING * INTO p;END IF;
 IF p.state='processing' AND p.started_at<now()-interval '3 minutes' THEN UPDATE app.document_language_proposals SET state='unknown',work_id=NULL WHERE id=p.id RETURNING * INTO p;END IF;
 IF p_action IN ('get','start') THEN RETURN app.language_proposal_json(p);END IF;
 IF p_action='work' THEN
  PERFORM app.require_ai_worker(p_secret);
  IF p.state NOT IN ('pending','ready') OR (p_input->>'expectedStep')::integer<>p.step THEN RETURN jsonb_build_object('created',false,'proposal',app.language_proposal_json(p));END IF;
  source:=p.request->'source';job:=CASE WHEN source->>'kind'='job' THEN (source->>'jobId')::uuid ELSE NULL END;
  INSERT INTO app.ai_enhancement_operations(tenant_id,id,snapshot_id,revision,target_id,policy,job_id) VALUES(w,(p_input->>'operationId')::uuid,CASE WHEN job IS NULL THEN (source->>'currentId')::uuid ELSE NULL END,CASE WHEN job IS NULL THEN (source->>'revision')::bigint ELSE NULL END,'P09:'||p.id::text,'cv-translation/1',job) ON CONFLICT(id) DO NOTHING;
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
END $$;
CREATE FUNCTION app.accept_language_proposal(p_id uuid,p_key uuid,p_review_revision bigint,p_payload jsonb,p_variant text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user();p app.document_language_proposals;result jsonb;source jsonb;provenance jsonb;current jsonb;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
 SELECT * INTO p FROM app.document_language_proposals WHERE tenant_id=w AND id=p_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND';END IF;
 IF p.state='accepted' THEN RETURN p.accepted;END IF;
 IF p.state<>'ready' OR p.review_revision<>p_review_revision OR NOT app.translation_source_current(w,p.request->'source',p.request->>'sourceLocale') OR p_payload#>'{content,translation,source}' IS DISTINCT FROM p.request->'source' OR p_payload#>>'{content,documentLocale}' IS DISTINCT FROM p.request->>'targetLocale' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT';END IF;
 source:=p.request->'source';
 IF source->>'kind'='base' THEN
  result:=app.write_base_language(p_key,p_variant,(p.request->>'targetRevision')::bigint,p_payload,NULL,true);
  result:=jsonb_build_object('kind','base','variantId',p_variant,'id',result->>'id','revision',result->'revision');
 ELSE
  provenance:=jsonb_build_object('sourceDocumentId',source->>'documentId','sourceCurrentId',source->>'currentId','sourceDocumentFingerprint',source->>'fingerprint','sourceDocumentRevision',(source->>'revision')::bigint);
  result:=app.save_current_job_document(p_key,(source->>'jobId')::uuid,split_part(p.request->>'targetLocale','-',1),(p.request->>'targetDocumentId')::uuid,(p.request->>'targetRevision')::bigint,p_payload,NULL,provenance,NULL);
  result:=jsonb_build_object('kind','job','jobId',source->>'jobId','documentId',result->>'documentId','id',result->>'id','revision',result->'revision','locale',result->>'locale');
 END IF;
 UPDATE app.document_language_proposals SET state='accepted',accepted=result,output=NULL,review=NULL WHERE id=p.id;
 RETURN result;
END $$;
CREATE FUNCTION app.purge_base_language_proposals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 DELETE FROM app.document_language_proposals WHERE tenant_id=OLD.tenant_id AND request#>>'{source,kind}'='base' AND request#>>'{source,currentId}'=OLD.id::text;
 RETURN OLD;
END $$;
CREATE TRIGGER purge_deleted_base_language_proposals AFTER DELETE ON app.editor_draft_snapshots FOR EACH ROW EXECUTE FUNCTION app.purge_base_language_proposals();
CREATE FUNCTION app.invalidate_job_language_proposals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE app.document_language_proposals SET state='stale',output=NULL,review=NULL,work_id=NULL WHERE tenant_id=OLD.tenant_id AND state IN ('pending','processing','ready') AND (request#>>'{source,currentId}'=OLD.id::text OR request->>'targetDocumentId'=OLD.document_id::text);
 RETURN OLD;
END $$;
CREATE TRIGGER invalidate_overwritten_job_language_proposals AFTER DELETE ON app.job_editor_versions FOR EACH ROW EXECUTE FUNCTION app.invalidate_job_language_proposals();
REVOKE EXECUTE ON FUNCTION app.language_proposal_json(app.document_language_proposals),app.language_proposal_command(text,uuid,jsonb,text),app.accept_language_proposal(uuid,uuid,bigint,jsonb,text),app.purge_base_language_proposals(),app.invalidate_job_language_proposals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.language_proposal_command(text,uuid,jsonb,text),app.accept_language_proposal(uuid,uuid,bigint,jsonb,text) TO authenticated;
