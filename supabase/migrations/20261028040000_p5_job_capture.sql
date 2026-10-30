-- Forward review artifact ONLY. No hosted apply or secret provisioning authorized.
ALTER TABLE app.target_job_contexts ALTER COLUMN snapshot_id DROP NOT NULL;
ALTER TABLE app.target_job_contexts ALTER COLUMN snapshot_revision DROP NOT NULL;
ALTER TABLE app.target_job_contexts ADD CONSTRAINT capture_base_pair CHECK ((snapshot_id IS NULL)=(snapshot_revision IS NULL));

CREATE TABLE app.capture_worker_authorization(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), secret_hash bytea NOT NULL);
CREATE TABLE app.capture_session_fences(session_hash text PRIMARY KEY CHECK(session_hash ~ '^[0-9a-f]{64}$'));
CREATE TABLE app.capture_connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), extension_id text NOT NULL CHECK(extension_id ~ '^[a-p]{32}$'),
 device_id uuid NOT NULL, session_hash text NOT NULL CHECK(session_hash ~ '^[0-9a-f]{64}$'),
 challenge text NOT NULL CHECK(challenge ~ '^[A-Za-z0-9_-]{43}$'), code_hash text UNIQUE,
 code_until timestamptz NOT NULL DEFAULT transaction_timestamp()+interval '120 seconds',
 connection_hash text UNIQUE, token_hash text UNIQUE, token_until timestamptz,
 expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE app.capture_operations(
 user_id uuid NOT NULL REFERENCES auth.users(id), request_id uuid NOT NULL,
 tenant_id uuid NOT NULL REFERENCES app.tenants(id), job_id uuid NOT NULL,
 body_hash bytea NOT NULL, state text NOT NULL DEFAULT 'received' CHECK(state IN ('received','processing','ready','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), lease uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(user_id,request_id), FOREIGN KEY(tenant_id,job_id) REFERENCES app.jobs(tenant_id,id)
);
CREATE INDEX capture_pending ON app.capture_operations(state,created_at);
ALTER TABLE app.capture_worker_authorization ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.capture_session_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.capture_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.capture_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.capture_worker_authorization,app.capture_session_fences,app.capture_connections,app.capture_operations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app.require_capture_worker(p_secret text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_secret IS NULL OR length(p_secret)<32 OR NOT EXISTS(SELECT 1 FROM app.capture_worker_authorization
 WHERE secret_hash=pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8'))) THEN
 RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='CAPTURE_FORBIDDEN'; END IF;
END $$;

-- Only existing authenticated login may bind an owner. No user/tenant argument exists.
CREATE FUNCTION app.authorize_capture(p_secret text,p_extension text,p_device uuid,p_session text,p_challenge text,p_code text,p_until timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; actor uuid:=app.require_user();
BEGIN
 PERFORM app.require_capture_worker(p_secret);
 IF p_extension IS NULL OR p_extension !~ '^[a-p]{32}$' OR p_device IS NULL OR p_session IS NULL OR p_session !~ '^[0-9a-f]{64}$'
 OR p_code IS NULL OR p_code !~ '^[0-9a-f]{64}$' OR p_challenge IS NULL OR p_challenge !~ '^[A-Za-z0-9_-]{43}$'
 OR p_until IS NULL OR p_until<=transaction_timestamp() OR p_until>transaction_timestamp()+interval '7 days 1 minute'
 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='CAPTURE_INVALID'; END IF;
 PERFORM app.provision_workspace(pg_catalog.gen_random_uuid());
 w:=app.tenant_for_user();
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 IF EXISTS(SELECT 1 FROM app.capture_session_fences WHERE session_hash=p_session) THEN RAISE EXCEPTION USING ERRCODE='PT401',MESSAGE='CAPTURE_UNAUTHORIZED'; END IF;
 -- Same physical installation cannot keep another account connected after explicit pairing.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_extension||p_device::text,0));
 UPDATE app.capture_connections SET revoked=true WHERE extension_id=p_extension AND device_id=p_device AND NOT revoked;
 INSERT INTO app.capture_connections(tenant_id,user_id,extension_id,device_id,session_hash,challenge,code_hash,expires_at)
 VALUES(w,actor,p_extension,p_device,p_session,p_challenge,p_code,p_until);
 RETURN pg_catalog.jsonb_build_object('authorized',true);
END $$;

-- Used before logout/account replacement; session hash comes only from a decrypted web cookie.
CREATE FUNCTION app.revoke_capture_session(p_secret text,p_session text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM app.require_capture_worker(p_secret);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session,0));
 INSERT INTO app.capture_session_fences VALUES(p_session) ON CONFLICT DO NOTHING;
 UPDATE app.capture_connections SET revoked=true WHERE session_hash=p_session AND NOT revoked;
 RETURN '{"revoked":true}'::jsonb;
END $$;
CREATE FUNCTION app.revoke_my_capture_connections() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE app.capture_connections SET revoked=true WHERE user_id=app.require_user();
 RETURN '{"revoked":true}'::jsonb;
END $$;

CREATE FUNCTION app.capture_receipt(o app.capture_operations) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('requestId',o.request_id,'jobId',o.job_id,'state',o.state,'createdAt',o.created_at)
$$;

-- Sole anonymous execution entry: server secret AND a valid owned capture capability.
-- Never sets auth.uid(), accepts owner IDs, proxies SQL, or accesses candidate/CV contents.
CREATE FUNCTION app.capture_command(p_secret text,p_action text,p_extension text,p_device uuid,p_credential text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c app.capture_connections; o app.capture_operations; snap app.editor_draft_snapshots;
 source jsonb; intake jsonb; job uuid; req uuid;
BEGIN
 PERFORM app.require_capture_worker(p_secret);
 IF p_action IS NULL OR p_action NOT IN ('exchange','renew','disconnect','save','status') OR p_credential IS NULL OR p_credential !~ '^[0-9a-f]{64}$'
 OR p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object' OR pg_catalog.octet_length(p_input::text)>300000
 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='CAPTURE_INVALID'; END IF;
 SELECT * INTO c FROM app.capture_connections WHERE extension_id=p_extension AND device_id=p_device AND NOT revoked
 AND expires_at>transaction_timestamp() AND CASE p_action WHEN 'exchange' THEN code_hash=p_credential AND code_until>transaction_timestamp()
 WHEN 'renew' THEN connection_hash=p_credential WHEN 'disconnect' THEN connection_hash=p_credential
 ELSE token_hash=p_credential AND token_until>transaction_timestamp() END FOR UPDATE;
 IF c.id IS NULL OR NOT EXISTS(SELECT 1 FROM app.tenants t JOIN app.tenant_memberships m ON m.tenant_id=t.id
 WHERE t.id=c.tenant_id AND t.owner_user_id=c.user_id AND t.state='active' AND m.user_id=c.user_id AND m.role='owner' AND m.state='active')
 THEN RAISE EXCEPTION USING ERRCODE='PT401',MESSAGE='CAPTURE_UNAUTHORIZED'; END IF;
 IF p_action='disconnect' THEN
 UPDATE app.capture_connections SET revoked=true WHERE id=c.id;
 RETURN '{"revoked":true}'::jsonb;
 END IF;
 IF p_action IN ('exchange','renew') THEN
 IF p_input->>'tokenHash' IS NULL OR (p_input->>'tokenHash') !~ '^[0-9a-f]{64}$'
 OR (p_action='exchange' AND (p_input->>'challenge' IS DISTINCT FROM c.challenge OR p_input->>'connectionHash' IS NULL OR (p_input->>'connectionHash') !~ '^[0-9a-f]{64}$'))
 THEN RAISE EXCEPTION USING ERRCODE='PT401',MESSAGE='CAPTURE_UNAUTHORIZED'; END IF;
 UPDATE app.capture_connections SET code_hash=NULL,connection_hash=CASE WHEN p_action='exchange' THEN p_input->>'connectionHash' ELSE connection_hash END,
 token_hash=p_input->>'tokenHash',token_until=least(expires_at,transaction_timestamp()+interval '10 minutes') WHERE id=c.id;
 RETURN pg_catalog.jsonb_build_object('expiresAt',c.expires_at,'userId',c.user_id);
 END IF;
 req:=(p_input->>'requestId')::uuid;
 IF req IS NULL OR req='00000000-0000-0000-0000-000000000000'::uuid THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='CAPTURE_INVALID'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.user_id::text||req::text,0));
 SELECT * INTO o FROM app.capture_operations WHERE user_id=c.user_id AND request_id=req;
 IF p_action='status' THEN
 IF o.job_id IS NULL THEN RETURN NULL; END IF;
 RETURN app.capture_receipt(o);
 END IF;
 IF o.job_id IS NOT NULL THEN
 IF o.body_hash<>app.hash_json(p_input) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='IDEMPOTENCY_BODY_MISMATCH'; END IF;
 RETURN app.capture_receipt(o);
 END IF;
 source:=p_input->'snapshot';
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_input) k WHERE k NOT IN ('requestId','snapshot'))
 OR pg_catalog.jsonb_typeof(source) IS DISTINCT FROM 'object'
 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(source) k WHERE k NOT IN ('text','sourceUrl','title','company','location','structured','adapter','capturedAt','parserVersion'))
 OR pg_catalog.jsonb_typeof(source->'text') IS DISTINCT FROM 'string' OR length(btrim(source->>'text')) NOT BETWEEN 1 AND 120000
 OR pg_catalog.jsonb_typeof(source->'sourceUrl') IS DISTINCT FROM 'string' OR length(source->>'sourceUrl') NOT BETWEEN 1 AND 2048
 OR (source->>'sourceUrl') !~ '^https?://' OR source->>'parserVersion' IS DISTINCT FROM '1'
 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='CAPTURE_INVALID'; END IF;
 IF (SELECT count(*) FROM app.capture_operations WHERE user_id=c.user_id AND state IN ('received','processing'))>=100
 THEN RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='CAPTURE_BUSY'; END IF;
 intake:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('text',source->>'text','sourceUrl',source->>'sourceUrl',
 'title',source->>'title','company',source->>'company','location',source->>'location','capture',source));
 SELECT * INTO snap FROM app.editor_draft_snapshots WHERE tenant_id=c.tenant_id ORDER BY revision DESC LIMIT 1;
 INSERT INTO app.jobs(tenant_id,draft_payload) VALUES(c.tenant_id,intake) RETURNING id INTO job;
 INSERT INTO app.target_job_contexts(tenant_id,job_id,snapshot_id,snapshot_revision,intake,requirements)
 VALUES(c.tenant_id,job,snap.id,snap.revision,intake,'[]');
 INSERT INTO app.capture_operations(user_id,request_id,tenant_id,job_id,body_hash)
 VALUES(c.user_id,req,c.tenant_id,job,app.hash_json(p_input)) RETURNING * INTO o;
 RETURN app.capture_receipt(o);
