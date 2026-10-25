-- P3 immutable rule inputs, explicit manual evidence scope and date-bound helper.

ALTER TABLE app.match_evidence ADD COLUMN evidence_role text NOT NULL DEFAULT 'semantic' CHECK(evidence_role IN ('semantic','eligibility'));

ALTER TABLE app.match_evidence ADD COLUMN gate_state text CHECK(gate_state IN ('supported','confirmed_unmet'));

ALTER TABLE app.match_evidence ADD CONSTRAINT ck_match_gate_role CHECK((evidence_role='semantic' AND gate_state IS NULL) OR (evidence_role='eligibility' AND gate_state IS NOT NULL AND strength=0));

ALTER TABLE app.match_evidence DROP CONSTRAINT uq_match_evidence_scope;

ALTER TABLE app.match_evidence ADD CONSTRAINT uq_match_evidence_role_scope UNIQUE(tenant_id,evidence_mapping_id,requirement_atom_id,claim_id,scope,evidence_role);

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:scoring:compatibility-1.1.0-db.1')::uuid,'scoring','compatibility-1.1.0-db.1',$config${"version": "compatibility-1.1.0-db.1", "weightProfile": "baseline-1.1", "weights": {"technical": 30, "responsibilities": 25, "experience": 15, "achievements": 10, "qualifications": 10, "professional": 5, "title": 5}, "priority": {"required": 3, "unspecified": 2, "preferred": 1}, "matchStrength": {"demonstrated": "1", "claimed_limited": ".75", "transferable": ".4", "not_evidenced": "0"}, "jobFamilyWeights": "future explicitly versioned override; not inferred per request", "frequencyBonus": false, "hardScoreCap": false, "readabilityIncluded": false, "sourceMethod": "compatibility-1.1.0", "calibrated": false, "authorizationGateOnly": true}$config$::jsonb,app.hash_json($config${"version": "compatibility-1.1.0-db.1", "weightProfile": "baseline-1.1", "weights": {"technical": 30, "responsibilities": 25, "experience": 15, "achievements": 10, "qualifications": 10, "professional": 5, "title": 5}, "priority": {"required": 3, "unspecified": 2, "preferred": 1}, "matchStrength": {"demonstrated": "1", "claimed_limited": ".75", "transferable": ".4", "not_evidenced": "0"}, "jobFamilyWeights": "future explicitly versioned override; not inferred per request", "frequencyBonus": false, "hardScoreCap": false, "readabilityIncluded": false, "sourceMethod": "compatibility-1.1.0", "calibrated": false, "authorizationGateOnly": true}$config$::jsonb));

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:weights:baseline-1.1')::uuid,'weights','baseline-1.1',$config${"weights": {"technical": 30, "responsibilities": 25, "experience": 15, "achievements": 10, "qualifications": 10, "professional": 5, "title": 5}, "calibrated": false}$config$::jsonb,app.hash_json($config${"weights": {"technical": 30, "responsibilities": 25, "experience": 15, "achievements": 10, "qualifications": 10, "professional": 5, "title": 5}, "calibrated": false}$config$::jsonb));

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:dictionary:reviewed-ro-en-1.0')::uuid,'dictionary','reviewed-ro-en-1.0',$config${"mode": "Human-reviewed RO/EN equivalence; no automatic dictionary or qualification recognition", "aliases": []}$config$::jsonb,app.hash_json($config${"mode": "Human-reviewed RO/EN equivalence; no automatic dictionary or qualification recognition", "aliases": []}$config$::jsonb));

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:normalizer:reviewed-requirements-1.0')::uuid,'normalizer','reviewed-requirements-1.0',$config${"mode": "reviewed flat AND/OR; stable requirement keys; no frequency bonus", "automaticNlp": false}$config$::jsonb,app.hash_json($config${"mode": "reviewed flat AND/OR; stable requirement keys; no frequency bonus", "automaticNlp": false}$config$::jsonb));

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:matcher:reviewed-evidence-1.0')::uuid,'matcher','reviewed-evidence-1.0',$config${"mode": "explicit reviewed claim/item bindings", "automaticNlp": false, "matchStrength": {"demonstrated": "1", "claimed_limited": ".75", "transferable": ".4", "not_evidenced": "0"}}$config$::jsonb,app.hash_json($config${"mode": "explicit reviewed claim/item bindings", "automaticNlp": false, "matchStrength": {"demonstrated": "1", "claimed_limited": ".75", "transferable": ".4", "not_evidenced": "0"}}$config$::jsonb));

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:date_bounds:elapsed-date-bounds-1.0')::uuid,'date_bounds','elapsed-date-bounds-1.0',$config${"mode": "earliest/latest stated-date bounds; union overlaps before completed months", "source": "research/architecture/duration_bounds_v1.py"}$config$::jsonb,app.hash_json($config${"mode": "earliest/latest stated-date bounds; union overlaps before completed months", "source": "research/architecture/duration_bounds_v1.py"}$config$::jsonb));

