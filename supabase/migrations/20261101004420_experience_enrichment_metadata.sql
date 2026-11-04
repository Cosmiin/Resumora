-- Session-only enrichment data must never become part of a frozen job CV.
-- Preserve the existing projection, ownership rules, volatility, search_path and ACLs.
DO $migration$
DECLARE definition text; marker text := $$c:=c-'nameParts'-'importReview'-'questionPlans'-'roleRewriteReviews';$$;
BEGIN
 SELECT pg_get_functiondef('app.freeze_job_document(jsonb,jsonb)'::regprocedure) INTO definition;
 IF position(marker IN definition)=0 THEN
  RAISE EXCEPTION 'freeze_job_document changed; review metadata stripping before applying';
 END IF;
 EXECUTE replace(definition,marker,$$c:=c-'nameParts'-'importReview'-'questionPlans'-'roleRewriteReviews'-'importSkillChoices'-'experienceEnrichment';$$);
END $migration$;
