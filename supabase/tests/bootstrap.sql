-- TEST ONLY. Runs in a new, private native PostgreSQL cluster, never a hosted DB.
-- Models auth.uid() from a verified JWT subject; it does not test GoTrue/JWT/HTTP.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
SET search_path = '' AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE SCHEMA test_support;
CREATE TABLE test_support.migrations (
  version text PRIMARY KEY,
  sha256 text NOT NULL
);
-- Storage RLS semantics only: no object server/HTTP or hosted bucket assurance.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;

-- Implements only the documented operation equality contract for policy tests.
CREATE FUNCTION storage.allow_only_operation(expected text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test_support.storage_operation',true)=expected,false) $$;