INSERT INTO app.rule_versions(id,rule_kind,version,config,content_hash) VALUES(md5('resumora.rule:readiness:qualitative-review-1.0')::uuid,'readiness','qualitative-review-1.0',$config${"categories": ["content", "structure", "jobOptimization", "writing", "application"], "states": ["pass", "needs_action", "pending", "not_applicable"], "numericScore": false, "basis": "user-reviewed checklist, not AI quality or hiring probability"}$config$::jsonb,app.hash_json($config${"categories": ["content", "structure", "jobOptimization", "writing", "application"], "states": ["pass", "needs_action", "pending", "not_applicable"], "numericScore": false, "basis": "user-reviewed checklist, not AI quality or hiring probability"}$config$::jsonb));

CREATE FUNCTION app.whole_months(p_start date,p_end date) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
 SELECT greatest(0,(extract(year FROM p_end)::integer-extract(year FROM p_start)::integer)*12+
  extract(month FROM p_end)::integer-extract(month FROM p_start)::integer-
  CASE WHEN extract(day FROM p_end)<extract(day FROM p_start) THEN 1 ELSE 0 END)
$$;

CREATE FUNCTION app.union_elapsed_months(p_intervals jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
 WITH spans AS(SELECT (e->>'start')::date s,(e->>'end')::date e FROM pg_catalog.jsonb_array_elements(p_intervals)e),
 valid AS(SELECT s,e FROM spans WHERE e>=s),
 previous AS(SELECT s,e,max(e) OVER(ORDER BY s,e ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) previous_end FROM valid),
 islands AS(SELECT s,e,sum(CASE WHEN previous_end IS NULL OR s>previous_end THEN 1 ELSE 0 END) OVER(ORDER BY s,e) g FROM previous),
 merged AS(SELECT min(s) s,max(e) e FROM islands GROUP BY g)
 SELECT COALESCE(sum(app.whole_months(s,e)),0)::integer FROM merged
$$;

CREATE FUNCTION app.calculate_duration(p_roles jsonb,p_as_of date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE r jsonb;s jsonb;e jsonb;s_low date;s_high date;e_low date;e_high date;lo integer;hi integer;
 low_intervals jsonb:='[]';high_intervals jsonb:='[]';per_role jsonb:='[]';unknown_roles jsonb:='[]';
BEGIN
 IF p_roles IS NULL OR pg_catalog.jsonb_typeof(p_roles)<>'array' OR pg_catalog.jsonb_array_length(p_roles)>1000 OR p_as_of IS NULL OR extract(year FROM p_as_of) NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_DURATION_CONTEXT'; END IF;
 FOR r IN SELECT * FROM pg_catalog.jsonb_array_elements(p_roles) LOOP
  s:=r->'start';e:=CASE WHEN (r->>'ongoing')::boolean THEN pg_catalog.jsonb_build_object('year',extract(year FROM p_as_of),'month',extract(month FROM p_as_of)) ELSE r->'end' END;
  IF s IS NULL OR s='null'::jsonb OR (NOT (r->>'ongoing')::boolean AND (e IS NULL OR e='null'::jsonb)) THEN
   unknown_roles:=unknown_roles||pg_catalog.jsonb_build_array(r->'id');CONTINUE;
  END IF;
  s_low:=pg_catalog.make_date((s->>'year')::integer,COALESCE((s->>'month')::integer,1),1);
  s_high:=CASE WHEN s ? 'month' THEN (s_low+interval '1 month - 1 day')::date ELSE pg_catalog.make_date((s->>'year')::integer,12,31) END;
  IF (r->>'ongoing')::boolean THEN e_low:=p_as_of;e_high:=p_as_of;
  ELSE
   e_low:=pg_catalog.make_date((e->>'year')::integer,COALESCE((e->>'month')::integer,1),1);
   e_high:=CASE WHEN e ? 'month' THEN (e_low+interval '1 month - 1 day')::date ELSE pg_catalog.make_date((e->>'year')::integer,12,31) END;
   e_low:=least(e_low,p_as_of);e_high:=least(e_high,p_as_of);
  END IF;
  IF e_high<s_low THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='IMPOSSIBLE_DATE_CHRONOLOGY_AS_OF'; END IF;
  lo:=app.whole_months(s_high,e_low);hi:=app.whole_months(s_low,e_high);
  low_intervals:=low_intervals||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('start',s_high,'end',e_low));
  high_intervals:=high_intervals||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('start',s_low,'end',e_high));
  per_role:=per_role||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',r->'id','lowerWholeMonths',lo,'upperWholeMonths',hi,'lowerDisplay',pg_catalog.jsonb_build_object('years',lo/12,'months',lo%12),'upperDisplay',pg_catalog.jsonb_build_object('years',hi/12,'months',hi%12),'label','Estimated completed elapsed months from stated precision; partial days omitted'));
 END LOOP;
 lo:=app.union_elapsed_months(low_intervals);hi:=app.union_elapsed_months(high_intervals);
 RETURN pg_catalog.jsonb_build_object('version','elapsed-date-bounds-1.0','asOf',p_as_of,'lowerWholeMonths',lo,'upperWholeMonths',hi,
  'lowerDisplay',pg_catalog.jsonb_build_object('years',lo/12,'months',lo%12),'upperDisplay',pg_catalog.jsonb_build_object('years',hi/12,'months',hi%12),
  'perRole',per_role,'unknownRoleIds',unknown_roles,'convention','Analytical earliest/latest day bounds are not persisted factual dates; union overlaps before completed months; partial days omitted','protectedCharacteristicsUsed',false);
END $$;

CREATE FUNCTION app.duration_bounds(p_profile_version uuid,p_as_of date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_workspace uuid:=app.tenant_for_user();v_cv jsonb;v_roles jsonb;
BEGIN
 PERFORM app.assert_profile_usable(v_workspace,p_profile_version);
 SELECT canonical_json INTO v_cv FROM app.profile_versions WHERE tenant_id=v_workspace AND id=p_profile_version;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',e->'id','start',
  (SELECT c->'value' FROM pg_catalog.jsonb_array_elements(v_cv->'claims')c WHERE c->>'id'=e->>'startClaimId'),'end',
  (SELECT c->'value' FROM pg_catalog.jsonb_array_elements(v_cv->'claims')c WHERE c->>'id'=e->>'endClaimId'),'ongoing',e->'ongoing')),'[]')
 INTO v_roles FROM pg_catalog.jsonb_array_elements(v_cv#>'{facts,employment}')e;
 RETURN app.calculate_duration(v_roles,p_as_of);
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app.duration_bounds(uuid,date) TO authenticated;
