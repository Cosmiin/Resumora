CREATE OR REPLACE FUNCTION app.validate_canonical(cv jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE ids uuid[]; ref record; record jsonb; item jsonb; linked jsonb; start_value jsonb; end_value jsonb; expected text; entity_ids text[];
BEGIN
 IF cv IS NULL OR pg_catalog.octet_length(cv::text)>1048576 OR NOT app.matches_schema(cv,app.canonical_cv_schema(),app.canonical_cv_schema()) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='CANONICAL_SCHEMA_INVALID';
 END IF;
 IF cv#>>'{document,templateVersionId}' IS NOT NULL AND cv#>>'{document,templateVersionId}' NOT IN (
   'template_folio_2_1_0', 'template_meridian_2_1_0', 'template_signal_2_1_0',
   'template_archive_2_1_0', 'template_monograph_2_1_0'
 ) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='UNREGISTERED_TEMPLATE_VERSION';
 END IF;
 ids:=app.collect_ids(cv);
 IF pg_catalog.cardinality(ids)<>(SELECT count(DISTINCT i) FROM pg_catalog.unnest(ids)i) THEN
   RAISE EXCEPTION USING ERRCODE='PT422', MESSAGE='DUPLICATE_CANONICAL_ID';
 END IF;
 IF pg_catalog.jsonb_array_length(cv->'generatedProse')>0 OR pg_catalog.jsonb_array_length(cv->'generations')>0 OR pg_catalog.jsonb_array_length(cv->'interviews')>0 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(cv#>'{document,sections}')s WHERE pg_catalog.jsonb_array_length(s->'proseIds')>0) THEN
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