END $$;

-- Bounded durable outbox. Only a scheduled server worker can claim/settle; no AI.
CREATE FUNCTION app.claim_capture(p_secret text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.capture_operations; source jsonb;
BEGIN
 PERFORM app.require_capture_worker(p_secret);
 UPDATE app.capture_operations SET state='failed',lease=NULL,lease_until=NULL
 WHERE state='processing' AND lease_until<transaction_timestamp() AND attempts>=3;
 SELECT * INTO o FROM app.capture_operations WHERE (state='received' OR (state='processing' AND lease_until<transaction_timestamp())) AND attempts<3
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF o.job_id IS NULL THEN RETURN NULL; END IF;
 UPDATE app.capture_operations SET state='processing',attempts=attempts+1,lease=pg_catalog.gen_random_uuid(),lease_until=transaction_timestamp()+interval '2 minutes'
 WHERE user_id=o.user_id AND request_id=o.request_id RETURNING * INTO o;
 SELECT intake->'capture' INTO source FROM app.target_job_contexts WHERE job_id=o.job_id;
 RETURN pg_catalog.jsonb_build_object('lease',o.lease,'snapshot',source);
END $$;
CREATE FUNCTION app.finish_capture(p_secret text,p_lease uuid,p_metadata jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o app.capture_operations;
BEGIN
 PERFORM app.require_capture_worker(p_secret);
 SELECT * INTO o FROM app.capture_operations WHERE lease=p_lease AND state='processing' AND lease_until>transaction_timestamp() FOR UPDATE;
 IF o.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='CAPTURE_STALE'; END IF;
 IF p_metadata IS NOT NULL AND (pg_catalog.jsonb_typeof(p_metadata)<>'object' OR pg_catalog.octet_length(p_metadata::text)>64000)
 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='CAPTURE_INVALID'; END IF;
 IF p_metadata IS NOT NULL THEN UPDATE app.target_job_contexts SET intake=intake||pg_catalog.jsonb_build_object('extracted',p_metadata) WHERE job_id=o.job_id; END IF;
 UPDATE app.capture_operations SET state=CASE WHEN p_metadata IS NOT NULL THEN 'ready' WHEN attempts>=3 THEN 'failed' ELSE 'received' END,lease=NULL,lease_until=NULL
 WHERE user_id=o.user_id AND request_id=o.request_id RETURNING * INTO o;
 RETURN app.capture_receipt(o);
END $$;

REVOKE EXECUTE ON FUNCTION app.require_capture_worker(text),app.authorize_capture(text,text,uuid,text,text,text,timestamptz),app.revoke_capture_session(text,text),
 app.revoke_my_capture_connections(),app.capture_receipt(app.capture_operations),app.capture_command(text,text,text,uuid,text,jsonb),app.claim_capture(text),app.finish_capture(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA app TO anon;
GRANT EXECUTE ON FUNCTION app.authorize_capture(text,text,uuid,text,text,text,timestamptz),app.revoke_my_capture_connections() TO authenticated;
GRANT EXECUTE ON FUNCTION app.revoke_capture_session(text,text),app.capture_command(text,text,text,uuid,text,jsonb),app.claim_capture(text),app.finish_capture(text,uuid,jsonb) TO anon;

-- Review accepts unassociated captures; source metadata never enters confirm_job.
CREATE OR REPLACE FUNCTION app.review_target_job(p_key uuid,p_job uuid,p_title text,p_company text,p_requirements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid:=app.tenant_for_user(); r record; c app.target_job_contexts; q jsonb; reqs jsonb:='[]'; n integer:=0; j jsonb;
BEGIN
 SELECT * INTO r FROM app.begin_request(w,'review_target_job',p_key,pg_catalog.jsonb_build_object('job',p_job,'title',p_title,'company',p_company,'requirements',p_requirements));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 SELECT * INTO c FROM app.target_job_contexts WHERE tenant_id=w AND job_id=p_job FOR UPDATE;
 IF c.job_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF c.job_version_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='VERSION_CONFLICT'; END IF;
 IF p_title IS NULL OR p_company IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 20000 OR pg_catalog.length(pg_catalog.btrim(p_company)) NOT BETWEEN 1 AND 20000
 OR pg_catalog.jsonb_typeof(p_requirements) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_requirements)>100 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
 FOR q IN SELECT * FROM pg_catalog.jsonb_array_elements(p_requirements) LOOP
 IF q->>'priority' IS NULL OR q->>'priority' NOT IN ('required','preferred') OR pg_catalog.jsonb_typeof(q->'text') IS DISTINCT FROM 'string'
 OR pg_catalog.length(pg_catalog.btrim(q->>'text')) NOT BETWEEN 1 AND 1000 OR pg_catalog.strpos(c.intake->>'text',q->>'text')=0
 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REQUIREMENT'; END IF;
 n:=n+1; reqs:=reqs||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key','evidence_'||n,'category','responsibilities','priority',q->>'priority','sourceText',q->>'text',
 'atoms',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('concept','evidence_'||n))));
 END LOOP;
 j:=app.confirm_job(p_key,p_job,0,(c.intake-'sourceUrl'-'capture'-'extracted')||pg_catalog.jsonb_build_object('title',p_title,'company',p_company,'captureKind','paste','requirements',reqs));
 UPDATE app.target_job_contexts SET job_version_id=(j->>'jobVersionId')::uuid,requirements=p_requirements,
 intake=intake||pg_catalog.jsonb_build_object('title',p_title,'company',p_company) WHERE job_id=p_job RETURNING * INTO c;
 RETURN app.finish_request(w,r.request_id,app.target_job_json(c));
