"""Focused canonical template publication checks against native PostgreSQL."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

VERSIONS = [
    'template_folio_2_1_0', 'template_meridian_2_1_0',
    'template_signal_2_1_0', 'template_archive_2_1_0',
    'template_monograph_2_1_0', None,
]


def suite(db):
    spec = importlib.util.spec_from_file_location('template_behavior', Path(__file__).with_name('behavior.py'))
    behavior = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(behavior)
    behavior.DB = db
    uid, literal = behavior.uid, behavior.literal

    class Templates(behavior.Workspace):
        def save_base(self, layout, revision, error=False):
            value = self.call('save_cv_checkpoint',
                f"'{uid()}','{self.profile['baseDocumentId']}',{revision},'{self.profile['profileVersionId']}',{literal(layout)},'en'",
                error=error)
            return value if error else json.loads(value)

        def save_job(self, layout, job, tailored, error=False, key=None):
            value = self.call('save_job_cv_checkpoint',
                f"'{key or uid()}',NULL,0,'{self.profile['profileVersionId']}','{job['jobVersionId']}',{literal(layout)},'ro'," + ('true' if tailored else 'false'),
                error=error)
            return value if error else json.loads(value)

        def document(self, version):
            return json.loads(db.sql(f"SELECT canonical_json->'document' FROM app.cv_versions WHERE id='{version}'"))

        def test_registered_and_legacy_versions_publish_and_restore_exact_layout(self):
            job = self.job()
            for revision, version in enumerate(VERSIONS, 1):
                with self.subTest(version=version):
                    cv = copy.deepcopy(self.cv)
                    cv['document']['templateVersionId'] = version
                    db.sql(f'SELECT app.validate_canonical({literal(cv)})')
                    published = self.publish(cv, profile=self.profile['profileId'], revision=revision, base_revision=2 * revision - 1)
                    self.profile = published
                    self.assertEqual(self.document(published['baseCvVersionId']), cv['document'])
                    base = self.save_base(cv['document'], 2 * revision)
                    self.assertEqual(self.document(base['cvVersionId']), cv['document'])
                    for tailored in (True, False):
                        key = uid()
                        branch = self.save_job(cv['document'], job, tailored, key=key)
                        saved = self.document(branch['cvVersionId'])
                        self.assertEqual(saved['templateVersionId'], version)
                        self.assertEqual(saved['sections'], cv['document']['sections'])
                        self.assertEqual(self.save_job(cv['document'], job, tailored, key=key), branch)
                        changed = dict(cv['document'], templateVersionId=VERSIONS[(revision + 1) % 5])
                        newer = json.loads(self.call('save_job_cv_checkpoint',
                            f"'{uid()}','{branch['documentId']}',1,'{self.profile['profileVersionId']}','{job['jobVersionId']}',{literal(changed)},'en'," + ('true' if tailored else 'false')))
                        restored = json.loads(self.call('restore_cv_version',
                            f"'{uid()}','{branch['documentId']}',2,'{branch['cvVersionId']}'"))
                        self.assertEqual(self.document(restored['cvVersionId']), saved)
                        self.assertEqual(self.document(branch['cvVersionId']), saved)
                        self.assertEqual(self.document(newer['cvVersionId'])['templateVersionId'], changed['templateVersionId'])
                        self.assertEqual(db.sql(f"SELECT content_hash=app.hash_json(canonical_json-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt') FROM app.cv_versions WHERE id='{restored['cvVersionId']}'"), 't')
                        self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_versions WHERE id='{branch['cvVersionId']}'", user=self.b, role='authenticated'), '0')
                    self.assertEqual(db.sql(f"SELECT head_version_id FROM app.cv_documents WHERE id='{self.profile['baseDocumentId']}'"), base['cvVersionId'])

        def test_invalid_and_unregistered_versions_fail_without_publishing(self):
            job = self.job()
            for version, message in [
                ('template_future_9_0_0', 'UNREGISTERED_TEMPLATE_VERSION'),
                ('template_folio_2_1_1', 'UNREGISTERED_TEMPLATE_VERSION'),
                ('', 'CANONICAL_SCHEMA_INVALID'),
                ('../../template', 'CANONICAL_SCHEMA_INVALID'),
                (42, 'CANONICAL_SCHEMA_INVALID'),
            ]:
                with self.subTest(version=version):
                    cv = copy.deepcopy(self.cv)
                    cv['document']['templateVersionId'] = version
                    self.assertIn(message, db.sql(f'SELECT app.validate_canonical({literal(cv)})', expect_error=True))
                    self.assertIn(message, self.publish(cv, profile=self.profile['profileId'], revision=1, base_revision=1, error=True))
                    self.assertIn(message, self.save_base(cv['document'], 1, error=True))
                    for tailored in (True, False):
                        self.assertIn(message, self.save_job(cv['document'], job, tailored, error=True))
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_versions WHERE tenant_id='{self.wa}'"), '1')
            self.assertEqual(db.sql(f"SELECT head_version_id FROM app.cv_documents WHERE id='{self.profile['baseDocumentId']}'"), self.profile['baseCvVersionId'])

        def test_registered_reference_does_not_bypass_semantic_or_permission_checks(self):
            cv = copy.deepcopy(self.cv)
            cv['document']['templateVersionId'] = VERSIONS[0]
            cv['document']['contactIds'] = ['id_' + uid()]
            self.assertIn('PRIVATE_OR_DANGLING_CONTACT', db.sql(f'SELECT app.validate_canonical({literal(cv)})', expect_error=True))
            self.assertIn('permission denied', db.sql(f'SELECT app.validate_canonical({literal(self.cv)})', role='authenticated', user=self.a, expect_error=True))
            self.assertIn('permission denied', db.sql(f'SELECT app.validate_canonical({literal(self.cv)})', role='anon', expect_error=True))

    checks = unittest.TestSuite(Templates(name) for name in (
        'test_registered_and_legacy_versions_publish_and_restore_exact_layout',
        'test_invalid_and_unregistered_versions_fail_without_publishing',
        'test_registered_reference_does_not_bypass_semantic_or_permission_checks',
    ))
    for cls, names in (
        (behavior.Profiles, (
            'test_input_status_does_not_silently_confirm',
            'test_foreign_claim_cannot_be_inserted_into_a_revision',
            'test_claim_and_published_versions_are_immutable',
            'test_revoked_support_blocks_new_cv_but_not_historical_read',
            'test_invalid_dates_titles_contacts_and_unsupported_prose_rejected',
        )),
        (behavior.Workspace, (
            'test_section_prose_references_are_rejected_by_all_publication_commands',
            'test_same_tenant_wrong_job_document_or_version_is_rejected',
        )),
    ):
        checks.addTests(cls(name) for name in names)
    return checks
