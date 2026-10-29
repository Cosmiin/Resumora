CREATE OR REPLACE FUNCTION app.write_job_editor(p_key uuid,p_job uuid,p_document uuid,p_expected_revision bigint,p_payload jsonb,p_restore uuid,p_delete boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); c app.target_job_contexts; d app.job_editor_documents;
 head app.job_editor_versions; saved app.job_editor_versions; restored app.job_editor_versions;
 source app.editor_draft_snapshots; r record; asset uuid; result jsonb;
 command text:=CASE WHEN p_delete THEN 'delete_job_editor' WHEN p_restore IS NOT NULL THEN 'restore_job_editor' ELSE 'save_job_editor' END;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR SHARE;
 PERFORM 1 FROM app.tenant_memberships WHERE tenant_id=w AND user_id=app.require_user() FOR SHARE;
 PERFORM app.assert_tenant(w);
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 PERFORM 1 FROM app.jobs WHERE tenant_id=w AND id=p_job FOR SHARE;
 IF c.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.jobs WHERE tenant_id=w AND id=p_job AND head_version_id IS NOT DISTINCT FROM c.job_version_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 SELECT * INTO r FROM app.begin_request(w,command,p_key,jsonb_build_object('job',p_job,'document',p_document,
 'expectedRevision',p_expected_revision,'payload',p_payload,'restore',p_restore,'delete',p_delete));
 IF r.cached IS NOT NULL THEN
  IF p_delete THEN RETURN r.cached; END IF;
  SELECT * INTO saved FROM app.job_editor_versions WHERE tenant_id=w AND id=(r.cached->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM app.job_editor_documents WHERE tenant_id=w AND id=saved.document_id AND deleted_at IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
  RETURN app.job_editor_json(saved);
 END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 OR p_expected_revision>9007199254740991 OR p_delete IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 IF p_document IS NOT NULL THEN
  SELECT * INTO d FROM app.job_editor_documents WHERE tenant_id=w AND job_id=p_job AND id=p_document AND deleted_at IS NULL FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
  SELECT * INTO head FROM app.job_editor_versions WHERE tenant_id=w AND document_id=d.id ORDER BY revision DESC LIMIT 1;
 ELSE
  IF p_delete OR p_restore IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
  IF EXISTS(SELECT 1 FROM app.job_editor_documents WHERE tenant_id=w AND job_id=p_job AND deleted_at IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 END IF;
 IF coalesce(head.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_delete THEN
  UPDATE app.job_editor_documents SET deleted_at=clock_timestamp() WHERE tenant_id=w AND id=d.id;
  PERFORM app.audit(w,'job_editor.delete','job_editor_document',d.id);
  RETURN app.finish_request(w,r.request_id,jsonb_build_object('documentId',d.id,'deleted',true));
 END IF;
 IF p_restore IS NOT NULL THEN
  SELECT * INTO restored FROM app.job_editor_versions WHERE tenant_id=w AND document_id=d.id AND id=p_restore;
  IF restored.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
  p_payload:=restored.payload;
 END IF;
 IF p_payload IS NULL OR NOT app.matches_schema(p_payload,app.job_editor_schema(),app.job_editor_schema()) THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 IF p_payload->'job' IS DISTINCT FROM app.job_editor_pin(c) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 SELECT * INTO source FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=(p_payload#>>'{source,snapshotId}')::uuid
 AND revision=(p_payload#>>'{source,revision}')::bigint;
 IF source.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 PERFORM app.validate_job_editor(p_payload,source.payload);
 asset:=app.validate_photo_reference(w,CASE WHEN p_payload->'presentation' ? 'photo'
  THEN p_payload#>'{presentation,photo}' ELSE source.payload#>'{content,presentation,photo}' END);
 IF d.id IS NULL THEN
  INSERT INTO app.job_editor_documents(tenant_id,job_id,source_snapshot_id,source_revision)
  VALUES(w,p_job,source.id,source.revision) RETURNING * INTO d;
 END IF;
 INSERT INTO app.job_editor_versions(tenant_id,job_id,document_id,revision,parent_id,restored_from,job_version_id,
 source_snapshot_id,source_revision,reason,payload,request_id,photo_asset_id)
 VALUES(w,p_job,d.id,coalesce(head.revision,0)+1,head.id,p_restore,c.job_version_id,source.id,source.revision,
 CASE WHEN p_restore IS NULL THEN 'save' ELSE 'restore' END,p_payload,r.request_id,asset) RETURNING * INTO saved;
 PERFORM app.audit(w,'job_editor.'||saved.reason,'job_editor_version',saved.id);
 PERFORM app.finish_request(w,r.request_id,jsonb_build_object('id',saved.id));
 RETURN app.job_editor_json(saved);
END $$;
REVOKE EXECUTE ON FUNCTION app.write_job_editor(uuid,uuid,uuid,bigint,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
