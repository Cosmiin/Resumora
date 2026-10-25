-- P3 calculations consume reviewed, FK-validated mappings. No model total or NLP.
CREATE FUNCTION app.calculate_scores(p_mapping uuid,p_rules uuid,p_profile_available boolean,p_cv_available boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH context AS(SELECT m.*,r.config rules FROM app.evidence_mappings m CROSS JOIN app.rule_versions r WHERE m.id=p_mapping AND r.id=p_rules AND r.rule_kind='scoring'),
 applicable AS(SELECT q.* FROM context c JOIN app.job_requirements q ON (q.tenant_id,q.job_version_id)=(c.tenant_id,c.job_version_id)
  WHERE EXISTS(SELECT 1 FROM app.requirement_atoms a WHERE a.tenant_id=q.tenant_id AND a.requirement_id=q.id AND a.polarity<>'not_required')),
 scopes AS(SELECT * FROM (VALUES('profile'::text,p_profile_available),('cv'::text,p_cv_available))s(scope_name,available) WHERE available),
 requirements AS(SELECT q.*,((c.rules->'priority'->>q.priority)::numeric*q.priority_fraction) importance,(c.rules->'weights'->>q.primary_category)::numeric nominal_weight
  FROM context c CROSS JOIN applicable q
  WHERE q.scorable AND NOT EXISTS(SELECT 1 FROM app.requirement_atoms a WHERE a.tenant_id=q.tenant_id AND a.requirement_id=q.id AND a.polarity='ambiguous')),
 atoms AS(SELECT s.scope_name,q.id requirement_id,q.tenant_id,q.primary_category,q.importance,q.nominal_weight,q.gate_kind,a.id atom_id,a.ordinal,a.operator,a.weight_share,
  COALESCE((SELECT max(e.strength*e.fulfillment) FROM app.match_evidence e WHERE e.tenant_id=q.tenant_id AND e.evidence_mapping_id=p_mapping AND e.requirement_atom_id=a.id AND e.scope=s.scope_name AND e.evidence_role='semantic'),0) strength
  FROM scopes s CROSS JOIN requirements q JOIN app.requirement_atoms a ON (a.tenant_id,a.requirement_id)=(q.tenant_id,q.id) WHERE a.polarity='positive'),
 criteria AS(SELECT scope_name,requirement_id,tenant_id,primary_category,importance,nominal_weight,
  (pg_catalog.array_agg(atom_id ORDER BY ordinal))[1] atom_id,
  CASE WHEN EXISTS(SELECT 1 FROM app.match_evidence denial JOIN app.requirement_atoms da ON (da.tenant_id,da.id)=(denial.tenant_id,denial.requirement_atom_id)
    WHERE denial.evidence_mapping_id=p_mapping AND da.requirement_id=atoms.requirement_id AND denial.evidence_role='eligibility' AND denial.gate_state='confirmed_unmet') THEN 0
   WHEN min(operator)='OR' THEN max(strength) ELSE sum(strength*weight_share)/sum(weight_share) END strength
  FROM atoms GROUP BY scope_name,requirement_id,tenant_id,primary_category,importance,nominal_weight),
 category_denominators AS(SELECT scope_name,primary_category,max(nominal_weight) nominal_weight,sum(importance) denominator FROM criteria GROUP BY scope_name,primary_category),
 category_weights AS(SELECT *,100*nominal_weight/sum(nominal_weight) OVER(PARTITION BY scope_name) effective_weight FROM category_denominators),
 components AS(SELECT c.*,w.denominator,w.effective_weight,w.effective_weight*c.importance*c.strength/w.denominator contribution,
  CASE WHEN c.strength>0 THEN 'included' WHEN c.scope_name='cv' AND EXISTS(SELECT 1 FROM criteria p WHERE p.scope_name='profile' AND p.requirement_id=c.requirement_id AND p.strength>0) THEN 'verified_omitted' ELSE 'unsupported' END keyword_status
  FROM criteria c JOIN category_weights w USING(scope_name,primary_category)),
 ambiguous AS(SELECT q.id FROM applicable q
  WHERE EXISTS(SELECT 1 FROM app.requirement_atoms a WHERE a.tenant_id=q.tenant_id AND a.requirement_id=q.id AND a.polarity='ambiguous')),
 gates AS(SELECT q.* FROM applicable q WHERE q.hard_gate),
 eligibility AS(SELECT CASE
  WHEN EXISTS(SELECT 1 FROM app.match_evidence e JOIN app.requirement_atoms a ON (a.tenant_id,a.id)=(e.tenant_id,e.requirement_atom_id) JOIN gates g ON (g.tenant_id,g.id)=(a.tenant_id,a.requirement_id) WHERE e.evidence_mapping_id=p_mapping AND e.evidence_role='eligibility' AND e.gate_state='confirmed_unmet') THEN 'confirmed_requirement_gap'
  WHEN EXISTS(SELECT 1 FROM ambiguous) OR EXISTS(SELECT 1 FROM gates g WHERE NOT (
    EXISTS(SELECT 1 FROM app.match_evidence e JOIN app.requirement_atoms a ON (a.tenant_id,a.id)=(e.tenant_id,e.requirement_atom_id) WHERE e.evidence_mapping_id=p_mapping AND a.requirement_id=g.id AND e.evidence_role='eligibility' AND e.gate_state='supported')
    OR (g.gate_kind<>'authorization' AND COALESCE((SELECT c.strength FROM criteria c WHERE c.requirement_id=g.id AND c.scope_name=CASE WHEN p_profile_available THEN 'profile' ELSE 'cv' END),0)=1))) THEN 'needs_verification'
  ELSE 'requirements_satisfied' END state)
 SELECT pg_catalog.jsonb_build_object('candidateFit',(SELECT sum(contribution) FROM components WHERE scope_name='profile'),
  'cvMatch',(SELECT sum(contribution) FROM components WHERE scope_name='cv'),'eligibility',(SELECT state FROM eligibility),
  'components',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('scope',scope_name,'requirementId',requirement_id,'atomId',atom_id,'category',primary_category,
    'priority',importance,'strength',strength,'effectiveWeight',effective_weight,'denominator',denominator,'contribution',contribution,'keywordStatus',keyword_status) ORDER BY scope_name,requirement_id) FROM components),'[]'),
  'ambiguousRequirementIds',COALESCE((SELECT pg_catalog.jsonb_agg(id ORDER BY id) FROM ambiguous),'[]'))
