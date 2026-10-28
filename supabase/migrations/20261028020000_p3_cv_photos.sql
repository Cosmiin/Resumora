-- Additive only. Prepared for explicit target review; never configures a secret.
CREATE TABLE app.photo_worker_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 secret_hash bytea NOT NULL CHECK(octet_length(secret_hash)=32)
);
REVOKE ALL ON app.photo_worker_config FROM PUBLIC,anon,authenticated;
ALTER TABLE app.photo_worker_config ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION app.require_photo_worker(secret text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF secret IS NULL OR length(secret)<32 OR NOT EXISTS(SELECT 1 FROM app.photo_worker_config
  WHERE secret_hash=pg_catalog.sha256(pg_catalog.convert_to(secret,'UTF8'))) THEN
  RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='RESOURCE_FORBIDDEN';
 END IF;
END $$;
CREATE TABLE app.photo_assets (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE RESTRICT,
 object_key text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 width integer NOT NULL CHECK(width BETWEEN 256 AND 1600),
 height integer NOT NULL CHECK(height BETWEEN 256 AND 1600),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 normalization_version text NOT NULL DEFAULT 'rgb-jpeg-1' CHECK(normalization_version='rgb-jpeg-1'),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','ready','purge_pending','purged')),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),deleted_at timestamptz,
 UNIQUE(tenant_id,id), CHECK(object_key=tenant_id::text||'/'||id::text||'.jpg')
);
ALTER TABLE app.photo_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.photo_assets FROM PUBLIC,anon,authenticated;
CREATE POLICY photo_owner_read ON app.photo_assets FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.photo_assets TO authenticated;
CREATE TABLE app.editor_photo_references (
 tenant_id uuid NOT NULL, snapshot_id uuid NOT NULL, asset_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,snapshot_id),
 FOREIGN KEY(tenant_id,snapshot_id) REFERENCES app.editor_draft_snapshots(tenant_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(tenant_id,asset_id) REFERENCES app.photo_assets(tenant_id,id) ON DELETE RESTRICT
);
ALTER TABLE app.editor_photo_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.editor_photo_references FROM PUBLIC,anon,authenticated;
CREATE POLICY photo_ref_owner ON app.editor_photo_references FOR SELECT TO authenticated USING(app.is_active_member(tenant_id));
GRANT SELECT ON app.editor_photo_references TO authenticated;
CREATE FUNCTION app.photo_manifest(p app.photo_assets) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT pg_catalog.jsonb_build_object(
 'id',p.id,'objectKey',p.object_key,'sha256',p.sha256,'width',p.width,'height',p.height,'byteSize',p.byte_size,'state',p.state) $$;
CREATE FUNCTION app.reserve_photo(p_id uuid,p_sha256 text,p_width integer,p_height integer,p_bytes integer,p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE workspace uuid; row app.photo_assets;
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 PERFORM app.provision_workspace(p_id); workspace:=app.tenant_for_user();
 INSERT INTO app.photo_assets(id,tenant_id,object_key,sha256,width,height,byte_size)
 VALUES(p_id,workspace,workspace::text||'/'||p_id::text||'.jpg',p_sha256,p_width,p_height,p_bytes)
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id FOR UPDATE;
 IF row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 IF row.sha256 IS DISTINCT FROM p_sha256 OR row.width IS DISTINCT FROM p_width OR row.height IS DISTINCT FROM p_height OR row.byte_size IS DISTINCT FROM p_bytes THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN app.photo_manifest(row);
END $$;
CREATE FUNCTION app.finish_photo(p_id uuid,p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row app.photo_assets; workspace uuid:=app.tenant_for_user();
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id FOR UPDATE;
 IF row.id IS NULL OR row.state NOT IN ('reserved','ready') THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 UPDATE app.photo_assets SET state='ready' WHERE id=row.id RETURNING * INTO row;
 RETURN app.photo_manifest(row);
END $$;
CREATE FUNCTION app.read_photo(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE row app.photo_assets; workspace uuid:=app.tenant_for_user();
BEGIN
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id AND state='ready';
 IF row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 RETURN app.photo_manifest(row);
END $$;
CREATE FUNCTION app.delete_photo(p_id uuid,p_complete boolean,p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row app.photo_assets; workspace uuid:=app.tenant_for_user();
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 SELECT * INTO row FROM app.photo_assets WHERE tenant_id=workspace AND id=p_id FOR UPDATE;
 IF row.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='PHOTO_NOT_FOUND'; END IF;
 IF p_complete AND row.state NOT IN ('purge_pending','purged') THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='PHOTO_DELETE_FENCE'; END IF;
 UPDATE app.photo_assets SET state=CASE WHEN p_complete OR state='purged' THEN 'purged' ELSE 'purge_pending' END,
  deleted_at=coalesce(deleted_at,transaction_timestamp()) WHERE id=row.id RETURNING * INTO row;
 RETURN app.photo_manifest(row);
END $$;
-- Runs for save AND restore. Row locks serialize attachment against deletion.
CREATE FUNCTION app.attach_editor_photo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb:=NEW.payload#>'{content,presentation,photo}'; a app.photo_assets; c jsonb;
BEGIN
 IF p IS NULL OR p='null'::jsonb THEN RETURN NEW; END IF;
 IF jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PHOTO'; END IF;
 c:=p->'crop';
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PHOTO'; END IF;
 IF NOT(p ?& ARRAY['assetId','crop','shape','visible']) OR NOT(c ?& ARRAY['version','centerX','centerY','zoom'])
  OR jsonb_typeof(p)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>4
  OR p->>'assetId' !~ '^[0-9a-fA-F-]{36}$' OR p->>'shape' NOT IN ('circle','square')
  OR jsonb_typeof(p->'visible') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(c))<>4
  OR c->>'version' IS DISTINCT FROM '1'
  OR jsonb_typeof(c->'centerX') IS DISTINCT FROM 'number' OR jsonb_typeof(c->'centerY') IS DISTINCT FROM 'number'
  OR jsonb_typeof(c->'zoom') IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PHOTO'; END IF;
 IF (c->>'centerX')::numeric NOT BETWEEN 0 AND 1 OR (c->>'centerY')::numeric NOT BETWEEN 0 AND 1 OR (c->>'zoom')::numeric NOT BETWEEN 1 AND 3 THEN
  RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_PHOTO'; END IF;
 SELECT * INTO a FROM app.photo_assets WHERE tenant_id=NEW.tenant_id AND id=(p->>'assetId')::uuid FOR UPDATE;
 IF a.id IS NULL OR a.state<>'ready' THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='PHOTO_NOT_AVAILABLE'; END IF;
 INSERT INTO app.editor_photo_references(tenant_id,snapshot_id,asset_id) VALUES(NEW.tenant_id,NEW.id,a.id);
 RETURN NEW;
END $$;
CREATE TRIGGER attach_photo AFTER INSERT ON app.editor_draft_snapshots FOR EACH ROW EXECUTE FUNCTION app.attach_editor_photo();
-- Storage checks exact manifest ownership/state. No UPDATE/upsert policy: bytes
-- cannot be changed after the trusted Worker verifies their checksum and finalizes.
CREATE FUNCTION app.photo_storage_access(object_name text, operation text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(
 SELECT 1 FROM app.photo_assets p WHERE p.object_key=object_name AND app.is_active_member(p.tenant_id)
 AND CASE operation WHEN 'read' THEN p.state IN ('reserved','ready') WHEN 'insert' THEN p.state='reserved'
 WHEN 'delete' THEN p.state IN ('purge_pending','purged') ELSE false END) $$;
-- Plain isolated SQL fixtures have no Storage service. Hosted Supabase does.
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL THEN
  IF to_regprocedure('storage.allow_only_operation(text)') IS NULL THEN RAISE EXCEPTION 'Storage operation-aware helper required; review target version before apply'; END IF;
  INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('cv-photos','cv-photos',false,10485760,ARRAY['image/jpeg']) ON CONFLICT(id) DO NOTHING;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='cv-photos' AND (public OR file_size_limit IS DISTINCT FROM 10485760 OR allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg'])) THEN
   RAISE EXCEPTION 'Existing cv-photos bucket configuration conflicts; review required'; END IF;
  EXECUTE 'CREATE POLICY cv_photo_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id=''cv-photos'' AND ((storage.allow_only_operation(''storage.object.get_authenticated'') AND app.photo_storage_access(name,''read'')) OR (storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete''))))';
  EXECUTE 'CREATE POLICY cv_photo_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id=''cv-photos'' AND storage.allow_only_operation(''storage.object.upload'') AND app.photo_storage_access(name,''insert''))';
  EXECUTE 'CREATE POLICY cv_photo_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id=''cv-photos'' AND storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete''))';
  -- Restrictive guards prevent broad pre-existing bucket policies from granting
  -- signed URLs, upserts or downloads after logical deletion for this bucket.
  EXECUTE 'CREATE POLICY cv_photo_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated,anon USING(bucket_id<>''cv-photos'' OR (auth.uid() IS NOT NULL AND ((storage.allow_only_operation(''storage.object.get_authenticated'') AND app.photo_storage_access(name,''read'')) OR (storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete'')))))';
  EXECUTE 'CREATE POLICY cv_photo_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated,anon WITH CHECK(bucket_id<>''cv-photos'' OR (auth.uid() IS NOT NULL AND storage.allow_only_operation(''storage.object.upload'') AND app.photo_storage_access(name,''insert'')))';
  EXECUTE 'CREATE POLICY cv_photo_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated,anon USING(bucket_id<>''cv-photos'') WITH CHECK(bucket_id<>''cv-photos'')';
  EXECUTE 'CREATE POLICY cv_photo_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated,anon USING(bucket_id<>''cv-photos'' OR (auth.uid() IS NOT NULL AND storage.allow_only_operation(''storage.object.delete_many'') AND app.photo_storage_access(name,''delete'')))';
 END IF;
END $$;
REVOKE EXECUTE ON FUNCTION app.require_photo_worker(text),app.photo_manifest(app.photo_assets),app.attach_editor_photo(),
 app.reserve_photo(uuid,text,integer,integer,integer,text),app.finish_photo(uuid,text),app.read_photo(uuid),app.delete_photo(uuid,boolean,text),app.photo_storage_access(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.reserve_photo(uuid,text,integer,integer,integer,text),app.finish_photo(uuid,text),app.read_photo(uuid),app.delete_photo(uuid,boolean,text),app.photo_storage_access(text,text) TO authenticated;

-- Authenticated maintenance hook; no remote scheduler or credentials installed.
CREATE FUNCTION app.expire_photo_uploads(p_worker_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE workspace uuid:=app.tenant_for_user(); row app.photo_assets; result jsonb:='[]'::jsonb;
BEGIN
 PERFORM app.require_photo_worker(p_worker_secret);
 FOR row IN SELECT p.* FROM app.photo_assets p WHERE p.tenant_id=workspace AND
  (p.state='purge_pending' OR (p.state IN ('reserved','ready') AND p.created_at<transaction_timestamp()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM app.editor_photo_references r WHERE r.tenant_id=p.tenant_id AND r.asset_id=p.id)))
  ORDER BY p.created_at LIMIT 10 FOR UPDATE SKIP LOCKED
 LOOP
  UPDATE app.photo_assets SET state='purge_pending',deleted_at=coalesce(deleted_at,transaction_timestamp()) WHERE id=row.id;
  result:=result||jsonb_build_array(app.photo_manifest(row));
 END LOOP;
 RETURN result;
END $$;
REVOKE EXECUTE ON FUNCTION app.expire_photo_uploads(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app.expire_photo_uploads(text) TO authenticated;
