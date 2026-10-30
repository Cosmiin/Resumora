-- Forward REVIEW artifact; never applied to owner/hosted data by this lane.
-- Strict representable subset only. These functions are pure/preflight seams;
-- destructive transfer waits for the import-owned scoped purge authority.
CREATE FUNCTION app.legacy_job_text_fact(p jsonb, claim_id text, field_id text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c jsonb; n integer;
BEGIN
 IF claim_id IS NULL THEN
  RETURN jsonb_build_object('id',field_id,'fieldId',field_id,'value','','status','user_authored','sourceId','job_document');
 END IF;
 SELECT count(*),jsonb_agg(x)->0 INTO n,c FROM jsonb_array_elements(p->'claims') x WHERE x->>'id'=claim_id;
 IF n<>1 OR c->>'kind'<>'text' OR jsonb_typeof(c->'value')<>'string' OR c->>'status' NOT IN ('user_confirmed','externally_verified') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='selected_text_claim';
 END IF;
 RETURN jsonb_build_object('id',field_id,'fieldId',field_id,'value',c->'value','status','user_authored','sourceId','job_document');
END $$;

CREATE FUNCTION app.convert_legacy_current_job(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE layout jsonb:=p->'document'; facts jsonb:=p->'facts'; s jsonb; item jsonb; f jsonb;
 k text; mapped text; entry text; claim_id text; n integer; seen text[]:='{}';
 name jsonb; titles jsonb; contacts jsonb:='[]'; professional jsonb:='[]'; technical jsonb:='[]';
 summary text:=''; prose jsonb; order_ids jsonb:='[]'; hidden jsonb:='[]'; presentation jsonb; c jsonb;
BEGIN
 -- Existing database canonical validation is authoritative. Unsupported accepted
 -- rendering is refused, never flattened by guessing prose targets/formatters.
 IF p->>'schemaVersion' IS DISTINCT FROM '1.0.0' OR p->>'locale' NOT IN ('ro','en') OR
    jsonb_typeof(layout) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'claims') IS DISTINCT FROM 'array' OR
    layout->'templateVersionId' IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='schema_or_template';
 END IF;
 name:=app.legacy_job_text_fact(p,NULL,'legacy_name');
 titles:=jsonb_build_array(app.legacy_job_text_fact(p,NULL,'legacy_title_0'),app.legacy_job_text_fact(p,NULL,'legacy_title_1'));
 FOR entry IN SELECT jsonb_array_elements_text(layout->'sectionOrder') LOOP
  SELECT count(*),jsonb_agg(x)->0 INTO n,s FROM jsonb_array_elements(layout->'sections') x WHERE x->>'id'=entry;
  IF n<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='section_reference';END IF;
  IF NOT (s->>'visible')::boolean THEN CONTINUE;END IF;
  k:=s->>'kind';
  IF k=ANY(seen) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='duplicate_section';END IF;
  seen:=array_append(seen,k);
  mapped:=CASE k WHEN 'identity' THEN 'identity' WHEN 'summary' THEN 'summary' WHEN 'professional_skills' THEN 'professionalSkills' WHEN 'technical_skills' THEN 'technicalSkills' END;
  IF mapped IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='section_rendering';
  END IF;
  -- Core section headings are fixed by the existing renderer. Do not lose a
  -- custom canonical heading by silently replacing it with a translated label.
  IF k<>'identity' AND s->>'label' IS DISTINCT FROM (CASE k
    WHEN 'summary' THEN CASE p->>'locale' WHEN 'ro' THEN 'Rezumat profesional' ELSE 'Professional Summary' END
    WHEN 'professional_skills' THEN CASE p->>'locale' WHEN 'ro' THEN 'Competențe profesionale' ELSE 'Professional skills' END
    WHEN 'technical_skills' THEN CASE p->>'locale' WHEN 'ro' THEN 'Competențe tehnice' ELSE 'Technical skills' END END) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='section_heading';
  END IF;
  order_ids:=order_ids||jsonb_build_array(mapped);
  IF k='identity' THEN
   IF jsonb_array_length(s->'entryIds')<>0 OR jsonb_array_length(s->'proseIds')<>0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='identity_rendering';END IF;
   name:=app.legacy_job_text_fact(p,facts->>'nameClaimId','legacy_name');
   titles:=jsonb_build_array(app.legacy_job_text_fact(p,facts#>>'{positioningTitleClaimIds,0}','legacy_title_0'),app.legacy_job_text_fact(p,facts#>>'{positioningTitleClaimIds,1}','legacy_title_1'));
   FOR claim_id IN SELECT jsonb_array_elements_text(layout->'contactIds') LOOP
    SELECT count(*),jsonb_agg(x)->0 INTO n,item FROM jsonb_array_elements(facts->'contacts') x WHERE x->>'id'=claim_id;
    IF n<>1 OR item->>'visibility'<>'export' OR item->>'kind' NOT IN ('email','phone','address','linkedin','website','github','other') THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='contact_rendering';END IF;
    f:=jsonb_build_object('id',item->>'id','kind',CASE WHEN item->>'kind' IN ('email','phone','address') THEN item->>'kind' ELSE 'social' END,'value',app.legacy_job_text_fact(p,item->>'valueClaimId',item->>'id'),'visible',true);
    IF item->>'kind' NOT IN ('email','phone','address') THEN f:=f||jsonb_build_object('platform',item->>'kind');END IF;
    contacts:=contacts||jsonb_build_array(f);
   END LOOP;
  ELSIF k='summary' THEN
   IF jsonb_array_length(s->'entryIds')<>0 OR jsonb_array_length(s->'proseIds')>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='summary_rendering';END IF;
   IF jsonb_array_length(s->'proseIds')=1 THEN
    SELECT count(*),jsonb_agg(x)->0 INTO n,prose FROM jsonb_array_elements(p->'generatedProse') x WHERE x->>'id'=s#>>'{proseIds,0}';
    IF n<>1 OR prose->>'approval'<>'approved' OR prose->>'kind'<>'summary' OR prose->>'origin'<>'user_authored' OR prose->>'locale' IS DISTINCT FROM p->>'locale' THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='summary_approval_or_origin';END IF;
    summary:=prose->>'text';
   END IF;
  ELSE
   IF jsonb_array_length(s->'proseIds')<>0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='skill_prose';END IF;
   FOR claim_id IN SELECT jsonb_array_elements_text(s->'entryIds') LOOP
    SELECT count(*),jsonb_agg(x)->0 INTO n,item FROM jsonb_array_elements(facts->'skills') x WHERE x->>'id'=claim_id;
    IF n<>1 OR item->>'class' IS DISTINCT FROM (CASE k WHEN 'professional_skills' THEN 'professional' ELSE 'technical' END) THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='skill_reference';END IF;
    f:=app.legacy_job_text_fact(p,item->>'labelClaimId',item->>'id');
    IF k='professional_skills' THEN professional:=professional||jsonb_build_array(f);ELSE technical:=technical||jsonb_build_array(f);END IF;
   END LOOP;
  END IF;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['identity','summary','professionalSkills','technicalSkills','experience','education']) LOOP
  IF NOT order_ids ? k THEN hidden:=hidden||jsonb_build_array(k);order_ids:=order_ids||jsonb_build_array(k);END IF;
 END LOOP;
 presentation:=jsonb_build_object('order',order_ids,'hidden',hidden);
 IF layout ? 'photo' THEN presentation:=presentation||jsonb_build_object('photo',layout->'photo');END IF;
 c:=jsonb_build_object('id',p->>'snapshotId','language',p->>'locale','name',name,'titles',titles,'contacts',contacts,
  'summary',jsonb_build_object('id','legacy_summary','text',summary,'origin','user_authored','approval','approved','claimIds','[]'::jsonb),
  'professionalSkills',professional,'technicalSkills',technical,'roles','[]'::jsonb,'education','[]'::jsonb,'optionalSections','[]'::jsonb,
  'sources','[{"id":"job_document","kind":"document","label":"Accepted job CV content"}]'::jsonb,'referenceProse','[]'::jsonb,'presentation',presentation);
 RETURN jsonb_build_object('schemaVersion','resumora-editor-draft/1','content',c,'answers','[]'::jsonb);
END $$;

-- Conservative comparison: ignore correlation/source handles only. Every
-- remaining value, ordering and presentation setting must match exactly.
CREATE FUNCTION app.legacy_job_render_key(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb; k text; v jsonb;
BEGIN
 IF jsonb_typeof(p)='array' THEN SELECT coalesce(jsonb_agg(app.legacy_job_render_key(x)),'[]') INTO result FROM jsonb_array_elements(p) x;RETURN result;END IF;
 IF jsonb_typeof(p)<>'object' THEN RETURN p;END IF;
 result:='{}';FOR k,v IN SELECT * FROM jsonb_each(p) LOOP
  IF k NOT IN ('id','fieldId','sourceId','sourceClaimId','sourceLineage','previousFactId','confirmedAt','evidenceClaimIds') THEN result:=result||jsonb_build_object(k,app.legacy_job_render_key(v));END IF;
 END LOOP;RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION app.legacy_job_text_fact(jsonb,text,text),app.convert_legacy_current_job(jsonb),app.legacy_job_render_key(jsonb) FROM PUBLIC,anon,authenticated;

-- Transient internal plan only, never a second stored document/archive. The
-- caller must hold this same transaction through transfer and Base removal.
CREATE FUNCTION app.preflight_legacy_current_jobs(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d app.cv_documents; v app.cv_versions; j app.job_versions; existing app.job_editor_versions;
 payload jsonb; plan jsonb:='[]'; prior jsonb; item jsonb; asset uuid;
BEGIN
 IF p_tenant IS DISTINCT FROM app.tenant_for_user() THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
 PERFORM 1 FROM app.tenants WHERE id=p_tenant FOR UPDATE;PERFORM app.assert_tenant(p_tenant);
 -- Lock both engines before conversion; ordinary current writes share the
 -- tenant lock. Never inspect a foreign tenant or choose a timestamp winner.
 PERFORM 1 FROM app.job_editor_documents WHERE tenant_id=p_tenant ORDER BY job_id,document_locale,id FOR UPDATE;
 PERFORM 1 FROM app.job_editor_versions WHERE tenant_id=p_tenant ORDER BY job_id,document_id,id FOR UPDATE;
 FOR d IN SELECT * FROM app.cv_documents WHERE tenant_id=p_tenant AND document_kind='job' ORDER BY job_id,id FOR UPDATE LOOP
  SELECT * INTO v FROM app.cv_versions WHERE tenant_id=p_tenant AND document_id=d.id AND id=d.head_version_id FOR UPDATE;
  IF v.id IS NULL OR v.job_id IS DISTINCT FROM d.job_id OR v.locale NOT IN ('ro','en') OR v.canonical_json->>'locale' IS DISTINCT FROM v.locale THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='head_lineage';END IF;
  PERFORM app.validate_canonical(v.canonical_json);
  payload:=app.convert_legacy_current_job(v.canonical_json);
  asset:=app.validate_photo_reference(p_tenant,payload#>'{content,presentation,photo}');
  SELECT * INTO existing FROM app.current_job_document_row(p_tenant,d.job_id,v.locale);
  SELECT x INTO prior FROM jsonb_array_elements(plan) x WHERE x->>'jobId'=d.job_id::text AND x->>'locale'=v.locale LIMIT 1;
  IF (existing.id IS NOT NULL AND app.legacy_job_render_key(existing.payload) IS DISTINCT FROM app.legacy_job_render_key(payload)) OR
     (prior IS NOT NULL AND app.legacy_job_render_key(prior->'payload') IS DISTINCT FROM app.legacy_job_render_key(payload)) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_COLLISION',DETAIL='different_current_content';END IF;
  -- An existing current editor row wins identity only AFTER exact equivalence.
  -- Canonical duplicates are ordered UUID ascending and share the first target.
  SELECT jv.* INTO j FROM app.jobs job JOIN app.job_versions jv ON (jv.tenant_id,jv.job_id,jv.id)=(job.tenant_id,job.id,job.head_version_id)
    WHERE job.tenant_id=p_tenant AND job.id=d.job_id FOR SHARE OF job,jv;
  IF j.id IS NULL OR length(j.reviewed_text) NOT BETWEEN 1 AND 200000 THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='job_context';END IF;
  item:=jsonb_build_object('jobId',d.job_id,'locale',v.locale,'canonicalDocumentId',d.id,'canonicalVersionId',v.id,
   'targetDocumentId',coalesce(existing.document_id,(prior->>'targetDocumentId')::uuid,d.id),
   'existingCurrentId',existing.id,'payload',payload,'photoAssetId',asset,'publicationRequestId',v.publication_request_id,
   'jobVersionId',j.id,'intake',jsonb_build_object('text',j.reviewed_text,'title',j.title,'company',j.company,'location',j.location_text));
  plan:=plan||jsonb_build_array(item);
 END LOOP;
 -- Legacy canonical storage has no primary-language selector. Do not invent
 -- one when both locales exist and the current engine has no primary yet.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(plan) x
   WHERE NOT EXISTS(SELECT 1 FROM app.job_editor_documents primary_doc WHERE primary_doc.tenant_id=p_tenant AND primary_doc.job_id=(x->>'jobId')::uuid AND primary_doc.deleted_at IS NULL AND primary_doc.is_primary)
   GROUP BY x->>'jobId' HAVING count(DISTINCT x->>'locale')>1) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='LEGACY_JOB_DOCUMENT_CONVERSION_REQUIRED',DETAIL='primary_locale_selection';
 END IF;
 RETURN plan;
END $$;
REVOKE EXECUTE ON FUNCTION app.preflight_legacy_current_jobs(uuid) FROM PUBLIC,anon,authenticated;

-- Sent IDs become opaque historical metadata; never repoint an old event at
-- today's document. Validate new references at the existing command boundary.
ALTER TABLE app.applications ADD COLUMN current_job_document_id uuid,
 ADD CONSTRAINT application_current_job_document FOREIGN KEY(tenant_id,job_id,current_job_document_id)
 REFERENCES app.job_editor_documents(tenant_id,job_id,id) ON DELETE RESTRICT;
DO $$DECLARE r record;BEGIN
 FOR r IN SELECT conrelid::regclass relation,conname FROM pg_constraint
  WHERE conrelid IN ('app.applications'::regclass,'app.application_events'::regclass)
    AND confrelid IN ('app.cv_documents'::regclass,'app.cv_versions'::regclass) LOOP
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.relation,r.conname);
 END LOOP;
END $$;
CREATE FUNCTION app.validate_application_cv_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_document_id uuid; v_version_id uuid;
BEGIN
 IF TG_TABLE_NAME='applications' THEN
  IF TG_OP='UPDATE' AND NEW.cv_document_id IS NOT DISTINCT FROM OLD.cv_document_id AND NEW.chosen_cv_version_id IS NOT DISTINCT FROM OLD.chosen_cv_version_id THEN RETURN NEW;END IF;
  v_document_id:=NEW.cv_document_id;v_version_id:=NEW.chosen_cv_version_id;
 ELSE v_document_id:=NEW.document_id;v_version_id:=NEW.cv_version_id;END IF;
 IF v_document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.cv_documents WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=v_document_id) OR
    v_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.cv_versions WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=v_version_id AND app.cv_versions.document_id=v_document_id) THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_JOB_LINEAGE_FORBIDDEN';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER application_cv_metadata BEFORE INSERT OR UPDATE ON app.applications FOR EACH ROW EXECUTE FUNCTION app.validate_application_cv_metadata();
CREATE TRIGGER event_cv_metadata BEFORE INSERT ON app.application_events FOR EACH ROW EXECUTE FUNCTION app.validate_application_cv_metadata();
REVOKE EXECUTE ON FUNCTION app.validate_application_cv_metadata() FROM PUBLIC,anon,authenticated;

-- Retire canonical job commands for a converted/removed Base family. Existing
-- unconverted canonical accounts still need their supported command behavior
-- until strict preservation can succeed; no migration-time semantic rewrite.
CREATE FUNCTION app.legacy_job_commands_retired(w uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE removed boolean:=false;
BEGIN
 IF to_regclass('app.base_cv_lifecycle') IS NOT NULL THEN
  SELECT generation>0 INTO removed FROM app.base_cv_lifecycle WHERE tenant_id=w;
 END IF;
 RETURN coalesce(removed,false) OR EXISTS(SELECT 1 FROM app.job_editor_versions WHERE tenant_id=w AND provenance ? 'legacyDocumentId');
END $$;
REVOKE EXECUTE ON FUNCTION app.legacy_job_commands_retired(uuid) FROM PUBLIC,anon,authenticated;
ALTER FUNCTION app.save_job_cv_checkpoint(uuid,uuid,bigint,uuid,uuid,jsonb,text,boolean) RENAME TO save_legacy_job_checkpoint_internal;
REVOKE EXECUTE ON FUNCTION app.save_legacy_job_checkpoint_internal(uuid,uuid,bigint,uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.save_job_cv_checkpoint(p_key uuid,p_document uuid,p_expected_revision bigint,p_profile_version uuid,p_job_version uuid,p_layout jsonb,p_locale text,p_tailored boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF app.legacy_job_commands_retired(app.tenant_for_user()) THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='CURRENT_JOB_DOCUMENT_REQUIRED';END IF;
 RETURN app.save_legacy_job_checkpoint_internal(p_key,p_document,p_expected_revision,p_profile_version,p_job_version,p_layout,p_locale,p_tailored);
END $$;
REVOKE EXECUTE ON FUNCTION app.save_job_cv_checkpoint(uuid,uuid,bigint,uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.save_job_cv_checkpoint(uuid,uuid,bigint,uuid,uuid,jsonb,text,boolean) TO authenticated;
-- The existing Base restore engine is retained behind a narrow wrapper.
ALTER FUNCTION app.restore_cv_version(uuid,uuid,bigint,uuid) RENAME TO restore_base_cv_version_internal;
REVOKE EXECUTE ON FUNCTION app.restore_base_cv_version_internal(uuid,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.restore_cv_version(p_key uuid,p_document uuid,p_expected_revision bigint,p_historical_version uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF app.legacy_job_commands_retired(app.tenant_for_user()) AND EXISTS(SELECT 1 FROM app.cv_documents WHERE tenant_id=app.tenant_for_user() AND id=p_document AND document_kind='job') THEN
  RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='CURRENT_JOB_DOCUMENT_REQUIRED';END IF;
 RETURN app.restore_base_cv_version_internal(p_key,p_document,p_expected_revision,p_historical_version);
END $$;
REVOKE EXECUTE ON FUNCTION app.restore_cv_version(uuid,uuid,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.restore_cv_version(uuid,uuid,bigint,uuid) TO authenticated;

-- Preserve the old invalidation implementation; new wrapper preflights every
-- canonical head before transferring anything or invalidating old Base work.
ALTER FUNCTION app.prepare_job_documents_for_base_removal(uuid) RENAME TO detach_job_documents_from_base_internal;
REVOKE EXECUTE ON FUNCTION app.detach_job_documents_from_base_internal(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app.prepare_job_documents_for_base_removal(p_tenant uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan jsonb; item jsonb; target uuid;
BEGIN
 -- Deferred dependency supplied by import30030000; no conversion is executed
 -- at migration time. Same-transaction tenant/epoch authority, never a GUC or
 -- an account-deletion state. Failure leaves ALL content untouched.
 PERFORM app.require_base_cv_purge(p_tenant);
 plan:=app.preflight_legacy_current_jobs(p_tenant);
 FOR item IN SELECT * FROM jsonb_array_elements(plan) LOOP
  target:=(item->>'targetDocumentId')::uuid;
  INSERT INTO app.target_job_contexts(tenant_id,job_id,job_version_id,snapshot_id,snapshot_revision,intake,requirements)
   VALUES(p_tenant,(item->>'jobId')::uuid,(item->>'jobVersionId')::uuid,NULL,NULL,item->'intake','[]') ON CONFLICT(job_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM app.job_editor_documents WHERE tenant_id=p_tenant AND id=target) THEN
   INSERT INTO app.job_editor_documents(id,tenant_id,job_id,source_snapshot_id,source_revision,document_locale,is_primary)
    VALUES(target,p_tenant,(item->>'jobId')::uuid,NULL,NULL,item->>'locale',NOT EXISTS(SELECT 1 FROM app.job_editor_documents WHERE tenant_id=p_tenant AND job_id=(item->>'jobId')::uuid AND deleted_at IS NULL));
   INSERT INTO app.job_editor_versions(tenant_id,job_id,document_id,revision,job_version_id,reason,payload,request_id,photo_asset_id,provenance)
    VALUES(p_tenant,(item->>'jobId')::uuid,target,1,(item->>'jobVersionId')::uuid,'save',item->'payload',(item->>'publicationRequestId')::uuid,(item->>'photoAssetId')::uuid,
      jsonb_build_object('legacyDocumentId',item->>'canonicalDocumentId','legacyCurrentId',item->>'canonicalVersionId'));
  END IF;
  UPDATE app.job_editor_versions SET provenance=provenance||jsonb_build_object('legacyDocumentId',item->>'canonicalDocumentId','legacyCurrentId',item->>'canonicalVersionId')
   WHERE tenant_id=p_tenant AND document_id=target AND NOT provenance ? 'legacyDocumentId';
  UPDATE app.applications SET current_job_document_id=target WHERE tenant_id=p_tenant AND job_id=(item->>'jobId')::uuid AND cv_document_id=(item->>'canonicalDocumentId')::uuid;
 END LOOP;
 PERFORM app.detach_job_documents_from_base_internal(p_tenant);
 -- Import owns the full canonical/profile/analysis dependency closure and its
 -- ordered DELETEs after this transfer, including all canonical job versions.
 -- No event UPDATE/DELETE, old-content archive or second rendering store here.
END $$;
REVOKE EXECUTE ON FUNCTION app.prepare_job_documents_for_base_removal(uuid) FROM PUBLIC,anon,authenticated;

-- Current edit/read links are separate from historical sent metadata.
CREATE OR REPLACE FUNCTION app.search_applications(p_query text DEFAULT '',p_stage text DEFAULT NULL,
 p_cursor_time timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();v_pattern text;v_items jsonb;
BEGIN
 IF p_query IS NULL OR pg_catalog.length(p_query)>200 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_cursor_time IS NULL)<>(p_cursor_id IS NULL) OR
  (p_stage IS NOT NULL AND p_stage NOT IN ('saved','drafting','applied','interview','offer','closed')) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_APPLICATION_QUERY'; END IF;
 v_pattern:='%'||pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 SELECT COALESCE(pg_catalog.jsonb_agg(x.result ORDER BY x.created_at DESC,x.id DESC),'[]') INTO v_items FROM (
  SELECT a.id,a.created_at,pg_catalog.jsonb_build_object('applicationId',a.id,'createdAt',a.created_at,'jobId',a.job_id,'jobVersionId',a.job_version_id,
   'title',j.title,'company',j.company,'stage',a.user_stage,'revision',a.revision,'documentId',coalesce(a.current_job_document_id,a.cv_document_id),'legacyDocumentId',a.cv_document_id,
   'latestCvVersionId',coalesce(accepted.id,cv.id),'currentDocumentLocale',current_doc.document_locale,'latestGenerationId',NULL,'tailoringState',CASE WHEN accepted.id IS NOT NULL THEN 'tailored' ELSE cv.tailoring_state END,
   'targetChanged',CASE WHEN coalesce(accepted.id,cv.id) IS NULL THEN false ELSE coalesce(accepted.job_version_id,cv.job_version_id) IS DISTINCT FROM current_job.head_version_id END,
   'chosenCvVersionId',a.chosen_cv_version_id,
   'lastSentCvVersionId',(SELECT e.cv_version_id FROM app.application_events e WHERE e.tenant_id=a.tenant_id AND e.application_id=a.id AND e.event_kind='mark_sent'
     AND NOT EXISTS(SELECT 1 FROM app.application_events retraction WHERE retraction.tenant_id=e.tenant_id AND retraction.retracts_event_id=e.id) ORDER BY e.event_sequence DESC LIMIT 1),
   'nextAction',(SELECT pg_catalog.jsonb_build_object('id',n.id,'label',n.label,'dueDate',n.due_date,'state',n.state) FROM app.next_actions n WHERE n.tenant_id=a.tenant_id AND n.application_id=a.id AND n.state='open' ORDER BY n.due_date NULLS LAST,n.id LIMIT 1)) AS result
  FROM app.applications a JOIN app.job_versions j ON (j.tenant_id,j.id)=(a.tenant_id,a.job_version_id)
   JOIN app.jobs current_job ON (current_job.tenant_id,current_job.id)=(a.tenant_id,a.job_id)
   LEFT JOIN app.cv_documents d ON (d.tenant_id,d.id)=(a.tenant_id,a.cv_document_id)
   LEFT JOIN app.cv_versions cv ON (cv.tenant_id,cv.id)=(d.tenant_id,d.head_version_id)
   LEFT JOIN app.job_editor_documents current_doc ON (current_doc.tenant_id,current_doc.job_id,current_doc.id)=(a.tenant_id,a.job_id,a.current_job_document_id) AND current_doc.deleted_at IS NULL
   LEFT JOIN app.job_editor_versions accepted ON (accepted.tenant_id,accepted.document_id)=(current_doc.tenant_id,current_doc.id)
  WHERE a.tenant_id=v_workspace AND (p_stage IS NULL OR a.user_stage=p_stage)
   AND (p_cursor_time IS NULL OR (a.created_at,a.id)<(p_cursor_time,p_cursor_id))
   AND (j.title ILIKE v_pattern ESCAPE E'\\' OR j.company ILIKE v_pattern ESCAPE E'\\'
    OR EXISTS(SELECT 1 FROM app.next_actions n WHERE n.tenant_id=a.tenant_id AND n.application_id=a.id AND n.label ILIKE v_pattern ESCAPE E'\\'))
  ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit
 )x;
 RETURN pg_catalog.jsonb_build_object('items',v_items,'resultCount',pg_catalog.jsonb_array_length(v_items),'sentCount',app.sent_count(),
  'nextCursor',CASE WHEN pg_catalog.jsonb_array_length(v_items)=p_limit THEN pg_catalog.jsonb_build_object('createdAt',v_items->-1->'createdAt','id',v_items->-1->'applicationId') ELSE NULL END);
END $$;
