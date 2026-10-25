-- Resumora architecture 2.0.0 P2. Approved scope: P0-P3 only.

-- Table shells precede all candidate keys and foreign keys in this phase.

SET lock_timeout = '5s';

SET statement_timeout = '60s';

CREATE TABLE app."jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "canonical_url_hash" bytea,
  "head_version_id" uuid,
  "draft_revision" bigint NOT NULL DEFAULT 0,
  "draft_payload" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."jobs" IS 'Stable job record and reviewed-version head.';

CREATE TABLE app."job_captures" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "source_document_id" uuid NOT NULL,
  "capture_kind" text NOT NULL,
  "source_hash" bytea NOT NULL,
  "consent_event_id" uuid,
  "recorded_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."job_captures" IS 'Preserve user-authorized job text capture provenance.';

CREATE TABLE app."job_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "sequence" bigint NOT NULL,
  "parent_version_id" uuid,
  "title" text NOT NULL,
  "company" text NOT NULL,
  "location_text" text,
  "reviewed_text" text NOT NULL,
  "content_hash" bytea NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "source_document_id" uuid NOT NULL,
  "job_capture_id" uuid NOT NULL
);

COMMENT ON TABLE app."job_versions" IS 'Immutable reviewed job description checkpoints.';

CREATE TABLE app."job_requirements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "job_version_id" uuid NOT NULL,
  "requirement_key" text NOT NULL,
  "primary_category" text NOT NULL,
  "priority" text NOT NULL,
  "hard_gate" boolean NOT NULL,
  "gate_basis" text,
  "source_span_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "job_id" uuid NOT NULL,
  "source_document_id" uuid NOT NULL
);

COMMENT ON TABLE app."job_requirements" IS 'Source-backed criteria with priority and hard-gate meaning.';

CREATE TABLE app."requirement_atoms" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "requirement_id" uuid NOT NULL,
  "group_key" text NOT NULL,
  "operator" text NOT NULL,
  "polarity" text NOT NULL,
  "concept_key" text,
  "weight_share" numeric(12,6) NOT NULL,
  "source_span_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "job_id" uuid NOT NULL,
  "source_document_id" uuid NOT NULL,
  "job_version_id" uuid NOT NULL
);

COMMENT ON TABLE app."requirement_atoms" IS 'Atomic AND/OR criteria and polarity for deterministic scoring.';

CREATE TABLE app."applications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "job_version_id" uuid NOT NULL,
  "cv_document_id" uuid,
  "chosen_cv_version_id" uuid,
  "user_stage" text NOT NULL,
  "revision" bigint NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "job_id" uuid NOT NULL
);

COMMENT ON TABLE app."applications" IS 'Manual application workspace with separate chosen/current CV.';

CREATE TABLE app."application_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "application_id" uuid NOT NULL,
  "event_kind" text NOT NULL,
  "actor_user_id" uuid,
  "actual_sent_date" date,
  "recorded_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "cv_version_id" uuid,
  "retracts_event_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "job_id" uuid NOT NULL,
  "job_version_id" uuid NOT NULL,
  "document_id" uuid,
  "request_id" uuid NOT NULL
);

COMMENT ON TABLE app."application_events" IS 'Immutable stage, sent-attestation and correction ledger.';

CREATE TABLE app."next_actions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "application_id" uuid NOT NULL,
  "action_kind" text NOT NULL,
  "label" text NOT NULL,
  "due_date" date,
  "state" text NOT NULL,
  "revision" bigint NOT NULL DEFAULT 0,
  "reminder_mode" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."next_actions" IS 'User-controlled next step for an application.';

ALTER TABLE app."source_documents" ADD COLUMN "job_id" uuid;

ALTER TABLE app."source_spans" ADD COLUMN "job_id" uuid;

ALTER TABLE app."cv_documents" ADD COLUMN "job_id" uuid;

ALTER TABLE app."cv_versions" ADD COLUMN "job_version_id" uuid;

ALTER TABLE app."cv_versions" ADD COLUMN "job_id" uuid;

ALTER TABLE app."source_documents" ADD CONSTRAINT "uq_source_documents_tenant_id_job_id_id" UNIQUE ("tenant_id", "job_id", "id");

ALTER TABLE app."source_spans" ADD CONSTRAINT "uq_source_spans_tenant_id_job_id_source_document_id_id" UNIQUE ("tenant_id", "job_id", "source_document_id", "id");

