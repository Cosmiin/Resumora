-- Fence pending profile-linked draft writes across removal and recreation.
CREATE FUNCTION app.get_workspace_draft_context(p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); value jsonb; generation bigint;
BEGIN
 PERFORM 1 FROM app.tenants WHERE id=w FOR SHARE;
 value:=app.get_workspace_draft(p_kind,p_id);
 generation:=(app.load_base_state()->>'generation')::bigint;
 RETURN jsonb_build_object('draft',value,'generation',generation);
END $$;
ALTER FUNCTION app.save_workspace_draft(uuid,text,uuid,bigint,jsonb) RENAME TO save_workspace_draft_before_generation;
CREATE FUNCTION app.save_workspace_draft(p_key uuid,p_kind text,p_id uuid,p_revision bigint,p_value jsonb,p_generation bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid;
BEGIN
 PERFORM app.provision_workspace(p_key);w:=app.tenant_for_user();
 PERFORM 1 FROM app.tenants WHERE id=w FOR UPDATE;
 PERFORM app.assert_workspace_resource(p_kind,p_id);
 IF p_kind NOT IN ('intake','resume','job-review') AND
    (p_generation IS NULL OR p_generation IS DISTINCT FROM (app.load_base_state()->>'generation')::bigint)
 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='BASE_GENERATION_CONFLICT'; END IF;
 RETURN app.save_workspace_draft_before_generation(p_key,p_kind,p_id,p_revision,p_value);
END $$;
REVOKE ALL ON FUNCTION app.save_workspace_draft_before_generation(uuid,text,uuid,bigint,jsonb),app.get_workspace_draft_context(text,uuid),app.save_workspace_draft(uuid,text,uuid,bigint,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.get_workspace_draft_context(text,uuid),app.save_workspace_draft(uuid,text,uuid,bigint,jsonb,bigint) TO authenticated;
