-- P1 physical refinements preserve the approved logical tables and canonical graph.
ALTER TABLE app.profile_version_entities ADD COLUMN ordinal integer NOT NULL CHECK(ordinal>=0);
ALTER TABLE app.source_spans ADD CONSTRAINT fk_span_exact_profile_source
 FOREIGN KEY(tenant_id,profile_id,source_document_id) REFERENCES app.source_documents(tenant_id,profile_id,id);

-- Serialize account deletion against all commands already authorized in flight.
CREATE OR REPLACE FUNCTION app.assert_tenant(workspace uuid, allow_deleting boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := app.require_user(); found_id uuid;
BEGIN
 SELECT t.id INTO found_id FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id
 WHERE t.id=workspace AND m.user_id=actor AND m.role='owner' AND m.state='active'
   AND (t.state='active' OR (allow_deleting AND t.state='deleting')) FOR SHARE OF t,m;
 IF found_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN'; END IF;
 RETURN actor;
END $$;

CREATE FUNCTION app.assert_profile_usable(workspace uuid, version_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE profile_id uuid;
BEGIN
 PERFORM app.assert_tenant(workspace);
 SELECT v.profile_id INTO profile_id FROM app.profile_versions v WHERE v.tenant_id=workspace AND v.id=version_id;
 IF profile_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='PROFILE_VERSION_FORBIDDEN'; END IF;
 PERFORM 1 FROM app.career_profiles p WHERE p.tenant_id=workspace AND p.id=profile_id FOR SHARE;
 IF EXISTS(SELECT 1 FROM app.profile_version_claims pc
   LEFT JOIN LATERAL (SELECT e.decision FROM app.confirmation_events e
     WHERE e.tenant_id=pc.tenant_id AND e.claim_id=pc.claim_id ORDER BY e.event_sequence DESC LIMIT 1) current_state ON true
   WHERE pc.tenant_id=workspace AND pc.profile_version_id=version_id
     AND COALESCE(current_state.decision,'missing') NOT IN ('user_confirmed','externally_verified')) THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='PROFILE_CONFIRMATION_REVOKED';
 END IF;
END $$;

CREATE FUNCTION app.entity_revision(workspace uuid, profile uuid, entity uuid, kind text, value jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing app.career_entities; revision_id uuid; sequence_no bigint; parent uuid; ref record; related jsonb;
BEGIN
 INSERT INTO app.career_entities(id,tenant_id,profile_id,entity_kind,state) VALUES(entity,workspace,profile,kind,'active') ON CONFLICT(id) DO NOTHING;
 SELECT * INTO existing FROM app.career_entities WHERE id=entity FOR UPDATE;
 IF existing.tenant_id<>workspace OR existing.profile_id<>profile OR existing.entity_kind<>kind THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='ENTITY_LINEAGE_FORBIDDEN'; END IF;
 SELECT id INTO revision_id FROM app.entity_revisions r WHERE r.tenant_id=workspace AND r.entity_id=entity AND r.payload=value AND r.content_hash=app.hash_json(value) ORDER BY revision_no DESC LIMIT 1;
 IF revision_id IS NOT NULL THEN RETURN revision_id; END IF;
 SELECT r.id,r.revision_no+1 INTO parent,sequence_no FROM app.entity_revisions r WHERE r.tenant_id=workspace AND r.entity_id=entity ORDER BY revision_no DESC LIMIT 1;
 INSERT INTO app.entity_revisions(tenant_id,profile_id,entity_id,revision_no,payload,validator_version,content_hash,supersedes_revision_id)
 VALUES(workspace,profile,entity,COALESCE(sequence_no,1),value,'canonical-entity-1.0.0',app.hash_json(value),parent) RETURNING id INTO revision_id;
 INSERT INTO app.entity_revision_claims(tenant_id,profile_id,entity_revision_id,field_role,claim_id)
 SELECT DISTINCT workspace,profile,revision_id,r.field_role,r.claim_id FROM app.claim_refs(value)r;
 IF kind='employment' THEN
   INSERT INTO app.entity_revision_entities(tenant_id,profile_id,entity_revision_id,field_role,related_entity_id)
   SELECT workspace,profile,revision_id,'employment.skillIds',app.canonical_id(s) FROM pg_catalog.jsonb_array_elements_text(value->'skillIds')s;
 ELSIF kind='enrichment' THEN
   INSERT INTO app.entity_revision_entities(tenant_id,profile_id,entity_revision_id,field_role,related_entity_id)
   VALUES(workspace,profile,revision_id,'enrichment.targetEntityId',app.canonical_id(value->>'targetEntityId'));
 END IF;
 RETURN revision_id;
END $$;

CREATE FUNCTION app.facts_from_entities(version_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH entries AS (
   SELECT e.entity_kind,r.payload,p.ordinal FROM app.profile_version_entities p
   JOIN app.entity_revisions r ON (r.tenant_id,r.id)=(p.tenant_id,p.entity_revision_id)
   JOIN app.career_entities e ON (e.tenant_id,e.id)=(r.tenant_id,r.entity_id)
   WHERE p.profile_version_id=version_id
 ) SELECT pg_catalog.jsonb_build_object('nameClaimId',
   (SELECT payload->'nameClaimId' FROM entries WHERE entity_kind='name'),
   'positioningTitleClaimIds',pg_catalog.jsonb_build_array(
     (SELECT payload->'titleClaimId' FROM entries WHERE entity_kind='positioning_title' AND payload->>'slot'='0'),
     (SELECT payload->'titleClaimId' FROM entries WHERE entity_kind='positioning_title' AND payload->>'slot'='1')),
   'contacts',COALESCE((SELECT pg_catalog.jsonb_agg(payload ORDER BY ordinal) FROM entries WHERE entity_kind='contact'),'[]'),
   'skills',COALESCE((SELECT pg_catalog.jsonb_agg(payload ORDER BY ordinal) FROM entries WHERE entity_kind='skill'),'[]'),
   'employment',COALESCE((SELECT pg_catalog.jsonb_agg(payload ORDER BY ordinal) FROM entries WHERE entity_kind='employment'),'[]'),
   'education',COALESCE((SELECT pg_catalog.jsonb_agg(payload ORDER BY ordinal) FROM entries WHERE entity_kind='education'),'[]'),
   'optionalEntries',COALESCE((SELECT pg_catalog.jsonb_agg(payload ORDER BY ordinal) FROM entries WHERE entity_kind='optional_entry'),'[]'))
$$;

CREATE FUNCTION app.validate_revision_joins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF EXISTS((SELECT r.field_role,r.claim_id FROM app.claim_refs(NEW.payload)r
   EXCEPT SELECT field_role,claim_id FROM app.entity_revision_claims WHERE tenant_id=NEW.tenant_id AND entity_revision_id=NEW.id)
   UNION ALL (SELECT field_role,claim_id FROM app.entity_revision_claims WHERE tenant_id=NEW.tenant_id AND entity_revision_id=NEW.id
   EXCEPT SELECT r.field_role,r.claim_id FROM app.claim_refs(NEW.payload)r)) THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='ENTITY_CLAIM_JOINS_MISMATCH';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER revision_joins AFTER INSERT ON app.entity_revisions DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app.validate_revision_joins();

CREATE FUNCTION app.validate_profile_pins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.canonical_json->'facts' IS DISTINCT FROM app.facts_from_entities(NEW.id) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PROFILE_PROJECTION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM app.profile_version_claims pc JOIN app.confirmation_events e ON (e.tenant_id,e.id)=(pc.tenant_id,pc.confirmation_event_id)
   WHERE pc.tenant_id=NEW.tenant_id AND pc.profile_version_id=NEW.id AND pc.accepted_state<>e.decision) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CONFIRMATION_PIN_DECISION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM app.profile_version_entities pe JOIN app.entity_revision_claims ec ON (ec.tenant_id,ec.entity_revision_id)=(pe.tenant_id,pe.entity_revision_id)
   WHERE pe.tenant_id=NEW.tenant_id AND pe.profile_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM app.profile_version_claims pc WHERE (pc.tenant_id,pc.profile_version_id,pc.claim_id)=(pe.tenant_id,pe.profile_version_id,ec.claim_id))) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='ENTITY_SUPPORT_NOT_PINNED'; END IF;
 IF EXISTS(SELECT 1 FROM app.profile_version_entities pe JOIN app.entity_revision_entities ee ON (ee.tenant_id,ee.entity_revision_id)=(pe.tenant_id,pe.entity_revision_id)
   WHERE pe.tenant_id=NEW.tenant_id AND pe.profile_version_id=NEW.id AND NOT EXISTS(SELECT 1 FROM app.profile_version_entities selected WHERE (selected.tenant_id,selected.profile_version_id,selected.entity_id)=(pe.tenant_id,pe.profile_version_id,ee.related_entity_id))) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='RELATED_ENTITY_NOT_PINNED'; END IF;
 IF NEW.content_hash<>app.hash_json(NEW.canonical_json-'profileId'-'profileVersionId'-'sequence'-'parentVersionId'-'asOf') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PROFILE_HASH_MISMATCH'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER profile_pins AFTER INSERT ON app.profile_versions DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app.validate_profile_pins();

CREATE FUNCTION app.canonical_for_cv(workspace uuid, version_id uuid, document_id uuid,
  new_version_id uuid, sequence_no bigint, parent uuid, locale text, layout jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE facts jsonb;
BEGIN
 PERFORM app.assert_profile_usable(workspace,version_id);
 SELECT v.canonical_json INTO facts FROM app.profile_versions v WHERE v.tenant_id=workspace AND v.id=version_id;
 RETURN pg_catalog.jsonb_build_object('schemaVersion','1.0.0','snapshotId',app.portable_id(new_version_id),'baseCvId',app.portable_id(document_id),
   'version',sequence_no,'parentSnapshotId',app.portable_id(parent),'createdAt',pg_catalog.transaction_timestamp(),'locale',locale,
   'sources',facts->'sources','provenance',facts->'provenance','claims',facts->'claims','facts',facts->'facts',
   'claimLinks',facts->'claimLinks','enrichment',facts->'enrichment','interviews','[]'::jsonb,'generatedProse','[]'::jsonb,'generations','[]'::jsonb,
   'document',layout,'context',pg_catalog.jsonb_build_object('kind','base','baseSnapshotId',NULL,'jobSnapshotId',NULL,'previousTailoredSnapshotId',NULL));
END $$;

CREATE FUNCTION app.cv_section_entity_ids(workspace uuid, profile_version uuid, section jsonb, layout jsonb)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT entry FROM (
  SELECT app.portable_id(pe.entity_id) entry,pe.ordinal::bigint ordinal
  FROM app.profile_version_entities pe
  JOIN app.career_entities e ON (e.tenant_id,e.id)=(pe.tenant_id,pe.entity_id)
  JOIN app.entity_revisions r ON (r.tenant_id,r.id)=(pe.tenant_id,pe.entity_revision_id)
  WHERE pe.tenant_id=workspace AND pe.profile_version_id=profile_version AND section->>'kind'='identity'
   AND ((e.entity_kind='name' AND r.payload->>'nameClaimId' IS NOT NULL)
    OR (e.entity_kind='positioning_title' AND r.payload->>'titleClaimId' IS NOT NULL)
    OR (e.entity_kind='contact' AND layout->'contactIds' ? app.portable_id(pe.entity_id)))
  UNION ALL
  SELECT value,ordinality FROM pg_catalog.jsonb_array_elements_text(section->'entryIds') WITH ORDINALITY
  WHERE section->>'kind'<>'identity'
 ) entries ORDER BY ordinal
$$;

CREATE FUNCTION app.insert_cv_version(workspace uuid, document_id uuid, profile_version uuid,
 request_id uuid, layout jsonb, locale text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE document app.cv_documents; profile uuid; snapshot uuid := pg_catalog.gen_random_uuid(); seq bigint; projection jsonb; section jsonb; entry text; section_row uuid; order_no integer:=0; item_no integer; revision uuid;
BEGIN
 SELECT * INTO document FROM app.cv_documents d WHERE d.tenant_id=workspace AND d.id=document_id FOR UPDATE;
 SELECT v.profile_id INTO profile FROM app.profile_versions v WHERE v.tenant_id=workspace AND v.id=profile_version;
 IF document.id IS NULL OR profile IS DISTINCT FROM document.profile_id OR document.document_kind<>'base' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_PROFILE_LINEAGE_FORBIDDEN'; END IF;
 SELECT COALESCE(max(v.sequence),0)+1 INTO seq FROM app.cv_versions v WHERE v.tenant_id=workspace AND v.document_id=insert_cv_version.document_id;
 projection:=app.canonical_for_cv(workspace,profile_version,document_id,snapshot,seq,document.head_version_id,locale,layout);
 PERFORM app.validate_canonical(projection);
 INSERT INTO app.cv_versions(id,tenant_id,profile_id,document_id,sequence,parent_version_id,profile_version_id,locale,tailoring_state,canonical_json,content_hash,publication_request_id,schema_version)
 VALUES(snapshot,workspace,profile,document_id,seq,document.head_version_id,profile_version,locale,'not_tailored',projection,app.hash_json(projection-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt'),request_id,'1.0.0');
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

CREATE FUNCTION app.ensure_profile(p_workspace uuid,p_profile uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile uuid;
BEGIN
 IF p_profile IS NOT NULL AND EXISTS(SELECT 1 FROM app.career_profiles WHERE id=p_profile AND tenant_id<>p_workspace) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='PROFILE_FORBIDDEN'; END IF;
 INSERT INTO app.career_profiles(id,tenant_id,draft_payload,draft_revision,draft_schema_version)
 VALUES(COALESCE(p_profile,pg_catalog.gen_random_uuid()),p_workspace,'{}',0,'canonical-cv-1.0.0') ON CONFLICT(tenant_id) DO NOTHING;
 SELECT id INTO v_profile FROM app.career_profiles WHERE tenant_id=p_workspace FOR UPDATE;
 IF p_profile IS NOT NULL AND p_profile<>v_profile THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='PERSONAL_PROFILE_ALREADY_EXISTS'; END IF;
 RETURN v_profile;
END $$;

CREATE FUNCTION app.save_profile_checkpoint(p_key uuid,p_profile uuid,p_expected_revision bigint,
 p_expected_base_revision bigint,p_cv jsonb,p_confirm_claim_ids uuid[],p_as_of date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();v_actor uuid:=app.require_user();r record;
 v_profile uuid;v_base app.cv_documents;v_head uuid;v_sequence bigint;v_version uuid:=pg_catalog.gen_random_uuid();
 v_cv_version uuid;v_record jsonb;v_source app.source_documents;v_span app.source_spans;v_claim app.claims;
 v_confirmation app.confirmation_events;v_claims jsonb:='[]';v_projection jsonb;v_entities jsonb:='[]';v_entity jsonb;
 v_entity_id uuid;v_revision uuid;v_kind text;v_ordinal integer:=0;v_relation app.claim_relations;v_ref text;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'save_profile_checkpoint',p_key,pg_catalog.jsonb_build_object(
 'profile',p_profile,'expectedRevision',p_expected_revision,'expectedBaseRevision',p_expected_base_revision,
 'cv',p_cv,'confirmClaimIds',p_confirm_claim_ids,'asOf',p_as_of));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 PERFORM app.validate_canonical(p_cv);
 IF p_cv#>>'{context,kind}'<>'base' OR p_as_of IS NULL OR extract(year FROM p_as_of) NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='BASE_PROFILE_INPUT_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(p_confirm_claim_ids)c WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_cv->'claims')i WHERE app.canonical_id(i->>'id')=c)) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CONFIRMATION_OUTSIDE_INPUT'; END IF;
 v_profile:=app.ensure_profile(v_workspace,p_profile);
 SELECT p.head_version_id,p.draft_revision+1 INTO v_head,v_sequence FROM app.career_profiles p WHERE p.tenant_id=v_workspace AND p.id=v_profile;
 IF v_sequence-1 IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 INSERT INTO app.cv_documents(tenant_id,profile_id,document_kind,draft_revision,draft_payload)
 VALUES(v_workspace,v_profile,'base',0,'{}') ON CONFLICT(tenant_id,profile_id) WHERE document_kind='base' DO NOTHING;
 SELECT * INTO v_base FROM app.cv_documents WHERE tenant_id=v_workspace AND profile_id=v_profile AND document_kind='base' FOR UPDATE;
 IF v_base.draft_revision IS DISTINCT FROM p_expected_base_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='BASE_VERSION_CONFLICT'; END IF;
 -- Immutable source content and locator identity; manifest state may evolve separately later.
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'sources') LOOP
   INSERT INTO app.source_documents(id,tenant_id,profile_id,source_kind,content_hash,state,metadata)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,
     CASE v_record->>'kind' WHEN 'external_document' THEN 'own_profile' WHEN 'job_capture' THEN 'job' ELSE v_record->>'kind' END,
     CASE WHEN v_record ? 'sha256' THEN pg_catalog.decode(v_record->>'sha256','hex') ELSE app.hash_json(v_record) END,
     CASE WHEN v_record->>'kind'='upload' THEN 'reserved' ELSE 'available' END,v_record) ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_source FROM app.source_documents WHERE id=app.canonical_id(v_record->>'id');
   IF v_source.tenant_id<>v_workspace OR v_source.profile_id IS DISTINCT FROM v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='SOURCE_LINEAGE_FORBIDDEN'; END IF;
   IF v_source.metadata<>v_record THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_SOURCE_CONTENT'; END IF;
 END LOOP;
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'provenance') LOOP
   INSERT INTO app.source_spans(id,tenant_id,profile_id,source_document_id,locator,text_excerpt)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,app.canonical_id(v_record->>'sourceId'),v_record-'excerpt',v_record->>'excerpt') ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_span FROM app.source_spans WHERE id=app.canonical_id(v_record->>'id');
   IF v_span.tenant_id<>v_workspace OR v_span.profile_id IS DISTINCT FROM v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='PROVENANCE_LINEAGE_FORBIDDEN'; END IF;
   IF v_span.locator<>v_record-'excerpt' OR v_span.text_excerpt IS DISTINCT FROM v_record->>'excerpt' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_PROVENANCE'; END IF;
 END LOOP;
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'claims') LOOP
   INSERT INTO app.claims(id,tenant_id,profile_id,claim_kind,value,content_hash)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,v_record->>'kind',v_record->'value',app.hash_json(pg_catalog.jsonb_build_object('kind',v_record->'kind','value',v_record->'value'))) ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_claim FROM app.claims WHERE id=app.canonical_id(v_record->>'id') FOR UPDATE;
   IF v_claim.tenant_id<>v_workspace OR v_claim.profile_id<>v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CLAIM_LINEAGE_FORBIDDEN'; END IF;
   IF v_claim.claim_kind<>v_record->>'kind' OR v_claim.value<>v_record->'value' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_CLAIM_CONTENT'; END IF;
   FOR v_ref IN SELECT * FROM pg_catalog.jsonb_array_elements_text(v_record->'provenanceIds') LOOP
     INSERT INTO app.claim_provenance(tenant_id,profile_id,claim_id,source_span_id,basis)
     VALUES(v_workspace,v_profile,v_claim.id,app.canonical_id(v_ref),'provided_by_user') ON CONFLICT DO NOTHING;
   END LOOP;
   IF v_claim.id=ANY(p_confirm_claim_ids) THEN
     INSERT INTO app.confirmation_events(tenant_id,profile_id,claim_id,actor_user_id,decision,method)
     VALUES(v_workspace,v_profile,v_claim.id,v_actor,'user_confirmed','explicit_selected_fact_attestation');
   END IF;
   SELECT * INTO v_confirmation FROM app.confirmation_events WHERE tenant_id=v_workspace AND claim_id=v_claim.id ORDER BY event_sequence DESC LIMIT 1;
   IF v_confirmation.id IS NULL OR v_confirmation.decision NOT IN ('user_confirmed','externally_verified') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EXPLICIT_CONFIRMATION_REQUIRED'; END IF;
   v_claims:=v_claims||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',app.portable_id(v_claim.id),'kind',v_claim.claim_kind,'value',v_claim.value,
    'provenanceIds',v_record->'provenanceIds','status',v_confirmation.decision,'confirmedAt',v_confirmation.recorded_at,'confirmationActor',app.portable_id(v_confirmation.actor_user_id))
    ||CASE WHEN v_confirmation.decision='externally_verified' THEN pg_catalog.jsonb_build_object('verificationMethod',v_confirmation.method) ELSE '{}'::jsonb END);
 END LOOP;
 v_projection:=pg_catalog.jsonb_build_object('schemaVersion','cv-facts-1.0.0','profileId',v_profile,'profileVersionId',v_version,
   'sequence',v_sequence,'parentVersionId',v_head,'asOf',p_as_of,'sources',p_cv->'sources','provenance',p_cv->'provenance',
   'claims',v_claims,'facts',p_cv->'facts','claimLinks',p_cv->'claimLinks','enrichment',p_cv->'enrichment');
 INSERT INTO app.profile_versions(id,tenant_id,profile_id,sequence,parent_version_id,canonical_json,schema_version,content_hash,as_of,publication_request_id)
 VALUES(v_version,v_workspace,v_profile,v_sequence,v_head,v_projection,'cv-facts-1.0.0',app.hash_json(v_projection-'profileId'-'profileVersionId'-'sequence'-'parentVersionId'-'asOf'),p_as_of,r.request_id);
 INSERT INTO app.profile_version_claims(tenant_id,profile_id,profile_version_id,claim_id,confirmation_event_id,accepted_state)
 SELECT v_workspace,v_profile,v_version,c.id,e.id,e.decision FROM app.claims c
 JOIN LATERAL(SELECT * FROM app.confirmation_events ce WHERE ce.tenant_id=c.tenant_id AND ce.claim_id=c.id ORDER BY ce.event_sequence DESC LIMIT 1)e ON true
 WHERE c.tenant_id=v_workspace AND c.id IN(SELECT app.canonical_id(i->>'id') FROM pg_catalog.jsonb_array_elements(p_cv->'claims')i);
 v_entities:=pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_build_object('entity',pg_catalog.md5(v_profile::text||':name')::uuid,'kind','name','payload',pg_catalog.jsonb_build_object('nameClaimId',p_cv#>'{facts,nameClaimId}')),
   pg_catalog.jsonb_build_object('entity',pg_catalog.md5(v_profile::text||':title0')::uuid,'kind','positioning_title','payload',pg_catalog.jsonb_build_object('slot',0,'titleClaimId',p_cv#>'{facts,positioningTitleClaimIds,0}')),
   pg_catalog.jsonb_build_object('entity',pg_catalog.md5(v_profile::text||':title1')::uuid,'kind','positioning_title','payload',pg_catalog.jsonb_build_object('slot',1,'titleClaimId',p_cv#>'{facts,positioningTitleClaimIds,1}')));
 FOR v_kind,v_record IN SELECT 'contact',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,contacts}')i
   UNION ALL SELECT 'skill',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,skills}')i
   UNION ALL SELECT 'employment',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,employment}')i
   UNION ALL SELECT 'education',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,education}')i
   UNION ALL SELECT 'optional_entry',i FROM pg_catalog.jsonb_array_elements(p_cv#>'{facts,optionalEntries}')i
   UNION ALL SELECT 'enrichment',i FROM pg_catalog.jsonb_array_elements(p_cv->'enrichment')i LOOP
   v_entities:=v_entities||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('entity',app.canonical_id(v_record->>'id'),'kind',v_kind,'payload',v_record));
 END LOOP;
 FOR v_entity IN SELECT * FROM pg_catalog.jsonb_array_elements(v_entities) LOOP
   v_entity_id:=(v_entity->>'entity')::uuid;
   v_revision:=app.entity_revision(v_workspace,v_profile,v_entity_id,v_entity->>'kind',v_entity->'payload');
   INSERT INTO app.profile_version_entities(tenant_id,profile_id,profile_version_id,entity_id,entity_revision_id,ordinal)
   VALUES(v_workspace,v_profile,v_version,v_entity_id,v_revision,v_ordinal);v_ordinal:=v_ordinal+1;
 END LOOP;
 FOR v_record IN SELECT * FROM pg_catalog.jsonb_array_elements(p_cv->'claimLinks') LOOP
   INSERT INTO app.claim_relations(id,tenant_id,profile_id,from_claim_id,to_claim_id,relation)
   VALUES(app.canonical_id(v_record->>'id'),v_workspace,v_profile,app.canonical_id(v_record->>'fromClaimId'),app.canonical_id(v_record->>'toClaimId'),v_record->>'relation') ON CONFLICT(id) DO NOTHING;
   SELECT * INTO v_relation FROM app.claim_relations WHERE id=app.canonical_id(v_record->>'id');
   IF v_relation.tenant_id<>v_workspace OR v_relation.profile_id<>v_profile THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RELATION_LINEAGE_FORBIDDEN'; END IF;
   IF v_relation.from_claim_id<>app.canonical_id(v_record->>'fromClaimId') OR v_relation.to_claim_id<>app.canonical_id(v_record->>'toClaimId') OR v_relation.relation<>v_record->>'relation' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_CLAIM_RELATION'; END IF;
   INSERT INTO app.profile_version_relations(tenant_id,profile_id,profile_version_id,claim_relation_id,from_claim_id,to_claim_id)
   VALUES(v_workspace,v_profile,v_version,v_relation.id,v_relation.from_claim_id,v_relation.to_claim_id);
 END LOOP;
 UPDATE app.career_profiles SET head_version_id=v_version,draft_revision=v_sequence,draft_payload=p_cv,updated_at=pg_catalog.transaction_timestamp() WHERE id=v_profile;
 v_cv_version:=app.insert_cv_version(v_workspace,v_base.id,v_version,r.request_id,p_cv->'document',p_cv->>'locale');
 PERFORM app.audit(v_workspace,'profile.checkpoint','profile_version',v_version,pg_catalog.jsonb_build_object('revision',v_sequence));
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('profileId',v_profile,'profileVersionId',v_version,
  'revision',v_sequence,'baseDocumentId',v_base.id,'baseCvVersionId',v_cv_version,'baseRevision',v_base.draft_revision+1));
EXCEPTION WHEN check_violation OR foreign_key_violation OR invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PROFILE_GRAPH';
 WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='PROFILE_IDENTITY_CONFLICT';
END $$;

CREATE FUNCTION app.save_cv_checkpoint(p_key uuid,p_document uuid,p_expected_revision bigint,p_profile_version uuid,p_layout jsonb,p_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_document app.cv_documents;v_version uuid;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'save_cv_checkpoint',p_key,pg_catalog.jsonb_build_object('document',p_document,'expectedRevision',p_expected_revision,'profileVersion',p_profile_version,'layout',p_layout,'locale',p_locale));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 PERFORM app.assert_profile_usable(v_workspace,p_profile_version);
 SELECT * INTO v_document FROM app.cv_documents WHERE tenant_id=v_workspace AND id=p_document FOR UPDATE;
 IF v_document.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_DOCUMENT_FORBIDDEN'; END IF;
 IF v_document.draft_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 v_version:=app.insert_cv_version(v_workspace,p_document,p_profile_version,r.request_id,p_layout,p_locale);
 PERFORM app.audit(v_workspace,'cv.checkpoint','cv_version',v_version);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('cvVersionId',v_version,'documentId',p_document,'revision',v_document.draft_revision+1));