ALTER TABLE app."cv_documents" ADD CONSTRAINT "uq_cv_documents_tenant_id_job_id_id" UNIQUE ("tenant_id", "job_id", "id");

ALTER TABLE app."jobs" ADD CONSTRAINT "pk_jobs_id" PRIMARY KEY ("id");

ALTER TABLE app."jobs" ADD CONSTRAINT "uq_jobs_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."jobs" ADD CONSTRAINT "ck_jobs_0" CHECK (draft_revision>=0);

ALTER TABLE app."jobs" ADD CONSTRAINT "ck_jobs_1" CHECK (jsonb_typeof(draft_payload)='object' AND octet_length(draft_payload::text)<=1048576);

ALTER TABLE app."jobs" ADD CONSTRAINT "ck_jobs_canonical_url_hash_sha256" CHECK (octet_length("canonical_url_hash")=32);

ALTER TABLE app."job_captures" ADD CONSTRAINT "pk_job_captures_id" PRIMARY KEY ("id");

ALTER TABLE app."job_captures" ADD CONSTRAINT "uq_job_captures_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."job_captures" ADD CONSTRAINT "uq_job_captures_tenant_id_job_id_id" UNIQUE ("tenant_id", "job_id", "id");

ALTER TABLE app."job_captures" ADD CONSTRAINT "uq_job_captures_tenant_id_job_id_source_document_id_id" UNIQUE ("tenant_id", "job_id", "source_document_id", "id");

ALTER TABLE app."job_captures" ADD CONSTRAINT "ck_job_captures_0" CHECK (capture_kind IN ('manual','paste'));

ALTER TABLE app."job_captures" ADD CONSTRAINT "ck_job_captures_source_hash_sha256" CHECK (octet_length("source_hash")=32);

ALTER TABLE app."job_versions" ADD CONSTRAINT "pk_job_versions_id" PRIMARY KEY ("id");

ALTER TABLE app."job_versions" ADD CONSTRAINT "uq_job_versions_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."job_versions" ADD CONSTRAINT "uq_job_versions_tenant_id_job_id_id" UNIQUE ("tenant_id", "job_id", "id");

ALTER TABLE app."job_versions" ADD CONSTRAINT "uq_job_versions_tenant_id_job_id_source_document_id_id" UNIQUE ("tenant_id", "job_id", "source_document_id", "id");

ALTER TABLE app."job_versions" ADD CONSTRAINT "uq_job_versions_tenant_id_job_id_sequence" UNIQUE ("tenant_id", "job_id", "sequence");

ALTER TABLE app."job_versions" ADD CONSTRAINT "ck_job_versions_0" CHECK (sequence>0);

ALTER TABLE app."job_versions" ADD CONSTRAINT "ck_job_versions_1" CHECK (length(title) BETWEEN 1 AND 20000);

ALTER TABLE app."job_versions" ADD CONSTRAINT "ck_job_versions_2" CHECK (length(company) BETWEEN 1 AND 20000);

ALTER TABLE app."job_versions" ADD CONSTRAINT "ck_job_versions_3" CHECK (length(reviewed_text) BETWEEN 1 AND 200000);

ALTER TABLE app."job_versions" ADD CONSTRAINT "ck_job_versions_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."job_requirements" ADD CONSTRAINT "pk_job_requirements_id" PRIMARY KEY ("id");

ALTER TABLE app."job_requirements" ADD CONSTRAINT "uq_job_requirements_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."job_requirements" ADD CONSTRAINT "uq_job_requirements_tenant_id_job_version_id_id" UNIQUE ("tenant_id", "job_version_id", "id");

ALTER TABLE app."job_requirements" ADD CONSTRAINT "uq_job_requirements_tenant_id_job_version_id_requirement_key" UNIQUE ("tenant_id", "job_version_id", "requirement_key");

ALTER TABLE app."job_requirements" ADD CONSTRAINT "ck_job_requirements_0" CHECK (priority IN ('required','preferred','unspecified'));

ALTER TABLE app."job_requirements" ADD CONSTRAINT "ck_job_requirements_1" CHECK (primary_category IN ('technical','responsibilities','experience','achievements','qualifications','professional','title'));

