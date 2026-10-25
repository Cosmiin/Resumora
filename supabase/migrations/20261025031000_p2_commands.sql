-- P2 reviewed jobs and manual application continuity. No scraping, AI or sending.
ALTER TABLE app.job_requirements ADD COLUMN scorable boolean NOT NULL DEFAULT true;
ALTER TABLE app.job_requirements ADD COLUMN priority_fraction numeric(12,6) NOT NULL DEFAULT 1 CHECK(priority_fraction>0 AND priority_fraction<=1);
ALTER TABLE app.job_requirements ADD COLUMN gate_kind text NOT NULL DEFAULT 'other' CHECK(gate_kind IN ('credential','authorization','other'));
ALTER TABLE app.job_requirements ADD COLUMN allow_equivalent boolean NOT NULL DEFAULT false;
ALTER TABLE app.job_requirements ADD COLUMN allow_transferable_equivalent boolean NOT NULL DEFAULT false;
ALTER TABLE app.requirement_atoms ADD COLUMN ordinal integer NOT NULL CHECK(ordinal>=0);
ALTER TABLE app.application_events ADD COLUMN event_sequence bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE app.source_documents ADD CONSTRAINT ck_source_context CHECK(profile_id IS NOT NULL OR job_id IS NOT NULL);

CREATE FUNCTION app.confirm_job(p_key uuid,p_job uuid,p_expected_revision bigint,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_job app.jobs;v_job_id uuid;
 v_version uuid:=pg_catalog.gen_random_uuid();v_source uuid:=pg_catalog.gen_random_uuid();v_capture uuid;v_span uuid;
 v_requirement jsonb;v_atom jsonb;v_requirement_id uuid;v_atom_id uuid;v_operator text;v_text text;v_excerpt text;v_weight numeric;v_share numeric;v_priority numeric;v_atom_count integer;v_atom_ordinal integer;v_total_atoms integer:=0;v_requirements jsonb;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'confirm_job',p_key,pg_catalog.jsonb_build_object('job',p_job,'expectedRevision',p_expected_revision,'input',p_input));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF pg_catalog.jsonb_typeof(p_input)<>'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input)k WHERE k NOT IN ('title','company','location','text','requirements','captureKind')) OR
  pg_catalog.length(p_input->>'title') NOT BETWEEN 1 AND 20000 OR pg_catalog.length(p_input->>'company') NOT BETWEEN 1 AND 20000 OR
  COALESCE(pg_catalog.jsonb_typeof(p_input->'requirements'),'missing')<>'array' OR pg_catalog.jsonb_array_length(p_input->'requirements')>500 OR
  COALESCE(p_input->>'captureKind','manual') NOT IN ('manual','paste') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
 v_text:=p_input->>'text';
 IF v_text IS NULL OR pg_catalog.length(v_text) NOT BETWEEN 1 AND 200000 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_JOB_TEXT'; END IF;
 IF p_job IS NULL THEN
  IF p_expected_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
  INSERT INTO app.jobs(tenant_id,draft_revision,draft_payload) VALUES(v_workspace,0,'{}') RETURNING id INTO v_job_id;
 ELSE v_job_id:=p_job; END IF;
 SELECT * INTO v_job FROM app.jobs WHERE tenant_id=v_workspace AND id=v_job_id FOR UPDATE;
 IF v_job.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='JOB_FORBIDDEN'; END IF;
 IF v_job.draft_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 INSERT INTO app.source_documents(id,tenant_id,job_id,source_kind,content_hash,state,metadata)
 VALUES(v_source,v_workspace,v_job_id,'job',app.hash_json(pg_catalog.to_jsonb(v_text)),'available',pg_catalog.jsonb_build_object('kind','manual_job_capture','textHash',pg_catalog.encode(app.hash_json(pg_catalog.to_jsonb(v_text)),'hex')));
 INSERT INTO app.job_captures(tenant_id,job_id,source_document_id,capture_kind,source_hash)
 VALUES(v_workspace,v_job_id,v_source,COALESCE(p_input->>'captureKind','manual'),app.hash_json(pg_catalog.to_jsonb(v_text))) RETURNING id INTO v_capture;
 INSERT INTO app.job_versions(id,tenant_id,job_id,source_document_id,job_capture_id,sequence,parent_version_id,title,company,location_text,reviewed_text,content_hash)
 VALUES(v_version,v_workspace,v_job_id,v_source,v_capture,v_job.draft_revision+1,v_job.head_version_id,p_input->>'title',p_input->>'company',p_input->>'location',v_text,app.hash_json(p_input));
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_input->'requirements')q GROUP BY pg_catalog.lower(pg_catalog.btrim(q->>'key')) HAVING count(*)>1) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='DUPLICATE_REQUIREMENT_NEEDS_REVIEW'; END IF;
 FOR v_requirement IN SELECT * FROM pg_catalog.jsonb_array_elements(p_input->'requirements') LOOP
  IF pg_catalog.jsonb_typeof(v_requirement)<>'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_requirement)k WHERE k NOT IN ('key','category','priority','hardGate','gateBasis','gateKind','allowEquivalent','allowTransferableEquivalent','priorityFraction','sourceText','atoms')) OR
    COALESCE(v_requirement->>'key','') !~ '^[a-z][a-z0-9_-]{0,79}$' OR COALESCE(pg_catalog.jsonb_typeof(v_requirement->'atoms'),'missing')<>'array' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REQUIREMENT'; END IF;
  IF v_requirement ? 'priorityFraction' AND pg_catalog.jsonb_typeof(v_requirement->'priorityFraction')<>'number' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PRIORITY_FRACTION'; END IF;
  v_priority:=COALESCE((v_requirement->>'priorityFraction')::numeric,1);
  IF v_priority<=0 OR v_priority>1 OR v_priority<>pg_catalog.trunc(v_priority,6) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PRIORITY_FRACTION'; END IF;
  v_requirement_id:=pg_catalog.gen_random_uuid();
  v_excerpt:=v_requirement->>'sourceText';
  IF v_excerpt IS NOT NULL AND (pg_catalog.octet_length(v_excerpt)>4096 OR pg_catalog.strpos(v_text,v_excerpt)=0) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='REQUIREMENT_SOURCE_NOT_IN_JOB'; END IF;
  INSERT INTO app.source_spans(tenant_id,job_id,source_document_id,locator,text_excerpt)
  VALUES(v_workspace,v_job_id,v_source,pg_catalog.jsonb_build_object('field','job.text','requirementKey',v_requirement->>'key'),v_excerpt) RETURNING id INTO v_span;
  INSERT INTO app.job_requirements(id,tenant_id,job_id,job_version_id,source_document_id,requirement_key,primary_category,priority,hard_gate,gate_basis,source_span_id,priority_fraction,gate_kind,allow_equivalent,allow_transferable_equivalent,scorable)
  VALUES(v_requirement_id,v_workspace,v_job_id,v_version,v_source,v_requirement->>'key',v_requirement->>'category',v_requirement->>'priority',COALESCE((v_requirement->>'hardGate')::boolean,false),v_requirement->>'gateBasis',v_span,v_priority,COALESCE(v_requirement->>'gateKind','other'),COALESCE((v_requirement->>'allowEquivalent')::boolean,false),COALESCE((v_requirement->>'allowTransferableEquivalent')::boolean,false),COALESCE(v_requirement->>'gateKind','other')<>'authorization');
  v_atom_count:=pg_catalog.jsonb_array_length(v_requirement->'atoms');v_total_atoms:=v_total_atoms+v_atom_count;
  IF v_total_atoms>2000 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='JOB_ATOM_LIMIT'; END IF;
  IF v_atom_count NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REQUIREMENT_ATOM_COUNT'; END IF;
  v_operator:=COALESCE(v_requirement#>>'{atoms,0,operator}','AND');v_weight:=0;v_atom_ordinal:=0;
  FOR v_atom IN SELECT * FROM pg_catalog.jsonb_array_elements(v_requirement->'atoms') LOOP
   IF pg_catalog.jsonb_typeof(v_atom)<>'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_atom)k WHERE k NOT IN ('operator','polarity','concept','weightShare')) OR COALESCE(v_atom->>'operator','AND')<>v_operator THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='FLAT_REVIEWED_AND_OR_GROUP_REQUIRED'; END IF;
   IF v_atom ? 'weightShare' AND pg_catalog.jsonb_typeof(v_atom->'weightShare')<>'number' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_WEIGHT_SHARE'; END IF;
   v_share:=COALESCE((v_atom->>'weightShare')::numeric,1);
   IF v_share<=0 OR v_share>1 OR v_share<>pg_catalog.trunc(v_share,6) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_WEIGHT_SHARE'; END IF;
   v_atom_id:=pg_catalog.gen_random_uuid();
   INSERT INTO app.requirement_atoms(id,tenant_id,job_id,job_version_id,source_document_id,requirement_id,group_key,operator,polarity,concept_key,weight_share,source_span_id,ordinal)
   VALUES(v_atom_id,v_workspace,v_job_id,v_version,v_source,v_requirement_id,v_requirement->>'key',v_operator,COALESCE(v_atom->>'polarity','positive'),v_atom->>'concept',v_share,v_span,v_atom_ordinal);
   v_atom_ordinal:=v_atom_ordinal+1;
   v_weight:=v_weight+v_share;
   IF v_operator='OR' AND v_share<>1 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='OR_ALTERNATIVES_COUNT_ONCE'; END IF;
  END LOOP;
  IF v_operator='AND' AND v_weight<>1 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='AND_WEIGHT_SHARES_MUST_SUM_TO_ONE'; END IF;
 END LOOP;
 UPDATE app.jobs SET head_version_id=v_version,draft_revision=v_job.draft_revision+1,draft_payload=p_input WHERE id=v_job_id;
 PERFORM app.audit(v_workspace,'job.confirmed','job_version',v_version);
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key',q.requirement_key,'requirementId',q.id,'atoms',
   (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('atomId',a.id,'concept',a.concept_key) ORDER BY a.ordinal) FROM app.requirement_atoms a WHERE a.tenant_id=q.tenant_id AND a.requirement_id=q.id)) ORDER BY q.requirement_key),'[]') INTO v_requirements FROM app.job_requirements q WHERE q.tenant_id=v_workspace AND q.job_version_id=v_version;
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('jobId',v_job_id,'jobVersionId',v_version,'revision',v_job.draft_revision+1,'requirements',v_requirements));
EXCEPTION WHEN check_violation OR foreign_key_violation OR not_null_violation OR invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_JOB_GRAPH';
 WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='JOB_IDENTITY_CONFLICT';
