-- Authenticated original retrieval; existing private bucket RLS remains a second fence.
CREATE FUNCTION app.get_cv_import_source(p_source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions
 WHERE tenant_id=w AND source_id=p_source AND state='ready' AND expires_at>transaction_timestamp();
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 RETURN app.cv_import_json(s);
END $$;
REVOKE EXECUTE ON FUNCTION app.get_cv_import_source(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_cv_import_source(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION app.job_editor_facts(c jsonb) RETURNS TABLE(entity_id text,field_key text,fact jsonb)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT c->>'id','name',c->'name'
 UNION ALL SELECT c->>'id','title',f FROM pg_catalog.jsonb_array_elements(coalesce(c->'titles','[]')) f
 UNION ALL SELECT e->>'id','contact',e->'value' FROM pg_catalog.jsonb_array_elements(coalesce(c->'contacts','[]')) e
 UNION ALL SELECT 'professionalSkills','skill',f FROM pg_catalog.jsonb_array_elements(coalesce(c->'professionalSkills','[]')) f
 UNION ALL SELECT 'technicalSkills','skill',f FROM pg_catalog.jsonb_array_elements(coalesce(c->'technicalSkills','[]')) f
 UNION ALL SELECT s->>'id','heading',s->'heading'
 FROM pg_catalog.jsonb_array_elements(coalesce(c->'optionalSections','[]')) s WHERE s ? 'heading'
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

CREATE OR REPLACE FUNCTION app.validate_job_editor(p jsonb,source jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; word jsonb; addition jsonb; target text; sections jsonb; content jsonb:=source->'content';
BEGIN
 IF p IS NULL OR NOT app.matches_schema(p,app.job_editor_schema(),app.job_editor_schema()) OR octet_length(p::text)>524288 THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD'; END IF;
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
    AND (f.fact->>'status' IN ('user_authored','user_confirmed')
      OR (f.fact->>'status'='extracted_unconfirmed' AND f.fact->>'acceptance'='automatic')))
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
 FOR target IN SELECT unnest(ARRAY['professionalSkills','technicalSkills']) LOOP
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p->'presentation'->(CASE target WHEN 'professionalSkills' THEN 'professionalSkillIds' ELSE 'technicalSkillIds' END),'[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM app.job_editor_facts(content) f WHERE f.entity_id=target AND f.fact->'id'=r)
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'localAdditions') a WHERE a->'id'=r AND a->>'targetId'=target
      AND a->>'kind'=(CASE target WHEN 'professionalSkills' THEN 'professionalSkill' ELSE 'technicalSkill' END)) THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';
   END IF;
  END LOOP;
 END LOOP;
END $$;