ALTER TABLE app."job_requirements" ADD CONSTRAINT "ck_job_requirements_2" CHECK (NOT hard_gate OR length(gate_basis)>0);

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "pk_requirement_atoms_id" PRIMARY KEY ("id");

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "uq_requirement_atoms_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "uq_requirement_atoms_tenant_id_job_version_id_id" UNIQUE ("tenant_id", "job_version_id", "id");

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "ck_requirement_atoms_0" CHECK (operator IN ('AND','OR'));

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "ck_requirement_atoms_1" CHECK (polarity IN ('positive','not_required','ambiguous'));

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "ck_requirement_atoms_2" CHECK (weight_share>0 AND weight_share<=1);

ALTER TABLE app."applications" ADD CONSTRAINT "pk_applications_id" PRIMARY KEY ("id");

ALTER TABLE app."applications" ADD CONSTRAINT "uq_applications_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."applications" ADD CONSTRAINT "uq_applications_tenant_id_job_id_id" UNIQUE ("tenant_id", "job_id", "id");

CREATE UNIQUE INDEX "uq_applications_tenant_id_cv_document_id" ON app."applications" ("tenant_id", "cv_document_id") WHERE cv_document_id IS NOT NULL;

ALTER TABLE app."applications" ADD CONSTRAINT "ck_applications_0" CHECK (user_stage IN ('saved','drafting','applied','interview','offer','closed'));

ALTER TABLE app."applications" ADD CONSTRAINT "ck_applications_1" CHECK (revision>=0);

ALTER TABLE app."applications" ADD CONSTRAINT "ck_applications_2" CHECK (chosen_cv_version_id IS NULL OR cv_document_id IS NOT NULL);

ALTER TABLE app."application_events" ADD CONSTRAINT "pk_application_events_id" PRIMARY KEY ("id");

ALTER TABLE app."application_events" ADD CONSTRAINT "uq_application_events_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."application_events" ADD CONSTRAINT "uq_application_events_tenant_id_application_id_id" UNIQUE ("tenant_id", "application_id", "id");

ALTER TABLE app."application_events" ADD CONSTRAINT "uq_application_events_tenant_id_request_id" UNIQUE ("tenant_id", "request_id");

CREATE UNIQUE INDEX "uq_application_events_tenant_id_retracts_event_id" ON app."application_events" ("tenant_id", "retracts_event_id") WHERE retracts_event_id IS NOT NULL;

ALTER TABLE app."application_events" ADD CONSTRAINT "ck_application_events_0" CHECK (event_kind IN ('mark_sent','retract_sent','correction','stage_changed'));

ALTER TABLE app."application_events" ADD CONSTRAINT "ck_application_events_1" CHECK (cv_version_id IS NULL OR document_id IS NOT NULL);

ALTER TABLE app."application_events" ADD CONSTRAINT "ck_application_events_2" CHECK ((event_kind='retract_sent')=(retracts_event_id IS NOT NULL));

ALTER TABLE app."application_events" ADD CONSTRAINT "ck_application_events_3" CHECK (event_kind='mark_sent' OR actual_sent_date IS NULL);

ALTER TABLE app."next_actions" ADD CONSTRAINT "pk_next_actions_id" PRIMARY KEY ("id");

ALTER TABLE app."next_actions" ADD CONSTRAINT "uq_next_actions_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."next_actions" ADD CONSTRAINT "ck_next_actions_0" CHECK (state IN ('open','done','cancelled'));

ALTER TABLE app."next_actions" ADD CONSTRAINT "ck_next_actions_1" CHECK (reminder_mode='none');

ALTER TABLE app."next_actions" ADD CONSTRAINT "ck_next_actions_2" CHECK (revision>=0);

ALTER TABLE app."next_actions" ADD CONSTRAINT "ck_next_actions_3" CHECK (length(label) BETWEEN 1 AND 1000);

ALTER TABLE app."source_documents" ADD CONSTRAINT "fk_source_documents_tenant_id_job_id_jobs" FOREIGN KEY ("tenant_id", "job_id") REFERENCES app."jobs" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."source_spans" ADD CONSTRAINT "fk_source_spans_tenant_id_job_id_source_documen_781851d4f77e" FOREIGN KEY ("tenant_id", "job_id", "source_document_id") REFERENCES app."source_documents" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_documents" ADD CONSTRAINT "fk_cv_documents_tenant_id_job_id_jobs" FOREIGN KEY ("tenant_id", "job_id") REFERENCES app."jobs" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."cv_versions" ADD CONSTRAINT "fk_cv_versions_tenant_id_job_id_job_version_id_job_versions" FOREIGN KEY ("tenant_id", "job_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."jobs" ADD CONSTRAINT "fk_jobs_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."jobs" ADD CONSTRAINT "fk_jobs_tenant_id_id_head_version_id_job_versions" FOREIGN KEY ("tenant_id", "id", "head_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "id") ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX "ix_jobs_tenant_id_canonical_url_hash" ON app."jobs" (tenant_id,canonical_url_hash);