END $$;

CREATE FUNCTION app.save_application(p_key uuid,p_application uuid,p_expected_revision bigint,p_job_version uuid,
 p_document uuid,p_chosen_cv uuid,p_stage text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_job uuid;v_application app.applications;v_id uuid:=COALESCE(p_application,pg_catalog.gen_random_uuid());
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'save_application',p_key,pg_catalog.jsonb_build_object('application',p_application,'expectedRevision',p_expected_revision,'jobVersion',p_job_version,'document',p_document,'chosenCv',p_chosen_cv,'stage',p_stage));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT job_id INTO v_job FROM app.job_versions WHERE tenant_id=v_workspace AND id=p_job_version;
 IF v_job IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='JOB_VERSION_FORBIDDEN'; END IF;
 IF p_application IS NULL THEN
  IF p_expected_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
  INSERT INTO app.applications(id,tenant_id,job_id,job_version_id,cv_document_id,chosen_cv_version_id,user_stage,revision)
  VALUES(v_id,v_workspace,v_job,p_job_version,p_document,p_chosen_cv,p_stage,1);
 ELSE
  SELECT * INTO v_application FROM app.applications WHERE tenant_id=v_workspace AND id=p_application FOR UPDATE;
  IF v_application.id IS NULL OR v_application.job_id<>v_job THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='APPLICATION_JOB_LINEAGE_FORBIDDEN'; END IF;
  IF v_application.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
  UPDATE app.applications SET job_version_id=p_job_version,cv_document_id=p_document,chosen_cv_version_id=p_chosen_cv,user_stage=p_stage,revision=revision+1 WHERE id=v_id;
 END IF;
 PERFORM app.audit(v_workspace,'application.saved','application',v_id);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('applicationId',v_id,'revision',p_expected_revision+1));
