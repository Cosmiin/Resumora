-- Canonical IDs require a leading letter; DB ownership keys remain UUIDs.
-- The explicit id_<uuid> codec preserves canonical v1 without weakening its schema.
CREATE FUNCTION app.portable_id(value uuid) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$ SELECT 'id_'||value::text $$;
CREATE FUNCTION app.canonical_id(value text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
BEGIN
 IF value !~ '^id_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CANONICAL_ID_CODEC_REQUIRED';
 END IF;
 RETURN pg_catalog.substr(value,4)::uuid;
END $$;

-- P1 bounded validation of the repository's canonical CV 1.0.0 contract.
CREATE FUNCTION app.canonical_cv_schema() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $body$
 SELECT $cv_schema${"type": "object", "additionalProperties": false, "properties": {"schemaVersion": {"const": "1.0.0"}, "snapshotId": {"$ref": "#/$defs/id"}, "baseCvId": {"$ref": "#/$defs/id"}, "version": {"type": "integer", "minimum": 1}, "parentSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "createdAt": {"type": "string", "format": "date-time"}, "locale": {"enum": ["ro", "en"]}, "sources": {"type": "array", "items": {"$ref": "#/$defs/source"}}, "provenance": {"type": "array", "items": {"$ref": "#/$defs/provenance"}}, "claims": {"type": "array", "items": {"$ref": "#/$defs/claim"}}, "facts": {"type": "object", "additionalProperties": false, "properties": {"nameClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "positioningTitleClaimIds": {"type": "array", "items": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "minItems": 2, "maxItems": 2}, "contacts": {"type": "array", "items": {"$ref": "#/$defs/contact"}}, "skills": {"type": "array", "items": {"$ref": "#/$defs/skill"}}, "employment": {"type": "array", "items": {"$ref": "#/$defs/employment"}}, "education": {"type": "array", "items": {"$ref": "#/$defs/education"}}, "optionalEntries": {"type": "array", "items": {"$ref": "#/$defs/optionalEntry"}}}, "required": ["nameClaimId", "positioningTitleClaimIds", "contacts", "skills", "employment", "education", "optionalEntries"]}, "claimLinks": {"type": "array", "items": {"$ref": "#/$defs/claimLink"}}, "enrichment": {"type": "array", "items": {"$ref": "#/$defs/enrichment"}}, "interviews": {"type": "array", "items": {"$ref": "#/$defs/interview"}}, "generatedProse": {"type": "array", "items": {"$ref": "#/$defs/prose"}}, "generations": {"type": "array", "items": {"$ref": "#/$defs/generation"}}, "document": {"type": "object", "additionalProperties": false, "properties": {"sectionOrder": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "sections": {"type": "array", "items": {"$ref": "#/$defs/section"}}, "templateVersionId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "contactIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["sectionOrder", "sections", "templateVersionId", "contactIds"]}, "context": {"type": "object", "additionalProperties": false, "properties": {"kind": {"enum": ["base", "tailored"]}, "baseSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "jobSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "previousTailoredSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}}, "required": ["kind", "baseSnapshotId", "jobSnapshotId", "previousTailoredSnapshotId"]}}, "required": ["schemaVersion", "snapshotId", "baseCvId", "version", "parentSnapshotId", "createdAt", "locale", "sources", "provenance", "claims", "facts", "claimLinks", "enrichment", "interviews", "generatedProse", "generations", "document", "context"], "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://schemas.example.invalid/cv/v1/schema.json", "title": "CV Maker canonical snapshot v1 — discovery proposal", "$defs": {"id": {"type": "string", "pattern": "^[a-z][a-z0-9_-]{1,79}$"}, "partialDate": {"type": "object", "additionalProperties": false, "properties": {"year": {"type": "integer", "minimum": 1900, "maximum": 2200}, "month": {"type": "integer", "minimum": 1, "maximum": 12}}, "required": ["year"]}, "location": {"type": "object", "additionalProperties": false, "properties": {"city": {"type": "string", "minLength": 1, "maxLength": 20000}, "countryCode": {"type": "string", "pattern": "^[A-Z]{2}$"}, "address": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": []}, "metric": {"type": "object", "additionalProperties": false, "properties": {"value": {"type": "number"}, "unit": {"type": "string", "minLength": 1, "maxLength": 20000}, "baseline": {"type": "number"}, "period": {"type": "string", "minLength": 1, "maxLength": 20000}, "qualifier": {"enum": ["exact", "approximate", "range"]}, "upperValue": {"type": "number"}}, "required": ["value", "unit", "qualifier"]}, "source": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["upload", "manual", "interview", "external_document", "job_capture"]}, "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "label": {"type": "string", "minLength": 1, "maxLength": 20000}, "capturedAt": {"type": "string", "format": "date-time"}, "extractorVersion": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": ["id", "kind", "label", "capturedAt"]}, "provenance": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "sourceId": {"$ref": "#/$defs/id"}, "locator": {"type": "string", "minLength": 1, "maxLength": 20000}, "excerpt": {"type": "string", "minLength": 1, "maxLength": 20000}, "extractionConfidence": {"type": "number", "minimum": 0, "maximum": 1}}, "required": ["id", "sourceId", "locator"]}, "claim": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["text", "date", "location", "metric"]}, "value": {}, "status": {"enum": ["extracted_unconfirmed", "user_confirmed", "externally_verified", "suggested", "rejected"]}, "provenanceIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "minItems": 1, "uniqueItems": true}, "confirmedAt": {"type": "string", "format": "date-time"}, "confirmationActor": {"$ref": "#/$defs/id"}, "verificationMethod": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": ["id", "kind", "value", "status", "provenanceIds"], "allOf": [{"if": {"properties": {"kind": {"const": "text"}}}, "then": {"properties": {"value": {"type": "string", "minLength": 1, "maxLength": 20000}}}}, {"if": {"properties": {"kind": {"const": "date"}}}, "then": {"properties": {"value": {"$ref": "#/$defs/partialDate"}}}}, {"if": {"properties": {"kind": {"const": "location"}}}, "then": {"properties": {"value": {"$ref": "#/$defs/location"}}}}, {"if": {"properties": {"kind": {"const": "metric"}}}, "then": {"properties": {"value": {"$ref": "#/$defs/metric"}}}}, {"if": {"properties": {"status": {"enum": ["user_confirmed", "externally_verified"]}}}, "then": {"required": ["confirmedAt", "confirmationActor"]}}, {"if": {"properties": {"status": {"const": "externally_verified"}}}, "then": {"required": ["verificationMethod"]}}]}, "contact": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["email", "phone", "location", "address", "linkedin", "github", "portfolio", "other"]}, "valueClaimId": {"$ref": "#/$defs/id"}, "visibility": {"enum": ["private", "export"]}, "label": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": ["id", "kind", "valueClaimId", "visibility"]}, "skill": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "class": {"enum": ["professional", "technical"]}, "labelClaimId": {"$ref": "#/$defs/id"}, "conceptId": {"type": "string", "minLength": 1, "maxLength": 20000}, "evidenceClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "class", "labelClaimId", "evidenceClaimIds"]}, "employment": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "titleClaimId": {"$ref": "#/$defs/id"}, "companyClaimId": {"$ref": "#/$defs/id"}, "locationClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "startClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "endClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "ongoing": {"type": "boolean"}, "scopeClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "responsibilityClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "accomplishmentClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "metricClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "skillIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "titleClaimId", "companyClaimId", "locationClaimId", "startClaimId", "endClaimId", "ongoing", "scopeClaimIds", "responsibilityClaimIds", "accomplishmentClaimIds", "metricClaimIds", "skillIds"], "allOf": [{"if": {"properties": {"ongoing": {"const": true}}}, "then": {"properties": {"endClaimId": {"type": "null"}}}}]}, "education": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "institutionClaimId": {"$ref": "#/$defs/id"}, "qualificationClaimId": {"$ref": "#/$defs/id"}, "fieldClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "locationClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "startClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "endClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "detailClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "institutionClaimId", "qualificationClaimId", "fieldClaimId", "locationClaimId", "startClaimId", "endClaimId", "detailClaimIds"]}, "optionalEntry": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["certifications", "projects", "achievements", "portfolio", "languages", "leadership", "publications", "volunteering", "custom"]}, "labelClaimId": {"$ref": "#/$defs/id"}, "detailClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "startClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "endClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "linkClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "metricClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "kind", "labelClaimId", "detailClaimIds", "startClaimId", "endClaimId", "linkClaimIds", "metricClaimIds"]}, "prose": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["summary", "bullet", "scope", "other"]}, "text": {"type": "string", "minLength": 1, "maxLength": 20000}, "claimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "minItems": 1, "uniqueItems": true}, "origin": {"enum": ["ai_generated", "user_authored"]}, "approval": {"enum": ["pending", "approved", "rejected"]}, "locale": {"enum": ["ro", "en"]}, "generationId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}}, "required": ["id", "kind", "text", "claimIds", "origin", "approval", "locale", "generationId"]}, "section": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["identity", "summary", "professional_skills", "technical_skills", "experience", "education", "certifications", "projects", "achievements", "portfolio", "languages", "leadership", "publications", "volunteering", "custom"]}, "label": {"type": "string", "minLength": 1, "maxLength": 20000}, "entryIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "proseIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "visible": {"type": "boolean"}}, "required": ["id", "kind", "label", "entryIds", "proseIds", "visible"]}, "generation": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "provider": {"type": "string", "minLength": 1, "maxLength": 20000}, "modelRequested": {"type": "string", "minLength": 1, "maxLength": 20000}, "modelResolved": {"type": "string", "minLength": 1, "maxLength": 20000}, "promptVersion": {"type": "string", "minLength": 1, "maxLength": 20000}, "inputHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "createdAt": {"type": "string", "format": "date-time"}}, "required": ["id", "provider", "modelRequested", "modelResolved", "promptVersion", "inputHash", "createdAt"]}, "claimLink": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "fromClaimId": {"$ref": "#/$defs/id"}, "toClaimId": {"$ref": "#/$defs/id"}, "relation": {"enum": ["metric_of", "supports", "contribution_to", "scope_of"]}}, "required": ["id", "fromClaimId", "toClaimId", "relation"]}, "enrichment": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "targetEntityId": {"$ref": "#/$defs/id"}, "attribute": {"enum": ["systems", "technology", "individual_contribution", "impact_time", "impact_cost", "impact_accuracy", "impact_revenue", "impact_productivity", "scale", "stakeholders", "budget", "team", "project"]}, "claimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "minItems": 1, "uniqueItems": true}}, "required": ["id", "targetEntityId", "attribute", "claimIds"]}, "interview": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "question": {"type": "string", "minLength": 1, "maxLength": 20000}, "answerClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "targetClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "state": {"enum": ["asked", "answered_unconfirmed", "confirmed", "dismissed"]}}, "required": ["id", "question", "answerClaimIds", "targetClaimIds", "state"]}}}$cv_schema$::jsonb
$body$;

CREATE FUNCTION app.matches_schema(value jsonb, schema jsonb, root_schema jsonb, depth integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE typ text; entry record; item jsonb; part jsonb; target jsonb; matches integer; number_value numeric;
BEGIN
 IF value IS NULL OR schema IS NULL OR depth>64 THEN RETURN false; END IF;
 IF schema ? '$ref' THEN
   IF schema->>'$ref' NOT LIKE '#/%' THEN RETURN false; END IF;
   target := root_schema #> pg_catalog.string_to_array(pg_catalog.substr(schema->>'$ref',3),'/');
   RETURN app.matches_schema(value,target,root_schema,depth+1);
 END IF;
 typ := pg_catalog.jsonb_typeof(value);
 IF schema ? 'type' THEN
   target := CASE WHEN pg_catalog.jsonb_typeof(schema->'type')='array' THEN schema->'type' ELSE pg_catalog.jsonb_build_array(schema->'type') END;
   IF NOT (target ? typ OR (typ='number' AND target ? 'integer' AND (value::text)::numeric=pg_catalog.trunc((value::text)::numeric))) THEN RETURN false; END IF;
 END IF;
 IF schema ? 'const' AND value<>schema->'const' THEN RETURN false; END IF;
 IF schema ? 'enum' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(schema->'enum') e WHERE e=matches_schema.value) THEN RETURN false; END IF;
 IF schema ? 'allOf' THEN
   FOR part IN SELECT * FROM pg_catalog.jsonb_array_elements(schema->'allOf') LOOP
     IF NOT app.matches_schema(value,part,root_schema,depth+1) THEN RETURN false; END IF;
   END LOOP;
 END IF;
 IF schema ? 'oneOf' THEN
   matches:=0;
   FOR part IN SELECT * FROM pg_catalog.jsonb_array_elements(schema->'oneOf') LOOP
     IF app.matches_schema(value,part,root_schema,depth+1) THEN matches:=matches+1; END IF;
   END LOOP;
   IF matches<>1 THEN RETURN false; END IF;
 END IF;
 IF schema ? 'if' AND app.matches_schema(value,schema->'if',root_schema,depth+1) AND schema ? 'then' THEN
   IF NOT app.matches_schema(value,schema->'then',root_schema,depth+1) THEN RETURN false; END IF;
 END IF;
 IF typ='object' THEN
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(schema->'required','[]')) LOOP
     IF NOT value ? (item#>>'{}') THEN RETURN false; END IF;
   END LOOP;
   FOR entry IN SELECT * FROM pg_catalog.jsonb_each(value) LOOP
     target:=schema->'properties'->entry.key;
     IF target IS NULL AND schema->'additionalProperties'='false'::jsonb THEN RETURN false; END IF;
     IF target IS NOT NULL AND NOT app.matches_schema(entry.value,target,root_schema,depth+1) THEN RETURN false; END IF;
   END LOOP;
 ELSIF typ='array' THEN
   matches:=pg_catalog.jsonb_array_length(value);
   IF matches>5000 OR matches<COALESCE((schema->>'minItems')::integer,0) OR matches>COALESCE((schema->>'maxItems')::integer,5000) THEN RETURN false; END IF;
   IF schema->>'uniqueItems'='true' AND matches<>(SELECT count(DISTINCT e) FROM pg_catalog.jsonb_array_elements(value)e) THEN RETURN false; END IF;
   IF schema ? 'items' THEN
     FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(value) LOOP
       IF NOT app.matches_schema(item,schema->'items',root_schema,depth+1) THEN RETURN false; END IF;
     END LOOP;
   END IF;
 ELSIF typ='string' THEN
   typ:=value#>>'{}';
   IF pg_catalog.length(typ)<COALESCE((schema->>'minLength')::integer,0) OR pg_catalog.length(typ)>COALESCE((schema->>'maxLength')::integer,200000) THEN RETURN false; END IF;
   IF schema ? 'pattern' AND typ !~ (schema->>'pattern') THEN RETURN false; END IF;
   IF schema->>'format'='date-time' THEN
     IF typ !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN false; END IF;
     BEGIN PERFORM typ::timestamptz; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false; END;
   END IF;
 ELSIF typ='number' THEN
   number_value:=(value::text)::numeric;
   IF (schema ? 'minimum' AND number_value<(schema->>'minimum')::numeric) OR (schema ? 'maximum' AND number_value>(schema->>'maximum')::numeric) THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION app.collect_ids(value jsonb) RETURNS uuid[]
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE result uuid[] := '{}'; entry record; item jsonb;
BEGIN
 IF pg_catalog.jsonb_typeof(value)='object' THEN
   IF value ? 'id' THEN result:=pg_catalog.array_append(result,app.canonical_id(value->>'id')); END IF;
   FOR entry IN SELECT * FROM pg_catalog.jsonb_each(value) LOOP result:=result||app.collect_ids(entry.value); END LOOP;
 ELSIF pg_catalog.jsonb_typeof(value)='array' THEN
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(value) LOOP result:=result||app.collect_ids(item); END LOOP;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION app.claim_refs(value jsonb) RETURNS TABLE(field_role text,claim_id uuid)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE entry record; item jsonb;
BEGIN
 IF pg_catalog.jsonb_typeof(value)='object' THEN
   FOR entry IN SELECT * FROM pg_catalog.jsonb_each(value) LOOP
     IF entry.key LIKE '%ClaimId' AND entry.value<>'null'::jsonb THEN
       field_role:=entry.key;claim_id:=app.canonical_id(entry.value#>>'{}'); RETURN NEXT;
     ELSIF entry.key LIKE '%ClaimIds' OR entry.key='claimIds' THEN
       FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(entry.value) LOOP
         IF item<>'null'::jsonb THEN field_role:=entry.key;claim_id:=app.canonical_id(item#>>'{}'); RETURN NEXT; END IF;
       END LOOP;
     ELSE RETURN QUERY SELECT * FROM app.claim_refs(entry.value);
     END IF;
   END LOOP;
 ELSIF pg_catalog.jsonb_typeof(value)='array' THEN
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(value) LOOP RETURN QUERY SELECT * FROM app.claim_refs(item); END LOOP;
 END IF;
END $$;

CREATE FUNCTION app.validate_canonical(cv jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE ids uuid[]; ref record; record jsonb; item jsonb; linked jsonb; start_value jsonb; end_value jsonb; expected text; entity_ids text[];
BEGIN
 IF cv IS NULL OR pg_catalog.octet_length(cv::text)>1048576 OR NOT app.matches_schema(cv,app.canonical_cv_schema(),app.canonical_cv_schema()) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='CANONICAL_SCHEMA_INVALID';
 END IF;
 ids:=app.collect_ids(cv);
 IF pg_catalog.cardinality(ids)<>(SELECT count(DISTINCT i) FROM pg_catalog.unnest(ids)i) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='DUPLICATE_CANONICAL_ID';
 END IF;
 IF pg_catalog.jsonb_array_length(cv->'generatedProse')>0 OR pg_catalog.jsonb_array_length(cv->'generations')>0 OR pg_catalog.jsonb_array_length(cv->'interviews')>0 OR cv#>>'{document,templateVersionId}' IS NOT NULL OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}')s WHERE pg_catalog.jsonb_array_length(s->'proseIds')>0) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='DEFERRED_FEATURE_NOT_IN_P0_P3';
 END IF;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'provenance') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv->'sources')s WHERE s->>'id'=record->>'sourceId') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_SOURCE'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'claims') LOOP
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(record->'provenanceIds') LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv->'provenance')p WHERE p->>'id'=item#>>'{}') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_PROVENANCE'; END IF;
   END LOOP;
 END LOOP;
 FOR ref IN SELECT * FROM app.claim_refs(cv) LOOP
   SELECT c INTO linked FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE app.canonical_id(c->>'id')=ref.claim_id;
   IF linked IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_CLAIM'; END IF;
   expected:=CASE WHEN ref.field_role IN ('nameClaimId','positioningTitleClaimIds','labelClaimId','titleClaimId','companyClaimId','institutionClaimId','qualificationClaimId','fieldClaimId') THEN 'text' WHEN ref.field_role IN ('startClaimId','endClaimId') THEN 'date' WHEN ref.field_role='locationClaimId' THEN 'location' WHEN ref.field_role='metricClaimIds' THEN 'metric' ELSE NULL END;
   IF expected IS NOT NULL AND linked->>'kind'<>expected THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='WRONG_CLAIM_KIND'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv#>'{facts,contacts}') LOOP
   SELECT c INTO linked FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'valueClaimId';
   IF linked->>'kind'<>(CASE WHEN record->>'kind'='location' THEN 'location' ELSE 'text' END) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='WRONG_CONTACT_CLAIM_KIND'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements((cv#>'{facts,employment}')||(cv#>'{facts,education}')||(cv#>'{facts,optionalEntries}')) LOOP
   SELECT c->'value' INTO start_value FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'startClaimId';
   SELECT c->'value' INTO end_value FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'endClaimId';
   IF start_value IS NOT NULL AND end_value IS NOT NULL AND ((start_value->>'year')::integer,COALESCE((start_value->>'month')::integer,1))>((end_value->>'year')::integer,COALESCE((end_value->>'month')::integer,12)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='IMPOSSIBLE_DATE_CHRONOLOGY'; END IF;
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(COALESCE(record->'skillIds','[]')) LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{facts,skills}')s WHERE s->>'id'=item#>>'{}') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_SKILL'; END IF;
   END LOOP;
 END LOOP;
 SELECT pg_catalog.array_agg(e->>'id') INTO entity_ids FROM pg_catalog.jsonb_array_elements((cv#>'{facts,contacts}')||(cv#>'{facts,skills}')||(cv#>'{facts,employment}')||(cv#>'{facts,education}')||(cv#>'{facts,optionalEntries}'))e;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'enrichment') LOOP
   IF NOT COALESCE(record->>'targetEntityId'=ANY(entity_ids),false) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DANGLING_ENRICHMENT_TARGET'; END IF;
 END LOOP;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv->'claimLinks') LOOP
   IF record->>'relation'='metric_of' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv->'claims')c WHERE c->>'id'=record->>'fromClaimId' AND c->>'kind'='metric') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='METRIC_LINK_REQUIRES_METRIC'; END IF;
 END LOOP;
 IF pg_catalog.jsonb_array_length(cv#>'{document,sectionOrder}')<>pg_catalog.jsonb_array_length(cv#>'{document,sections}') OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(cv#>'{document,sectionOrder}')i WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}')s WHERE s->>'id'=i)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='SECTION_ORDER_NOT_PERMUTATION'; END IF;
 FOR record IN SELECT * FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}') LOOP
   FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(record->'entryIds') LOOP
     expected:=record->>'kind';
     IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements((cv#>'{facts,skills}')||(cv#>'{facts,employment}')||(cv#>'{facts,education}')||(cv#>'{facts,optionalEntries}'))e WHERE e->>'id'=item#>>'{}' AND (CASE WHEN e ? 'class' THEN e->>'class'||'_skills' WHEN e ? 'companyClaimId' THEN 'experience' WHEN e ? 'institutionClaimId' THEN 'education' ELSE e->>'kind' END)=expected) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='WRONG_SECTION_ENTRY_KIND'; END IF;
   END LOOP;
 END LOOP;
 FOR item IN SELECT * FROM pg_catalog.jsonb_array_elements(cv#>'{document,contactIds}') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{facts,contacts}')c WHERE c->>'id'=item#>>'{}' AND c->>'visibility'='export') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PRIVATE_OR_DANGLING_CONTACT'; END IF;
 END LOOP;
 IF cv#>>'{context,kind}'='tailored' THEN
   IF cv#>>'{context,baseSnapshotId}' IS NULL OR cv#>>'{context,jobSnapshotId}' IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='TAILORED_LINEAGE_REQUIRED'; END IF;
 ELSE
   IF cv#>>'{context,baseSnapshotId}' IS NOT NULL OR cv#>>'{context,jobSnapshotId}' IS NOT NULL OR cv#>>'{context,previousTailoredSnapshotId}' IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='BASE_HAS_JOB_CONTEXT'; END IF;
 END IF;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC, anon;
