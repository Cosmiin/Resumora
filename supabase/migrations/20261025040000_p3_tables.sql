-- Resumora architecture 2.0.0 P3. Approved scope: P0-P3 only.

-- Table shells precede all candidate keys and foreign keys in this phase.

SET lock_timeout = '5s';

SET statement_timeout = '60s';

CREATE TABLE app."rule_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "rule_kind" text NOT NULL,
  "version" text NOT NULL,
  "config" jsonb NOT NULL,
  "content_hash" bytea NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."rule_versions" IS 'Reviewed global scoring/dictionary/normalizer/readiness versions.';

CREATE TABLE app."evidence_mappings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "profile_version_id" uuid,
  "job_version_id" uuid NOT NULL,
  "mapping_version" text NOT NULL,
  "content_hash" bytea NOT NULL,
  "review_state" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "cv_version_id" uuid
);

COMMENT ON TABLE app."evidence_mappings" IS 'Reviewed evidence bundle for a profile and job pair.';

CREATE TABLE app."match_evidence" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "evidence_mapping_id" uuid NOT NULL,
  "requirement_atom_id" uuid NOT NULL,
  "claim_id" uuid NOT NULL,
  "cv_item_id" uuid,
  "relation" text NOT NULL,
  "strength" numeric(12,6) NOT NULL,
  "review_state" text NOT NULL,
  "explanation" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "profile_version_id" uuid NOT NULL,
  "job_version_id" uuid NOT NULL,
  "cv_version_id" uuid,
  scope text NOT NULL CHECK (scope IN ('profile','cv')),
  match_class text NOT NULL CHECK (match_class IN ('demonstrated','claimed_limited','transferable','not_evidenced')),
  fulfillment numeric(12,6) NOT NULL DEFAULT 1 CHECK (fulfillment BETWEEN 0 AND 1)
);

COMMENT ON TABLE app."match_evidence" IS 'Explain a criterion-to-fact and optional CV-item match.';

CREATE TABLE app."analysis_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "profile_version_id" uuid,
  "cv_version_id" uuid,
  "job_version_id" uuid NOT NULL,
  "evidence_mapping_id" uuid NOT NULL,
  "rules_version_id" uuid NOT NULL,
  "dictionary_version_id" uuid NOT NULL,
  "normalizer_version_id" uuid NOT NULL,
  "input_fingerprint" bytea NOT NULL,
  "as_of" date NOT NULL,
  "state" text NOT NULL,
  "candidate_fit" numeric(12,6),
  "cv_match" numeric(12,6),
  "eligibility" text NOT NULL,
  "result_hash" bytea NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "matcher_version_id" uuid NOT NULL,
  "weights_version_id" uuid NOT NULL,
  "date_bounds_version_id" uuid NOT NULL,
  "explanation_locale" text NOT NULL,
  "requirements_hash" bytea NOT NULL,
  "input_bundle" jsonb NOT NULL
);

COMMENT ON TABLE app."analysis_runs" IS 'Reproducible Candidate Fit, CV Match and eligibility results.';

CREATE TABLE app."analysis_components" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "analysis_run_id" uuid NOT NULL,
  "requirement_atom_id" uuid,
  "category" text NOT NULL,
  "effective_weight" numeric(12,6) NOT NULL,
  "denominator" numeric(12,6) NOT NULL,
  "contribution" numeric(12,6) NOT NULL,
  "explanation" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp(),
  "job_version_id" uuid NOT NULL,
  "component_key" text NOT NULL
);

COMMENT ON TABLE app."analysis_components" IS 'Persist each score contribution and denominator.';

CREATE TABLE app."recommendations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "analysis_run_id" uuid NOT NULL,
  "recommendation_kind" text NOT NULL,
  "priority" integer NOT NULL,
  "action" jsonb NOT NULL,
  "limitations" text NOT NULL,
  "estimated_delta" numeric(12,6),
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."recommendations" IS 'Truthful next action grounded in analysis and evidence.';