EXCEPTION WHEN check_violation OR foreign_key_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_APPLICATION_LINEAGE';
 WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='DOCUMENT_ALREADY_ATTACHED';
END $$;

CREATE FUNCTION app.save_next_action(p_key uuid,p_application uuid,p_action uuid,p_expected_revision bigint,
 p_kind text,p_label text,p_due_date date,p_state text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_action app.next_actions;v_id uuid:=COALESCE(p_action,pg_catalog.gen_random_uuid());
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'save_next_action',p_key,pg_catalog.jsonb_build_object('application',p_application,'action',p_action,'expectedRevision',p_expected_revision,'kind',p_kind,'label',p_label,'dueDate',p_due_date,'state',p_state));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.applications WHERE tenant_id=v_workspace AND id=p_application) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='APPLICATION_FORBIDDEN'; END IF;
 IF p_action IS NULL THEN
  IF p_expected_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
  INSERT INTO app.next_actions(id,tenant_id,application_id,action_kind,label,due_date,state,revision,reminder_mode)
  VALUES(v_id,v_workspace,p_application,p_kind,p_label,p_due_date,p_state,1,'none');
 ELSE
  SELECT * INTO v_action FROM app.next_actions WHERE tenant_id=v_workspace AND id=p_action AND application_id=p_application FOR UPDATE;
  IF v_action.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='NEXT_ACTION_LINEAGE_FORBIDDEN'; END IF;
  IF v_action.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
  UPDATE app.next_actions SET action_kind=p_kind,label=p_label,due_date=p_due_date,state=p_state,revision=revision+1 WHERE id=v_id;
 END IF;
 PERFORM app.audit(v_workspace,'next_action.saved','next_action',v_id);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('nextActionId',v_id,'revision',p_expected_revision+1));
