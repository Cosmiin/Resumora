-- Keep frozen job copies self-contained. Only explicitly selected reserves
-- become visible skills; pending AI work and remaining inventory stay in Base.
-- Replace the existing body without changing ownership, ACLs or search_path.
DO $migration$
DECLARE definition text;
  metadata text := $$c:=c-'nameParts'-'importReview'-'questionPlans'-'roleRewriteReviews'-'importSkillChoices'-'experienceEnrichment';$$;
  groups_marker text := $$groups:=coalesce(c->group_name,'[]');$$;
BEGIN
  SELECT pg_get_functiondef('app.freeze_job_document(jsonb,jsonb)'::regprocedure) INTO definition;
  IF position(metadata IN definition)=0 OR position(groups_marker IN definition)=0 THEN
    RAISE EXCEPTION 'freeze_job_document changed; review skills inventory projection before applying';
  END IF;
  definition:=replace(definition,metadata,$$c:=c-'nameParts'-'importReview'-'questionPlans'-'roleRewriteReviews'-'importSkillChoices'-'experienceEnrichment'-'skillReserves'-'skillReview'-'skillExclusions';$$);
  definition:=replace(definition,groups_marker,$replacement$
    groups:=coalesce(c->group_name,'[]');
    IF p#>ARRAY['presentation',key] IS NOT NULL THEN
      groups:=groups||coalesce(c#>ARRAY['skillReserves',group_name],'[]');
    END IF;
  $replacement$);
  EXECUTE definition;
END $migration$;
