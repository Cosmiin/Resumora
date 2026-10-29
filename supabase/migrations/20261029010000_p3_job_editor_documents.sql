-- Forward local migration only; hosted activation requires separate approval.
-- Bounded editor document adapter: no canonical publication or factual writes.
CREATE FUNCTION app.job_editor_schema() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $body$
 SELECT $schema${"type":"object","additionalProperties":false,"properties":{"schemaVersion":{"const":"resumora-job-editor/1"},"acceptance":{"const":"accepted"},"source":{"type":"object","additionalProperties":false,"properties":{"snapshotId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["snapshotId","revision"]},"job":{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"versionId":{"oneOf":[{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},{"type":"null"}]},"fingerprint":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["id","versionId","fingerprint"]},"selectedFacts":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"entityId":{"type":"string","minLength":1,"maxLength":256},"fieldId":{"type":"string","minLength":1,"maxLength":256},"valueId":{"type":"string","minLength":1,"maxLength":256},"sourceId":{"type":"string","minLength":1,"maxLength":256}},"required":["entityId","fieldId","valueId","sourceId"]},"maxItems":5000,"uniqueItems":true},"selectedAnswerIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"wording":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"targetId":{"type":"string","minLength":1,"maxLength":256},"text":{"type":"string","minLength":1,"maxLength":20000},"origin":{"enum":["ai_generated","user_authored"]},"acceptance":{"const":"accepted"},"valueIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"answerIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true}},"required":["targetId","text","origin","acceptance","valueIds","answerIds"]},"maxItems":200,"uniqueItems":true},"presentation":{"type":"object","additionalProperties":false,"properties":{"order":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"hidden":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"hiddenFields":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"templateVersionId":{"type":"string","pattern":"^[a-z][a-z0-9_-]{1,79}$"},"photo":{"oneOf":[{"type":"null"},{"type":"object","additionalProperties":false,"properties":{"assetId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"crop":{"type":"object","additionalProperties":false,"properties":{"version":{"const":1},"centerX":{"type":"number","minimum":0,"maximum":1},"centerY":{"type":"number","minimum":0,"maximum":1},"zoom":{"type":"number","minimum":1,"maximum":3}},"required":["version","centerX","centerY","zoom"]},"shape":{"enum":["circle","square"]},"visible":{"type":"boolean"}},"required":["assetId","crop","shape","visible"]}]}},"required":[]},"localAdditions":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string","pattern":"^job_local_[a-zA-Z0-9_-]{1,100}$"},"targetId":{"type":"string","minLength":1,"maxLength":256},"kind":{"enum":["bullet","professionalSkill","technicalSkill"]},"text":{"type":"string","minLength":1,"maxLength":20000},"scope":{"const":"job-only"},"origin":{"const":"user_authored"}},"required":["id","targetId","kind","text","scope","origin"]},"maxItems":200,"uniqueItems":true}},"required":["schemaVersion","acceptance","source","job","selectedFacts","selectedAnswerIds","wording","presentation","localAdditions"]}$schema$::jsonb
$body$;

