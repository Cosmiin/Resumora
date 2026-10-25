"""Security boundary tests: synthetic files only; no connection is attempted."""
import importlib.util
import os
from pathlib import Path
import shlex
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/db/preflight.py'
spec = importlib.util.spec_from_file_location('preflight', SCRIPT)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='resumora-preflight-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patch = patch.object(preflight, 'ROOT', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.password = 'synthetic spaces $() ` ; quote\'value'
        self.secret = self.root / '.env.db.local'
        self.secret.write_text('SUPABASE_DB_PASSWORD=' + shlex.quote(self.password) + '\n')
        self.secret.chmod(0o600)
        self.metadata = self.root / 'supabase/.temp'
        self.metadata.mkdir(parents=True)
        self.metadata.chmod(0o700)
        (self.metadata / 'project-ref').write_text(preflight.TARGET)
        (self.metadata / 'project-ref').chmod(0o600)
        self.url = self.metadata / 'pooler-url'
        self.url.write_text('postgres://postgres.' + preflight.TARGET + '@aws-0-eu-central-1.pooler.supabase.com:5432/postgres')
        self.url.chmod(0o600)

    def test_secret_is_data_and_connection_is_exact_tls_read_only(self):
        with patch.dict(os.environ, {'PGHOST': 'evil.invalid', 'PGSERVICE': 'evil', 'SUPABASE_ACCESS_TOKEN': 'synthetic'}, clear=False):
            env = preflight.credentials()
        self.assertEqual(env['PGPASSWORD'], self.password)
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGUSER'], 'postgres.' + preflight.TARGET)
        self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])
        self.assertNotIn('PGSERVICE', env)
        self.assertNotIn('SUPABASE_ACCESS_TOKEN', env)

    def test_wrong_ref_host_user_port_or_embedded_password_rejected(self):
        for uri in ['postgres://postgres.other@aws-0-eu.pooler.supabase.com:5432/postgres',
                    'postgres://postgres.' + preflight.TARGET + '@evil.invalid:5432/postgres',
                    'postgres://postgres.' + preflight.TARGET + '@aws-0-eu.pooler.supabase.com:6543/postgres',
                    'postgres://postgres.' + preflight.TARGET + ':secret@aws-0-eu.pooler.supabase.com:5432/postgres']:
            with self.subTest(uri=uri):
                self.url.write_text(uri)
                with self.assertRaises(ValueError): preflight.credentials()

    def test_wrong_project_link_rejected(self):
        (self.metadata / 'project-ref').write_text('wrong-project')
        with self.assertRaises(ValueError): preflight.credentials()

    def test_unsafe_or_symlink_cache_directory_rejected_without_repair(self):
        self.metadata.chmod(0o755)
        with self.assertRaises(ValueError): preflight.credentials()
        self.assertEqual(self.metadata.stat().st_mode & 0o777, 0o755)
        self.metadata.chmod(0o700)
        target = self.root / 'private-metadata'
        self.metadata.rename(target)
        self.metadata.symlink_to(target, target_is_directory=True)
        with self.assertRaises(ValueError): preflight.credentials()

    def test_link_metadata_must_be_private_regular_files(self):
        for name in ['project-ref', 'pooler-url']:
            with self.subTest(name=name):
                path = self.metadata / name
                path.chmod(0o644)
                with self.assertRaises(ValueError): preflight.credentials()
                self.assertEqual(path.stat().st_mode & 0o777, 0o644)
                path.chmod(0o600)
                target = self.root / ('private-' + name)
                path.rename(target)
                path.symlink_to(target)
                with self.assertRaises(ValueError): preflight.credentials()
                path.unlink()
                target.rename(path)

    def test_supported_legacy_direct_metadata_keeps_tls_and_read_only(self):
        self.url.write_text('postgres://postgres@db.' + preflight.TARGET + '.supabase.co:5432/postgres')
        env = preflight.credentials()
        self.assertEqual(env['PGHOST'], 'db.' + preflight.TARGET + '.supabase.co')
        self.assertEqual(env['PGUSER'], 'postgres')
        self.assertEqual(env['PGPASSWORD'], self.password)
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])

    def test_world_readable_or_symlink_secret_rejected(self):
        self.secret.chmod(0o644)
        with self.assertRaises(ValueError): preflight.credentials()
        target = self.root / 'secret'
        self.secret.rename(target)
        self.secret.symlink_to(target)
        with self.assertRaises(ValueError): preflight.credentials()

    def test_shell_code_or_extra_variables_are_not_evaluated(self):
        for value in ['export SUPABASE_DB_PASSWORD=x\n', 'SUPABASE_DB_PASSWORD=$(touch marker)\n',
                      'SUPABASE_DB_PASSWORD=x\nEVIL=y\n']:
            self.secret.write_text(value)
            with self.assertRaises(ValueError): preflight.credentials()
        self.assertFalse((self.root / 'marker').exists())

    def test_unverified_tls_is_rejected_before_inventory(self):
        import subprocess
        result = subprocess.CompletedProcess([], 0, '{"readOnly":"on","tls":false}\n', '')
        with patch.object(preflight.subprocess, 'run', return_value=result) as run:
            with self.assertRaises(RuntimeError): preflight.inventory(Path('/synthetic/psql'), {})
        self.assertEqual(run.call_count, 1)
        self.assertTrue(run.call_args.kwargs['input'].startswith('BEGIN READ ONLY;'))


if __name__ == '__main__':
    unittest.main()