EXCEPTION WHEN check_violation OR foreign_key_violation OR not_null_violation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_NEXT_ACTION';
END $$;

CREATE FUNCTION app.sent_count() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT count(DISTINCT e.application_id) FROM app.application_events e WHERE e.tenant_id=app.tenant_for_user() AND e.event_kind='mark_sent'
  AND NOT EXISTS(SELECT 1 FROM app.application_events x WHERE x.tenant_id=e.tenant_id AND x.application_id=e.application_id AND x.retracts_event_id=e.id)
$$;

CREATE FUNCTION app.mark_sent(p_key uuid,p_application uuid,p_expected_revision bigint,p_cv_version uuid,p_actual_sent_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_application app.applications;v_cv app.cv_versions;v_document app.cv_documents;v_event uuid;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'mark_sent',p_key,pg_catalog.jsonb_build_object('application',p_application,'expectedRevision',p_expected_revision,'cvVersion',p_cv_version,'actualSentDate',p_actual_sent_date));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO v_application FROM app.applications WHERE tenant_id=v_workspace AND id=p_application FOR UPDATE;
 IF v_application.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='APPLICATION_FORBIDDEN'; END IF;
 IF v_application.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_cv_version IS NOT NULL THEN
  SELECT * INTO v_cv FROM app.cv_versions WHERE tenant_id=v_workspace AND id=p_cv_version;
  SELECT * INTO v_document FROM app.cv_documents WHERE tenant_id=v_workspace AND id=v_cv.document_id;
  IF v_cv.id IS NULL OR v_document.job_id IS DISTINCT FROM v_application.job_id THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='SENT_CV_JOB_LINEAGE_FORBIDDEN'; END IF;
 END IF;
 INSERT INTO app.application_events(tenant_id,application_id,job_id,job_version_id,event_kind,actor_user_id,actual_sent_date,document_id,cv_version_id,request_id)
 VALUES(v_workspace,p_application,v_application.job_id,v_application.job_version_id,'mark_sent',app.require_user(),p_actual_sent_date,v_cv.document_id,v_cv.id,r.request_id) RETURNING id INTO v_event;
 UPDATE app.applications SET revision=revision+1 WHERE id=p_application;
 PERFORM app.audit(v_workspace,'application.mark_sent','application_event',v_event);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('sentEventId',v_event,'applicationId',p_application,'revision',p_expected_revision+1,'sentCount',app.sent_count()));