$$;

CREATE FUNCTION app.confirmation_fingerprint(p_profile uuid,p_cv uuid) RETURNS bytea
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT app.hash_json(COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('claim',s.claim_id,'decision',e.decision,'event',e.id) ORDER BY s.claim_id),'[]'))
 FROM (SELECT DISTINCT pc.tenant_id,pc.claim_id FROM app.profile_version_claims pc
  WHERE pc.profile_version_id=p_profile OR pc.profile_version_id=(SELECT profile_version_id FROM app.cv_versions WHERE id=p_cv))s
 LEFT JOIN LATERAL(SELECT id,decision FROM app.confirmation_events e WHERE e.tenant_id=s.tenant_id AND e.claim_id=s.claim_id ORDER BY event_sequence DESC LIMIT 1)e ON true
$$;

CREATE FUNCTION app.get_analysis(p_analysis uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();v_run app.analysis_runs;v_components jsonb;v_valid boolean;v_recommendations jsonb;
BEGIN
 SELECT * INTO v_run FROM app.analysis_runs WHERE tenant_id=v_workspace AND id=p_analysis;
 IF v_run.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='ANALYSIS_FORBIDDEN'; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key',c.component_key,'category',c.category,'effectiveWeight',c.effective_weight,'denominator',c.denominator,'contribution',c.contribution,'explanation',c.explanation) ORDER BY c.component_key),'[]') INTO v_components
 FROM app.analysis_components c WHERE c.tenant_id=v_workspace AND c.analysis_run_id=p_analysis;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',r.id,'kind',r.recommendation_kind,'action',r.action,'estimatedDelta',r.estimated_delta,'limitations',r.limitations,
  'requirementIds',(SELECT pg_catalog.jsonb_agg(q.job_requirement_id ORDER BY q.job_requirement_id) FROM app.recommendation_requirements q WHERE q.tenant_id=r.tenant_id AND q.recommendation_id=r.id),
  'claimIds',COALESCE((SELECT pg_catalog.jsonb_agg(c.claim_id ORDER BY c.claim_id) FROM app.recommendation_claims c WHERE c.tenant_id=r.tenant_id AND c.recommendation_id=r.id),'[]')) ORDER BY r.priority,r.id),'[]') INTO v_recommendations
 FROM app.recommendations r WHERE r.tenant_id=v_workspace AND r.analysis_run_id=p_analysis;
 v_valid:=(v_run.input_bundle->>'confirmationHash')=pg_catalog.encode(app.confirmation_fingerprint(v_run.profile_version_id,v_run.cv_version_id),'hex');
 RETURN pg_catalog.jsonb_build_object('analysisId',v_run.id,'candidateFit',CASE WHEN v_valid THEN pg_catalog.round(v_run.candidate_fit,2) ELSE NULL END,'candidateFitRaw',CASE WHEN v_valid THEN v_run.candidate_fit ELSE NULL END,
  'cvMatch',CASE WHEN v_valid THEN pg_catalog.round(v_run.cv_match,2) ELSE NULL END,'cvMatchRaw',CASE WHEN v_valid THEN v_run.cv_match ELSE NULL END,'eligibility',CASE WHEN v_valid THEN v_run.eligibility ELSE 'needs_verification' END,
  'historicalResult',pg_catalog.jsonb_build_object('candidateFit',v_run.candidate_fit,'cvMatch',v_run.cv_match,'eligibility',v_run.eligibility),
  'candidateFitScope',CASE WHEN v_run.profile_version_id IS NULL THEN 'Full confirmed profile unavailable; CandidateFit is null' ELSE 'Complete pinned confirmed profile' END,
  'readability',pg_catalog.jsonb_build_object('state','untested','exportId',NULL),'calibrated',false,
  'method','compatibility-1.1.0-db.1','sourceMethod','compatibility-1.1.0','asOf',v_run.as_of,'inputs',v_run.input_bundle->'versions',
  'confirmationValid',v_valid,'targetChanged',v_run.job_version_id IS DISTINCT FROM (SELECT j.head_version_id FROM app.jobs j JOIN app.job_versions v ON (v.tenant_id,v.job_id)=(j.tenant_id,j.id) WHERE v.tenant_id=v_workspace AND v.id=v_run.job_version_id),
  'components',v_components,'recommendations',v_recommendations,'interpretation','Reviewed structured evidence only; no hiring probability, employer ATS, legal certification or PDF test');