CREATE TABLE app.job_editor_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 job_id uuid NOT NULL, source_snapshot_id uuid NOT NULL, source_revision bigint NOT NULL CHECK(source_revision>0),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), deleted_at timestamptz,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.jobs(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,source_snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_active_job_editor ON app.job_editor_documents(tenant_id,job_id) WHERE deleted_at IS NULL;
CREATE TABLE app.job_editor_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, job_id uuid NOT NULL, document_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0), parent_id uuid, restored_from uuid,
 job_version_id uuid, source_snapshot_id uuid NOT NULL, source_revision bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), reason text NOT NULL CHECK(reason IN ('save','restore')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=524288),
 request_id uuid NOT NULL, photo_asset_id uuid,
 UNIQUE(tenant_id,document_id,id), UNIQUE(tenant_id,document_id,revision),
 FOREIGN KEY(tenant_id,job_id,document_id) REFERENCES app.job_editor_documents(tenant_id,job_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,document_id,parent_id) REFERENCES app.job_editor_versions(tenant_id,document_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,document_id,restored_from) REFERENCES app.job_editor_versions(tenant_id,document_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,job_id,job_version_id) REFERENCES app.job_versions(tenant_id,job_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,source_snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,request_id) REFERENCES app.idempotency_requests(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,photo_asset_id) REFERENCES app.photo_assets(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.job_editor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.job_editor_versions ENABLE ROW LEVEL SECURITY;
-- RPC-only access: no changes to existing exposed table policies/grants.
REVOKE ALL ON app.job_editor_documents,app.job_editor_versions FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable_job_editor_version BEFORE UPDATE OR DELETE ON app.job_editor_versions
 FOR EACH ROW EXECUTE FUNCTION app.protect_immutable();

CREATE FUNCTION app.job_editor_pin(c app.target_job_contexts) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',c.job_id,'versionId',c.job_version_id,'fingerprint',
 pg_catalog.encode(app.hash_json(pg_catalog.jsonb_build_object('schema','job-editor-input/1',
 'id',c.job_id,'versionId',c.job_version_id,'intake',c.intake,'requirements',c.requirements)),'hex'))
$$;
CREATE FUNCTION app.job_editor_context(p_job uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); c app.target_job_contexts;
BEGIN
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job;
 IF c.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 RETURN pg_catalog.jsonb_build_object('job',app.job_editor_pin(c),'source',
 pg_catalog.jsonb_build_object('snapshotId',c.snapshot_id,'revision',c.snapshot_revision));
END $$;
-- Enumerate only model facts, not presentation wording, imported proposals or
-- answer paraphrases. Keep entity handles and exact value/source revisions.
CREATE FUNCTION app.job_editor_facts(c jsonb) RETURNS TABLE(entity_id text,field_key text,fact jsonb)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT c->>'id','name',c->'name'
 UNION ALL SELECT c->>'id','title',f FROM pg_catalog.jsonb_array_elements(coalesce(c->'titles','[]')) f
 UNION ALL SELECT e->>'id','contact',e->'value' FROM pg_catalog.jsonb_array_elements(coalesce(c->'contacts','[]')) e
 UNION ALL SELECT 'professionalSkills','skill',f FROM pg_catalog.jsonb_array_elements(coalesce(c->'professionalSkills','[]')) f
 UNION ALL SELECT 'technicalSkills','skill',f FROM pg_catalog.jsonb_array_elements(coalesce(c->'technicalSkills','[]')) f
 UNION ALL SELECT e->>'id',k,v FROM (
  SELECT e FROM pg_catalog.jsonb_array_elements(coalesce(c->'roles','[]')) e
  UNION ALL SELECT e FROM pg_catalog.jsonb_array_elements(coalesce(c->'education','[]')) e
  UNION ALL SELECT e FROM pg_catalog.jsonb_array_elements(coalesce(c->'optionalSections','[]')) s,
   LATERAL pg_catalog.jsonb_array_elements(coalesce(s->'entries','[]')) e
 ) entities CROSS JOIN LATERAL pg_catalog.jsonb_each(entities.e) fields(k,v)
 WHERE k IN ('title','company','location','start','end','ongoing','context','institution','qualification','field','details','proficiency')
 UNION ALL SELECT e->>'id','bullet',f FROM (
  SELECT e FROM pg_catalog.jsonb_array_elements(coalesce(c->'roles','[]')) e
  UNION ALL SELECT e FROM pg_catalog.jsonb_array_elements(coalesce(c->'optionalSections','[]')) s,
   LATERAL pg_catalog.jsonb_array_elements(coalesce(s->'entries','[]')) e
 ) entities CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(coalesce(e->'bullets','[]')) f
