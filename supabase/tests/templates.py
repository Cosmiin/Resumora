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

        def document(self, version):
            return json.loads(db.sql(f"SELECT canonical_json->'document' FROM app.cv_versions WHERE id='{version}'"))

        def test_registered_and_legacy_versions_publish_and_restore_exact_layout(self):
            for version in VERSIONS:
                with self.subTest(version=version):
                    self.setUp()
                    cv=copy.deepcopy(self.cv);cv['document']['templateVersionId']=version
                    published=self.publish(cv,profile=self.profile['profileId'],revision=1,base_revision=1)
                    self.profile=published
                    self.assertEqual(self.document(published['baseCvVersionId']),cv['document'])
                    base=self.save_base(cv['document'],2)
                    self.assertEqual(self.document(base['cvVersionId']),cv['document'])
                    changed=dict(cv['document'],templateVersionId=VERSIONS[1] if version!=VERSIONS[1] else VERSIONS[0])
                    newer=self.save_base(changed,3)
                    key=uid();args=f"'{key}','{base['documentId']}',4,'{base['cvVersionId']}'"
                    restored=json.loads(self.call('restore_cv_version',args))
                    self.assertEqual(json.loads(self.call('restore_cv_version',args)),restored)
                    self.assertEqual(self.document(restored['cvVersionId']),cv['document'])
                    self.assertEqual(self.document(newer['cvVersionId']),changed)
                    self.assertEqual(db.sql(f"SELECT content_hash=app.hash_json(canonical_json-'snapshotId'-'baseCvId'-'version'-'parentSnapshotId'-'createdAt') FROM app.cv_versions WHERE id='{restored['cvVersionId']}'"),'t')
                    self.assertEqual(db.sql(f"SELECT count(*) FROM app.cv_versions WHERE id='{base['cvVersionId']}'",user=self.b,role='authenticated'),'0')

        def test_invalid_and_unregistered_versions_fail_without_publishing(self):
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
    ):
        checks.addTests(cls(name) for name in names)
    return checks
