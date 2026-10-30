-- Supabase Storage authorizes uploads as the caller, then writes object metadata
-- as service_role. That completion may have no end-user JWT subject. Keep the
-- same tenant lock and live source reservation fence for BOTH phases.
-- No grants, policies, bucket visibility, data, or existing history are changed.
CREATE OR REPLACE FUNCTION app.fence_base_source_upload() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; actor uuid; owner_text text; allowed boolean;
BEGIN
 IF NEW.bucket_id NOT IN ('cv-imports','cv-photos') THEN RETURN NEW; END IF;
 actor:=auth.uid();
 IF actor IS NOT NULL THEN
  w:=app.tenant_for_user();
  PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;PERFORM app.assert_tenant(w);
  allowed:=CASE NEW.bucket_id WHEN 'cv-imports' THEN app.can_access_cv_import_object(NEW.name,true)
    ELSE app.photo_storage_access(NEW.name,'insert') END;
 ELSE
  -- Read the actual database role, not a caller-set JWT/GUC role claim. Only a
  -- connection already authorized to assume Supabase's service_role can enter.
  IF coalesce(current_setting('role',true),'')<>'service_role' OR
     NOT pg_has_role(session_user,'service_role','MEMBER') THEN
   RAISE EXCEPTION USING ERRCODE='PT401',MESSAGE='AUTHENTICATION_REQUIRED';
  END IF;
  owner_text:=coalesce(to_jsonb(NEW)->>'owner_id',to_jsonb(NEW)->>'owner');
  IF owner_text IS NULL OR owner_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
   RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';
  END IF;
  actor:=owner_text::uuid;
  SELECT t.id INTO w FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id
   WHERE t.owner_user_id=actor AND t.kind='personal' AND t.state='active'
    AND m.user_id=actor AND m.role='owner' AND m.state='active' FOR UPDATE OF t;
  IF w IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';END IF;
  -- The service's owner field is not enough: the exact path must still have a
  -- live owned reservation after taking the SAME lock as Remove Base. Removal
  -- deletes these reservations, so a late completion cannot resurrect a source.
  IF NEW.bucket_id='cv-imports' THEN
   SELECT EXISTS(SELECT 1 FROM app.source_documents d JOIN app.cv_import_sessions s
    ON (s.tenant_id,s.source_id)=(d.tenant_id,d.id)
    WHERE d.tenant_id=w AND d.bucket='cv-imports' AND d.object_key=NEW.name
     AND s.state='uploading' AND s.expires_at>transaction_timestamp()) INTO allowed;
  ELSE
   SELECT EXISTS(SELECT 1 FROM app.photo_assets p WHERE p.tenant_id=w
    AND p.object_key=NEW.name AND p.state='reserved') INTO allowed;
  END IF;
 END IF;
 IF allowed IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';
 END IF;
 RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION app.fence_base_source_upload() FROM PUBLIC,anon,authenticated;