EXCEPTION WHEN check_violation OR foreign_key_violation OR invalid_text_representation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_CV_GRAPH';
END $$;

CREATE FUNCTION app.restore_cv_version(p_key uuid,p_document uuid,p_expected_revision bigint,p_historical_version uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_old app.cv_versions;v_document app.cv_documents;v_version uuid;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'restore_cv_version',p_key,pg_catalog.jsonb_build_object('document',p_document,'expectedRevision',p_expected_revision,'historicalVersion',p_historical_version));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO v_old FROM app.cv_versions WHERE tenant_id=v_workspace AND id=p_historical_version AND document_id=p_document;
 IF v_old.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESTORE_LINEAGE_FORBIDDEN'; END IF;
 PERFORM app.assert_profile_usable(v_workspace,v_old.profile_version_id);
 SELECT * INTO v_document FROM app.cv_documents WHERE tenant_id=v_workspace AND id=p_document FOR UPDATE;
 IF v_document.draft_revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF v_document.document_kind='job' THEN
  v_version:=app.insert_job_cv_version(v_workspace,p_document,v_old.profile_version_id,r.request_id,v_old.canonical_json->'document',v_old.locale,v_old.job_version_id,v_old.tailoring_state='tailored');
 ELSE
  v_version:=app.insert_cv_version(v_workspace,p_document,v_old.profile_version_id,r.request_id,v_old.canonical_json->'document',v_old.locale);
 END IF;
 PERFORM app.audit(v_workspace,'cv.restore','cv_version',v_version);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('cvVersionId',v_version,'documentId',p_document,'revision',v_document.draft_revision+1,'restoredFrom',p_historical_version));
