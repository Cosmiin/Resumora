-- Job-local manual summary and ordered competence selections. Source snapshots remain immutable.
CREATE OR REPLACE FUNCTION app.job_editor_schema() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $body$
 SELECT $schema${"type":"object","additionalProperties":false,"properties":{"schemaVersion":{"const":"resumora-job-editor/1"},"acceptance":{"const":"accepted"},"source":{"type":"object","additionalProperties":false,"properties":{"snapshotId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"revision":{"type":"integer","minimum":1,"maximum":9007199254740991}},"required":["snapshotId","revision"]},"job":{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"versionId":{"oneOf":[{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},{"type":"null"}]},"fingerprint":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["id","versionId","fingerprint"]},"selectedFacts":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"entityId":{"type":"string","minLength":1,"maxLength":256},"fieldId":{"type":"string","minLength":1,"maxLength":256},"valueId":{"type":"string","minLength":1,"maxLength":256},"sourceId":{"type":"string","minLength":1,"maxLength":256}},"required":["entityId","fieldId","valueId","sourceId"]},"maxItems":5000,"uniqueItems":true},"selectedAnswerIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"wording":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"targetId":{"type":"string","minLength":1,"maxLength":256},"text":{"type":"string","minLength":1,"maxLength":20000},"origin":{"enum":["ai_generated","user_authored"]},"acceptance":{"const":"accepted"},"valueIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"answerIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true}},"required":["targetId","text","origin","acceptance","valueIds","answerIds"]},"maxItems":200,"uniqueItems":true},"presentation":{"type":"object","additionalProperties":false,"properties":{"order":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"hidden":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"hiddenFields":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"templateVersionId":{"type":"string","pattern":"^[a-z][a-z0-9_-]{1,79}$"},"photo":{"oneOf":[{"type":"null"},{"type":"object","additionalProperties":false,"properties":{"assetId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"crop":{"type":"object","additionalProperties":false,"properties":{"version":{"const":1},"centerX":{"type":"number","minimum":0,"maximum":1},"centerY":{"type":"number","minimum":0,"maximum":1},"zoom":{"type":"number","minimum":1,"maximum":3}},"required":["version","centerX","centerY","zoom"]},"shape":{"enum":["circle","square"]},"visible":{"type":"boolean"}},"required":["assetId","crop","shape","visible"]}]},"summaryText":{"type":"string","maxLength":20000},"professionalSkillIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true},"technicalSkillIds":{"type":"array","items":{"type":"string","minLength":1,"maxLength":256},"maxItems":5000,"uniqueItems":true}},"required":[]},"localAdditions":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"id":{"type":"string","pattern":"^job_local_[a-zA-Z0-9_-]{1,100}$"},"targetId":{"type":"string","minLength":1,"maxLength":256},"kind":{"enum":["bullet","professionalSkill","technicalSkill"]},"text":{"type":"string","minLength":1,"maxLength":20000},"scope":{"const":"job-only"},"origin":{"const":"user_authored"}},"required":["id","targetId","kind","text","scope","origin"]},"maxItems":200,"uniqueItems":true}},"required":["schemaVersion","acceptance","source","job","selectedFacts","selectedAnswerIds","wording","presentation","localAdditions"]}$schema$::jsonb
$body$;

CREATE OR REPLACE FUNCTION app.validate_job_editor(p jsonb,source jsonb) RETURNS void
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
 -- Competence selections can only reference this pinned source group or explicit job-local manual additions.
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