END $$;

CREATE FUNCTION app.validate_evidence_lineage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m app.evidence_mappings;v_cv app.cv_versions;v_requirement app.job_requirements;
BEGIN
 SELECT * INTO m FROM app.evidence_mappings WHERE tenant_id=NEW.tenant_id AND id=NEW.evidence_mapping_id;
 IF NEW.scope='profile' THEN
  IF m.profile_version_id IS DISTINCT FROM NEW.profile_version_id OR NEW.cv_item_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PROFILE_MAPPING_LINEAGE_MISMATCH'; END IF;
 ELSE
  SELECT * INTO v_cv FROM app.cv_versions WHERE tenant_id=NEW.tenant_id AND id=m.cv_version_id;
  IF v_cv.id IS NULL OR NEW.cv_version_id IS DISTINCT FROM v_cv.id OR NEW.profile_version_id IS DISTINCT FROM v_cv.profile_version_id THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CV_MAPPING_LINEAGE_MISMATCH'; END IF;
  IF NEW.evidence_role='semantic' AND NOT EXISTS(SELECT 1 FROM app.cv_items i JOIN app.entity_revision_claims ec ON (ec.tenant_id,ec.entity_revision_id)=(i.tenant_id,i.entity_revision_id)
    WHERE i.tenant_id=NEW.tenant_id AND i.id=NEW.cv_item_id AND i.cv_version_id=v_cv.id AND i.selected AND ec.claim_id=NEW.claim_id) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='CLAIM_NOT_REPRESENTED_BY_CV_ITEM'; END IF;
 END IF;
 SELECT q.* INTO v_requirement FROM app.job_requirements q JOIN app.requirement_atoms a ON (a.tenant_id,a.requirement_id)=(q.tenant_id,q.id)
 WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.requirement_atom_id AND q.job_version_id=m.job_version_id;
 IF v_requirement.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='REQUIREMENT_MAPPING_LINEAGE_MISMATCH'; END IF;
 IF NEW.evidence_role='eligibility' AND (NOT v_requirement.hard_gate OR NOT EXISTS(SELECT 1 FROM app.requirement_atoms a WHERE a.tenant_id=NEW.tenant_id AND a.requirement_id=v_requirement.id AND a.polarity<>'not_required')) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='GATE_ASSERTION_REQUIRES_REVIEWED_HARD_GATE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_lineage BEFORE INSERT ON app.match_evidence FOR EACH ROW EXECUTE FUNCTION app.validate_evidence_lineage();