END $$;

CREATE FUNCTION app.revoke_claim(p_key uuid,p_claim uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_profile uuid;v_event uuid;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'revoke_claim',p_key,pg_catalog.jsonb_build_object('claim',p_claim,'reason',p_reason));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF p_reason IS NULL OR pg_catalog.length(p_reason)>1000 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_REVOCATION_REASON'; END IF;
 SELECT profile_id INTO v_profile FROM app.claims WHERE tenant_id=v_workspace AND id=p_claim;
 IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CLAIM_FORBIDDEN'; END IF;
 PERFORM 1 FROM app.career_profiles WHERE tenant_id=v_workspace AND id=v_profile FOR UPDATE;
 PERFORM 1 FROM app.claims WHERE tenant_id=v_workspace AND id=p_claim FOR UPDATE;
 INSERT INTO app.confirmation_events(tenant_id,profile_id,claim_id,actor_user_id,decision,method,reason)
 VALUES(v_workspace,v_profile,p_claim,app.require_user(),'revoked','explicit_user_revocation',p_reason) RETURNING id INTO v_event;
 PERFORM app.audit(v_workspace,'claim.revoked','claim',p_claim);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('confirmationEventId',v_event,'claimId',p_claim,'state','revoked'));
END $$;

DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['source_documents','source_spans','claims','claim_provenance','confirmation_events','career_entities','entity_revisions','entity_revision_claims','claim_relations','entity_revision_entities','profile_version_relations','career_profiles','profile_versions','profile_version_entities','profile_version_claims','cv_documents','cv_versions','cv_sections','cv_items'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,anon,authenticated',table_name);
  EXECUTE format('CREATE POLICY member_read ON app.%I FOR SELECT TO authenticated USING(app.is_active_member(tenant_id))',table_name);
  EXECUTE format('GRANT SELECT ON app.%I TO authenticated',table_name);
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['source_spans','claims','claim_provenance','confirmation_events','entity_revisions','entity_revision_claims','claim_relations','entity_revision_entities','profile_version_relations','profile_versions','profile_version_entities','profile_version_claims','cv_versions','cv_sections','cv_items'] LOOP
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.protect_immutable()',table_name);
 END LOOP;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.save_profile_checkpoint(uuid,uuid,bigint,bigint,jsonb,uuid[],date),
 app.save_cv_checkpoint(uuid,uuid,bigint,uuid,jsonb,text),app.restore_cv_version(uuid,uuid,bigint,uuid),app.revoke_claim(uuid,uuid,text) TO authenticated;
