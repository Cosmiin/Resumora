-- Resumora architecture 2.0.0 P1. Approved scope: P0-P3 only.

-- Table shells precede all candidate keys and foreign keys in this phase.

SET lock_timeout = '5s';

SET statement_timeout = '60s';

CREATE TABLE app."source_documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "source_kind" text NOT NULL,
  "bucket" text,
  "object_key" text,
  "content_hash" bytea NOT NULL,
  "mime_type" text,
  "size_bytes" bigint,
  "retain_until" timestamptz,
  "state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid,
  "upload_request_id" uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=65536)
);

COMMENT ON TABLE app."source_documents" IS 'Manifest for uploads, manual answers and other factual sources.';

CREATE TABLE app."source_spans" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "source_document_id" uuid NOT NULL,
  "locator" jsonb NOT NULL,
  "text_excerpt" text,
  "retained_text_ref" text,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid
);

COMMENT ON TABLE app."source_spans" IS 'Point factual provenance to exact original text locations.';

CREATE TABLE app."claims" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "claim_kind" text NOT NULL,
  "value" jsonb NOT NULL,
  "content_hash" bytea NOT NULL,
  "replacement_of_claim_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."claims" IS 'Immutable typed factual assertions.';

CREATE TABLE app."claim_provenance" (
  "tenant_id" uuid NOT NULL,
  "claim_id" uuid NOT NULL,
  "source_span_id" uuid NOT NULL,
  "basis" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."claim_provenance" IS 'Many-to-many claim-to-source evidence.';

CREATE TABLE app."confirmation_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "claim_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "decision" text NOT NULL,
  "method" text NOT NULL,
  "reason" text,
  "recorded_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL,
  event_sequence bigint GENERATED ALWAYS AS IDENTITY
);

COMMENT ON TABLE app."confirmation_events" IS 'Attestation, rejection, verification and revocation history.';

CREATE TABLE app."career_entities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_kind" text NOT NULL,
  "state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."career_entities" IS 'Stable identity for roles, skills and other career entries.';

CREATE TABLE app."entity_revisions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "revision_no" bigint NOT NULL,
  "payload" jsonb NOT NULL,
  "validator_version" text NOT NULL,
  "content_hash" bytea NOT NULL,
  "supersedes_revision_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."entity_revisions" IS 'Immutable bounded attributes for one career entity.';

CREATE TABLE app."entity_revision_claims" (
  "tenant_id" uuid NOT NULL,
  "entity_revision_id" uuid NOT NULL,
  "field_role" text NOT NULL,
  "claim_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."entity_revision_claims" IS 'Bind entity fields to factual claims.';

CREATE TABLE app."career_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "head_version_id" uuid,
  "draft_payload" jsonb NOT NULL,
  "draft_revision" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "draft_schema_version" text NOT NULL
);

COMMENT ON TABLE app."career_profiles" IS 'Editable career draft and published Base head.';

CREATE TABLE app."profile_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "sequence" bigint NOT NULL,
  "parent_version_id" uuid,
  "canonical_json" jsonb NOT NULL,
  "schema_version" text NOT NULL,
  "content_hash" bytea NOT NULL,
  "as_of" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "publication_request_id" uuid NOT NULL
);

COMMENT ON TABLE app."profile_versions" IS 'Immutable complete career-profile checkpoints.';

CREATE TABLE app."profile_version_entities" (
  "tenant_id" uuid NOT NULL,
  "profile_version_id" uuid NOT NULL,
  "entity_revision_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL
);

COMMENT ON TABLE app."profile_version_entities" IS 'Pin the exact career entity revisions in a checkpoint.';

CREATE TABLE app."profile_version_claims" (
  "tenant_id" uuid NOT NULL,
  "profile_version_id" uuid NOT NULL,
  "claim_id" uuid NOT NULL,
  "confirmation_event_id" uuid NOT NULL,
  "accepted_state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."profile_version_claims" IS 'Pin usable claims and their confirmation evidence.';

CREATE TABLE app."cv_documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "document_kind" text NOT NULL,
  "head_version_id" uuid,
  "draft_revision" bigint NOT NULL DEFAULT 0,
  "draft_payload" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL
);

COMMENT ON TABLE app."cv_documents" IS 'Editable presentation branch and latest content pointer.';

CREATE TABLE app."cv_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "sequence" bigint NOT NULL,
  "parent_version_id" uuid,
  "profile_version_id" uuid NOT NULL,
  "locale" text NOT NULL,
  "tailoring_state" text NOT NULL,
  "canonical_json" jsonb NOT NULL,
  "content_hash" bytea NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_id" uuid NOT NULL,
  "publication_request_id" uuid NOT NULL,
  "schema_version" text NOT NULL
);