CREATE FUNCTION app.publish_analysis(p_key uuid,p_profile_version uuid,p_cv_version uuid,p_job_version uuid,
 p_evidence jsonb,p_gate_assertions jsonb,p_as_of date,p_locale text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_profile uuid;v_cv app.cv_versions;v_job app.job_versions;
 v_rules app.rule_versions;v_versions jsonb;v_bundle jsonb;v_normalized jsonb;v_gates jsonb;v_requirements_hash bytea;v_fingerprint bytea;v_analysis uuid;v_mapping uuid;
 v_item jsonb;v_requirement app.job_requirements;v_atom app.requirement_atoms;v_scope text;v_claim uuid;v_item_id uuid;v_input_profile uuid;
 v_strength numeric;v_fulfillment numeric;v_class text;v_relation text;v_explanation text;v_result jsonb;v_component jsonb;v_recommendation uuid;v_profile_strength numeric;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'publish_analysis',p_key,pg_catalog.jsonb_build_object('profileVersion',p_profile_version,'cvVersion',p_cv_version,'jobVersion',p_job_version,'evidence',p_evidence,'gateAssertions',p_gate_assertions,'asOf',p_as_of,'locale',p_locale));
 IF r.cached IS NOT NULL THEN RETURN app.get_analysis((r.cached->>'analysisId')::uuid); END IF;
 IF p_profile_version IS NULL AND p_cv_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='ANALYSIS_INPUT_REQUIRED'; END IF;
 IF p_locale IS NULL OR p_locale NOT IN ('ro','en') OR p_as_of IS NULL OR extract(year FROM p_as_of) NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_ANALYSIS_CONTEXT'; END IF;
 IF p_evidence IS NULL OR pg_catalog.jsonb_typeof(p_evidence)<>'array' OR p_gate_assertions IS NULL OR pg_catalog.jsonb_typeof(p_gate_assertions)<>'array' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='REVIEWED_EVIDENCE_ARRAY_REQUIRED'; END IF;
 IF pg_catalog.jsonb_array_length(p_evidence)>5000 OR pg_catalog.jsonb_array_length(p_gate_assertions)>500 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='EVIDENCE_LIMIT'; END IF;
 IF p_profile_version IS NOT NULL THEN
  PERFORM app.assert_profile_usable(v_workspace,p_profile_version);
  SELECT profile_id INTO v_profile FROM app.profile_versions WHERE tenant_id=v_workspace AND id=p_profile_version;
 END IF;
 IF p_cv_version IS NOT NULL THEN
  SELECT * INTO v_cv FROM app.cv_versions WHERE tenant_id=v_workspace AND id=p_cv_version;
  IF v_cv.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CV_VERSION_FORBIDDEN'; END IF;
  PERFORM app.assert_profile_usable(v_workspace,v_cv.profile_version_id);
  IF v_profile IS NOT NULL AND v_profile<>v_cv.profile_id THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='ANALYSIS_PROFILE_LINEAGE_MISMATCH'; END IF;
 END IF;
 SELECT * INTO v_job FROM app.job_versions WHERE tenant_id=v_workspace AND id=p_job_version;
 IF v_job.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='JOB_VERSION_FORBIDDEN'; END IF;
 SELECT * INTO STRICT v_rules FROM app.rule_versions WHERE rule_kind='scoring' AND version='compatibility-1.1.0-db.1';
 SELECT pg_catalog.jsonb_object_agg(rule_kind,pg_catalog.jsonb_build_object('id',id,'version',version,'hash',pg_catalog.encode(content_hash,'hex'))) INTO v_versions
 FROM app.rule_versions WHERE (rule_kind,version) IN (('scoring','compatibility-1.1.0-db.1'),('weights','baseline-1.1'),('dictionary','reviewed-ro-en-1.0'),('normalizer','reviewed-requirements-1.0'),('matcher','reviewed-evidence-1.0'),('date_bounds','elapsed-date-bounds-1.0'));
 SELECT app.hash_json(COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('requirement',pg_catalog.to_jsonb(q),
  'atoms',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)-'created_at' ORDER BY a.ordinal) FROM app.requirement_atoms a WHERE a.tenant_id=q.tenant_id AND a.requirement_id=q.id))-'created_at' ORDER BY q.requirement_key),'[]'))
 INTO v_requirements_hash FROM app.job_requirements q WHERE q.tenant_id=v_workspace AND q.job_version_id=p_job_version;
 SELECT COALESCE(pg_catalog.jsonb_agg(e ORDER BY e->>'scope',e->>'atomId',e->>'claimId',e::text),'[]') INTO v_normalized FROM(SELECT DISTINCT e FROM pg_catalog.jsonb_array_elements(p_evidence)e)d;
 SELECT COALESCE(pg_catalog.jsonb_agg(e ORDER BY e->>'requirementId',e->>'state',e::text),'[]') INTO v_gates FROM(SELECT DISTINCT e FROM pg_catalog.jsonb_array_elements(p_gate_assertions)e)d;
 v_versions:=v_versions||pg_catalog.jsonb_build_object('profile',p_profile_version,'document',p_cv_version,'job',p_job_version,'requirementsHash',pg_catalog.encode(v_requirements_hash,'hex'),'matcherProvider',NULL,'matcherModel',NULL,'matcherPrompt',NULL);
 v_bundle:=pg_catalog.jsonb_build_object('versions',v_versions,'asOf',p_as_of,'explanationLocale',p_locale,
  'confirmationHash',pg_catalog.encode(app.confirmation_fingerprint(p_profile_version,p_cv_version),'hex'),
  'reviewedEvidence',v_normalized,'gateAssertions',v_gates,'reviewActor',app.require_user(),'automaticNlp',false,'calibrated',false);
 v_fingerprint:=app.hash_json(v_bundle||pg_catalog.jsonb_build_object('tenant',v_workspace));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resumora:analysis:'||v_workspace::text||pg_catalog.encode(v_fingerprint,'hex'),0));
 SELECT id INTO v_analysis FROM app.analysis_runs WHERE tenant_id=v_workspace AND input_fingerprint=v_fingerprint;
 IF v_analysis IS NOT NULL THEN
  PERFORM app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('analysisId',v_analysis));
  RETURN app.get_analysis(v_analysis);
 END IF;
 INSERT INTO app.evidence_mappings(tenant_id,profile_version_id,cv_version_id,job_version_id,mapping_version,content_hash,review_state)
 VALUES(v_workspace,p_profile_version,p_cv_version,p_job_version,'reviewed-evidence-1.0',app.hash_json(pg_catalog.jsonb_build_object('evidence',v_normalized,'gates',v_gates)),'accepted') RETURNING id INTO v_mapping;
 FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(v_normalized) LOOP
  IF pg_catalog.jsonb_typeof(v_item)<>'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_item)k WHERE k NOT IN ('atomId','claimId','cvItemId','scope','matchClass','relation','fulfillment','explanation')) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_BINDING'; END IF;
  v_scope:=v_item->>'scope';v_class:=v_item->>'matchClass';v_relation:=v_item->>'relation';v_claim:=(v_item->>'claimId')::uuid;v_item_id:=(v_item->>'cvItemId')::uuid;
  IF v_scope='profile' AND p_profile_version IS NOT NULL THEN v_input_profile:=p_profile_version;
  ELSIF v_scope='cv' AND v_cv.id IS NOT NULL THEN v_input_profile:=v_cv.profile_version_id;
  ELSE RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EVIDENCE_SCOPE_UNAVAILABLE'; END IF;
  SELECT * INTO v_atom FROM app.requirement_atoms WHERE tenant_id=v_workspace AND id=(v_item->>'atomId')::uuid AND job_version_id=p_job_version;
  IF v_atom.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EVIDENCE_JOB_LINEAGE_MISMATCH'; END IF;
  SELECT * INTO v_requirement FROM app.job_requirements WHERE tenant_id=v_workspace AND id=v_atom.requirement_id;
  v_strength:=(v_rules.config->'matchStrength'->>v_class)::numeric;
  IF v_strength IS NULL OR v_relation IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_MATCH_CLASS'; END IF;
  IF v_item ? 'fulfillment' AND pg_catalog.jsonb_typeof(v_item->'fulfillment')<>'number' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_FULFILLMENT'; END IF;
  v_fulfillment:=COALESCE((v_item->>'fulfillment')::numeric,1);
  IF v_fulfillment<0 OR v_fulfillment>1 OR v_fulfillment<>pg_catalog.trunc(v_fulfillment,6) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_FULFILLMENT'; END IF;
  v_explanation:=COALESCE(v_item->>'explanation','Reviewed supporting evidence');
  IF pg_catalog.length(v_explanation)>2000 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EXPLANATION_LIMIT'; END IF;
  IF v_relation IN ('ambiguous','rejected') OR v_requirement.gate_kind='authorization' OR
   (v_requirement.gate_kind IN ('credential','authorization') AND ((v_relation='approved_equivalent' AND NOT v_requirement.allow_equivalent) OR ((v_class='transferable' OR v_relation='transferable') AND NOT v_requirement.allow_transferable_equivalent))) THEN v_strength:=0; END IF;
  INSERT INTO app.match_evidence(tenant_id,evidence_mapping_id,requirement_atom_id,claim_id,cv_item_id,relation,strength,review_state,explanation,profile_version_id,job_version_id,cv_version_id,scope,match_class,fulfillment,evidence_role)
  VALUES(v_workspace,v_mapping,v_atom.id,v_claim,v_item_id,v_relation,v_strength,'accepted',v_explanation,v_input_profile,p_job_version,CASE WHEN v_scope='cv' THEN p_cv_version ELSE NULL END,v_scope,v_class,v_fulfillment,'semantic');
 END LOOP;
 FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(v_gates) LOOP
  IF pg_catalog.jsonb_typeof(v_item)<>'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_item)k WHERE k NOT IN ('requirementId','state','claimId','reason')) OR COALESCE(v_item->>'state','') NOT IN ('supported','confirmed_unmet','needs_verification') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_GATE_ASSERTION'; END IF;
  SELECT q.* INTO v_requirement FROM app.job_requirements q WHERE q.tenant_id=v_workspace AND q.job_version_id=p_job_version AND q.id=(v_item->>'requirementId')::uuid AND q.hard_gate
   AND EXISTS(SELECT 1 FROM app.requirement_atoms a WHERE a.tenant_id=q.tenant_id AND a.requirement_id=q.id AND a.polarity<>'not_required');
  IF v_requirement.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='GATE_ASSERTION_LINEAGE_MISMATCH'; END IF;
  IF v_item->>'state'='needs_verification' AND v_item->>'claimId' IS NULL THEN CONTINUE; END IF;
  v_claim:=(v_item->>'claimId')::uuid;
  IF v_claim IS NULL OR pg_catalog.length(COALESCE(v_item->>'reason','')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EXPLICIT_GATE_EVIDENCE_REQUIRED'; END IF;
  v_input_profile:=COALESCE(p_profile_version,v_cv.profile_version_id);v_scope:=CASE WHEN p_profile_version IS NOT NULL THEN 'profile' ELSE 'cv' END;
  SELECT * INTO v_atom FROM app.requirement_atoms WHERE tenant_id=v_workspace AND requirement_id=v_requirement.id AND polarity<>'not_required' ORDER BY ordinal LIMIT 1;
  INSERT INTO app.match_evidence(tenant_id,evidence_mapping_id,requirement_atom_id,claim_id,relation,strength,review_state,explanation,profile_version_id,job_version_id,cv_version_id,scope,match_class,fulfillment,evidence_role,gate_state)
  VALUES(v_workspace,v_mapping,v_atom.id,v_claim,'exact',0,'accepted',v_item->>'reason',v_input_profile,p_job_version,CASE WHEN v_scope='cv' THEN p_cv_version ELSE NULL END,v_scope,'not_evidenced',1,'eligibility',v_item->>'state');
 END LOOP;
 v_result:=app.calculate_scores(v_mapping,v_rules.id,p_profile_version IS NOT NULL,p_cv_version IS NOT NULL);
 INSERT INTO app.analysis_runs(tenant_id,profile_version_id,cv_version_id,job_version_id,evidence_mapping_id,rules_version_id,dictionary_version_id,normalizer_version_id,matcher_version_id,weights_version_id,date_bounds_version_id,input_fingerprint,as_of,state,candidate_fit,cv_match,eligibility,result_hash,explanation_locale,requirements_hash,input_bundle)
 VALUES(v_workspace,p_profile_version,p_cv_version,p_job_version,v_mapping,v_rules.id,(v_versions#>>'{dictionary,id}')::uuid,(v_versions#>>'{normalizer,id}')::uuid,(v_versions#>>'{matcher,id}')::uuid,(v_versions#>>'{weights,id}')::uuid,(v_versions#>>'{date_bounds,id}')::uuid,v_fingerprint,p_as_of,'succeeded',(v_result->>'candidateFit')::numeric,(v_result->>'cvMatch')::numeric,v_result->>'eligibility',app.hash_json(v_result),p_locale,v_requirements_hash,v_bundle) RETURNING id INTO v_analysis;
 FOR v_component IN SELECT * FROM pg_catalog.jsonb_array_elements(v_result->'components') LOOP
  INSERT INTO app.analysis_components(tenant_id,analysis_run_id,job_version_id,requirement_atom_id,component_key,category,effective_weight,denominator,contribution,explanation)
  VALUES(v_workspace,v_analysis,p_job_version,(v_component->>'atomId')::uuid,(v_component->>'scope')||':'||(v_component->>'requirementId'),v_component->>'category',
   (v_component->>'effectiveWeight')::numeric,(v_component->>'denominator')::numeric,(v_component->>'contribution')::numeric,
   pg_catalog.format('%s; %s; priority=%s; strength=%s',v_component->>'scope',v_component->>'keywordStatus',v_component->>'priority',v_component->>'strength'));
  IF v_component->>'scope'='cv' AND (v_component->>'strength')::numeric<1 THEN
   SELECT COALESCE((e->>'strength')::numeric,0) INTO v_profile_strength FROM pg_catalog.jsonb_array_elements(v_result->'components')e WHERE e->>'scope'='profile' AND e->>'requirementId'=v_component->>'requirementId';
   INSERT INTO app.recommendations(tenant_id,analysis_run_id,recommendation_kind,priority,action,limitations,estimated_delta)
   VALUES(v_workspace,v_analysis,CASE WHEN COALESCE(v_profile_strength,0)>(v_component->>'strength')::numeric THEN 'profile_present_cv_omitted' WHEN greatest(COALESCE(v_profile_strength,0),(v_component->>'strength')::numeric)>0 THEN 'insufficiently_demonstrated' ELSE 'not_supported_in_available_profile' END,1,
    pg_catalog.jsonb_build_object('type','review_evidence','needsConfirmation',COALESCE(v_profile_strength,0)=0,'createsFact',false),
    'Only evaluated confirmed evidence; missing evidence is not proof of inability. No estimated gain without a concrete supported comparison.',NULL) RETURNING id INTO v_recommendation;
   INSERT INTO app.recommendation_requirements(tenant_id,recommendation_id,job_requirement_id) VALUES(v_workspace,v_recommendation,(v_component->>'requirementId')::uuid);
   INSERT INTO app.recommendation_claims(tenant_id,recommendation_id,claim_id,support_role)
   SELECT DISTINCT v_workspace,v_recommendation,e.claim_id,'available_confirmed_support' FROM app.match_evidence e JOIN app.requirement_atoms a ON (a.tenant_id,a.id)=(e.tenant_id,e.requirement_atom_id)
   WHERE e.tenant_id=v_workspace AND e.evidence_mapping_id=v_mapping AND a.requirement_id=(v_component->>'requirementId')::uuid AND e.evidence_role='semantic' AND e.strength*e.fulfillment>0;
  END IF;
 END LOOP;
 PERFORM app.audit(v_workspace,'analysis.published','analysis',v_analysis);
 PERFORM app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('analysisId',v_analysis));
 RETURN app.get_analysis(v_analysis);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='EVIDENCE_BINDING_CONFLICT';
 WHEN check_violation OR foreign_key_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_ANALYSIS_GRAPH';
END $$;

CREATE FUNCTION app.publish_readiness(p_key uuid,p_profile_version uuid,p_cv_version uuid,p_job_version uuid,p_checks jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();r record;v_profile uuid;v_cv app.cv_versions;v_job app.job_versions;v_job_version uuid;v_has_application boolean;v_rubric uuid;v_check jsonb;v_category text;v_hash bytea;v_id uuid;v_result jsonb;
BEGIN
 SELECT * INTO r FROM app.begin_request(v_workspace,'publish_readiness',p_key,pg_catalog.jsonb_build_object('profileVersion',p_profile_version,'cvVersion',p_cv_version,'jobVersion',p_job_version,'checks',p_checks));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF p_profile_version IS NULL AND p_cv_version IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='READINESS_INPUT_REQUIRED'; END IF;
 IF p_profile_version IS NOT NULL THEN
  PERFORM app.assert_profile_usable(v_workspace,p_profile_version);
  SELECT profile_id INTO v_profile FROM app.profile_versions WHERE tenant_id=v_workspace AND id=p_profile_version;
 END IF;
 IF p_cv_version IS NOT NULL THEN
  SELECT * INTO v_cv FROM app.cv_versions WHERE tenant_id=v_workspace AND id=p_cv_version;
  IF v_cv.id IS NULL OR (v_profile IS NOT NULL AND v_profile<>v_cv.profile_id) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='READINESS_CV_LINEAGE_FORBIDDEN'; END IF;
  PERFORM app.assert_profile_usable(v_workspace,v_cv.profile_version_id);
 END IF;
 IF v_cv.job_version_id IS NOT NULL AND p_job_version IS NOT NULL AND p_job_version<>v_cv.job_version_id THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='READINESS_JOB_LINEAGE_MISMATCH'; END IF;
 v_job_version:=COALESCE(p_job_version,v_cv.job_version_id);
 SELECT * INTO v_job FROM app.job_versions WHERE tenant_id=v_workspace AND id=v_job_version;
 IF v_job_version IS NOT NULL AND v_job.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='READINESS_JOB_FORBIDDEN'; END IF;
 v_has_application:=EXISTS(SELECT 1 FROM app.applications a WHERE a.tenant_id=v_workspace AND a.job_id=v_job.job_id);
 IF p_checks IS NULL OR pg_catalog.jsonb_typeof(p_checks)<>'object' OR pg_catalog.octet_length(p_checks::text)>60000 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='QUALITATIVE_CHECKLIST_REQUIRED'; END IF;
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p_checks))<>5 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_checks)k WHERE k NOT IN ('content','structure','jobOptimization','writing','application')) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='QUALITATIVE_CATEGORIES_REQUIRED'; END IF;
 FOREACH v_category IN ARRAY ARRAY['content','structure','jobOptimization','writing','application'] LOOP
  v_check:=p_checks->v_category;
  IF pg_catalog.jsonb_typeof(v_check) IS DISTINCT FROM 'object' OR COALESCE(v_check->>'state','') NOT IN ('pass','needs_action','pending','not_applicable') OR
    EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(v_check)k WHERE k NOT IN ('state','reason','sourcePaths')) OR pg_catalog.length(COALESCE(v_check->>'reason',''))>2000 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_QUALITATIVE_CHECK'; END IF;
  IF v_check->>'state'='not_applicable' AND ((v_category='jobOptimization' AND v_job_version IS NOT NULL) OR (v_category='application' AND v_has_application) OR v_category NOT IN ('jobOptimization','application') OR pg_catalog.length(COALESCE(v_check->>'reason',''))=0) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='NOT_APPLICABLE_REQUIRES_TRUE_CONTEXT_ABSENCE'; END IF;
  IF v_check ? 'sourcePaths' THEN
   IF pg_catalog.jsonb_typeof(v_check->'sourcePaths')<>'array' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_CHECK_SOURCE_PATHS'; END IF;
   IF pg_catalog.jsonb_array_length(v_check->'sourcePaths')>50 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_check->'sourcePaths')p WHERE pg_catalog.jsonb_typeof(p)<>'string' OR pg_catalog.length(p#>>'{}')>200 OR p#>>'{}' NOT LIKE '/%') THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_CHECK_SOURCE_PATHS'; END IF;
  END IF;
 END LOOP;
 SELECT id INTO STRICT v_rubric FROM app.rule_versions WHERE rule_kind='readiness' AND version='qualitative-review-1.0';
 v_result:=pg_catalog.jsonb_build_object('categories',p_checks,'basis','User-reviewed checklist; not automated writing quality or hiring probability','context',pg_catalog.jsonb_build_object('jobVersionId',v_job_version,'hasApplication',v_has_application),'confirmationHash',pg_catalog.encode(app.confirmation_fingerprint(p_profile_version,p_cv_version),'hex'));
 v_hash:=app.hash_json(pg_catalog.jsonb_build_object('tenant',v_workspace,'profile',p_profile_version,'cv',p_cv_version,'job',v_job_version,'rubric',v_rubric,'result',v_result));
 INSERT INTO app.readiness_runs(tenant_id,profile_version_id,cv_version_id,job_version_id,rubric_version_id,checks,input_hash,result_hash)
 VALUES(v_workspace,p_profile_version,p_cv_version,v_job_version,v_rubric,v_result,v_hash,app.hash_json(v_result)) ON CONFLICT(tenant_id,input_hash) DO NOTHING RETURNING id INTO v_id;
 IF v_id IS NULL THEN SELECT id INTO v_id FROM app.readiness_runs WHERE tenant_id=v_workspace AND input_hash=v_hash; END IF;
 PERFORM app.audit(v_workspace,'readiness.reviewed','readiness',v_id);
 RETURN app.finish_request(v_workspace,r.request_id,pg_catalog.jsonb_build_object('readinessId',v_id,'rubricVersion','qualitative-review-1.0','checks',p_checks,'numericScore',NULL));
END $$;

CREATE FUNCTION app.validate_recommendation_lineage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run app.analysis_runs;v_claim uuid;v_requirement uuid;
BEGIN
 SELECT a.* INTO v_run FROM app.analysis_runs a JOIN app.recommendations r ON (r.tenant_id,r.analysis_run_id)=(a.tenant_id,a.id) WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.recommendation_id;
 IF TG_TABLE_NAME='recommendation_requirements' THEN
  v_requirement:=(pg_catalog.to_jsonb(NEW)->>'job_requirement_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM app.job_requirements q WHERE q.tenant_id=NEW.tenant_id AND q.id=v_requirement AND q.job_version_id=v_run.job_version_id) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='RECOMMENDATION_JOB_LINEAGE_MISMATCH'; END IF;
 ELSE
  v_claim:=(pg_catalog.to_jsonb(NEW)->>'claim_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM app.profile_version_claims pc WHERE pc.tenant_id=NEW.tenant_id AND pc.claim_id=v_claim AND
   (pc.profile_version_id=v_run.profile_version_id OR pc.profile_version_id=(SELECT profile_version_id FROM app.cv_versions WHERE tenant_id=NEW.tenant_id AND id=v_run.cv_version_id))) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='RECOMMENDATION_PROFILE_LINEAGE_MISMATCH'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recommendation_requirement_lineage BEFORE INSERT ON app.recommendation_requirements FOR EACH ROW EXECUTE FUNCTION app.validate_recommendation_lineage();
CREATE TRIGGER recommendation_claim_lineage BEFORE INSERT ON app.recommendation_claims FOR EACH ROW EXECUTE FUNCTION app.validate_recommendation_lineage();

CREATE FUNCTION app.protect_catalog() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IMMUTABLE_RULE_VERSION'; END $$;
CREATE TRIGGER immutable_catalog BEFORE UPDATE OR DELETE ON app.rule_versions FOR EACH ROW EXECUTE FUNCTION app.protect_catalog();
CREATE INDEX ix_match_evidence_calculation ON app.match_evidence(tenant_id,evidence_mapping_id,scope,evidence_role,requirement_atom_id);
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['evidence_mappings','match_evidence','analysis_runs','analysis_components','recommendations','readiness_runs','recommendation_requirements','recommendation_claims'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,anon,authenticated',table_name);
  EXECUTE format('CREATE POLICY member_read ON app.%I FOR SELECT TO authenticated USING(app.is_active_member(tenant_id))',table_name);
  EXECUTE format('GRANT SELECT ON app.%I TO authenticated',table_name);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.protect_immutable()',table_name);
 END LOOP;
END $$;
ALTER TABLE app.rule_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.rule_versions FROM PUBLIC,anon,authenticated;
CREATE POLICY published_catalog_read ON app.rule_versions FOR SELECT TO authenticated USING(true);
GRANT SELECT ON app.rule_versions TO authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.publish_analysis(uuid,uuid,uuid,uuid,jsonb,jsonb,date,text),app.get_analysis(uuid),
 app.publish_readiness(uuid,uuid,uuid,uuid,jsonb) TO authenticated;