CREATE TABLE app."readiness_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "profile_version_id" uuid,
  "cv_version_id" uuid,
  "job_version_id" uuid,
  "rubric_version_id" uuid NOT NULL,
  "checks" jsonb NOT NULL,
  "input_hash" bytea NOT NULL,
  "result_hash" bytea NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."readiness_runs" IS 'Separate version-pinned review-completion diagnosis.';

CREATE TABLE app."recommendation_requirements" (
  "tenant_id" uuid NOT NULL,
  "recommendation_id" uuid NOT NULL,
  "job_requirement_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."recommendation_requirements" IS 'Enforce recommendation-to-criteria references relationally.';

CREATE TABLE app."recommendation_claims" (
  "tenant_id" uuid NOT NULL,
  "recommendation_id" uuid NOT NULL,
  "claim_id" uuid NOT NULL,
  "support_role" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT transaction_timestamp()
);

COMMENT ON TABLE app."recommendation_claims" IS 'Enforce recommendation-to-supporting-fact references.';

ALTER TABLE app."rule_versions" ADD CONSTRAINT "pk_rule_versions_id" PRIMARY KEY ("id");

ALTER TABLE app."rule_versions" ADD CONSTRAINT "uq_rule_versions_rule_kind_version" UNIQUE ("rule_kind", "version");

ALTER TABLE app."rule_versions" ADD CONSTRAINT "ck_rule_versions_0" CHECK (rule_kind IN ('scoring','dictionary','normalizer','matcher','weights','readiness','date_bounds'));

ALTER TABLE app."rule_versions" ADD CONSTRAINT "ck_rule_versions_1" CHECK (jsonb_typeof(config)='object' AND octet_length(config::text)<=1048576);

ALTER TABLE app."rule_versions" ADD CONSTRAINT "ck_rule_versions_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "pk_evidence_mappings_id" PRIMARY KEY ("id");

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "uq_evidence_mappings_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "uq_evidence_mappings_tenant_id_profile_version__477969719e66" UNIQUE ("tenant_id", "profile_version_id", "job_version_id", "id");

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "uq_evidence_mappings_tenant_id_job_version_id_id" UNIQUE ("tenant_id", "job_version_id", "id");

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "ck_evidence_mappings_0" CHECK (review_state IN ('draft','accepted','rejected'));

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "ck_evidence_mappings_1" CHECK (profile_version_id IS NOT NULL OR cv_version_id IS NOT NULL);

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "ck_evidence_mappings_content_hash_sha256" CHECK (octet_length("content_hash")=32);

ALTER TABLE app."match_evidence" ADD CONSTRAINT "pk_match_evidence_id" PRIMARY KEY ("id");

ALTER TABLE app."match_evidence" ADD CONSTRAINT "uq_match_evidence_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."match_evidence" ADD CONSTRAINT "uq_match_evidence_tenant_id_evidence_mapping_id_e05c1d4a8aa0" UNIQUE ("tenant_id", "evidence_mapping_id", "requirement_atom_id", "claim_id");

ALTER TABLE app."match_evidence" ADD CONSTRAINT "ck_match_evidence_0" CHECK (relation IN ('exact','approved_equivalent','transferable','partial','ambiguous','rejected'));

ALTER TABLE app."match_evidence" ADD CONSTRAINT "ck_match_evidence_1" CHECK (strength IN (0,0.4,0.75,1));

ALTER TABLE app."match_evidence" ADD CONSTRAINT "ck_match_evidence_2" CHECK (review_state='accepted');

ALTER TABLE app."match_evidence" ADD CONSTRAINT "ck_match_evidence_3" CHECK (cv_item_id IS NULL OR cv_version_id IS NOT NULL);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "pk_analysis_runs_id" PRIMARY KEY ("id");

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "uq_analysis_runs_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "uq_analysis_runs_tenant_id_input_fingerprint" UNIQUE ("tenant_id", "input_fingerprint");

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "uq_analysis_runs_tenant_id_job_version_id_id" UNIQUE ("tenant_id", "job_version_id", "id");

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_0" CHECK (candidate_fit IS NULL OR candidate_fit BETWEEN 0 AND 100);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_1" CHECK (cv_match IS NULL OR cv_match BETWEEN 0 AND 100);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_2" CHECK (profile_version_id IS NOT NULL OR candidate_fit IS NULL);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_3" CHECK (cv_version_id IS NOT NULL OR cv_match IS NULL);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_4" CHECK (eligibility IN ('requirements_satisfied','needs_verification','confirmed_requirement_gap'));

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_5" CHECK (state IN ('queued','succeeded','failed','invalidated'));

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_6" CHECK (explanation_locale IN ('ro','en'));

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_7" CHECK (jsonb_typeof(input_bundle)='object' AND octet_length(input_bundle::text)<=1048576);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_input_fingerprint_sha256" CHECK (octet_length("input_fingerprint")=32);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_result_hash_sha256" CHECK (octet_length("result_hash")=32);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "ck_analysis_runs_requirements_hash_sha256" CHECK (octet_length("requirements_hash")=32);

ALTER TABLE app."analysis_components" ADD CONSTRAINT "pk_analysis_components_id" PRIMARY KEY ("id");

ALTER TABLE app."analysis_components" ADD CONSTRAINT "uq_analysis_components_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."analysis_components" ADD CONSTRAINT "uq_analysis_components_tenant_id_analysis_run_i_b6e7879a0fda" UNIQUE ("tenant_id", "analysis_run_id", "component_key");

ALTER TABLE app."analysis_components" ADD CONSTRAINT "ck_analysis_components_0" CHECK (effective_weight>=0 AND effective_weight<=100);

ALTER TABLE app."analysis_components" ADD CONSTRAINT "ck_analysis_components_1" CHECK (denominator>=0);

ALTER TABLE app."analysis_components" ADD CONSTRAINT "ck_analysis_components_2" CHECK (contribution>=0 AND contribution<=100);

ALTER TABLE app."recommendations" ADD CONSTRAINT "pk_recommendations_id" PRIMARY KEY ("id");

ALTER TABLE app."recommendations" ADD CONSTRAINT "uq_recommendations_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."recommendations" ADD CONSTRAINT "uq_recommendations_tenant_id_analysis_run_id_id" UNIQUE ("tenant_id", "analysis_run_id", "id");

ALTER TABLE app."recommendations" ADD CONSTRAINT "ck_recommendations_0" CHECK (priority>=0);

ALTER TABLE app."recommendations" ADD CONSTRAINT "ck_recommendations_1" CHECK (jsonb_typeof(action)='object' AND octet_length(action::text)<=65536);

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "pk_readiness_runs_id" PRIMARY KEY ("id");

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "uq_readiness_runs_tenant_id_id" UNIQUE ("tenant_id", "id");

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "uq_readiness_runs_tenant_id_input_hash" UNIQUE ("tenant_id", "input_hash");

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "ck_readiness_runs_0" CHECK (profile_version_id IS NOT NULL OR cv_version_id IS NOT NULL);

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "ck_readiness_runs_1" CHECK (jsonb_typeof(checks)='object' AND octet_length(checks::text)<=65536);

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "ck_readiness_runs_input_hash_sha256" CHECK (octet_length("input_hash")=32);

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "ck_readiness_runs_result_hash_sha256" CHECK (octet_length("result_hash")=32);

ALTER TABLE app."recommendation_requirements" ADD CONSTRAINT "pk_recommendation_requirements_tenant_id_recomm_e801e4ac1748" PRIMARY KEY ("tenant_id", "recommendation_id", "job_requirement_id");

ALTER TABLE app."recommendation_claims" ADD CONSTRAINT "pk_recommendation_claims_tenant_id_recommendati_d87b098e9c11" PRIMARY KEY ("tenant_id", "recommendation_id", "claim_id");

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "fk_evidence_mappings_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "fk_evidence_mappings_tenant_id_profile_version__611a172aac9c" FOREIGN KEY ("tenant_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "fk_evidence_mappings_tenant_id_cv_version_id_cv_versions" FOREIGN KEY ("tenant_id", "cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."evidence_mappings" ADD CONSTRAINT "fk_evidence_mappings_tenant_id_job_version_id_job_versions" FOREIGN KEY ("tenant_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_evidence_mappings_tenant_id_cv_version_id" ON app."evidence_mappings" (tenant_id,cv_version_id);

ALTER TABLE app."match_evidence" ADD CONSTRAINT "fk_match_evidence_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."match_evidence" ADD CONSTRAINT "fk_match_evidence_tenant_id_job_version_id_evid_d617de2118a7" FOREIGN KEY ("tenant_id", "job_version_id", "evidence_mapping_id") REFERENCES app."evidence_mappings" ("tenant_id", "job_version_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."match_evidence" ADD CONSTRAINT "fk_match_evidence_tenant_id_job_version_id_requ_b33365309195" FOREIGN KEY ("tenant_id", "job_version_id", "requirement_atom_id") REFERENCES app."requirement_atoms" ("tenant_id", "job_version_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."match_evidence" ADD CONSTRAINT "fk_match_evidence_tenant_id_profile_version_id__3d5f9b35c987" FOREIGN KEY ("tenant_id", "profile_version_id", "claim_id") REFERENCES app."profile_version_claims" ("tenant_id", "profile_version_id", "claim_id") ON DELETE RESTRICT;

ALTER TABLE app."match_evidence" ADD CONSTRAINT "fk_match_evidence_tenant_id_cv_version_id_cv_it_8d82d6a30729" FOREIGN KEY ("tenant_id", "cv_version_id", "cv_item_id") REFERENCES app."cv_items" ("tenant_id", "cv_version_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_match_evidence_tenant_id_job_version_id_evid_3896cddd1307" ON app."match_evidence" (tenant_id,job_version_id,evidence_mapping_id);

CREATE INDEX "ix_match_evidence_tenant_id_job_version_id_requ_e4c04fae9fb2" ON app."match_evidence" (tenant_id,job_version_id,requirement_atom_id);

CREATE INDEX "ix_match_evidence_tenant_id_profile_version_id_claim_id" ON app."match_evidence" (tenant_id,profile_version_id,claim_id);

CREATE INDEX "ix_match_evidence_tenant_id_cv_version_id_cv_item_id" ON app."match_evidence" (tenant_id,cv_version_id,cv_item_id);

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_tenant_id_profile_version_id_p_02f65eea791e" FOREIGN KEY ("tenant_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_tenant_id_cv_version_id_cv_versions" FOREIGN KEY ("tenant_id", "cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_tenant_id_job_version_id_job_versions" FOREIGN KEY ("tenant_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_tenant_id_job_version_id_evide_8c2bb61cc37a" FOREIGN KEY ("tenant_id", "job_version_id", "evidence_mapping_id") REFERENCES app."evidence_mappings" ("tenant_id", "job_version_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_rules_version_id_rule_versions" FOREIGN KEY ("rules_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_dictionary_version_id_rule_versions" FOREIGN KEY ("dictionary_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_normalizer_version_id_rule_versions" FOREIGN KEY ("normalizer_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_matcher_version_id_rule_versions" FOREIGN KEY ("matcher_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_weights_version_id_rule_versions" FOREIGN KEY ("weights_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_runs" ADD CONSTRAINT "fk_analysis_runs_date_bounds_version_id_rule_versions" FOREIGN KEY ("date_bounds_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

CREATE INDEX "ix_analysis_runs_tenant_id_profile_version_id" ON app."analysis_runs" (tenant_id,profile_version_id);

CREATE INDEX "ix_analysis_runs_tenant_id_cv_version_id" ON app."analysis_runs" (tenant_id,cv_version_id);

CREATE INDEX "ix_analysis_runs_tenant_id_job_version_id_evide_07190353e59e" ON app."analysis_runs" (tenant_id,job_version_id,evidence_mapping_id);

ALTER TABLE app."analysis_components" ADD CONSTRAINT "fk_analysis_components_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_components" ADD CONSTRAINT "fk_analysis_components_tenant_id_job_version_id_170f69128918" FOREIGN KEY ("tenant_id", "job_version_id", "analysis_run_id") REFERENCES app."analysis_runs" ("tenant_id", "job_version_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."analysis_components" ADD CONSTRAINT "fk_analysis_components_tenant_id_job_version_id_a5e5e161bfba" FOREIGN KEY ("tenant_id", "job_version_id", "requirement_atom_id") REFERENCES app."requirement_atoms" ("tenant_id", "job_version_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_analysis_components_tenant_id_job_version_id_2b981196f538" ON app."analysis_components" (tenant_id,job_version_id,analysis_run_id);

CREATE INDEX "ix_analysis_components_tenant_id_job_version_id_54a80ba9cf9c" ON app."analysis_components" (tenant_id,job_version_id,requirement_atom_id);

ALTER TABLE app."recommendations" ADD CONSTRAINT "fk_recommendations_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."recommendations" ADD CONSTRAINT "fk_recommendations_tenant_id_analysis_run_id_analysis_runs" FOREIGN KEY ("tenant_id", "analysis_run_id") REFERENCES app."analysis_runs" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "fk_readiness_runs_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "fk_readiness_runs_tenant_id_profile_version_id__eca72a48e2b6" FOREIGN KEY ("tenant_id", "profile_version_id") REFERENCES app."profile_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "fk_readiness_runs_tenant_id_cv_version_id_cv_versions" FOREIGN KEY ("tenant_id", "cv_version_id") REFERENCES app."cv_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "fk_readiness_runs_tenant_id_job_version_id_job_versions" FOREIGN KEY ("tenant_id", "job_version_id") REFERENCES app."job_versions" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."readiness_runs" ADD CONSTRAINT "fk_readiness_runs_rubric_version_id_rule_versions" FOREIGN KEY ("rubric_version_id") REFERENCES app."rule_versions" ("id") ON DELETE RESTRICT;

CREATE INDEX "ix_readiness_runs_tenant_id_profile_version_id" ON app."readiness_runs" (tenant_id,profile_version_id);

CREATE INDEX "ix_readiness_runs_tenant_id_cv_version_id" ON app."readiness_runs" (tenant_id,cv_version_id);

CREATE INDEX "ix_readiness_runs_tenant_id_job_version_id" ON app."readiness_runs" (tenant_id,job_version_id);

ALTER TABLE app."recommendation_requirements" ADD CONSTRAINT "fk_recommendation_requirements_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."recommendation_requirements" ADD CONSTRAINT "fk_recommendation_requirements_tenant_id_recomm_f1936b1031ea" FOREIGN KEY ("tenant_id", "recommendation_id") REFERENCES app."recommendations" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."recommendation_requirements" ADD CONSTRAINT "fk_recommendation_requirements_tenant_id_job_re_a407adf7e7f2" FOREIGN KEY ("tenant_id", "job_requirement_id") REFERENCES app."job_requirements" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_recommendation_requirements_tenant_id_job_requirement_id" ON app."recommendation_requirements" (tenant_id,job_requirement_id);

ALTER TABLE app."recommendation_claims" ADD CONSTRAINT "fk_recommendation_claims_tenant_id_tenants" FOREIGN KEY ("tenant_id") REFERENCES app."tenants" ("id") ON DELETE RESTRICT;

ALTER TABLE app."recommendation_claims" ADD CONSTRAINT "fk_recommendation_claims_tenant_id_recommendati_b7021faf46bf" FOREIGN KEY ("tenant_id", "recommendation_id") REFERENCES app."recommendations" ("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE app."recommendation_claims" ADD CONSTRAINT "fk_recommendation_claims_tenant_id_claim_id_claims" FOREIGN KEY ("tenant_id", "claim_id") REFERENCES app."claims" ("tenant_id", "id") ON DELETE RESTRICT;

CREATE INDEX "ix_recommendation_claims_tenant_id_claim_id" ON app."recommendation_claims" (tenant_id,claim_id);

ALTER TABLE app.match_evidence DROP CONSTRAINT "uq_match_evidence_tenant_id_evidence_mapping_id_e05c1d4a8aa0";

ALTER TABLE app.match_evidence ADD CONSTRAINT uq_match_evidence_scope UNIQUE (tenant_id,evidence_mapping_id,requirement_atom_id,claim_id,scope);
