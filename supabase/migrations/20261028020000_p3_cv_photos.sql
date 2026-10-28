-- Additive only. Prepared for explicit target review; never configures a secret.
CREATE TABLE app.photo_worker_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 secret_hash bytea NOT NULL CHECK(octet_length(secret_hash)=32)
);
REVOKE ALL ON app.photo_worker_config FROM PUBLIC,anon,authenticated;
ALTER TABLE app.photo_worker_config ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION app.require_photo_worker(secret text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF secret IS NULL OR length(secret)<32 OR NOT EXISTS(SELECT 1 FROM app.photo_worker_config
  WHERE secret_hash=pg_catalog.sha256(pg_catalog.convert_to(secret,'UTF8'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';
 END IF;
END $$;
CREATE TABLE app.photo_assets (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
 object_key text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 width integer NOT NULL CHECK(width BETWEEN 256 AND 1600),
 height integer NOT NULL CHECK(height BETWEEN 256 AND 1600),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 normalization_version text NOT NULL DEFAULT 'rgb-jpeg-1' CHECK(normalization_version='rgb-jpeg-1'),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','ready','purge_pending','purged')),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),deleted_at timestamptz,
 UNIQUE(tenant_id,id), CHECK(object_key=tenant_id::text||'/'||id::text||'.jpg')
);
ALTER TABLE app.photo_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.photo_assets FROM PUBLIC,anon,authenticated;
CREATE POLICY photo_owner_read ON app.photo_assets FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.photo_assets TO authenticated;
CREATE TABLE app.editor_photo_references (
 tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, asset_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,snapshot_id),
 FOREIGN KEY(tenant_id,snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,asset_id) REFERENCES app.photo_assets(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.editor_photo_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.editor_photo_references FROM PUBLIC,anon,authenticated;
CREATE POLICY photo_ref_owner ON app.editor_photo_references FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.editor_photo_references TO authenticated;
CREATE FUNCTION app.photo_manifest(p app.photo_assets) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT pg_catalog.jsonb_build_object(
 'id',p.id,'objectKey',p.object_key,'sha256',p.sha256,'width',p.width,'height',p.height,'byteSize',p.byte_size,'state',p.state) $$;
CREATE FUNCTION app.reserve_photo(p_id uuid,p_sha256 text,p_width integer,p_height integer,p_bytes integer,p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE workspace uuid; row app.photo_assets;
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 PERFORM app.provision_workspace(p_id); workspace:=app.tenant_for_user();
 INSERT INTO app.photo_assets(id,tenant_id,object_key,sha256,width,height,byte_size)
 VALUES(p_id,workspace,workspace::text||'/'||p_id::text||'.jpg',p_sha256,p_width,p_height,p_bytes)
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id FOR UPDATE;
 IF row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 IF row.sha256 IS DISTINCT FROM p_sha256 OR row.width IS DISTINCT FROM p_width OR row.height IS DISTINCT FROM p_height OR row.byte_size IS DISTINCT FROM p_bytes THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN app.photo_manifest(row);
END $$;
CREATE FUNCTION app.finish_photo(p_id uuid,p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row app.photo_assets; workspace uuid:=app.tenant_for_user();
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id FOR UPDATE;
 IF row.id IS NULL OR row.state NOT IN ('reserved','ready') THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 UPDATE app.photo_assets SET state='ready' WHERE id=row.id RETURNING * INTO row;
 RETURN app.photo_manifest(row);
END $$;
CREATE FUNCTION app.read_photo(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE row app.photo_assets; workspace uuid:=app.tenant_for_user();
BEGIN
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id AND state='ready';
 IF row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 RETURN app.photo_manifest(row);
END $$;
CREATE FUNCTION app.delete_photo(p_id uuid,p_complete boolean,p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row app.photo_assets; workspace uuid:=app.tenant_for_user();
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id FOR UPDATE;
 IF row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 IF p_complete AND row.state NOT IN ('purge_pending','purged') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='PHOTO_DELETE_FENCE'; END IF;
 UPDATE app.photo_assets SET state=CASE WHEN p_complete OR state='purged' THEN 'purged' ELSE 'purge_pending' END,
  deleted_at=coalesce(deleted_at,transaction_timestamp()) WHERE id=row.id RETURNING * INTO row;
 RETURN app.photo_manifest(row);
END $$;
CREATE OR REPLACE FUNCTION app.canonical_cv_schema() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $body$
 SELECT $cv_schema${"type": "object", "additionalProperties": false, "properties": {"schemaVersion": {"const": "1.0.0"}, "snapshotId": {"$ref": "#/$defs/id"}, "baseCvId": {"$ref": "#/$defs/id"}, "version": {"type": "integer", "minimum": 1}, "parentSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "createdAt": {"type": "string", "format": "date-time"}, "locale": {"enum": ["ro", "en"]}, "sources": {"type": "array", "items": {"$ref": "#/$defs/source"}}, "provenance": {"type": "array", "items": {"$ref": "#/$defs/provenance"}}, "claims": {"type": "array", "items": {"$ref": "#/$defs/claim"}}, "facts": {"type": "object", "additionalProperties": false, "properties": {"nameClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "positioningTitleClaimIds": {"type": "array", "items": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "minItems": 2, "maxItems": 2}, "contacts": {"type": "array", "items": {"$ref": "#/$defs/contact"}}, "skills": {"type": "array", "items": {"$ref": "#/$defs/skill"}}, "employment": {"type": "array", "items": {"$ref": "#/$defs/employment"}}, "education": {"type": "array", "items": {"$ref": "#/$defs/education"}}, "optionalEntries": {"type": "array", "items": {"$ref": "#/$defs/optionalEntry"}}}, "required": ["nameClaimId", "positioningTitleClaimIds", "contacts", "skills", "employment", "education", "optionalEntries"]}, "claimLinks": {"type": "array", "items": {"$ref": "#/$defs/claimLink"}}, "enrichment": {"type": "array", "items": {"$ref": "#/$defs/enrichment"}}, "interviews": {"type": "array", "items": {"$ref": "#/$defs/interview"}}, "generatedProse": {"type": "array", "items": {"$ref": "#/$defs/prose"}}, "generations": {"type": "array", "items": {"$ref": "#/$defs/generation"}}, "document": {"type": "object", "additionalProperties": false, "properties": {"sectionOrder": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "sections": {"type": "array", "items": {"$ref": "#/$defs/section"}}, "templateVersionId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "contactIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "photo": {"oneOf": [{"type": "null"}, {"type": "object", "additionalProperties": false, "properties": {"assetId": {"type": "string", "pattern": "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"}, "crop": {"type": "object", "additionalProperties": false, "properties": {"version": {"const": 1}, "centerX": {"type": "number", "minimum": 0, "maximum": 1}, "centerY": {"type": "number", "minimum": 0, "maximum": 1}, "zoom": {"type": "number", "minimum": 1, "maximum": 3}}, "required": ["version", "centerX", "centerY", "zoom"]}, "shape": {"enum": ["circle", "square"]}, "visible": {"type": "boolean"}}, "required": ["assetId", "crop", "shape", "visible"]}]}, "photoMode": {"enum": ["base", "override"]}}, "required": ["sectionOrder", "sections", "templateVersionId", "contactIds"]}, "context": {"type": "object", "additionalProperties": false, "properties": {"kind": {"enum": ["base", "tailored"]}, "baseSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "jobSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "previousTailoredSnapshotId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}}, "required": ["kind", "baseSnapshotId", "jobSnapshotId", "previousTailoredSnapshotId"]}}, "required": ["schemaVersion", "snapshotId", "baseCvId", "version", "parentSnapshotId", "createdAt", "locale", "sources", "provenance", "claims", "facts", "claimLinks", "enrichment", "interviews", "generatedProse", "generations", "document", "context"], "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://schemas.example.invalid/cv/v1/schema.json", "title": "CV Maker canonical snapshot v1 — discovery proposal", "$defs": {"id": {"type": "string", "pattern": "^[a-z][a-z0-9_-]{1,79}$"}, "partialDate": {"type": "object", "additionalProperties": false, "properties": {"year": {"type": "integer", "minimum": 1900, "maximum": 2200}, "month": {"type": "integer", "minimum": 1, "maximum": 12}}, "required": ["year"]}, "location": {"type": "object", "additionalProperties": false, "properties": {"city": {"type": "string", "minLength": 1, "maxLength": 20000}, "countryCode": {"type": "string", "pattern": "^[A-Z]{2}$"}, "address": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": []}, "metric": {"type": "object", "additionalProperties": false, "properties": {"value": {"type": "number"}, "unit": {"type": "string", "minLength": 1, "maxLength": 20000}, "baseline": {"type": "number"}, "period": {"type": "string", "minLength": 1, "maxLength": 20000}, "qualifier": {"enum": ["exact", "approximate", "range"]}, "upperValue": {"type": "number"}}, "required": ["value", "unit", "qualifier"]}, "source": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["upload", "manual", "interview", "external_document", "job_capture"]}, "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "label": {"type": "string", "minLength": 1, "maxLength": 20000}, "capturedAt": {"type": "string", "format": "date-time"}, "extractorVersion": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": ["id", "kind", "label", "capturedAt"]}, "provenance": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "sourceId": {"$ref": "#/$defs/id"}, "locator": {"type": "string", "minLength": 1, "maxLength": 20000}, "excerpt": {"type": "string", "minLength": 1, "maxLength": 20000}, "extractionConfidence": {"type": "number", "minimum": 0, "maximum": 1}}, "required": ["id", "sourceId", "locator"]}, "claim": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["text", "date", "location", "metric"]}, "value": {}, "status": {"enum": ["extracted_unconfirmed", "user_confirmed", "externally_verified", "suggested", "rejected"]}, "provenanceIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "minItems": 1, "uniqueItems": true}, "confirmedAt": {"type": "string", "format": "date-time"}, "confirmationActor": {"$ref": "#/$defs/id"}, "verificationMethod": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": ["id", "kind", "value", "status", "provenanceIds"], "allOf": [{"if": {"properties": {"kind": {"const": "text"}}}, "then": {"properties": {"value": {"type": "string", "minLength": 1, "maxLength": 20000}}}}, {"if": {"properties": {"kind": {"const": "date"}}}, "then": {"properties": {"value": {"$ref": "#/$defs/partialDate"}}}}, {"if": {"properties": {"kind": {"const": "location"}}}, "then": {"properties": {"value": {"$ref": "#/$defs/location"}}}}, {"if": {"properties": {"kind": {"const": "metric"}}}, "then": {"properties": {"value": {"$ref": "#/$defs/metric"}}}}, {"if": {"properties": {"status": {"enum": ["user_confirmed", "externally_verified"]}}}, "then": {"required": ["confirmedAt", "confirmationActor"]}}, {"if": {"properties": {"status": {"const": "externally_verified"}}}, "then": {"required": ["verificationMethod"]}}]}, "contact": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["email", "phone", "location", "address", "linkedin", "github", "portfolio", "other"]}, "valueClaimId": {"$ref": "#/$defs/id"}, "visibility": {"enum": ["private", "export"]}, "label": {"type": "string", "minLength": 1, "maxLength": 20000}}, "required": ["id", "kind", "valueClaimId", "visibility"]}, "skill": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "class": {"enum": ["professional", "technical"]}, "labelClaimId": {"$ref": "#/$defs/id"}, "conceptId": {"type": "string", "minLength": 1, "maxLength": 20000}, "evidenceClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "class", "labelClaimId", "evidenceClaimIds"]}, "employment": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "titleClaimId": {"$ref": "#/$defs/id"}, "companyClaimId": {"$ref": "#/$defs/id"}, "locationClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "startClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "endClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "ongoing": {"type": "boolean"}, "scopeClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "responsibilityClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "accomplishmentClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "metricClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "skillIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "titleClaimId", "companyClaimId", "locationClaimId", "startClaimId", "endClaimId", "ongoing", "scopeClaimIds", "responsibilityClaimIds", "accomplishmentClaimIds", "metricClaimIds", "skillIds"], "allOf": [{"if": {"properties": {"ongoing": {"const": true}}}, "then": {"properties": {"endClaimId": {"type": "null"}}}}]}, "education": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "institutionClaimId": {"$ref": "#/$defs/id"}, "qualificationClaimId": {"$ref": "#/$defs/id"}, "fieldClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "locationClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "startClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "endClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "detailClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "institutionClaimId", "qualificationClaimId", "fieldClaimId", "locationClaimId", "startClaimId", "endClaimId", "detailClaimIds"]}, "optionalEntry": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["certifications", "projects", "achievements", "portfolio", "languages", "leadership", "publications", "volunteering", "custom"]}, "labelClaimId": {"$ref": "#/$defs/id"}, "detailClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "startClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "endClaimId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}, "linkClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "metricClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}}, "required": ["id", "kind", "labelClaimId", "detailClaimIds", "startClaimId", "endClaimId", "linkClaimIds", "metricClaimIds"]}, "prose": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["summary", "bullet", "scope", "other"]}, "text": {"type": "string", "minLength": 1, "maxLength": 20000}, "claimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "minItems": 1, "uniqueItems": true}, "origin": {"enum": ["ai_generated", "user_authored"]}, "approval": {"enum": ["pending", "approved", "rejected"]}, "locale": {"enum": ["ro", "en"]}, "generationId": {"oneOf": [{"$ref": "#/$defs/id"}, {"type": "null"}]}}, "required": ["id", "kind", "text", "claimIds", "origin", "approval", "locale", "generationId"]}, "section": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "kind": {"enum": ["identity", "summary", "professional_skills", "technical_skills", "experience", "education", "certifications", "projects", "achievements", "portfolio", "languages", "leadership", "publications", "volunteering", "custom"]}, "label": {"type": "string", "minLength": 1, "maxLength": 20000}, "entryIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "proseIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "visible": {"type": "boolean"}}, "required": ["id", "kind", "label", "entryIds", "proseIds", "visible"]}, "generation": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "provider": {"type": "string", "minLength": 1, "maxLength": 20000}, "modelRequested": {"type": "string", "minLength": 1, "maxLength": 20000}, "modelResolved": {"type": "string", "minLength": 1, "maxLength": 20000}, "promptVersion": {"type": "string", "minLength": 1, "maxLength": 20000}, "inputHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "createdAt": {"type": "string", "format": "date-time"}}, "required": ["id", "provider", "modelRequested", "modelResolved", "promptVersion", "inputHash", "createdAt"]}, "claimLink": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "fromClaimId": {"$ref": "#/$defs/id"}, "toClaimId": {"$ref": "#/$defs/id"}, "relation": {"enum": ["metric_of", "supports", "contribution_to", "scope_of"]}}, "required": ["id", "fromClaimId", "toClaimId", "relation"]}, "enrichment": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "targetEntityId": {"$ref": "#/$defs/id"}, "attribute": {"enum": ["systems", "technology", "individual_contribution", "impact_time", "impact_cost", "impact_accuracy", "impact_revenue", "impact_productivity", "scale", "stakeholders", "budget", "team", "project"]}, "claimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "minItems": 1, "uniqueItems": true}}, "required": ["id", "targetEntityId", "attribute", "claimIds"]}, "interview": {"type": "object", "additionalProperties": false, "properties": {"id": {"$ref": "#/$defs/id"}, "question": {"type": "string", "minLength": 1, "maxLength": 20000}, "answerClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "targetClaimIds": {"type": "array", "items": {"$ref": "#/$defs/id"}, "uniqueItems": true}, "state": {"enum": ["asked", "answered_unconfirmed", "confirmed", "dismissed"]}}, "required": ["id", "question", "answerClaimIds", "targetClaimIds", "state"]}}}$cv_schema$::jsonb
$body$;
CREATE FUNCTION app.validate_photo_reference(workspace uuid,p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset uuid; state text;
BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NULL; END IF;
 IF NOT app.matches_schema(p,app.canonical_cv_schema()#>'{properties,document,properties,photo}',app.canonical_cv_schema()) THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PHOTO'; END IF;
 SELECT a.id,a.state INTO asset,state FROM app.photo_assets a
 WHERE a.tenant_id=workspace AND a.id=(p->>'assetId')::uuid FOR UPDATE;
 IF asset IS NULL OR state<>'ready' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PHOTO_NOT_AVAILABLE'; END IF;
 RETURN asset;
END $$;
CREATE FUNCTION app.attach_editor_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset uuid;
BEGIN
 asset:=app.validate_photo_reference(NEW.tenant_id,NEW.payload#>'{content,presentation,photo}');
 IF asset IS NOT NULL THEN
  INSERT INTO app.editor_photo_references(tenant_id,snapshot_id,asset_id) VALUES(NEW.tenant_id,NEW.id,asset);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER attach_photo AFTER INSERT ON app.editor_draft_snapshots FOR EACH ROW EXECUTE FUNCTION app.attach_editor_photo();
CREATE TABLE app.cv_photo_references (
 tenant_id uuid NOT NULL, cv_version_id uuid NOT NULL, asset_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,cv_version_id),
 FOREIGN KEY(tenant_id,cv_version_id) REFERENCES app.cv_versions(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,asset_id) REFERENCES app.photo_assets(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.cv_photo_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.cv_photo_references FROM PUBLIC,anon,authenticated;
CREATE POLICY cv_photo_ref_owner ON app.cv_photo_references FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.cv_photo_references TO authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.cv_photo_references FOR EACH ROW EXECUTE FUNCTION app.protect_immutable();
CREATE FUNCTION app.pin_cv_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE layout jsonb:=NEW.canonical_json->'document'; previous jsonb; p jsonb;
 mode text; kind text; command text; has_base boolean:=false;
BEGIN
 SELECT d.document_kind INTO kind FROM app.cv_documents d WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.document_id;
 SELECT r.command_kind INTO command FROM app.idempotency_requests r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.publication_request_id;
 SELECT v.canonical_json->'document' INTO previous FROM app.cv_versions v WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.parent_version_id;
 IF command='restore_cv_version' THEN
  p:=layout->'photo'; mode:=coalesce(layout->>'photoMode','base');
 ELSE
  mode:=CASE WHEN kind='job' THEN coalesce(layout->>'photoMode',previous->>'photoMode','base') ELSE 'base' END;
  IF mode='override' THEN
   IF layout ? 'photo' THEN p:=layout->'photo';
   ELSIF previous->>'photoMode'='override' THEN p:=previous->'photo';
   ELSE RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PHOTO'; END IF;
  ELSE
   SELECT s.payload#>'{content,presentation,photo}' INTO p FROM app.editor_draft_snapshots s
    WHERE s.tenant_id=NEW.tenant_id ORDER BY s.revision DESC LIMIT 1;
   has_base:=FOUND;
  END IF;
 END IF;
 PERFORM app.validate_photo_reference(NEW.tenant_id,p);
 IF has_base OR layout ? 'photo' OR layout ? 'photoMode' OR (command<>'restore_cv_version' AND previous ? 'photo') THEN
  layout:=layout||jsonb_build_object('photo',coalesce(p,'null'::jsonb),'photoMode',mode);
  NEW.canonical_json:=jsonb_set(NEW.canonical_json,'{document}',layout);
 END IF;
 PERFORM app.validate_canonical(NEW.canonical_json);
 NEW.content_hash:=app.hash_json(NEW.canonical_json-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt');
 RETURN NEW;
END $$;
CREATE FUNCTION app.attach_cv_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.canonical_json#>>'{document,photo,assetId}' IS NOT NULL THEN
  INSERT INTO app.cv_photo_references(tenant_id,cv_version_id,asset_id)
   VALUES(NEW.tenant_id,NEW.id,(NEW.canonical_json#>>'{document,photo,assetId}')::uuid);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pin_photo BEFORE INSERT ON app.cv_versions FOR EACH ROW EXECUTE FUNCTION app.pin_cv_photo();
CREATE TRIGGER attach_photo AFTER INSERT ON app.cv_versions FOR EACH ROW EXECUTE FUNCTION app.attach_cv_photo();
REVOKE EXECUTE ON FUNCTION app.validate_photo_reference(uuid,jsonb),app.pin_cv_photo(),app.attach_cv_photo() FROM PUBLIC,anon,authenticated;
-- Storage checks exact manifest ownership/state. No UPDATE/upsert policy: bytes
-- cannot be changed after the trusted Worker verifies their checksum and finalizes.
CREATE FUNCTION app.photo_storage_access(object_name text, operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(
 SELECT 1 FROM app.photo_assets p WHERE p.object_key=object_name AND app.is_active_member(p.tenant_id)
 AND CASE operation WHEN 'read' THEN p.state IN ('reserved','ready') WHEN 'insert' THEN p.state='reserved'
 WHEN 'delete' THEN p.state IN ('purge_pending','purged') ELSE false END) $$;
-- Plain isolated SQL fixtures have no Storage service. Hosted Supabase does.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
  IF to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RAISE EXCEPTION 'Storage operation-aware helper required; review target version before apply'; END IF;
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('cv-photos','cv-photos',false,10485760,ARRAY['image/jpeg']) ON CONFLICT(id) DO NOTHING;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='cv-photos' AND (public OR file_size_limit IS DISTINCT FROM 10485760 OR allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg'])) THEN
   RAISE EXCEPTION 'Existing cv-photos bucket configuration conflicts; review required'; END IF;
  EXECUTE 'CREATE POLICY cv_photo_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id=''cv-photos'' AND ((storage.allow_only_operation(''storage.object.get_authenticated'') AND app.photo_storage_access(name,''read'')) OR (storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete''))))';
  EXECUTE 'CREATE POLICY cv_photo_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id=''cv-photos'' AND storage.allow_only_operation(''storage.object.upload'') AND app.photo_storage_access(name,''insert''))';
  EXECUTE 'CREATE POLICY cv_photo_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id=''cv-photos'' AND storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete''))';
  -- Restrictive guards prevent broad pre-existing bucket policies from granting
  -- signed URLs, upserts or downloads after logical deletion for this bucket.
  EXECUTE 'CREATE POLICY cv_photo_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated,anon USING(bucket_id<>''cv-photos'' OR (auth.uid() IS NOT NULL AND ((storage.allow_only_operation(''storage.object.get_authenticated'') AND app.photo_storage_access(name,''read'')) OR (storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete'')))))';
  EXECUTE 'CREATE POLICY cv_photo_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated,anon WITH CHECK(bucket_id<>''cv-photos'' OR (auth.uid() IS NOT NULL AND storage.allow_only_operation(''storage.object.upload'') AND app.photo_storage_access(name,''insert'')))';
  EXECUTE 'CREATE POLICY cv_photo_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated,anon USING(bucket_id<>''cv-photos'') WITH CHECK(bucket_id<>''cv-photos'')';
  EXECUTE 'CREATE POLICY cv_photo_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated,anon USING(bucket_id<>''cv-photos'' OR (auth.uid() IS NOT NULL AND storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete'')))';
 END IF;
END $$;
REVOKE EXECUTE ON FUNCTION app.require_photo_worker(text),app.photo_manifest(app.photo_assets),app.attach_editor_photo(),
 app.reserve_photo(uuid,text,integer,integer,integer,text),app.finish_photo(uuid,text),app.read_photo(uuid),app.delete_photo(uuid,boolean,text),app.photo_storage_access(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.reserve_photo(uuid,text,integer,integer,integer,text),app.finish_photo(uuid,text),app.read_photo(uuid),app.delete_photo(uuid,boolean,text),app.photo_storage_access(text,text) TO authenticated;

-- Authenticated maintenance hook; no remote scheduler or credentials installed.
CREATE FUNCTION app.expire_photo_uploads(p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE workspace uuid:=app.tenant_for_user(); row app.photo_assets; result jsonb:='[]'::jsonb;
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 FOR row IN SELECT p.* FROM app.photo_assets p WHERE p.tenant_id=workspace AND
  (p.state='purge_pending' OR (p.state IN ('reserved','ready') AND p.created_at<transaction_timestamp()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM app.cv_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)))
  ORDER BY p.created_at LIMIT 10 FOR UPDATE SKIP LOCKED
 LOOP
  UPDATE app.photo_assets SET state='purge_pending',deleted_at=coalesce(deleted_at,transaction_timestamp()) WHERE id=row.id;
  result:=result||jsonb_build_array(app.photo_manifest(row));
 END LOOP;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION app.expire_photo_uploads(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.expire_photo_uploads(text) TO authenticated;