CREATE INDEX "ix_jobs_tenant_id_id_head_version_id" ON app."jobs" (tenant_id,id,head_version_id);

ALTER TABLE app."job_captures" ADD CONSTRAINT "fk_job_captures_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."job_captures" ADD CONSTRAINT "fk_job_captures_tenant_id_job_id_jobs" FOREIGN KEY ("tenant_id", "job_id") REFERENCES app."jobs" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."job_captures" ADD CONSTRAINT "fk_job_captures_tenant_id_job_id_source_documen_bff5946eb00c" FOREIGN KEY ("tenant_id", "job_id", "source_document_id") REFERENCES app."source_documents" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."job_captures" ADD CONSTRAINT "fk_job_captures_tenant_id_consent_event_id_consent_events" FOREIGN KEY ("tenant_id", "consent_event_id") REFERENCES app."consent_events" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_job_captures_tenant_id_consent_event_id" ON app."job_captures" (tenant_id,consent_event_id);

ALTER TABLE app."job_versions" ADD CONSTRAINT "fk_job_versions_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."job_versions" ADD CONSTRAINT "fk_job_versions_tenant_id_job_id_source_documen_1e72a16c26c1" FOREIGN KEY ("tenant_id", "job_id", "source_document_id", "job_capture_id") REFERENCES app."job_captures" ("tenant_id", "job_id", "source_document_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."job_versions" ADD CONSTRAINT "fk_job_versions_tenant_id_job_id_jobs" FOREIGN KEY ("tenant_id", "job_id") REFERENCES app."jobs" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."job_versions" ADD CONSTRAINT "fk_job_versions_tenant_id_job_id_parent_version_1eca79e66b19" FOREIGN KEY ("tenant_id", "job_id", "parent_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_job_versions_tenant_id_job_id_source_documen_4643c97e8221" ON app."job_versions" (tenant_id,job_id,source_document_id,job_capture_id);

CREATE INDEX "ix_job_versions_tenant_id_job_id_parent_version_id" ON app."job_versions" (tenant_id,job_id,parent_version_id);

ALTER TABLE app."job_requirements" ADD CONSTRAINT "fk_job_requirements_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."job_requirements" ADD CONSTRAINT "fk_job_requirements_tenant_id_job_id_source_doc_f5b3db4e77de" FOREIGN KEY ("tenant_id", "job_id", "source_document_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "source_document_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."job_requirements" ADD CONSTRAINT "fk_job_requirements_tenant_id_job_id_source_doc_11b7f688e0a6" FOREIGN KEY ("tenant_id", "job_id", "source_document_id", "source_span_id") REFERENCES app."source_spans" ("tenant_id", "job_id", "source_document_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_job_requirements_tenant_id_job_id_source_doc_6c0961925056" ON app."job_requirements" (tenant_id,job_id,source_document_id,job_version_id);

CREATE INDEX "ix_job_requirements_tenant_id_job_id_source_doc_d08ad9c23368" ON app."job_requirements" (tenant_id,job_id,source_document_id,source_span_id);

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "fk_requirement_atoms_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "fk_requirement_atoms_tenant_id_job_id_source_do_099a7506fde7" FOREIGN KEY ("tenant_id", "job_id", "source_document_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "source_document_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "fk_requirement_atoms_tenant_id_job_id_source_do_a708c78631e5" FOREIGN KEY ("tenant_id", "job_id", "source_document_id", "source_span_id") REFERENCES app."source_spans" ("tenant_id", "job_id", "source_document_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."requirement_atoms" ADD CONSTRAINT "fk_requirement_atoms_tenant_id_job_version_id_r_c32b81b779e0" FOREIGN KEY ("tenant_id", "job_version_id", "requirement_id") REFERENCES app."job_requirements" ("tenant_id", "job_version_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_requirement_atoms_tenant_id_job_id_source_do_8ef68ca2a50f" ON app."requirement_atoms" (tenant_id,job_id,source_document_id,job_version_id);

CREATE INDEX "ix_requirement_atoms_tenant_id_job_id_source_do_11e481f20017" ON app."requirement_atoms" (tenant_id,job_id,source_document_id,source_span_id);

CREATE INDEX "ix_requirement_atoms_tenant_id_job_version_id_requirement_id" ON app."requirement_atoms" (tenant_id,job_version_id,requirement_id);

ALTER TABLE app."applications" ADD CONSTRAINT "fk_applications_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."applications" ADD CONSTRAINT "fk_applications_tenant_id_job_id_job_version_id_job_versions" FOREIGN KEY ("tenant_id", "job_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."applications" ADD CONSTRAINT "fk_applications_tenant_id_job_id_cv_document_id_cv_documents" FOREIGN KEY ("tenant_id", "job_id", "cv_document_id") REFERENCES app."cv_documents" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."applications" ADD CONSTRAINT "fk_applications_tenant_id_cv_document_id_chosen_2a80867408e5" FOREIGN KEY ("tenant_id", "cv_document_id", "chosen_cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "document_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_applications_tenant_id_job_id_job_version_id" ON app."applications" (tenant_id,job_id,job_version_id);

CREATE INDEX "ix_applications_tenant_id_job_id_cv_document_id" ON app."applications" (tenant_id,job_id,cv_document_id);

CREATE INDEX "ix_applications_tenant_id_cv_document_id_chosen_5e0927b59acf" ON app."applications" (tenant_id,cv_document_id,chosen_cv_version_id);

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_job_id_applicat_b4a731f75dd8" FOREIGN KEY ("tenant_id", "job_id", "application_id") REFERENCES app."applications" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_job_id_job_vers_2f8638351f9d" FOREIGN KEY ("tenant_id", "job_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_job_id_document_457c40b73308" FOREIGN KEY ("tenant_id", "job_id", "document_id") REFERENCES app."cv_documents" ("tenant_id", "job_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_document_id_cv__495c83a77250" FOREIGN KEY ("tenant_id", "document_id", "cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "document_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_application_id__3f79844a6417" FOREIGN KEY ("tenant_id", "application_id", "retracts_event_id") REFERENCES app."application_events" ("tenant_id", "application_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_tenant_id_request_id_idem_f314493594e9" FOREIGN KEY ("tenant_id", "request_id") REFERENCES app."idempotency_requests" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."application_events" ADD CONSTRAINT "fk_application_events_actor_user_id_auth_users" FOREIGN KEY ("actor_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL;

CREATE INDEX "ix_application_events_tenant_id_job_id_application_id" ON app."application_events" (tenant_id,job_id,application_id);

CREATE INDEX "ix_application_events_tenant_id_job_id_job_version_id" ON app."application_events" (tenant_id,job_id,job_version_id);

CREATE INDEX "ix_application_events_tenant_id_job_id_document_id" ON app."application_events" (tenant_id,job_id,document_id);

CREATE INDEX "ix_application_events_tenant_id_document_id_cv_version_id" ON app."application_events" (tenant_id,document_id,cv_version_id);

CREATE INDEX "ix_application_events_tenant_id_application_id__53a901437306" ON app."application_events" (tenant_id,application_id,retracts_event_id);

ALTER TABLE app."next_actions" ADD CONSTRAINT "fk_next_actions_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."next_actions" ADD CONSTRAINT "fk_next_actions_tenant_id_application_id_applications" FOREIGN KEY ("tenant_id", "application_id") REFERENCES app."applications" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_next_actions_tenant_id_application_id" ON app."next_actions" (tenant_id,application_id);

ALTER TABLE app.cv_documents DROP CONSTRAINT ck_cv_documents_0;

ALTER TABLE app.cv_documents ADD CONSTRAINT ck_cv_document_job_context CHECK ((document_kind='base' AND job_id IS NULL) OR (document_kind='job' AND job_id IS NOT NULL));

ALTER TABLE app.cv_versions DROP CONSTRAINT ck_cv_versions_2;

ALTER TABLE app.cv_versions ADD CONSTRAINT ck_cv_version_job_context CHECK ((job_id IS NULL)=(job_version_id IS NULL) AND tailoring_state IN ('not_tailored','tailored') AND (tailoring_state<>'tailored' OR job_version_id IS NOT NULL));