END $$;

-- Existing authenticated paste fallback also saves before Base exists.
CREATE OR REPLACE FUNCTION app.save_target_job(p_key uuid,p_snapshot uuid,p_revision bigint,p_intake jsonb,p_requirements jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w uuid; chosen uuid:=p_snapshot; chosen_revision bigint:=p_revision; r record; j jsonb; q jsonb; reqs jsonb:='[]'; n integer:=0; saved app.target_job_contexts;
BEGIN
 PERFORM app.provision_workspace(p_key);
 w:=app.tenant_for_user();
 IF (p_snapshot IS NULL)<>(p_revision IS NULL) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='INVALID_COMMAND_ENVELOPE'; END IF;
 SELECT * INTO r FROM app.begin_request(w,'save_target_job',p_key,pg_catalog.jsonb_build_object('snapshot',p_snapshot,'revision',p_revision,'intake',p_intake,'requirements',p_requirements));
 IF r.cached IS NOT NULL THEN RETURN r.cached; END IF;
 IF p_snapshot IS NULL THEN SELECT id,revision INTO chosen,chosen_revision FROM app.editor_draft_snapshots WHERE tenant_id=w ORDER BY revision DESC LIMIT 1; END IF;
 IF p_snapshot IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.editor_draft_snapshots WHERE tenant_id=w AND id=p_snapshot AND revision=p_revision) THEN
 RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='SNAPSHOT_NOT_FOUND'; END IF;
 IF pg_catalog.jsonb_typeof(p_intake) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_intake) k WHERE k NOT IN ('text','title','company','location','sourceUrl'))
 OR pg_catalog.jsonb_typeof(p_intake->'text') IS DISTINCT FROM 'string' OR pg_catalog.length(p_intake->>'text') NOT BETWEEN 1 AND 200000

 OR pg_catalog.jsonb_typeof(p_requirements) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_requirements)>100
 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REVIEWED_JOB'; END IF;
 FOR q IN SELECT * FROM pg_catalog.jsonb_array_elements(p_requirements) LOOP
 IF pg_catalog.jsonb_typeof(q) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(q) k WHERE k NOT IN ('text','priority'))
 OR q->>'priority' IS NULL OR q->>'priority' NOT IN ('required','preferred') OR pg_catalog.jsonb_typeof(q->'text') IS DISTINCT FROM 'string'
 OR pg_catalog.length(pg_catalog.btrim(q->>'text')) NOT BETWEEN 1 AND 1000 OR pg_catalog.strpos(p_intake->>'text',q->>'text')=0
 THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='INVALID_REQUIREMENT'; END IF;
 n:=n+1;
 reqs:=reqs||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key','evidence_'||n,'category','responsibilities','priority',q->>'priority',
 'sourceText',q->>'text','atoms',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('concept','evidence_'||n))));
 END LOOP;
 INSERT INTO app.jobs(tenant_id,draft_payload) VALUES(w,p_intake) RETURNING pg_catalog.jsonb_build_object('jobId',id) INTO j;
 INSERT INTO app.target_job_contexts(tenant_id,job_id,job_version_id,snapshot_id,snapshot_revision,intake,requirements)
 VALUES(w,(j->>'jobId')::uuid,NULL,chosen,chosen_revision,p_intake,p_requirements) RETURNING * INTO saved;
 RETURN app.finish_request(w,r.request_id,app.target_job_json(saved));
END $$;
