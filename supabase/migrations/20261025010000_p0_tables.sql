-- Resumora architecture 2.0.0 P0. Approved scope: P0-P3 only.

-- Table shells precede all candidate keys and foreign keys in this phase.

SET lock_timeout = '5s';

SET statement_timeout = '60s';

CREATE SCHEMA app;

REVOKE ALL ON SCHEMA app FROM PUBLIC, anon;

GRANT USAGE ON SCHEMA app TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE app."tenants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" uuid,
  "kind" text NOT NULL,
  "state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "deletion_generation" bigint NOT NULL DEFAULT 0
);

COMMENT ON TABLE app."tenants" IS 'Personal workspace and ownership boundary.';

CREATE TABLE app."user_profiles" (
  "user_id" uuid NOT NULL,
  "ui_locale" text NOT NULL,
  "preferences" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."user_profiles" IS 'User preferences independent of CV content.';

CREATE TABLE app."tenant_memberships" (
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL,
  "state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."tenant_memberships" IS 'Authorize user access to a workspace.';

CREATE TABLE app."idempotency_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "principal_key" text NOT NULL,
  "command_kind" text NOT NULL,
  "key_digest" bytea NOT NULL,
  "request_hash" bytea NOT NULL,
  "state" text NOT NULL,
  "result_refs" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "request_schema_version" text NOT NULL,
  "response_status" integer
);

COMMENT ON TABLE app."idempotency_requests" IS 'Replay one logical command safely after retries.';

CREATE TABLE app."audit_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "resource_kind" text NOT NULL,
  "resource_id" uuid,
  "safe_metadata" jsonb NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."audit_events" IS 'Safe actor/action history for important mutations.';

CREATE TABLE app."consent_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "purpose" text NOT NULL,
  "policy_version" text NOT NULL,
  "decision" text NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."consent_events" IS 'Record purpose-specific policy acceptance and revocation.';

CREATE TABLE app."deletion_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "scope" jsonb NOT NULL,
  "state" text NOT NULL,
  "checkpoint" jsonb NOT NULL,
  "tombstone_generation" bigint NOT NULL,
  "requested_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "request_id" uuid NOT NULL
);

COMMENT ON TABLE app."deletion_requests" IS 'Resumable rights/erasure workflow and anti-resurrection fence.';

ALTER TABLE app."tenants" ADD CONSTRAINT "pk_tenants_id" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "uq_tenants_owner_user_id" ON app."tenants" ("owner_user_id") WHERE kind = 'personal';

ALTER TABLE app."tenants" ADD CONSTRAINT "ck_tenants_0" CHECK (kind='personal');

ALTER TABLE app."tenants" ADD CONSTRAINT "ck_tenants_1" CHECK (state IN ('active','deleting','deleted'));

ALTER TABLE app."tenants" ADD CONSTRAINT "ck_tenants_2" CHECK (state<>'active' OR owner_user_id IS NOT NULL);

ALTER TABLE app."tenants" ADD CONSTRAINT "ck_tenants_3" CHECK (deletion_generation>=0);

ALTER TABLE app."user_profiles" ADD CONSTRAINT "pk_user_profiles_user_id" PRIMARY KEY ("user_id");

ALTER TABLE app."user_profiles" ADD CONSTRAINT "ck_user_profiles_0" CHECK (ui_locale IN ('ro','en'));

ALTER TABLE app."user_profiles" ADD CONSTRAINT "ck_user_profiles_1" CHECK (jsonb_typeof(preferences)='object' AND octet_length(preferences::text)<=16384);

ALTER TABLE app."tenant_memberships" ADD CONSTRAINT "pk_tenant_memberships_tenant_id_user_id" PRIMARY KEY ("tenant_id", "user_id");

ALTER TABLE app."tenant_memberships" ADD CONSTRAINT "ck_tenant_memberships_0" CHECK (role='owner');