END $$;

CREATE FUNCTION app.retract_sent(p_key uuid,p_application uuid,p_expected_revision bigint,p_sent_event uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_application app.applications;v_event uuid;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'retract_sent',p_key,pg_catalog.jsonb_build_object('application',p_application,'expectedRevision',p_expected_revision,'sentEvent',p_sent_event));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO v_application FROM app.applications WHERE tenant_id=v_workspace AND id=p_application FOR UPDATE;
 IF v_application.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='APPLICATION_FORBIDDEN'; END IF;
 IF v_application.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.application_events WHERE tenant_id=v_workspace AND application_id=p_application AND id=p_sent_event AND event_kind='mark_sent') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RETRACTION_LINEAGE_FORBIDDEN'; END IF;
 INSERT INTO app.application_events(tenant_id,application_id,job_id,job_version_id,event_kind,actor_user_id,retracts_event_id,request_id)
 VALUES(v_workspace,p_application,v_application.job_id,v_application.job_version_id,'retract_sent',app.require_user(),p_sent_event,r.request_id) RETURNING id INTO v_event;
 UPDATE app.applications SET revision=revision+1 WHERE id=p_application;
 PERFORM app.audit(v_workspace,'application.retract_sent','application_event',v_event);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('retractionEventId',v_event,'applicationId',p_application,'revision',p_expected_revision+1,'sentCount',app.sent_count()));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='SENT_EVENT_ALREADY_RETRACTED';
END $$;

CREATE FUNCTION app.validate_retraction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.retracts_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.application_events target WHERE target.tenant_id=NEW.tenant_id AND target.application_id=NEW.application_id AND target.id=NEW.retracts_event_id AND target.event_kind='mark_sent') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_RETRACTION_TARGET'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_retraction BEFORE INSERT ON app.application_events FOR EACH ROW EXECUTE FUNCTION app.validate_retraction();


