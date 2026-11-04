-- Metadata discovery is account-scoped and independent of browser URL/storage.
-- Only a committed review publication closes the pending-review receipt.
CREATE FUNCTION app.get_pending_cv_import() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions
 WHERE tenant_id=w AND state='ready' AND review IS NOT NULL
 AND expires_at>transaction_timestamp() AND review_decisions='[]'::jsonb
 ORDER BY created_at DESC,source_id DESC LIMIT 1;
 IF s.source_id IS NULL THEN RETURN NULL; END IF;
 RETURN (app.cv_import_json(s)-'review')||jsonb_build_object('review',NULL);
END $$;
REVOKE ALL ON FUNCTION app.get_pending_cv_import() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_pending_cv_import() TO authenticated;
