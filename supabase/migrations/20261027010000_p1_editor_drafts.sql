-- Independent unconfirmed editor snapshots: canonical profile draft revisions and
-- payloads are coupled to publication, so cannot safely store editor history.
-- One focused immutable table; 1MiB applies per payload, never lifetime history.
CREATE TABLE app.editor_draft_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
 revision bigint NOT NULL CHECK (revision>0),
 parent_id uuid,
 restored_from uuid,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 reason text NOT NULL CHECK (reason IN ('save','autosave','restore')),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1048576),
 request_id uuid NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,revision),
 FOREIGN KEY(tenant_id,parent_id) REFERENCES app.editor_draft_snapshots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,restored_from) REFERENCES app.editor_draft_snapshots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,request_id) REFERENCES app.idempotency_requests(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.editor_draft_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.editor_draft_snapshots FROM PUBLIC,anon,authenticated;
CREATE POLICY owner_read ON app.editor_draft_snapshots FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.editor_draft_snapshots TO authenticated;
CREATE TRIGGER immutable_editor_snapshot BEFORE UPDATE OR DELETE ON app.editor_draft_snapshots
 FOR EACH ROW EXECUTE FUNCTION app.protect_immutable();

CREATE FUNCTION app.editor_snapshot_json(s app.editor_draft_snapshots) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
   'id',s.id,'revision',s.revision,'restoredFrom',s.restored_from,'createdAt',s.created_at,'reason',s.reason))
   ||pg_catalog.jsonb_build_object('parentId',s.parent_id,'payload',s.payload)
$$;
CREATE FUNCTION app.load_base_draft() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := app.require_user(); result jsonb;
BEGIN
 SELECT app.editor_snapshot_json(s) INTO result FROM app.editor_draft_snapshots s
 WHERE app.is_active_member(s.tenant_id) ORDER BY s.revision DESC LIMIT 1;
 RETURN result;
END $$;
-- Cursor is an exclusive revision, not an account identifier. Empty means newest.
CREATE FUNCTION app.base_draft_history(p_before_revision bigint DEFAULT NULL,p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := app.require_user(); result jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>20 OR p_before_revision<=0 THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(app.editor_snapshot_json(s) ORDER BY s.revision DESC),'[]'::jsonb) INTO result
 FROM (SELECT * FROM app.editor_draft_snapshots s WHERE app.is_active_member(s.tenant_id)
   AND (p_before_revision IS NULL OR s.revision<p_before_revision) ORDER BY s.revision DESC LIMIT p_limit) s;
 RETURN result;
END $$;

CREATE FUNCTION app.write_base_draft(p_key uuid,p_expected_revision bigint,p_payload jsonb,p_mode text,p_snapshot uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE workspace uuid; head app.editor_draft_snapshots; saved app.editor_draft_snapshots; r record; old jsonb;
 command text := CASE WHEN p_snapshot IS NULL THEN 'save_base_draft' ELSE 'restore_base_draft' END;
BEGIN
 IF p_snapshot IS NULL THEN PERFORM app.provision_workspace(p_key); END IF;
 workspace := app.tenant_for_user();
 SELECT * INTO r FROM app.begin_request(workspace,command,p_key,pg_catalog.jsonb_build_object(
   'revision',p_expected_revision,'payload',p_payload,'mode',p_mode,'snapshot',p_snapshot));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('resumora:editor:'||workspace::text,0));
 SELECT * INTO head FROM app.editor_draft_snapshots WHERE tenant_id=workspace ORDER BY revision DESC LIMIT 1;
 IF coalesce(head.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_snapshot IS NOT NULL THEN
   SELECT payload INTO old FROM app.editor_draft_snapshots WHERE tenant_id=workspace AND id=p_snapshot;
   IF old IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
   p_payload := old;
 END IF;
 IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload)<>'object'
   OR p_payload->>'schemaVersion' IS DISTINCT FROM 'resumora-editor-draft/1'
   OR pg_catalog.jsonb_typeof(p_payload->'content') IS DISTINCT FROM 'object'
   OR pg_catalog.jsonb_typeof(p_payload->'answers') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_EDITOR_PAYLOAD';
 END IF;
 IF pg_catalog.octet_length(p_payload::text)>1048576 THEN
   RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='INVALID_COMMAND_ENVELOPE';
 END IF;
 INSERT INTO app.editor_draft_snapshots(tenant_id,revision,parent_id,restored_from,reason,payload,request_id)
 VALUES(workspace,coalesce(head.revision,0)+1,head.id,p_snapshot,
   CASE p_mode WHEN 'checkpoint' THEN 'save' ELSE p_mode END,p_payload,r.request_id) RETURNING * INTO saved;
 PERFORM app.audit(workspace,'editor.'||p_mode,'editor_snapshot',saved.id);
 RETURN app.finish_request(workspace,r.request_id,app.editor_snapshot_json(saved));
END $$;
CREATE FUNCTION app.save_base_draft(p_key uuid,p_expected_revision bigint,p_payload jsonb,p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_mode IS NULL OR p_mode NOT IN ('autosave','checkpoint') THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE';
 END IF;
 RETURN app.write_base_draft(p_key,p_expected_revision,p_payload,p_mode,NULL);
END $$;
CREATE FUNCTION app.restore_base_draft(p_key uuid,p_expected_revision bigint,p_snapshot uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 RETURN app.write_base_draft(p_key,p_expected_revision,NULL,'restore',p_snapshot);
END $$;
REVOKE EXECUTE ON FUNCTION app.editor_snapshot_json(app.editor_draft_snapshots),
 app.write_base_draft(uuid,bigint,jsonb,text,uuid),app.load_base_draft(),app.base_draft_history(bigint,integer),
 app.save_base_draft(uuid,bigint,jsonb,text),app.restore_base_draft(uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.load_base_draft(),app.base_draft_history(bigint,integer),
 app.save_base_draft(uuid,bigint,jsonb,text),app.restore_base_draft(uuid,bigint,uuid) TO authenticated;