CREATE FUNCTION app.insert_job_cv_version(workspace uuid, document_id uuid, profile_version uuid,
 request_id uuid, layout jsonb, locale text, p_job_version uuid, p_tailored boolean, p_base_snapshot uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE document app.cv_documents; profile uuid; snapshot uuid := pg_catalog.gen_random_uuid(); seq bigint; projection jsonb; section jsonb; entry text; section_row uuid; order_no integer:=0; item_no integer; revision uuid; v_target_job uuid; v_base_document uuid;
BEGIN
 SELECT * INTO document FROM app.cv_documents d WHERE d.tenant_id=workspace AND d.id=document_id FOR UPDATE;
 SELECT v.profile_id INTO profile FROM app.profile_versions v WHERE v.tenant_id=workspace AND v.id=profile_version;
 IF document.id IS NULL OR profile IS DISTINCT FROM document.profile_id OR document.document_kind<>'job' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_PROFILE_LINEAGE_FORBIDDEN'; END IF;
 SELECT COALESCE(max(v.sequence),0)+1 INTO seq FROM app.cv_versions v WHERE v.tenant_id=workspace AND v.document_id=insert_job_cv_version.document_id;
 SELECT j.job_id INTO v_target_job FROM app.job_versions j WHERE j.tenant_id=workspace AND j.id=p_job_version;
 IF v_target_job IS NULL OR document.job_id IS DISTINCT FROM v_target_job THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_JOB_LINEAGE_FORBIDDEN'; END IF;
 SELECT d.id INTO v_base_document FROM app.cv_documents d WHERE d.tenant_id=workspace AND d.profile_id=profile AND d.document_kind='base';
 IF v_base_document IS NULL OR (p_tailored AND NOT EXISTS(SELECT 1 FROM app.cv_versions cv WHERE cv.tenant_id=workspace AND cv.id=p_base_snapshot AND cv.document_id=v_base_document AND cv.profile_version_id=profile_version)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PINNED_BASE_CV_REQUIRED'; END IF;
 projection:=app.canonical_for_cv(workspace,profile_version,document_id,snapshot,seq,document.head_version_id,locale,layout);
 projection:=pg_catalog.jsonb_set(projection,'{baseCvId}',pg_catalog.to_jsonb(app.portable_id(v_base_document)));
 IF p_tailored THEN
  projection:=pg_catalog.jsonb_set(projection,'{context}',pg_catalog.jsonb_build_object('kind','tailored','baseSnapshotId',app.portable_id(p_base_snapshot),'jobSnapshotId',app.portable_id(p_job_version),'previousTailoredSnapshotId',
    CASE WHEN EXISTS(SELECT 1 FROM app.cv_versions WHERE id=document.head_version_id AND tailoring_state='tailored') THEN app.portable_id(document.head_version_id) ELSE NULL END));
 END IF;
 PERFORM app.validate_canonical(projection);
 INSERT INTO app.cv_versions(id,tenant_id,profile_id,document_id,sequence,parent_version_id,profile_version_id,locale,tailoring_state,canonical_json,content_hash,publication_request_id,schema_version,job_id,job_version_id)
 VALUES(snapshot,workspace,profile,document_id,seq,document.head_version_id,profile_version,locale,CASE WHEN p_tailored THEN 'tailored' ELSE 'not_tailored' END,projection,app.hash_json(projection-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt'),request_id,'1.0.0',v_target_job,p_job_version);
 FOR entry IN SELECT * FROM pg_catalog.jsonb_array_elements_text(layout->'sectionOrder') LOOP
   SELECT s INTO STRICT section FROM pg_catalog.jsonb_array_elements(layout->'sections')s WHERE s->>'id'=entry;
   INSERT INTO app.cv_sections(tenant_id,cv_version_id,section_instance_id,section_kind,label,ordinal,visible)
    VALUES(workspace,snapshot,app.canonical_id(entry),section->>'kind',section->>'label',order_no,(section->>'visible')::boolean) RETURNING id INTO section_row;
   item_no:=0;
   FOR entry IN SELECT * FROM app.cv_section_entity_ids(workspace,profile_version,section,layout) LOOP
     SELECT pe.entity_revision_id INTO revision FROM app.profile_version_entities pe WHERE pe.tenant_id=workspace AND pe.profile_version_id=profile_version AND pe.entity_id=app.canonical_id(entry);
     IF revision IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CV_ENTITY_NOT_PINNED'; END IF;
     INSERT INTO app.cv_items(tenant_id,cv_section_id,cv_version_id,profile_version_id,item_kind,entity_revision_id,ordinal,selected,privacy_flags)
       VALUES(workspace,section_row,snapshot,profile_version,'entity',revision,item_no,(section->>'visible')::boolean,'{}');
     item_no:=item_no+1;
   END LOOP;
   order_no:=order_no+1;
 END LOOP;
 UPDATE app.cv_documents d SET head_version_id=snapshot,draft_revision=d.draft_revision+1,draft_payload=layout WHERE d.id=document_id AND d.tenant_id=workspace;
 RETURN snapshot;
END $$;

CREATE FUNCTION app.save_job_cv_checkpoint(p_key uuid,p_document uuid,p_expected_revision bigint,
 p_profile_version uuid,p_job_version uuid,p_layout jsonb,p_locale text,p_tailored boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_profile uuid;v_job uuid;v_document app.cv_documents;v_id uuid:=COALESCE(p_document,pg_catalog.gen_random_uuid());v_version uuid;v_base_snapshot uuid;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'save_job_cv_checkpoint',p_key,pg_catalog.jsonb_build_object('document',p_document,'expectedRevision',p_expected_revision,'profileVersion',p_profile_version,'jobVersion',p_job_version,'layout',p_layout,'locale',p_locale,'tailored',p_tailored));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF p_tailored IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EXPLICIT_TAILORING_STATE_REQUIRED'; END IF;
 PERFORM app.assert_profile_usable(v_workspace,p_profile_version);
 SELECT profile_id INTO v_profile FROM app.profile_versions WHERE tenant_id=v_workspace AND id=p_profile_version;
 SELECT job_id INTO v_job FROM app.job_versions WHERE tenant_id=v_workspace AND id=p_job_version;
 IF v_job IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='JOB_VERSION_FORBIDDEN'; END IF;
 IF p_document IS NULL THEN
  IF p_expected_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
  INSERT INTO app.cv_documents(id,tenant_id,profile_id,job_id,document_kind,draft_revision,draft_payload)
  VALUES(v_id,v_workspace,v_profile,v_job,'job',0,'{}');
 END IF;
 SELECT * INTO v_document FROM app.cv_documents WHERE tenant_id=v_workspace AND id=v_id FOR UPDATE;
 IF v_document.id IS NULL OR v_document.document_kind<>'job' OR v_document.profile_id<>v_profile OR v_document.job_id<>v_job THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='JOB_CV_LINEAGE_FORBIDDEN'; END IF;
 IF v_document.draft_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_tailored THEN
  SELECT cv.id INTO v_base_snapshot FROM app.cv_versions cv JOIN app.cv_documents d ON (d.tenant_id,d.id)=(cv.tenant_id,cv.document_id)
  WHERE cv.tenant_id=v_workspace AND cv.profile_version_id=p_profile_version AND d.document_kind='base' ORDER BY cv.sequence DESC LIMIT 1;
 END IF;
 v_version:=app.insert_job_cv_version(v_workspace,v_id,p_profile_version,r.request_id,p_layout,p_locale,p_job_version,p_tailored,v_base_snapshot);
 PERFORM app.audit(v_workspace,'cv.job_selection','cv_version',v_version,pg_catalog.jsonb_build_object('tailored',p_tailored));
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('cvVersionId',v_version,'documentId',v_id,'revision',p_expected_revision+1,'tailoringState',CASE WHEN p_tailored THEN 'tailored' ELSE 'not_tailored' END));
EXCEPTION WHEN check_violation OR foreign_key_violation OR not_null_violation OR invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_JOB_CV_GRAPH';
END $$;

CREATE FUNCTION app.search_applications(p_query text DEFAULT '',p_stage text DEFAULT NULL,
 p_cursor_time timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL,p_limit integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();v_pattern text;v_items jsonb;
BEGIN
 IF p_query IS NULL OR pg_catalog.length(p_query)>200 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_cursor_time IS NULL)<>(p_cursor_id IS NULL) OR
  (p_stage IS NOT NULL AND p_stage NOT IN ('saved','drafting','applied','interview','offer','closed')) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_APPLICATION_QUERY'; END IF;
 v_pattern:='%'||pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 SELECT COALESCE(pg_catalog.jsonb_agg(x.result ORDER BY x.created_at DESC,x.id DESC),'[]') INTO v_items FROM (
  SELECT a.id,a.created_at,pg_catalog.jsonb_build_object('applicationId',a.id,'createdAt',a.created_at,'jobId',a.job_id,'jobVersionId',a.job_version_id,
   'title',j.title,'company',j.company,'stage',a.user_stage,'revision',a.revision,'documentId',a.cv_document_id,
   'latestCvVersionId',cv.id,'latestGenerationId',NULL,'tailoringState',cv.tailoring_state,
   'targetChanged',CASE WHEN cv.id IS NULL THEN false ELSE cv.job_version_id IS DISTINCT FROM current_job.head_version_id END,
   'chosenCvVersionId',a.chosen_cv_version_id,
   'lastSentCvVersionId',(SELECT e.cv_version_id FROM app.application_events e WHERE e.tenant_id=a.tenant_id AND e.application_id=a.id AND e.event_kind='mark_sent'
     AND NOT EXISTS(SELECT 1 FROM app.application_events retraction WHERE retraction.tenant_id=e.tenant_id AND retraction.retracts_event_id=e.id) ORDER BY e.event_sequence DESC LIMIT 1),
   'nextAction',(SELECT pg_catalog.jsonb_build_object('id',n.id,'label',n.label,'dueDate',n.due_date,'state',n.state) FROM app.next_actions n WHERE n.tenant_id=a.tenant_id AND n.application_id=a.id AND n.state='open' ORDER BY n.due_date NULLS LAST,n.id LIMIT 1)) AS result
  FROM app.applications a JOIN app.job_versions j ON (j.tenant_id,j.id)=(a.tenant_id,a.job_version_id)
   JOIN app.jobs current_job ON (current_job.tenant_id,current_job.id)=(a.tenant_id,a.job_id)
   LEFT JOIN app.cv_documents d ON (d.tenant_id,d.id)=(a.tenant_id,a.cv_document_id)
   LEFT JOIN app.cv_versions cv ON (cv.tenant_id,cv.id)=(d.tenant_id,d.head_version_id)
  WHERE a.tenant_id=v_workspace AND (p_stage IS NULL OR a.user_stage=p_stage)
   AND (p_cursor_time IS NULL OR (a.created_at,a.id)<(p_cursor_time,p_cursor_id))
   AND (j.title ILIKE v_pattern ESCAPE E'\\' OR j.company ILIKE v_pattern ESCAPE E'\\'
    OR EXISTS(SELECT 1 FROM app.next_actions n WHERE n.tenant_id=a.tenant_id AND n.application_id=a.id AND n.label ILIKE v_pattern ESCAPE E'\\'))
  ORDER BY a.created_at DESC,a.id DESC LIMIT p_limit
 )x;
 RETURN pg_catalog.jsonb_build_object('items',v_items,'resultCount',pg_catalog.jsonb_array_length(v_items),'sentCount',app.sent_count(),
  'nextCursor',CASE WHEN pg_catalog.jsonb_array_length(v_items)=p_limit THEN pg_catalog.jsonb_build_object('createdAt',v_items->-1->'createdAt','id',v_items->-1->'applicationId') ELSE NULL END);
END $$;

CREATE INDEX ix_application_events_history ON app.application_events(tenant_id,application_id,event_sequence DESC);
CREATE INDEX ix_next_actions_application_state ON app.next_actions(tenant_id,application_id,state,due_date);
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['jobs','job_captures','job_versions','job_requirements','requirement_atoms','applications','application_events','next_actions'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,anon,authenticated',table_name);
  EXECUTE format('CREATE POLICY member_read ON app.%I FOR SELECT TO authenticated USING(app.is_active_member(tenant_id))',table_name);
  EXECUTE format('GRANT SELECT ON app.%I TO authenticated',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['job_captures','job_versions','job_requirements','requirement_atoms','application_events'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.protect_immutable()',table_name);
 END LOOP;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.confirm_job(uuid,uuid,bigint,jsonb),
 app.save_application(uuid,uuid,bigint,uuid,uuid,uuid,text),app.save_next_action(uuid,uuid,uuid,bigint,text,text,date,text),
 app.sent_count(),app.mark_sent(uuid,uuid,bigint,uuid,date),app.retract_sent(uuid,uuid,bigint,uuid),
 app.save_job_cv_checkpoint(uuid,uuid,bigint,uuid,uuid,jsonb,text,boolean),app.search_applications(text,text,timestamptz,uuid,integer) TO authenticated;