COMMENT ON TABLE app."cv_versions" IS 'Immutable selected CV presentation for exact input versions.';

CREATE TABLE app."cv_sections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "cv_version_id" uuid NOT NULL,
  "section_instance_id" uuid NOT NULL,
  "section_kind" text NOT NULL,
  "label" text NOT NULL,
  "ordinal" integer NOT NULL,
  "visible" boolean NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."cv_sections" IS 'Ordered section instances in one CV version.';

CREATE TABLE app."cv_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "cv_section_id" uuid NOT NULL,
  "cv_version_id" uuid NOT NULL,
  "item_kind" text NOT NULL,
  "entity_revision_id" uuid,
  "ordinal" integer NOT NULL,
  "selected" boolean NOT NULL,
  "privacy_flags" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_version_id" uuid NOT NULL
);

COMMENT ON TABLE app."cv_items" IS 'Ordered selected facts/prose within a section.';

CREATE TABLE app."claim_relations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "from_claim_id" uuid NOT NULL,
  "to_claim_id" uuid NOT NULL,
  "relation" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."claim_relations" IS 'Preserve canonical claimLinks with actual source/target FKs, including metric_of and scope_of.';

CREATE TABLE app."entity_revision_entities" (
  "tenant_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "entity_revision_id" uuid NOT NULL,
  "field_role" text NOT NULL,
  "related_entity_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."entity_revision_entities" IS 'Preserve canonical employment skillIds and enrichment targetEntityId as same-profile entity FKs.';

CREATE TABLE app."profile_version_relations" (
  "tenant_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "profile_version_id" uuid NOT NULL,
  "claim_relation_id" uuid NOT NULL,
  "from_claim_id" uuid NOT NULL,
  "to_claim_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."profile_version_relations" IS 'Pin the exact claim-relation set in each immutable profile version.';

ALTER TABLE app."source_documents" ADD CONSTRAINT "pk_source_documents_id" PRIMARY KEY ("id");

ALTER TABLE app."source_documents" ADD CONSTRAINT "uq_source_documents_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."source_documents" ADD CONSTRAINT "uq_source_documents_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

CREATE UNIQUE INDEX "uq_source_documents_tenant_id_upload_request_id" ON app."source_documents" ("tenant_id", "upload_request_id") WHERE upload_request_id IS NOT NULL;

CREATE UNIQUE INDEX "uq_source_documents_bucket_object_key" ON app."source_documents" ("bucket", "object_key") WHERE object_key IS NOT NULL;

ALTER TABLE app."source_documents" ADD CONSTRAINT "ck_source_documents_0" CHECK (source_kind IN ('manual','upload','interview','job','own_profile'));

ALTER TABLE app."source_documents" ADD CONSTRAINT "ck_source_documents_1" CHECK ((bucket IS NULL)=(object_key IS NULL));

ALTER TABLE app."source_documents" ADD CONSTRAINT "ck_source_documents_2" CHECK (size_bytes IS NULL OR size_bytes>=0);

ALTER TABLE app."source_documents" ADD CONSTRAINT "ck_source_documents_3" CHECK (state IN ('reserved','uploaded','verified','quarantined','available','purge_pending','purged','failed'));

ALTER TABLE app."source_documents" ADD CONSTRAINT "ck_source_documents_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."source_spans" ADD CONSTRAINT "pk_source_spans_id" PRIMARY KEY ("id");

ALTER TABLE app."source_spans" ADD CONSTRAINT "uq_source_spans_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."source_spans" ADD CONSTRAINT "uq_source_spans_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

ALTER TABLE app."source_spans" ADD CONSTRAINT "uq_source_spans_tenant_id_source_document_id_id" UNIQUE ("tenant_id", "source_document_id", "id");

ALTER TABLE app."source_spans" ADD CONSTRAINT "ck_source_spans_0" CHECK (jsonb_typeof(locator)='object');

ALTER TABLE app."source_spans" ADD CONSTRAINT "ck_source_spans_1" CHECK (text_excerpt IS NULL OR octet_length(text_excerpt)<=4096);

ALTER TABLE app."claims" ADD CONSTRAINT "pk_claims_id" PRIMARY KEY ("id");

ALTER TABLE app."claims" ADD CONSTRAINT "uq_claims_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."claims" ADD CONSTRAINT "uq_claims_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

ALTER TABLE app."claims" ADD CONSTRAINT "ck_claims_0" CHECK (claim_kind IN ('text','date','location','metric'));

ALTER TABLE app."claims" ADD CONSTRAINT "ck_claims_1" CHECK (replacement_of_claim_id IS NULL OR replacement_of_claim_id<>id);

ALTER TABLE app."claims" ADD CONSTRAINT "ck_claims_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."claim_provenance" ADD CONSTRAINT "pk_claim_provenance_tenant_id_claim_id_source_span_id" PRIMARY KEY ("tenant_id", "claim_id", "source_span_id");

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "pk_confirmation_events_id" PRIMARY KEY ("id");

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "uq_confirmation_events_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "uq_confirmation_events_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "uq_confirmation_events_tenant_id_profile_id_claim_id_id" UNIQUE ("tenant_id", "profile_id", "claim_id", "id");

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "ck_confirmation_events_0" CHECK (decision IN ('user_confirmed','externally_verified','rejected','revoked'));

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "ck_confirmation_events_1" CHECK (decision<>'externally_verified' OR length(method)>0);

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "ck_confirmation_events_2" CHECK (length(method) BETWEEN 1 AND 1000);

ALTER TABLE app."career_entities" ADD CONSTRAINT "pk_career_entities_id" PRIMARY KEY ("id");

ALTER TABLE app."career_entities" ADD CONSTRAINT "uq_career_entities_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."career_entities" ADD CONSTRAINT "uq_career_entities_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

ALTER TABLE app."career_entities" ADD CONSTRAINT "ck_career_entities_0" CHECK (entity_kind IN ('name','positioning_title','contact','skill','employment','responsibility','accomplishment','education','enrichment','optional_entry'));

ALTER TABLE app."career_entities" ADD CONSTRAINT "ck_career_entities_1" CHECK (state IN ('active','retired'));

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "pk_entity_revisions_id" PRIMARY KEY ("id");

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "uq_entity_revisions_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "uq_entity_revisions_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "uq_entity_revisions_tenant_id_entity_id_revision_no" UNIQUE ("tenant_id", "entity_id", "revision_no");

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "uq_entity_revisions_tenant_id_profile_id_entity_id_id" UNIQUE ("tenant_id", "profile_id", "entity_id", "id");

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "ck_entity_revisions_0" CHECK (revision_no>0);

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "ck_entity_revisions_1" CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536);

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "ck_entity_revisions_2" CHECK (supersedes_revision_id IS NULL OR supersedes_revision_id<>id);

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "ck_entity_revisions_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."entity_revision_claims" ADD CONSTRAINT "pk_entity_revision_claims_tenant_id_entity_revi_2a7a9b65c262" PRIMARY KEY ("tenant_id", "entity_revision_id", "field_role", "claim_id");

ALTER TABLE app."entity_revision_claims" ADD CONSTRAINT "ck_entity_revision_claims_0" CHECK (length(field_role) BETWEEN 1 AND 120);

ALTER TABLE app."career_profiles" ADD CONSTRAINT "pk_career_profiles_id" PRIMARY KEY ("id");

ALTER TABLE app."career_profiles" ADD CONSTRAINT "uq_career_profiles_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."career_profiles" ADD CONSTRAINT "uq_career_profiles_tenant_id" UNIQUE ("tenant_id");

ALTER TABLE app."career_profiles" ADD CONSTRAINT "ck_career_profiles_0" CHECK (draft_revision>=0);

ALTER TABLE app."career_profiles" ADD CONSTRAINT "ck_career_profiles_1" CHECK (jsonb_typeof(draft_payload)='object' AND octet_length(draft_payload::text)<=1048576);

ALTER TABLE app."profile_versions" ADD CONSTRAINT "pk_profile_versions_id" PRIMARY KEY ("id");

ALTER TABLE app."profile_versions" ADD CONSTRAINT "uq_profile_versions_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."profile_versions" ADD CONSTRAINT "uq_profile_versions_tenant_id_publication_request_id" UNIQUE ("tenant_id", "publication_request_id");

ALTER TABLE app."profile_versions" ADD CONSTRAINT "uq_profile_versions_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

ALTER TABLE app."profile_versions" ADD CONSTRAINT "uq_profile_versions_tenant_id_profile_id_sequence" UNIQUE ("tenant_id", "profile_id", "sequence");

ALTER TABLE app."profile_versions" ADD CONSTRAINT "ck_profile_versions_0" CHECK (sequence>0);

ALTER TABLE app."profile_versions" ADD CONSTRAINT "ck_profile_versions_1" CHECK (schema_version='cv-facts-1.0.0');

ALTER TABLE app."profile_versions" ADD CONSTRAINT "ck_profile_versions_2" CHECK (jsonb_typeof(canonical_json)='object' AND octet_length(canonical_json::text)<=1048576);

ALTER TABLE app."profile_versions" ADD CONSTRAINT "ck_profile_versions_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."profile_version_entities" ADD CONSTRAINT "pk_profile_version_entities_tenant_id_profile_v_62c69dded715" PRIMARY KEY ("tenant_id", "profile_version_id", "entity_revision_id");

ALTER TABLE app."profile_version_entities" ADD CONSTRAINT "uq_profile_version_entities_tenant_id_profile_v_73dcca99f877" UNIQUE ("tenant_id", "profile_version_id", "entity_id");

ALTER TABLE app."profile_version_claims" ADD CONSTRAINT "pk_profile_version_claims_tenant_id_profile_ver_d13373dd257f" PRIMARY KEY ("tenant_id", "profile_version_id", "claim_id");

ALTER TABLE app."profile_version_claims" ADD CONSTRAINT "ck_profile_version_claims_0" CHECK (accepted_state IN ('user_confirmed','externally_verified'));

ALTER TABLE app."cv_documents" ADD CONSTRAINT "pk_cv_documents_id" PRIMARY KEY ("id");

ALTER TABLE app."cv_documents" ADD CONSTRAINT "uq_cv_documents_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."cv_documents" ADD CONSTRAINT "uq_cv_documents_tenant_id_profile_id_id" UNIQUE ("tenant_id", "profile_id", "id");

CREATE UNIQUE INDEX "uq_cv_documents_tenant_id_profile_id" ON app."cv_documents" ("tenant_id", "profile_id") WHERE document_kind='base';

ALTER TABLE app."cv_documents" ADD CONSTRAINT "ck_cv_documents_0" CHECK (document_kind='base');

ALTER TABLE app."cv_documents" ADD CONSTRAINT "ck_cv_documents_1" CHECK (draft_revision>=0);

ALTER TABLE app."cv_documents" ADD CONSTRAINT "ck_cv_documents_2" CHECK (jsonb_typeof(draft_payload)='object' AND octet_length(draft_payload::text)<=1048576);

ALTER TABLE app."cv_versions" ADD CONSTRAINT "pk_cv_versions_id" PRIMARY KEY ("id");

ALTER TABLE app."cv_versions" ADD CONSTRAINT "uq_cv_versions_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."cv_versions" ADD CONSTRAINT "uq_cv_versions_tenant_id_document_id_id" UNIQUE ("tenant_id", "document_id", "id");

ALTER TABLE app."cv_versions" ADD CONSTRAINT "uq_cv_versions_tenant_id_profile_version_id_id" UNIQUE ("tenant_id", "profile_version_id", "id");

ALTER TABLE app."cv_versions" ADD CONSTRAINT "uq_cv_versions_tenant_id_document_id_sequence" UNIQUE ("tenant_id", "document_id", "sequence");

ALTER TABLE app."cv_versions" ADD CONSTRAINT "uq_cv_versions_tenant_id_publication_request_id" UNIQUE ("tenant_id", "publication_request_id");

ALTER TABLE app."cv_versions" ADD CONSTRAINT "ck_cv_versions_0" CHECK (sequence>0);

ALTER TABLE app."cv_versions" ADD CONSTRAINT "ck_cv_versions_1" CHECK (locale IN ('ro','en'));

ALTER TABLE app."cv_versions" ADD CONSTRAINT "ck_cv_versions_2" CHECK (tailoring_state='not_tailored');

ALTER TABLE app."cv_versions" ADD CONSTRAINT "ck_cv_versions_3" CHECK (schema_version='1.0.0');

ALTER TABLE app."cv_versions" ADD CONSTRAINT "ck_cv_versions_4" CHECK (jsonb_typeof(canonical_json)='object' AND octet_length(canonical_json::text)<=1048576);

ALTER TABLE app."cv_versions" ADD CONSTRAINT "ck_cv_versions_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."cv_sections" ADD CONSTRAINT "pk_cv_sections_id" PRIMARY KEY ("id");

ALTER TABLE app."cv_sections" ADD CONSTRAINT "uq_cv_sections_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."cv_sections" ADD CONSTRAINT "uq_cv_sections_tenant_id_cv_version_id_id" UNIQUE ("tenant_id", "cv_version_id", "id");

ALTER TABLE app."cv_sections" ADD CONSTRAINT "uq_cv_sections_tenant_id_cv_version_id_ordinal" UNIQUE ("tenant_id", "cv_version_id", "ordinal");

ALTER TABLE app."cv_sections" ADD CONSTRAINT "uq_cv_sections_tenant_id_cv_version_id_section_instance_id" UNIQUE ("tenant_id", "cv_version_id", "section_instance_id");

ALTER TABLE app."cv_sections" ADD CONSTRAINT "ck_cv_sections_0" CHECK (ordinal>=0);

ALTER TABLE app."cv_sections" ADD CONSTRAINT "ck_cv_sections_1" CHECK (length(label)<=20000);

ALTER TABLE app."cv_items" ADD CONSTRAINT "pk_cv_items_id" PRIMARY KEY ("id");

ALTER TABLE app."cv_items" ADD CONSTRAINT "uq_cv_items_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."cv_items" ADD CONSTRAINT "uq_cv_items_tenant_id_cv_section_id_ordinal" UNIQUE ("tenant_id", "cv_section_id", "ordinal");

ALTER TABLE app."cv_items" ADD CONSTRAINT "uq_cv_items_tenant_id_cv_version_id_id" UNIQUE ("tenant_id", "cv_version_id", "id");

ALTER TABLE app."cv_items" ADD CONSTRAINT "ck_cv_items_0" CHECK (ordinal>=0);

ALTER TABLE app."cv_items" ADD CONSTRAINT "ck_cv_items_1" CHECK (entity_revision_id IS NOT NULL);

ALTER TABLE app."cv_items" ADD CONSTRAINT "ck_cv_items_2" CHECK (jsonb_typeof(privacy_flags)='object');

ALTER TABLE app."claim_relations" ADD CONSTRAINT "pk_claim_relations_id" PRIMARY KEY ("id");

ALTER TABLE app."claim_relations" ADD CONSTRAINT "uq_claim_relations_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."claim_relations" ADD CONSTRAINT "uq_claim_relations_tenant_id_profile_id_from_cl_8cbe6760ec10" UNIQUE ("tenant_id", "profile_id", "from_claim_id", "to_claim_id", "relation");

ALTER TABLE app."claim_relations" ADD CONSTRAINT "uq_claim_relations_tenant_id_profile_id_id_from_a267d5ad6be2" UNIQUE ("tenant_id", "profile_id", "id", "from_claim_id", "to_claim_id");

ALTER TABLE app."claim_relations" ADD CONSTRAINT "ck_claim_relations_0" CHECK (relation IN ('metric_of','supports','contribution_to','scope_of'));

ALTER TABLE app."claim_relations" ADD CONSTRAINT "ck_claim_relations_1" CHECK (from_claim_id<>to_claim_id);

ALTER TABLE app."entity_revision_entities" ADD CONSTRAINT "pk_entity_revision_entities_tenant_id_entity_re_3119f580f830" PRIMARY KEY ("tenant_id", "entity_revision_id", "field_role", "related_entity_id");

ALTER TABLE app."entity_revision_entities" ADD CONSTRAINT "ck_entity_revision_entities_0" CHECK (field_role IN ('employment.skillIds','enrichment.targetEntityId'));

ALTER TABLE app."profile_version_relations" ADD CONSTRAINT "pk_profile_version_relations_tenant_id_profile__1c6f9a8863f8" PRIMARY KEY ("tenant_id", "profile_version_id", "claim_relation_id");

ALTER TABLE app."source_documents" ADD CONSTRAINT "fk_source_documents_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."source_documents" ADD CONSTRAINT "fk_source_documents_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."source_documents" ADD CONSTRAINT "fk_source_documents_tenant_id_upload_request_id_68300ba9d45a" FOREIGN KEY ("tenant_id", "upload_request_id") REFERENCES app."idempotency_requests" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_source_documents_tenant_id_upload_request_id" ON app."source_documents" (tenant_id,upload_request_id);

ALTER TABLE app."source_spans" ADD CONSTRAINT "fk_source_spans_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."source_spans" ADD CONSTRAINT "fk_source_spans_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."source_spans" ADD CONSTRAINT "fk_source_spans_tenant_id_source_document_id_so_775041e2c90c" FOREIGN KEY ("tenant_id", "source_document_id") REFERENCES app."source_documents" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."claims" ADD CONSTRAINT "fk_claims_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."claims" ADD CONSTRAINT "fk_claims_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."claims" ADD CONSTRAINT "fk_claims_tenant_id_profile_id_replacement_of_c_5e9e95a8c405" FOREIGN KEY ("tenant_id", "profile_id", "replacement_of_claim_id") REFERENCES app."claims" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_claims_tenant_id_profile_id_replacement_of_claim_id" ON app."claims" (tenant_id,profile_id,replacement_of_claim_id);

ALTER TABLE app."claim_provenance" ADD CONSTRAINT "fk_claim_provenance_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."claim_provenance" ADD CONSTRAINT "fk_claim_provenance_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."claim_provenance" ADD CONSTRAINT "fk_claim_provenance_tenant_id_profile_id_claim_id_claims" FOREIGN KEY ("tenant_id", "profile_id", "claim_id") REFERENCES app."claims" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."claim_provenance" ADD CONSTRAINT "fk_claim_provenance_tenant_id_profile_id_source_b9c4a5f3d7e6" FOREIGN KEY ("tenant_id", "profile_id", "source_span_id") REFERENCES app."source_spans" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_claim_provenance_tenant_id_profile_id" ON app."claim_provenance" (tenant_id,profile_id);

CREATE INDEX "ix_claim_provenance_tenant_id_profile_id_claim_id" ON app."claim_provenance" (tenant_id,profile_id,claim_id);

CREATE INDEX "ix_claim_provenance_tenant_id_profile_id_source_span_id" ON app."claim_provenance" (tenant_id,profile_id,source_span_id);

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "fk_confirmation_events_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "fk_confirmation_events_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "fk_confirmation_events_tenant_id_profile_id_claim_id_claims" FOREIGN KEY ("tenant_id", "profile_id", "claim_id") REFERENCES app."claims" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."confirmation_events" ADD CONSTRAINT "fk_confirmation_events_actor_user_id_auth_users" FOREIGN KEY ("actor_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL;

ALTER TABLE app."career_entities" ADD CONSTRAINT "fk_career_entities_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."career_entities" ADD CONSTRAINT "fk_career_entities_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "fk_entity_revisions_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "fk_entity_revisions_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "fk_entity_revisions_tenant_id_profile_id_entity_06d74e623227" FOREIGN KEY ("tenant_id", "profile_id", "entity_id") REFERENCES app."career_entities" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revisions" ADD CONSTRAINT "fk_entity_revisions_tenant_id_profile_id_entity_062b7da49b82" FOREIGN KEY ("tenant_id", "profile_id", "entity_id", "supersedes_revision_id") REFERENCES app."entity_revisions" ("tenant_id", "profile_id", "entity_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_entity_revisions_tenant_id_profile_id_entity_168e523c249e" ON app."entity_revisions" (tenant_id,profile_id,entity_id,supersedes_revision_id);

ALTER TABLE app."entity_revision_claims" ADD CONSTRAINT "fk_entity_revision_claims_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revision_claims" ADD CONSTRAINT "fk_entity_revision_claims_tenant_id_profile_id__d9cfd0a530bf" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revision_claims" ADD CONSTRAINT "fk_entity_revision_claims_tenant_id_profile_id__a41ad86c3df6" FOREIGN KEY ("tenant_id", "profile_id", "entity_revision_id") REFERENCES app."entity_revisions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revision_claims" ADD CONSTRAINT "fk_entity_revision_claims_tenant_id_profile_id__0e6d73dee305" FOREIGN KEY ("tenant_id", "profile_id", "claim_id") REFERENCES app."claims" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_entity_revision_claims_tenant_id_profile_id" ON app."entity_revision_claims" (tenant_id,profile_id);

CREATE INDEX "ix_entity_revision_claims_tenant_id_profile_id__c65cea401acb" ON app."entity_revision_claims" (tenant_id,profile_id,entity_revision_id);

CREATE INDEX "ix_entity_revision_claims_tenant_id_profile_id_claim_id" ON app."entity_revision_claims" (tenant_id,profile_id,claim_id);

ALTER TABLE app."career_profiles" ADD CONSTRAINT "fk_career_profiles_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."career_profiles" ADD CONSTRAINT "fk_career_profiles_tenant_id_id_head_version_id_e6f361d17892" FOREIGN KEY ("tenant_id", "id", "head_version_id") REFERENCES app."profile_versions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "ix_career_profiles_tenant_id_id_head_version_id" ON app."career_profiles" (tenant_id,id,head_version_id);

ALTER TABLE app."profile_versions" ADD CONSTRAINT "fk_profile_versions_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."profile_versions" ADD CONSTRAINT "fk_profile_versions_tenant_id_publication_reque_e5ba4a60e000" FOREIGN KEY ("tenant_id", "publication_request_id") REFERENCES app."idempotency_requests" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_versions" ADD CONSTRAINT "fk_profile_versions_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_versions" ADD CONSTRAINT "fk_profile_versions_tenant_id_profile_id_parent_16046a539495" FOREIGN KEY ("tenant_id", "profile_id", "parent_version_id") REFERENCES app."profile_versions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_profile_versions_tenant_id_profile_id_parent_version_id" ON app."profile_versions" (tenant_id,profile_id,parent_version_id);

ALTER TABLE app."profile_version_entities" ADD CONSTRAINT "fk_profile_version_entities_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_entities" ADD CONSTRAINT "fk_profile_version_entities_tenant_id_profile_i_e61291e7128d" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_entities" ADD CONSTRAINT "fk_profile_version_entities_tenant_id_profile_i_e915421da5fd" FOREIGN KEY ("tenant_id", "profile_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_entities" ADD CONSTRAINT "fk_profile_version_entities_tenant_id_profile_i_47240bfde83d" FOREIGN KEY ("tenant_id", "profile_id", "entity_id", "entity_revision_id") REFERENCES app."entity_revisions" ("tenant_id", "profile_id", "entity_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_profile_version_entities_tenant_id_profile_id" ON app."profile_version_entities" (tenant_id,profile_id);

CREATE INDEX "ix_profile_version_entities_tenant_id_profile_i_12de967288a6" ON app."profile_version_entities" (tenant_id,profile_id,profile_version_id);

CREATE INDEX "ix_profile_version_entities_tenant_id_profile_i_ed11b6bfaf18" ON app."profile_version_entities" (tenant_id,profile_id,entity_id,entity_revision_id);

ALTER TABLE app."profile_version_claims" ADD CONSTRAINT "fk_profile_version_claims_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_claims" ADD CONSTRAINT "fk_profile_version_claims_tenant_id_profile_id__abbfafcca01d" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_claims" ADD CONSTRAINT "fk_profile_version_claims_tenant_id_profile_id__46fb6f549337" FOREIGN KEY ("tenant_id", "profile_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_claims" ADD CONSTRAINT "fk_profile_version_claims_tenant_id_profile_id__36daa3153eb8" FOREIGN KEY ("tenant_id", "profile_id", "claim_id", "confirmation_event_id") REFERENCES app."confirmation_events" ("tenant_id", "profile_id", "claim_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_profile_version_claims_tenant_id_profile_id" ON app."profile_version_claims" (tenant_id,profile_id);

CREATE INDEX "ix_profile_version_claims_tenant_id_profile_id__0586352d5531" ON app."profile_version_claims" (tenant_id,profile_id,profile_version_id);

CREATE INDEX "ix_profile_version_claims_tenant_id_profile_id__c27fe4053fed" ON app."profile_version_claims" (tenant_id,profile_id,claim_id,confirmation_event_id);

ALTER TABLE app."cv_documents" ADD CONSTRAINT "fk_cv_documents_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."cv_documents" ADD CONSTRAINT "fk_cv_documents_tenant_id_profile_id_career_profiles" FOREIGN KEY ("tenant_id", "profile_id") REFERENCES app."career_profiles" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_documents" ADD CONSTRAINT "fk_cv_documents_tenant_id_id_head_version_id_cv_versions" FOREIGN KEY ("tenant_id", "id", "head_version_id") REFERENCES app."cv_versions" ("tenant_id", "document_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "ix_cv_documents_tenant_id_id_head_version_id" ON app."cv_documents" (tenant_id,id,head_version_id);

ALTER TABLE app."cv_versions" ADD CONSTRAINT "fk_cv_versions_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."cv_versions" ADD CONSTRAINT "fk_cv_versions_tenant_id_profile_id_document_id_cv_documents" FOREIGN KEY ("tenant_id", "profile_id", "document_id") REFERENCES app."cv_documents" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_versions" ADD CONSTRAINT "fk_cv_versions_tenant_id_profile_id_profile_ver_1eedbc40ffc8" FOREIGN KEY ("tenant_id", "profile_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_versions" ADD CONSTRAINT "fk_cv_versions_tenant_id_document_id_parent_ver_2609ea323359" FOREIGN KEY ("tenant_id", "document_id", "parent_version_id") REFERENCES app."cv_versions" ("tenant_id", "document_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_versions" ADD CONSTRAINT "fk_cv_versions_tenant_id_publication_request_id_6128bffdce46" FOREIGN KEY ("tenant_id", "publication_request_id") REFERENCES app."idempotency_requests" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_cv_versions_tenant_id_profile_id_document_id" ON app."cv_versions" (tenant_id,profile_id,document_id);

CREATE INDEX "ix_cv_versions_tenant_id_profile_id_profile_version_id" ON app."cv_versions" (tenant_id,profile_id,profile_version_id);

CREATE INDEX "ix_cv_versions_tenant_id_document_id_parent_version_id" ON app."cv_versions" (tenant_id,document_id,parent_version_id);

ALTER TABLE app."cv_sections" ADD CONSTRAINT "fk_cv_sections_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."cv_sections" ADD CONSTRAINT "fk_cv_sections_tenant_id_cv_version_id_cv_versions" FOREIGN KEY ("tenant_id", "cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_items" ADD CONSTRAINT "fk_cv_items_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."cv_items" ADD CONSTRAINT "fk_cv_items_tenant_id_profile_version_id_cv_ver_d8374bb22ab2" FOREIGN KEY ("tenant_id", "profile_version_id", "cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "profile_version_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_items" ADD CONSTRAINT "fk_cv_items_tenant_id_cv_version_id_cv_section__26d046f4236b" FOREIGN KEY ("tenant_id", "cv_version_id", "cv_section_id") REFERENCES app."cv_sections" ("tenant_id", "cv_version_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_items" ADD CONSTRAINT "fk_cv_items_tenant_id_profile_version_id_entity_55f4059e7d22" FOREIGN KEY ("tenant_id", "profile_version_id", "entity_revision_id") REFERENCES app."profile_version_entities" ("tenant_id", "profile_version_id", "entity_revision_id") ON DELETE RESTRICT;

CREATE INDEX "ix_cv_items_tenant_id_profile_version_id_cv_version_id" ON app."cv_items" (tenant_id,profile_version_id,cv_version_id);

CREATE INDEX "ix_cv_items_tenant_id_cv_version_id_cv_section_id" ON app."cv_items" (tenant_id,cv_version_id,cv_section_id);

CREATE INDEX "ix_cv_items_tenant_id_profile_version_id_entity_revision_id" ON app."cv_items" (tenant_id,profile_version_id,entity_revision_id);

ALTER TABLE app."claim_relations" ADD CONSTRAINT "fk_claim_relations_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."claim_relations" ADD CONSTRAINT "fk_claim_relations_tenant_id_profile_id_from_claim_id_claims" FOREIGN KEY ("tenant_id", "profile_id", "from_claim_id") REFERENCES app."claims" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."claim_relations" ADD CONSTRAINT "fk_claim_relations_tenant_id_profile_id_to_claim_id_claims" FOREIGN KEY ("tenant_id", "profile_id", "to_claim_id") REFERENCES app."claims" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_claim_relations_tenant_id_profile_id_to_claim_id" ON app."claim_relations" (tenant_id,profile_id,to_claim_id);

ALTER TABLE app."entity_revision_entities" ADD CONSTRAINT "fk_entity_revision_entities_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revision_entities" ADD CONSTRAINT "fk_entity_revision_entities_tenant_id_profile_i_9f1774af2310" FOREIGN KEY ("tenant_id", "profile_id", "entity_revision_id") REFERENCES app."entity_revisions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."entity_revision_entities" ADD CONSTRAINT "fk_entity_revision_entities_tenant_id_profile_i_a3b870a39353" FOREIGN KEY ("tenant_id", "profile_id", "related_entity_id") REFERENCES app."career_entities" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_entity_revision_entities_tenant_id_profile_i_ef2a8aeb3f12" ON app."entity_revision_entities" (tenant_id,profile_id,entity_revision_id);

CREATE INDEX "ix_entity_revision_entities_tenant_id_profile_i_eebffa142cbd" ON app."entity_revision_entities" (tenant_id,profile_id,related_entity_id);

ALTER TABLE app."profile_version_relations" ADD CONSTRAINT "fk_profile_version_relations_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_relations" ADD CONSTRAINT "fk_profile_version_relations_tenant_id_profile__fc7ab6e1667a" FOREIGN KEY ("tenant_id", "profile_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "profile_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_relations" ADD CONSTRAINT "fk_profile_version_relations_tenant_id_profile__1682ee370100" FOREIGN KEY ("tenant_id", "profile_id", "claim_relation_id", "from_claim_id", "to_claim_id") REFERENCES app."claim_relations" ("tenant_id", "profile_id", "id", "from_claim_id", "to_claim_id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_relations" ADD CONSTRAINT "fk_profile_version_relations_tenant_id_profile__c6e98e8e2723" FOREIGN KEY ("tenant_id", "profile_version_id", "from_claim_id") REFERENCES app."profile_version_claims" ("tenant_id", "profile_version_id", "claim_id") ON DELETE RESTRICT;

ALTER TABLE app."profile_version_relations" ADD CONSTRAINT "fk_profile_version_relations_tenant_id_profile__5ce73b9f2492" FOREIGN KEY ("tenant_id", "profile_version_id", "to_claim_id") REFERENCES app."profile_version_claims" ("tenant_id", "profile_version_id", "claim_id") ON DELETE RESTRICT;

CREATE INDEX "ix_profile_version_relations_tenant_id_profile__261f5b0a7e4b" ON app."profile_version_relations" (tenant_id,profile_id,profile_version_id);

CREATE INDEX "ix_profile_version_relations_tenant_id_profile__83bdfe704b32" ON app."profile_version_relations" (tenant_id,profile_id,claim_relation_id,from_claim_id,to_claim_id);

CREATE INDEX "ix_profile_version_relations_tenant_id_profile__ac835065292a" ON app."profile_version_relations" (tenant_id,profile_version_id,from_claim_id);

CREATE INDEX "ix_profile_version_relations_tenant_id_profile__16c992542150" ON app."profile_version_relations" (tenant_id,profile_version_id,to_claim_id);
