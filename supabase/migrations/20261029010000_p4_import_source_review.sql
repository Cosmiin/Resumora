-- Authenticated original retrieval; existing private bucket RLS remains a second fence.
CREATE FUNCTION app.get_cv_import_source(p_source uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); s app.cv_import_sessions;
BEGIN
 SELECT * INTO s FROM app.cv_import_sessions
 WHERE tenant_id=w AND source_id=p_source AND state='ready' AND expires_at>transaction_timestamp();
 IF s.source_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 RETURN app.cv_import_json(s);
END $$;
REVOKE EXECUTE ON FUNCTION app.get_cv_import_source(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_cv_import_source(uuid) TO authenticated;
