"""Focused real SQL checks for unconfirmed editor snapshots; no hosted access."""
import concurrent.futures
import json
import importlib.util
from pathlib import Path
import unittest
import uuid


def suite(db):
    def uid():
        return str(uuid.uuid4())

    def literal(value):
        return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"

    spec = importlib.util.spec_from_file_location('canonical_behavior', Path(__file__).with_name('behavior.py'))
    canonical = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(canonical)
    canonical.DB = db

    class EditorDrafts(unittest.TestCase):
        def setUp(self):
            self.a, self.b = uid(), uid()
            db.sql(f"INSERT INTO auth.users(id) VALUES ('{self.a}'),('{self.b}')")
            self.payload = {'schemaVersion': 'resumora-editor-draft/1', 'content': {
                'name': {'value': '', 'status': 'pending', 'id': 'local-id'},
                'contributions': [{'id': 'stable-contribution', 'sourceId': 'answer-source'}]},
                'answers': [{'id': 'answer-id', 'question': 'Q?', 'answer': 'Context', 'cvFieldId': None}]}

        def call(self, name, args='', user=None, error=False):
            return db.sql(f'SELECT app.{name}({args})', user=user or self.a, role='authenticated', expect_error=error)

        def save(self, payload=None, revision=0, key=None, error=False):
            result = self.call('save_base_draft', f"'{key or uid()}',{revision},{literal(payload or self.payload)},'autosave'", error=error)
            return result if error else json.loads(result)

        def test_roundtrip_pending_answers_history_restore_and_canonical_preservation(self):
            self.assertEqual(self.call('load_base_draft'), '')
            self.assertEqual(json.loads(self.call('base_draft_history')), [])
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.tenants WHERE owner_user_id='{self.a}'"), '0')
            first = self.save()
            second = self.save({**self.payload, 'answers': []}, 1)
            self.assertEqual(json.loads(self.call('load_base_draft')), second)
            restored = json.loads(self.call('restore_base_draft', f"'{uid()}',2,'{first['id']}'"))
            self.assertEqual(restored['payload'], self.payload)
            self.assertEqual(restored['parentId'], second['id'])
            self.assertEqual(restored['restoredFrom'], first['id'])
            self.assertEqual(restored['revision'], 3)
            self.assertIsNone(first['parentId'])
            self.assertEqual(json.loads(self.call('base_draft_history')), [restored, second, first])
            # No canonical graph/version is invented or confirmed by editor saves.
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.profile_versions WHERE tenant_id IN (SELECT id FROM app.tenants WHERE owner_user_id='{self.a}')"), '0')
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.confirmation_events WHERE tenant_id IN (SELECT id FROM app.tenants WHERE owner_user_id='{self.a}')"), '0')

        def test_cas_replay_mismatch_expiry_and_atomic_rollback(self):
            key = uid()
            first = self.save(key=key)
            self.save(revision=1)
            self.assertEqual(self.save(key=key), first)
            self.assertIn('VERSION_CONFLICT', self.save(revision=0, error=True))
            self.assertIn('IDEMPOTENCY_BODY_MISMATCH', self.save(revision=1, key=key, error=True))
            db.sql(f"UPDATE app.idempotency_requests SET expires_at=now()-interval '1 day' WHERE command_kind='save_base_draft' AND result_refs->>'id'='{first['id']}'")
            self.assertIn('REQUEST_EXPIRED', self.save(key=key, error=True))
            self.assertEqual(len(json.loads(self.call('base_draft_history'))), 2)
            fresh = uid()
            self.assertIn('INVALID_EDITOR_PAYLOAD', self.save({'schemaVersion': 'bad'}, revision=2, key=fresh, error=True))
            self.assertEqual(self.save(revision=2, key=fresh)['revision'], 3)

        def test_anonymous_wrong_owner_direct_writes_and_revocation(self):
            first = self.save()
            self.assertIn('permission denied', db.sql('SELECT app.load_base_draft()', role='anon', expect_error=True))
            self.assertIn('AUTHENTICATION_REQUIRED', db.sql('SELECT app.load_base_draft()', role='authenticated', expect_error=True))
            self.assertEqual(self.call('load_base_draft', user=self.b), '')
            self.assertEqual(json.loads(self.call('base_draft_history', user=self.b)), [])
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.tenants WHERE owner_user_id='{self.b}'"), '0')
            self.call('provision_workspace', f"'{uid()}'", user=self.b)
            self.assertIn('SNAPSHOT_NOT_FOUND', self.call('restore_base_draft', f"'{uid()}',0,'{first['id']}'", user=self.b, error=True))
            self.assertEqual(db.sql(f"SELECT count(*) FROM app.editor_draft_snapshots WHERE id='{first['id']}'", user=self.b, role='authenticated'), '0')
            other = json.loads(self.call('save_base_draft', f"'{uid()}',0,{literal(self.payload)},'autosave'", user=self.b))
            self.assertEqual(json.loads(self.call('load_base_draft', user=self.b)), other)
            self.assertEqual(json.loads(self.call('load_base_draft')), first)
            self.assertEqual(json.loads(self.call('base_draft_history')), [first])
            self.assertEqual(json.loads(self.call('base_draft_history', user=self.b)), [other])
            for command in [f"UPDATE app.editor_draft_snapshots SET revision=2 WHERE id='{first['id']}'",
                            f"DELETE FROM app.editor_draft_snapshots WHERE id='{first['id']}'",
                            "INSERT INTO app.editor_draft_snapshots SELECT * FROM app.editor_draft_snapshots",
                            "SELECT app.write_base_draft(NULL,0,NULL,'autosave',NULL)"]:
                self.assertIn('permission denied', db.sql(command, user=self.a, role='authenticated', expect_error=True))
            self.assertIn('IMMUTABLE_RECORD', db.sql(f"UPDATE app.editor_draft_snapshots SET revision=2 WHERE id='{first['id']}'", expect_error=True))
            db.sql(f"UPDATE app.tenant_memberships SET state='revoked' WHERE user_id='{self.a}'")
            self.assertEqual(self.call('load_base_draft'), '')
            self.assertEqual(json.loads(self.call('base_draft_history')), [])
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED', self.call('restore_base_draft', f"'{uid()}',1,'{first['id']}'", error=True))
            self.assertIn('RESOURCE_FORBIDDEN', self.save(error=True))

        def test_deleting_workspace_fences_read_write_and_replay(self):
            key = uid()
            first = self.save(key=key)
            self.call('request_deletion', f"'{uid()}'")
            self.assertEqual(self.call('load_base_draft'), '')
            self.assertEqual(json.loads(self.call('base_draft_history')), [])
            self.assertIn('RESOURCE_FORBIDDEN', self.save(key=key, error=True))
            self.assertIn('ACTIVE_WORKSPACE_REQUIRED', self.call('restore_base_draft', f"'{uid()}',1,'{first['id']}'", error=True))

        def test_concurrent_same_key_and_distinct_key_cas(self):
            key = uid()
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(lambda _: self.save(key=key), range(4)))
            self.assertTrue(all(result == results[0] for result in results))
            def contender(_):
                try:
                    return self.save(revision=1)
                except AssertionError as error:
                    return str(error)
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                outcomes = list(pool.map(contender, range(4)))
            self.assertEqual(sum(isinstance(x, dict) for x in outcomes), 1)
            self.assertTrue(all(isinstance(x, dict) or 'VERSION_CONFLICT' in x for x in outcomes))

        def test_existing_canonical_publication_is_preserved(self):
            self.call('provision_workspace', f"'{uid()}'")
            profile = canonical.Profiles()
            profile.a = self.a
            publication = profile.publish()
            before = db.sql(f"SELECT row_to_json(p) FROM app.career_profiles p WHERE id='{publication['profileId']}'")
            version = db.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{publication['baseCvVersionId']}'")
            self.save()
            self.assertEqual(db.sql(f"SELECT row_to_json(p) FROM app.career_profiles p WHERE id='{publication['profileId']}'"), before)
            self.assertEqual(db.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{publication['baseCvVersionId']}'"), version)

        def test_payload_limit_is_per_snapshot_and_history_is_paginated(self):
            large = {**self.payload, 'content': {'context': 'x' * 550000}}
            for rev in range(3):
                self.save(large, rev)
            page1 = json.loads(self.call('base_draft_history', 'NULL,2'))
            page2 = json.loads(self.call('base_draft_history', f"{page1[-1]['revision']},2"))
            self.assertEqual([x['revision'] for x in page1 + page2], [3, 2, 1])
            self.assertIn('INVALID_COMMAND_ENVELOPE', self.call('base_draft_history', 'NULL,21', error=True))
            self.assertIn('INVALID_COMMAND_ENVELOPE', self.save({**large, 'content': {'context': 'x' * 1048576}}, 3, error=True))
            self.assertEqual(json.loads(self.call('load_base_draft'))['revision'], 3)

        def test_base_lifecycle_floor_and_owned_transaction_guard(self):
            key = uid()
            first = self.save(key=key)
            second = self.save(revision=1)
            tenant = db.sql(f"SELECT id FROM app.tenants WHERE owner_user_id='{self.a}'")
            self.assertIn('permission denied', self.call('require_base_cv_purge', f"'{tenant}'", error=True))
            self.assertIn('IMMUTABLE_RECORD', db.sql(f"DELETE FROM app.editor_draft_snapshots WHERE tenant_id='{tenant}'", expect_error=True))
            # Privileged synthetic fixture exercises the exact guard/floor seam;
            # this is not the pending end-to-end destructive command.
            db.sql(f"BEGIN; UPDATE app.base_cv_lifecycle SET generation=generation+1,revision_floor=3,purge_transaction=pg_current_xact_id() WHERE tenant_id='{tenant}'; SELECT app.require_base_cv_purge('{tenant}'); DELETE FROM app.editor_draft_snapshots WHERE tenant_id='{tenant}'; UPDATE app.base_cv_lifecycle SET purge_transaction=NULL WHERE tenant_id='{tenant}'; COMMIT;", user=self.a)
            state = json.loads(self.call('load_base_state'))
            self.assertEqual((state['generation'],state['revision'],state['snapshot']), (1,3,None))
            self.assertEqual(db.sql(f"SELECT state FROM app.tenants WHERE id='{tenant}'"), 'active')
            self.assertEqual(json.loads(self.call('base_draft_history')), [])
            self.assertIn('VERSION_CONFLICT', self.save(revision=0,error=True))
            self.assertIn('REQUEST_EXPIRED', self.save(key=key,error=True))
            self.assertIn('SNAPSHOT_NOT_FOUND', self.call('restore_base_draft', f"'{uid()}',3,'{first['id']}'", error=True))
            fresh = self.save({'schemaVersion':'resumora-editor-draft/1','content':{},'answers':[]},revision=3)
            self.assertEqual(fresh['revision'],4)
            self.assertIsNone(fresh['parentId'])
            self.assertEqual(fresh['payload']['answers'],[])
            self.assertEqual(json.loads(self.call('load_base_draft'))['id'],fresh['id'])

        def test_base_purge_marker_cannot_authorize_a_later_transaction_or_audit_delete(self):
            self.save()
            tenant = db.sql(f"SELECT id FROM app.tenants WHERE owner_user_id='{self.a}'")
            db.sql(f"UPDATE app.base_cv_lifecycle SET purge_transaction=pg_current_xact_id() WHERE tenant_id='{tenant}'")
            self.assertIn('RESOURCE_FORBIDDEN', db.sql(f"SELECT app.require_base_cv_purge('{tenant}')",user=self.a,expect_error=True))
            self.assertIn('IMMUTABLE_RECORD', db.sql(f"DELETE FROM app.editor_draft_snapshots WHERE tenant_id='{tenant}'",expect_error=True))
            self.assertIn('IMMUTABLE_RECORD', db.sql(f"BEGIN;UPDATE app.base_cv_lifecycle SET purge_transaction=pg_current_xact_id() WHERE tenant_id='{tenant}';DELETE FROM app.audit_events WHERE tenant_id='{tenant}';COMMIT;",expect_error=True))
            db.sql(f"UPDATE app.base_cv_lifecycle SET purge_transaction=NULL WHERE tenant_id='{tenant}'")
            self.assertEqual(db.sql(f"SELECT state FROM app.tenants WHERE id='{tenant}'"),'active')

    return unittest.defaultTestLoader.loadTestsFromTestCase(EditorDrafts)