$$;
CREATE FUNCTION app.validate_job_editor(p jsonb,source jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; word jsonb; addition jsonb; target text; sections jsonb; content jsonb:=source->'content';
BEGIN
 IF p IS NULL OR NOT app.matches_schema(p,app.job_editor_schema(),app.job_editor_schema()) OR octet_length(p::text)>524288 THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 -- Existing snapshots are immutable; this command cannot fix/re-attest malformed
 -- or ambiguous source handles and must never guess a match by array position.
 IF source->>'schemaVersion' IS DISTINCT FROM 'resumora-editor-draft/1' OR jsonb_typeof(content) IS DISTINCT FROM 'object'
 OR jsonb_typeof(source->'answers') IS DISTINCT FROM 'array'
 OR EXISTS(SELECT 1 FROM app.job_editor_facts(content) GROUP BY fact->>'id' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM app.job_editor_facts(content) GROUP BY fact->>'fieldId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'selectedFacts') x GROUP BY x->>'valueId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'wording') x GROUP BY x->>'targetId' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'localAdditions') x GROUP BY x->>'id' HAVING count(*)>1) THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(p->'selectedFacts') LOOP
  IF NOT EXISTS(SELECT 1 FROM app.job_editor_facts(content) f WHERE f.entity_id=r->>'entityId'
    AND f.fact->>'id'=r->>'valueId' AND f.fact->>'fieldId'=r->>'fieldId' AND f.fact->>'sourceId'=r->>'sourceId'
    AND f.fact->>'status' IN ('user_authored','user_confirmed'))
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(content->'sources','[]')) s WHERE s->>'id'=r->>'sourceId') THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_array_elements(p->'selectedAnswerIds') LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(source->'answers') a WHERE a->'id'=r AND a->>'status'='confirmed')<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 END LOOP;
 FOR word IN SELECT * FROM jsonb_array_elements(p->'wording') LOOP
  target:=word->>'targetId';
  IF NOT (word->>'text' ~ '[^[:space:]]') OR jsonb_array_length(word->'valueIds')+jsonb_array_length(word->'answerIds')=0 OR
    (SELECT count(*) FROM (
      SELECT e FROM jsonb_array_elements(coalesce(content->'roles','[]')) e
      UNION ALL SELECT e FROM jsonb_array_elements(coalesce(content->'optionalSections','[]')) s,
       LATERAL jsonb_array_elements(coalesce(s->'entries','[]')) e WHERE s->>'kind'<>'languages'
    ) targets WHERE e->>'id'=target)<>1 THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(word->'valueIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'selectedFacts') s,app.job_editor_facts(content) f
    WHERE s->'valueId'=r AND f.fact->'id'=r AND f.entity_id=target AND f.field_key IN ('context','details','bullet')
    AND jsonb_typeof(f.fact->'value')='string') THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_array_elements(word->'answerIds') LOOP
   IF NOT (p->'selectedAnswerIds' @> jsonb_build_array(r)) OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(source->'answers') a,jsonb_array_elements(coalesce(content->'sources','[]')) s
    WHERE a->'id'=r AND a->>'targetId'=target AND a->>'status'='confirmed' AND a->>'sourceId'=s->>'id') THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
  END LOOP;
 END LOOP;
 SELECT jsonb_agg(id) INTO sections FROM (
 SELECT unnest(ARRAY['identity','summary','professionalSkills','technicalSkills','experience','education']) AS id
 UNION ALL SELECT s->>'id' FROM jsonb_array_elements(coalesce(content->'optionalSections','[]')) s) allowed;
 FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p#>'{presentation,order}','[]'))
 UNION ALL SELECT * FROM jsonb_array_elements(coalesce(p#>'{presentation,hidden}','[]')) LOOP
  IF NOT sections @> jsonb_build_array(r) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
 END LOOP;
 FOR addition IN SELECT * FROM jsonb_array_elements(p->'localAdditions') LOOP
  IF NOT (addition->>'text' ~ '[^[:space:]]') OR EXISTS(SELECT 1 FROM app.job_editor_facts(content) f
   WHERE addition->>'id' IN (f.entity_id,f.fact->>'id',f.fact->>'fieldId'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(content->'sources','[]')) s WHERE s->>'id' IN (addition->>'id','job_local_manual'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(source->'answers') a WHERE a->>'id'=addition->>'id') THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
  target:=addition->>'targetId';
  IF addition->>'kind'='bullet' THEN
   IF (SELECT count(*) FROM (
     SELECT e FROM jsonb_array_elements(coalesce(content->'roles','[]')) e
     UNION ALL SELECT e FROM jsonb_array_elements(coalesce(content->'optionalSections','[]')) s,
       LATERAL jsonb_array_elements(coalesce(s->'entries','[]')) e WHERE s->>'kind'<>'languages'
    ) targets WHERE e->>'id'=target)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
  ELSIF target IS DISTINCT FROM (CASE addition->>'kind' WHEN 'professionalSkill' THEN 'professionalSkills' ELSE 'technicalSkills' END) THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION app.job_editor_json(v app.job_editor_versions) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('id',v.id,'documentId',v.document_id,'revision',v.revision,
 'restoredFrom',v.restored_from,'createdAt',v.created_at,'reason',v.reason)) ||
 jsonb_build_object('parentId',v.parent_id,'payload',v.payload,'sourcePayload',s.payload)
 FROM app.editor_draft_snapshots s WHERE s.tenant_id=v.tenant_id AND s.id=v.source_snapshot_id
$$;
CREATE FUNCTION app.load_job_editor(p_job uuid,p_document uuid DEFAULT NULL,p_version uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); result jsonb;
BEGIN
 IF (p_document IS NULL)<>(p_version IS NULL) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 SELECT app.job_editor_json(v) INTO result FROM app.job_editor_documents d JOIN app.job_editor_versions v
 ON v.tenant_id=d.tenant_id AND v.document_id=d.id
 WHERE d.tenant_id=w AND d.job_id=p_job AND d.deleted_at IS NULL
 AND (p_document IS NULL OR d.id=p_document) AND (p_version IS NULL OR v.id=p_version)
 ORDER BY v.revision DESC LIMIT 1;
 RETURN result;
END $$;
CREATE FUNCTION app.job_editor_history(p_job uuid,p_document uuid,p_before_revision bigint DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); result jsonb;
BEGIN
 IF p_document IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_before_revision<=0 THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 SELECT coalesce(jsonb_agg(app.job_editor_json(v) ORDER BY v.revision DESC),'[]') INTO result FROM (
  SELECT v.* FROM app.job_editor_versions v JOIN app.job_editor_documents d ON d.tenant_id=v.tenant_id AND d.id=v.document_id
  WHERE d.tenant_id=w AND d.job_id=p_job AND d.id=p_document AND d.deleted_at IS NULL
  AND (p_before_revision IS NULL OR v.revision<p_before_revision) ORDER BY v.revision DESC LIMIT p_limit) v;
 RETURN result;
END $$;
-- Serialize every job write with the owned job context; lock tenant/membership
-- to order acceptance against account deletion/revocation, and the photo row
-- through validate_photo_reference to order against deletion of that asset.
CREATE FUNCTION app.write_job_editor(p_key uuid,p_job uuid,p_document uuid,p_expected_revision bigint,p_payload jsonb,p_restore uuid,p_delete boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); c app.target_job_contexts; d app.job_editor_documents;
 head app.job_editor_versions; saved app.job_editor_versions; restored app.job_editor_versions;
 source app.editor_draft_snapshots; r record; asset uuid; result jsonb;
 command text:=CASE WHEN p_delete THEN 'delete_job_editor' WHEN p_restore IS NOT NULL THEN 'restore_job_editor' ELSE 'save_job_editor' END;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR SHARE;
 PERFORM 1 FROM app.tenant_memberships WHERE tenant_id=w AND user_id=app.require_user() FOR SHARE;
 PERFORM app.assert_tenant(w);
 PERFORM 1 FROM app.jobs WHERE tenant_id=w AND id=p_job FOR SHARE;
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
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
 IF d.id IS NOT NULL AND (d.source_snapshot_id<>source.id OR d.source_revision<>source.revision) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
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
 -- Only durable result references in the request ledger, never a second copy of
 -- source answers or a job CV in the provider usage ledger.
 PERFORM app.finish_request(w,r.request_id,jsonb_build_object('id',saved.id));
 RETURN app.job_editor_json(saved);
END $$;
CREATE FUNCTION app.save_job_editor(p_key uuid,p_job uuid,p_document uuid,p_expected_revision bigint,p_payload jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT app.write_job_editor(p_key,p_job,p_document,p_expected_revision,p_payload,NULL,false)
$$;
CREATE FUNCTION app.restore_job_editor(p_key uuid,p_job uuid,p_document uuid,p_expected_revision bigint,p_version uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_document IS NULL OR p_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 RETURN app.write_job_editor(p_key,p_job,p_document,p_expected_revision,NULL,p_version,false);
END $$;
CREATE FUNCTION app.delete_job_editor(p_key uuid,p_job uuid,p_document uuid,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_document IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 RETURN app.write_job_editor(p_key,p_job,p_document,p_expected_revision,NULL,NULL,true);
END $$;
REVOKE EXECUTE ON FUNCTION app.job_editor_schema(),app.job_editor_pin(app.target_job_contexts),app.job_editor_context(uuid),
 app.job_editor_facts(jsonb),app.validate_job_editor(jsonb,jsonb),app.job_editor_json(app.job_editor_versions),
 app.load_job_editor(uuid,uuid,uuid),app.job_editor_history(uuid,uuid,bigint,integer),
 app.write_job_editor(uuid,uuid,uuid,bigint,jsonb,uuid,boolean),app.save_job_editor(uuid,uuid,uuid,bigint,jsonb),
 app.restore_job_editor(uuid,uuid,uuid,bigint,uuid),app.delete_job_editor(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.job_editor_context(uuid),app.load_job_editor(uuid,uuid,uuid),app.job_editor_history(uuid,uuid,bigint,integer),
 app.save_job_editor(uuid,uuid,uuid,bigint,jsonb),app.restore_job_editor(uuid,uuid,uuid,bigint,uuid),app.delete_job_editor(uuid,uuid,uuid,bigint) TO authenticated;

-- Retain ready assets referenced by immutable job editor history too.
CREATE OR REPLACE FUNCTION app.expire_photo_uploads(p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE workspace uuid:=app.tenant_for_user(); row app.photo_assets; result jsonb:='[]'::jsonb;
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 FOR row IN SELECT p.* FROM app.photo_assets p WHERE p.tenant_id=workspace AND
  (p.state='purge_pending' OR (p.state IN ('reserved','ready') AND p.created_at<transaction_timestamp()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM app.cv_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM app.job_editor_versions v WHERE v.tenant_id=p.tenant_id AND v.photo_asset_id=p.id)))
  ORDER BY p.created_at LIMIT 10 FOR UPDATE SKIP LOCKED
 LOOP
  IF row.state<>'purge_pending' AND
   (EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.tenant_id=row.tenant_id AND r.asset_id=row.id)
    OR EXISTS(SELECT 1 FROM app.cv_photo_references r WHERE r.tenant_id=row.tenant_id AND r.asset_id=row.id)
    OR EXISTS(SELECT 1 FROM app.job_editor_versions v WHERE v.tenant_id=row.tenant_id AND v.photo_asset_id=row.id)) THEN
   CONTINUE;
  END IF;
  UPDATE app.photo_assets SET state='purge_pending',deleted_at=coalesce(deleted_at,transaction_timestamp()) WHERE id=row.id;
  result:=result||jsonb_build_array(app.photo_manifest(row));
 END LOOP;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION app.expire_photo_uploads(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.expire_photo_uploads(text) TO authenticated;
