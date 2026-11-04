"""Hosted Storage metadata preflight regression, using synthetic SQL subjects only."""
import json
import unittest
import uuid


def suite(db):
    class PhotoMetadata(unittest.TestCase):
        def setUp(self):
            self.owner, self.foreign, self.asset = [str(uuid.uuid4()) for _ in range(3)]
            self.secret = 'synthetic-photo-metadata-worker-1234567890'
            db.sql(f"INSERT INTO auth.users(id) VALUES('{self.owner}'),('{self.foreign}'); INSERT INTO app.photo_worker_config(secret_hash) VALUES(sha256(convert_to('{self.secret}','UTF8'))) ON CONFLICT(singleton) DO UPDATE SET secret_hash=EXCLUDED.secret_hash")
            self.row = json.loads(db.sql(f"SELECT app.reserve_photo('{self.asset}','{'a'*64}',256,256,100,'{self.secret}')", user=self.owner, role='authenticated'))
            self.key = self.row['objectKey']
            db.sql(f"SET test_support.storage_operation='storage.object.upload'; INSERT INTO storage.objects(bucket_id,name) VALUES('cv-photos','{self.key}')", user=self.owner, role='authenticated')
            db.sql(f"SELECT app.provision_workspace('{uuid.uuid4()}')", user=self.foreign, role='authenticated')

        def visible(self, operation, user=None, role='authenticated'):
            return db.sql(f"SET test_support.storage_operation='{operation}'; SELECT count(*) FROM storage.objects WHERE bucket_id='cv-photos' AND name='{self.key}'", user=user, role=role)

        def test_metadata_preflight_keeps_owner_state_and_operation_fences(self):
            # The gateway issues this metadata GET before the actual byte GET.
            operations = ['object.get_authenticated_info', 'storage.object.get_authenticated']
            for state in ['reserved', 'ready']:
                if state == 'ready':
                    db.sql(f"SELECT app.finish_photo('{self.asset}','{self.secret}')", user=self.owner, role='authenticated')
                for operation in operations:
                    with self.subTest(state=state, operation=operation):
                        self.assertEqual(self.visible(operation, self.owner), '1')
                        self.assertEqual(self.visible(operation, self.foreign), '0')
                        self.assertEqual(self.visible(operation, role='anon'), '0')
                        self.assertEqual(self.visible(operation), '0')
            # Restrictive guards must still defeat unrelated broad SELECT policies.
            db.sql('CREATE POLICY photo_metadata_broad_fixture ON storage.objects FOR SELECT TO authenticated,anon USING(true)')
            try:
                for operation in ['storage.object.list', 'storage.object.sign', 'storage.object.sign_many', 'object.head_authenticated_info', '', 'object']:
                    self.assertEqual(self.visible(operation, self.owner), '0')
                for operation in operations:
                    self.assertEqual(self.visible(operation, self.foreign), '0')
                    # PostgreSQL may reject anon at the ungranted helper before
                    # evaluating the false auth.uid() guard. Both paths deny.
                    try:
                        visible = self.visible(operation, role='anon')
                    except AssertionError as error:
                        self.assertIn('permission denied', str(error))
                    else:
                        self.assertEqual(visible, '0')
            finally:
                db.sql('DROP POLICY photo_metadata_broad_fixture ON storage.objects')
            db.sql(f"SELECT app.delete_photo('{self.asset}',false,'{self.secret}')", user=self.owner, role='authenticated')
            for operation in operations:
                self.assertEqual(self.visible(operation, self.owner), '0')

        def test_metadata_preflight_is_revoked_with_membership_or_base_removal(self):
            self.assertEqual(self.visible('object.get_authenticated_info', self.owner), '1')
            db.sql(f"UPDATE app.tenant_memberships SET state='revoked' WHERE user_id='{self.owner}'")
            self.assertEqual(self.visible('object.get_authenticated_info', self.owner), '0')
            db.sql(f"UPDATE app.tenant_memberships SET state='active' WHERE user_id='{self.owner}'")
            db.sql(f"SELECT app.remove_base_cv('{uuid.uuid4()}',0,0)", user=self.owner, role='authenticated')
            self.assertEqual(self.visible('object.get_authenticated_info', self.owner), '0')
            self.assertEqual(self.visible('storage.object.get_authenticated', self.owner), '0')

    return unittest.defaultTestLoader.loadTestsFromTestCase(PhotoMetadata)
