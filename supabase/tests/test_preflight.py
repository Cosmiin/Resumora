"""Security boundary tests: synthetic files only; no connection is attempted."""
import importlib.util
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import shlex
import subprocess
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
        # Only file selection is exercised here; subprocess TLS/SQL is mocked.
        self.ca = self.root / 'authoritative public CA.crt'
        self.ca.write_text('synthetic public CA fixture; not used for TLS\n')

    def invoke(self, receipt, *extra):
        stdout, stderr = io.StringIO(), io.StringIO()
        args = ['preflight.py', '--pg-bin', '/synthetic/pg', '--receipt', str(receipt), *extra]
        with patch.object(preflight.sys, 'argv', args), redirect_stdout(stdout), redirect_stderr(stderr):
            code = preflight.main()
        return code, stdout.getvalue(), stderr.getvalue()

    def test_secret_is_data_and_connection_is_exact_tls_read_only(self):
        with patch.dict(os.environ, {'PGHOST': 'evil.invalid', 'PGSERVICE': 'evil', 'SUPABASE_ACCESS_TOKEN': 'synthetic'}, clear=False):
            env = preflight.credentials()
        self.assertEqual(env['PGPASSWORD'], self.password)
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGSSLROOTCERT'], '/etc/ssl/certs/ca-certificates.crt')
        self.assertEqual(env['PGUSER'], 'postgres.' + preflight.TARGET)
        self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])
        self.assertNotIn('PGSERVICE', env)
        self.assertNotIn('SUPABASE_ACCESS_TOKEN', env)

    def test_explicit_ca_cannot_weaken_tls_target_or_read_only_settings(self):
        with patch.dict(os.environ, {'PGSSLMODE': 'disable', 'PGSSLROOTCERT': '/untrusted/default',
                                    'PGOPTIONS': '-c default_transaction_read_only=off'}, clear=False):
            env = preflight.credentials(self.ca)
        self.assertEqual(env['PGSSLROOTCERT'], str(self.ca))
        self.assertEqual(env['PGSSLMODE'], 'verify-full')
        self.assertEqual(env['PGUSER'], 'postgres.' + preflight.TARGET)
        self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])
        (self.metadata / 'project-ref').write_text('wrong-project')
        with self.assertRaises(ValueError): preflight.credentials(self.ca)

    def test_missing_directory_and_symlink_ca_rejected_before_inventory(self):
        link = self.root / 'ca-link'
        link.symlink_to(self.ca)
        for ca in [self.root / 'missing-ca', self.root, link]:
            with self.subTest(ca=ca), patch.object(preflight, 'inventory') as inventory:
                receipt = self.root / 'never-written.json'
                code, _, _ = self.invoke(receipt, '--ssl-root-cert', str(ca))
                self.assertEqual(code, 1)
                inventory.assert_not_called()
                self.assertFalse(receipt.exists())

    def test_successful_cli_saves_private_json_and_keeps_strict_query_environment(self):
        receipt = self.root / 'inventory.json'
        values = [{'version': '16.15', 'database': 'postgres', 'collation': 'C.UTF-8',
                   'ctype': 'C.UTF-8', 'readOnly': 'on', 'tls': True},
                  [], [], [], [], False, False, False, False]
        responses = [subprocess.CompletedProcess([], 0, json.dumps(value), '') for value in values]
        # A permissive caller umask must not make the new receipt public.
        old_mask = os.umask(0)
        try:
            with patch.object(preflight.subprocess, 'run', side_effect=responses) as run:
                code, stdout, stderr = self.invoke(receipt, '--ssl-root-cert', str(self.ca))
        finally:
            os.umask(old_mask)
        self.assertEqual(code, 0, stderr)
        saved = json.loads(receipt.read_text())
        self.assertEqual(saved['target_ref'], preflight.TARGET)
        self.assertFalse(saved['can_apply'])
        self.assertEqual(saved['tables'], [])
        self.assertEqual(saved['migration_history'], [])
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
        self.assertEqual(receipt.stat().st_uid, os.getuid())
        self.assertEqual(run.call_count, len(values))
        for call in run.call_args_list:
            env = call.kwargs['env']
            self.assertEqual(env['PGSSLROOTCERT'], str(self.ca))
            self.assertEqual(env['PGSSLMODE'], 'verify-full')
            self.assertEqual(env['PGUSER'], 'postgres.' + preflight.TARGET)
            self.assertIn('default_transaction_read_only=on', env['PGOPTIONS'])
            self.assertTrue(call.kwargs['input'].startswith('BEGIN READ ONLY;'))
        for output in [receipt.read_text(), stdout, stderr]:
            self.assertNotIn(self.password, output)
            self.assertNotIn(self.url.read_text(), output)

    def test_default_cli_success_writes_receipt_without_path_open_type_error(self):
        receipt = self.root / 'default-inventory.json'
        result = {'target_ref': preflight.TARGET, 'can_apply': False, 'tables': []}
        with patch.object(preflight, 'inventory', return_value=result):
            code, _, stderr = self.invoke(receipt)
        self.assertEqual(code, 0, stderr)
        self.assertEqual(json.loads(receipt.read_text()), result)
        self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)

    def test_existing_receipt_and_symlinks_rejected_before_inventory(self):
        target = self.root / 'preserve.json'
        target.write_text('preserve')
        link, dangling = self.root / 'receipt-link', self.root / 'dangling-link'
        link.symlink_to(target)
        dangling.symlink_to(self.root / 'missing-target')
        for receipt in [target, link, dangling]:
            with self.subTest(receipt=receipt), patch.object(preflight, 'inventory') as inventory:
                code, _, _ = self.invoke(receipt, '--ssl-root-cert', str(self.ca))
                self.assertEqual(code, 1)
                inventory.assert_not_called()
                self.assertEqual(target.read_text(), 'preserve')
        self.assertTrue(link.is_symlink())
        self.assertTrue(dangling.is_symlink())
        self.assertFalse((self.root / 'missing-target').exists())

    def test_receipt_path_races_do_not_overwrite_or_follow_symlinks(self):
        target = self.root / 'race-target'
        target.write_text('preserve')
        for symlink in [False, True]:
            receipt = self.root / ('raced-link' if symlink else 'raced-file')
            def race(*_):
                if symlink:
                    receipt.symlink_to(target)
                else:
                    receipt.write_text('other writer')
                return {'can_apply': False}
            with self.subTest(symlink=symlink), patch.object(preflight, 'inventory', side_effect=race):
                code, _, _ = self.invoke(receipt, '--ssl-root-cert', str(self.ca))
                self.assertEqual(code, 1)
                self.assertEqual(target.read_text(), 'preserve')
                if symlink:
                    self.assertTrue(receipt.is_symlink())
                else:
                    self.assertEqual(receipt.read_text(), 'other writer')

    def test_query_failure_leaves_no_receipt_or_raw_connection_diagnostics(self):
        receipt = self.root / 'failed.json'
        raw_error = self.password + self.url.read_text()
        failure = subprocess.CompletedProcess([], 2, '', raw_error)
        with patch.object(preflight.subprocess, 'run', return_value=failure):
            code, stdout, stderr = self.invoke(receipt, '--ssl-root-cert', str(self.ca))
        self.assertEqual(code, 1)
        self.assertFalse(receipt.exists())
        self.assertNotIn(self.password, stdout + stderr)
        self.assertNotIn(self.url.read_text(), stdout + stderr)

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
        result = subprocess.CompletedProcess([], 0, '{"readOnly":"on","tls":false}\n', '')
        with patch.object(preflight.subprocess, 'run', return_value=result) as run:
            with self.assertRaises(RuntimeError): preflight.inventory(Path('/synthetic/psql'), {})
        self.assertEqual(run.call_count, 1)
        self.assertTrue(run.call_args.kwargs['input'].startswith('BEGIN READ ONLY;'))


if __name__ == '__main__':
    unittest.main()
