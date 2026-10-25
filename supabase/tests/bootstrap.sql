-- TEST ONLY. Runs in a new, private native PostgreSQL cluster, never a hosted DB.
-- Models auth.uid() from a verified JWT subject; it does not test GoTrue/JWT/HTTP.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
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