ALTER TABLE app."tenant_memberships" ADD CONSTRAINT "ck_tenant_memberships_1" CHECK (state IN ('active','revoked'));

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "pk_idempotency_requests_id" PRIMARY KEY ("id");

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "uq_idempotency_requests_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "uq_idempotency_requests_tenant_id_principal_key_0ade785b820c" UNIQUE ("tenant_id", "principal_key", "command_kind", "key_digest");

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_0" CHECK (length(principal_key) BETWEEN 1 AND 200);

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_1" CHECK (length(command_kind) BETWEEN 1 AND 80);

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_2" CHECK (state IN ('in_progress','accepted','completed','failed_final'));

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_3" CHECK (jsonb_typeof(result_refs)='object');

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_4" CHECK (state<>'completed' OR response_status BETWEEN 200 AND 299);

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_key_digest_sha256" CHECK (octet_length("key_digest")=32);

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "ck_idempotency_requests_request_hash_sha256" CHECK (octet_length("request_hash")=32);

ALTER TABLE app."audit_events" ADD CONSTRAINT "pk_audit_events_id" PRIMARY KEY ("id");

ALTER TABLE app."audit_events" ADD CONSTRAINT "uq_audit_events_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."audit_events" ADD CONSTRAINT "ck_audit_events_0" CHECK (length(action) BETWEEN 1 AND 100);

ALTER TABLE app."audit_events" ADD CONSTRAINT "ck_audit_events_1" CHECK (jsonb_typeof(safe_metadata)='object' AND octet_length(safe_metadata::text)<=4096);

ALTER TABLE app."consent_events" ADD CONSTRAINT "pk_consent_events_id" PRIMARY KEY ("id");

ALTER TABLE app."consent_events" ADD CONSTRAINT "uq_consent_events_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."consent_events" ADD CONSTRAINT "ck_consent_events_0" CHECK (decision IN ('accepted','revoked'));

ALTER TABLE app."consent_events" ADD CONSTRAINT "ck_consent_events_1" CHECK (length(purpose) BETWEEN 1 AND 100);

ALTER TABLE app."consent_events" ADD CONSTRAINT "ck_consent_events_2" CHECK (length(policy_version) BETWEEN 1 AND 100);

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "pk_deletion_requests_id" PRIMARY KEY ("id");

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "uq_deletion_requests_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "ck_deletion_requests_0" CHECK (state IN ('requested','quiescing','purging','awaiting_backup_expiry','completed','failed_retryable'));

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "ck_deletion_requests_1" CHECK (tombstone_generation>=0);

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "ck_deletion_requests_2" CHECK (jsonb_typeof(scope)='object' AND jsonb_typeof(checkpoint)='object');

ALTER TABLE app."tenants" ADD CONSTRAINT "fk_tenants_owner_user_id_auth_users" FOREIGN KEY ("owner_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL;

ALTER TABLE app."user_profiles" ADD CONSTRAINT "fk_user_profiles_user_id_auth_users" FOREIGN KEY ("user_id") REFERENCES auth.users ("id") ON DELETE CASCADE;

ALTER TABLE app."tenant_memberships" ADD CONSTRAINT "fk_tenant_memberships_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."tenant_memberships" ADD CONSTRAINT "fk_tenant_memberships_user_id_auth_users" FOREIGN KEY ("user_id") REFERENCES auth.users ("id") ON DELETE RESTRICT;

ALTER TABLE app."idempotency_requests" ADD CONSTRAINT "fk_idempotency_requests_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."audit_events" ADD CONSTRAINT "fk_audit_events_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."audit_events" ADD CONSTRAINT "fk_audit_events_actor_user_id_auth_users" FOREIGN KEY ("actor_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL;

ALTER TABLE app."consent_events" ADD CONSTRAINT "fk_consent_events_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."consent_events" ADD CONSTRAINT "fk_consent_events_actor_user_id_auth_users" FOREIGN KEY ("actor_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL;

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "fk_deletion_requests_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."deletion_requests" ADD CONSTRAINT "fk_deletion_requests_tenant_id_request_id_idemp_10aac949951c" FOREIGN KEY ("tenant_id", "request_id") REFERENCES app."idempotency_requests" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_deletion_requests_tenant_id_request_id" ON app."deletion_requests" (tenant_id,request_id);
