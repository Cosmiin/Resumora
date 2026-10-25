-- P0 authorization and transactional request ledger. No async/provider work.
CREATE FUNCTION app.hash_json(value jsonb) RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT pg_catalog.sha256(pg_catalog.convert_to(value::text, 'UTF8'))
$$;

CREATE FUNCTION app.require_user() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id=actor) THEN
    RAISE EXCEPTION USING ERRCODE='PT401', MESSAGE='AUTHENTICATION_REQUIRED';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION app.is_active_member(workspace uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.tenant_memberships m JOIN app.tenants t ON t.id=m.tenant_id
    WHERE m.tenant_id=workspace AND m.user_id=auth.uid()
      AND m.state='active' AND m.role='owner' AND t.state='active'
  )
$$;

CREATE FUNCTION app.assert_tenant(workspace uuid, allow_deleting boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := app.require_user();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app.tenant_memberships m JOIN app.tenants t ON t.id=m.tenant_id
    WHERE m.tenant_id=workspace AND m.user_id=actor AND m.role='owner'
      AND m.state='active' AND (t.state='active' OR (allow_deleting AND t.state='deleting'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='RESOURCE_FORBIDDEN';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION app.tenant_for_user() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE workspace uuid;
BEGIN
  SELECT t.id INTO workspace FROM app.tenants t
    JOIN app.tenant_memberships m ON m.tenant_id=t.id
    WHERE t.owner_user_id=app.require_user() AND t.state='active'
      AND m.user_id=auth.uid() AND m.state='active' AND m.role='owner';
  IF workspace IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='PT403', MESSAGE='ACTIVE_WORKSPACE_REQUIRED';
  END IF;
  RETURN workspace;
END $$;

-- Internal-only helper. Its insert/lock/result share the caller's transaction.
CREATE FUNCTION app.begin_request(workspace uuid, command text, request_key uuid,
  body jsonb, allow_deleting boolean DEFAULT false)
RETURNS TABLE (request_id uuid, cached jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; principal text; fingerprint bytea; existing app.idempotency_requests;
BEGIN
  actor := app.assert_tenant(workspace,allow_deleting);
  IF request_key IS NULL OR request_key='00000000-0000-0000-0000-000000000000'::uuid
     OR body IS NULL OR pg_catalog.octet_length(body::text)>1048576 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='INVALID_COMMAND_ENVELOPE';
  END IF;
  principal := 'user:'||actor::text;
  fingerprint := app.hash_json(pg_catalog.jsonb_build_object('schemaVersion','1',
    'command',command,'tenant',workspace,'principal',principal,'body',body));
  INSERT INTO app.idempotency_requests
    (tenant_id,principal_key,command_kind,key_digest,request_hash,state,result_refs,
     expires_at,request_schema_version)
  VALUES (workspace,principal,command,pg_catalog.sha256(pg_catalog.uuid_send(request_key)),
    fingerprint,'in_progress','{}',pg_catalog.transaction_timestamp()+interval '7 days','1')
  ON CONFLICT (tenant_id,principal_key,command_kind,key_digest) DO NOTHING
  RETURNING id INTO request_id;
  IF request_id IS NOT NULL THEN
    cached := NULL;
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT r.* INTO STRICT existing FROM app.idempotency_requests r
    WHERE r.tenant_id=workspace AND r.principal_key=principal AND r.command_kind=command
      AND r.key_digest=pg_catalog.sha256(pg_catalog.uuid_send(request_key)) FOR UPDATE;
  IF existing.request_hash<>fingerprint THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='IDEMPOTENCY_BODY_MISMATCH';
  END IF;
  IF existing.expires_at<=pg_catalog.transaction_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='PT410', MESSAGE='REQUEST_EXPIRED_RECOVER_EXISTING_RESOURCE';
  END IF;
  IF existing.state NOT IN ('completed','accepted') THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='COMMAND_IN_PROGRESS';
  END IF;
  request_id := existing.id;
  cached := existing.result_refs;
  RETURN NEXT;
END $$;

CREATE FUNCTION app.finish_request(workspace uuid, request_id uuid, result jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE app.idempotency_requests SET state='completed',response_status=200,result_refs=result
    WHERE tenant_id=workspace AND id=request_id AND state='in_progress';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='REQUEST_STATE_CONFLICT';
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION app.audit(workspace uuid, action_name text, resource_type text,
  resource uuid, metadata jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO app.audit_events(tenant_id,actor_user_id,action,resource_kind,resource_id,safe_metadata)
    VALUES(workspace,app.require_user(),action_name,resource_type,resource,metadata);
END $$;

CREATE FUNCTION app.protect_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' AND pg_catalog.has_table_privilege(current_user,TG_RELID,'DELETE')
     AND EXISTS(SELECT 1 FROM app.tenants WHERE id=OLD.tenant_id AND state='deleting') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='IMMUTABLE_RECORD';
END $$;

CREATE FUNCTION app.provision_workspace(request_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := app.require_user(); workspace uuid; r record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resumora:provision:'||actor::text,0));
  SELECT id INTO workspace FROM app.tenants WHERE owner_user_id=actor AND kind='personal';
  IF workspace IS NULL THEN
    INSERT INTO app.tenants(owner_user_id,kind,state) VALUES(actor,'personal','active') RETURNING id INTO workspace;
    INSERT INTO app.tenant_memberships(tenant_id,user_id,role,state) VALUES(workspace,actor,'owner','active');
    INSERT INTO app.user_profiles(user_id,ui_locale,preferences) VALUES(actor,'ro','{}')
      ON CONFLICT(user_id) DO NOTHING;
  END IF;
  SELECT * INTO r FROM app.begin_request(workspace,'provision_workspace',request_key,'{}');
  IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
  PERFORM app.audit(workspace,'workspace.provisioned','tenant',workspace);
  RETURN app.finish_request(workspace,r.request_id,pg_catalog.jsonb_build_object('tenantId',workspace,'userId',actor));
END $$;

CREATE FUNCTION app.set_preferences(request_key uuid, ui_locale text, preferences jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE workspace uuid := app.tenant_for_user(); actor uuid := app.require_user(); r record;
BEGIN
  IF ui_locale NOT IN ('ro','en') OR pg_catalog.jsonb_typeof(preferences)<>'object'
    OR pg_catalog.octet_length(preferences::text)>16384 THEN
    RAISE EXCEPTION USING ERRCODE='PT400', MESSAGE='INVALID_PREFERENCES';
  END IF;
  SELECT * INTO r FROM app.begin_request(workspace,'set_preferences',request_key,
    pg_catalog.jsonb_build_object('uiLocale',ui_locale,'preferences',preferences));
  IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
  UPDATE app.user_profiles u SET ui_locale=set_preferences.ui_locale,
    preferences=set_preferences.preferences,updated_at=pg_catalog.transaction_timestamp() WHERE u.user_id=actor;
  PERFORM app.audit(workspace,'preferences.updated','user',actor);
  RETURN app.finish_request(workspace,r.request_id,pg_catalog.jsonb_build_object('userId',actor,'uiLocale',ui_locale));
END $$;

CREATE FUNCTION app.record_consent(request_key uuid, purpose text, policy_version text, decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE workspace uuid := app.tenant_for_user(); r record; event_id uuid;
BEGIN
  SELECT * INTO r FROM app.begin_request(workspace,'record_consent',request_key,
    pg_catalog.jsonb_build_object('purpose',purpose,'policyVersion',policy_version,'decision',decision));
  IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
  INSERT INTO app.consent_events(tenant_id,actor_user_id,purpose,policy_version,decision)
    VALUES(workspace,app.require_user(),purpose,policy_version,decision) RETURNING id INTO event_id;
  RETURN app.finish_request(workspace,r.request_id,pg_catalog.jsonb_build_object('consentEventId',event_id));
END $$;

CREATE FUNCTION app.request_deletion(request_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := app.require_user(); workspace uuid; generation bigint; r record; deletion_id uuid;
BEGIN
  SELECT id INTO workspace FROM app.tenants WHERE owner_user_id=actor AND state IN ('active','deleting') FOR UPDATE;
  SELECT * INTO r FROM app.begin_request(workspace,'request_deletion',request_key,'{"kind":"account"}',true);
  IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
  UPDATE app.tenants SET state='deleting',deletion_generation=deletion_generation+1 WHERE id=workspace RETURNING deletion_generation INTO generation;
  INSERT INTO app.deletion_requests(tenant_id,scope,state,checkpoint,tombstone_generation,request_id)
    VALUES(workspace,'{"kind":"account"}','requested','{}',generation,r.request_id) RETURNING id INTO deletion_id;
  RETURN app.finish_request(workspace,r.request_id,pg_catalog.jsonb_build_object('deletionRequestId',deletion_id,'state','requested'));
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenants','user_profiles','tenant_memberships','idempotency_requests','audit_events','consent_events','deletion_requests'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC, anon, authenticated',table_name);
  END LOOP;
END $$;
CREATE POLICY self_read ON app.user_profiles FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY membership_self_read ON app.tenant_memberships FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY owner_read ON app.tenants FOR SELECT TO authenticated USING(app.is_active_member(id));
CREATE POLICY member_read ON app.consent_events FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.user_profiles,app.tenant_memberships,app.tenants,app.consent_events TO authenticated;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.protect_immutable();
CREATE TRIGGER immutable_consent BEFORE UPDATE OR DELETE ON app.consent_events FOR EACH ROW EXECUTE FUNCTION app.protect_immutable();
-- PostgreSQL's global default PUBLIC EXECUTE is not overridden by a schema-only
-- default-privilege revoke. Explicitly revoke at every function migration boundary.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.is_active_member(uuid),app.provision_workspace(uuid),
 app.set_preferences(uuid,text,jsonb),app.record_consent(uuid,text,text,text),app.request_deletion(uuid) TO authenticated;
